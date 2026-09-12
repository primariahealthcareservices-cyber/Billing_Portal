"""Corporate Management routes — Income/Expenses entries."""
from datetime import datetime, date
from flask import Blueprint, request, jsonify, current_app
from flask_jwt_extended import get_jwt_identity

from models import db, FinanceEntry, ENTRY_TYPES, DEPARTMENT_CONFIG
from utils import role_required

DEPARTMENT = "Corporate"
CONFIG = DEPARTMENT_CONFIG[DEPARTMENT]

corporate_bp = Blueprint("corporate", __name__, url_prefix="/api/corporate")


def _parse_date(value, default=None):
    if not value:
        return default
    try:
        return datetime.strptime(value, "%Y-%m-%d").date()
    except ValueError:
        return default


def _parse_decimal(value):
    """Return a float for numeric-ish input, or None for blank/invalid values.

    Without this, an empty string ("") sent from the form for salary_amount /
    allowance_amount gets passed straight into a Numeric(14,2) DB column,
    which the DB driver can't cast, raising an exception during commit that
    surfaces to the client as a bare 500 Internal Server Error.
    """
    if value in (None, ""):
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _apply_date_filters(query):
    start_date = _parse_date(request.args.get("start_date"))
    end_date = _parse_date(request.args.get("end_date"))
    if start_date:
        query = query.filter(FinanceEntry.entry_date >= start_date)
    if end_date:
        query = query.filter(FinanceEntry.entry_date <= end_date)
    return query


@corporate_bp.route("/options", methods=["GET"])
@role_required("Corporate")
def options():
    return jsonify({
        "department": DEPARTMENT,
        "entry_types": ENTRY_TYPES,
        "categories": CONFIG["categories"],
        "revenue_types": CONFIG["revenue_types"],
        "show_generated_by": CONFIG["show_generated_by"],
        "show_revenue_type": CONFIG["show_revenue_type"],
        "show_patient_fields": CONFIG["show_patient_fields"],
        "show_client_name": CONFIG["show_client_name"],
        "show_gst_number": CONFIG["show_gst_number"],
        "show_items": CONFIG["show_items"],
        "show_invoice": CONFIG["show_invoice"],
        # Indicate that we support executive compensation fields
        "show_executive_compensation": True,
    }), 200


@corporate_bp.route("/entries", methods=["POST"])
@role_required("Corporate")
def create_entry():
    data = request.get_json(silent=True) or {}
    entry_type = data.get("entry_type")
    category = data.get("category")
    amount = data.get("amount")
    remarks = data.get("remarks", "")
    generated_by = data.get("generated_by", "").strip() or None
    client_name = data.get("client_name", "").strip() or None
    entry_date = _parse_date(data.get("entry_date"), default=date.today())

    # Executive compensation fields (only meaningful when
    # category == "Executive Compensation", but the form always sends them,
    # so they must be safely parsed/nulled regardless of category).
    exec_department = data.get("exec_department") or None
    employee_name = (data.get("employee_name") or "").strip() or None
    salary_amount = _parse_decimal(data.get("salary_amount"))
    allowance_amount = _parse_decimal(data.get("allowance_amount"))

    errors = []
    if entry_type not in ENTRY_TYPES:
        errors.append("entry_type must be Income or Expenses.")
    allowed_categories = CONFIG["categories"].get(entry_type, [])
    if category not in allowed_categories:
        errors.append(f"category must be one of: {', '.join(allowed_categories)}.")
    try:
        amount = float(amount)
        if amount <= 0:
            errors.append("amount must be greater than 0.")
    except (TypeError, ValueError):
        errors.append("amount must be a number.")
    if errors:
        return jsonify({"message": "Validation failed.", "errors": errors}), 400

    entry = FinanceEntry(
        department=DEPARTMENT,
        entry_type=entry_type,
        category=category,
        generated_by=generated_by,
        client_name=client_name,
        amount=amount,
        remarks=remarks,
        entry_date=entry_date,
        created_by_id=get_jwt_identity(),
        exec_department=exec_department,
        employee_name=employee_name,
        salary_amount=salary_amount,
        allowance_amount=allowance_amount,
    )

    try:
        db.session.add(entry)
        db.session.commit()
    except Exception:
        db.session.rollback()
        current_app.logger.exception("Failed to create Corporate finance entry")
        return jsonify({"message": "Internal server error."}), 500

    return jsonify({"message": "Entry created.", "entry": entry.to_dict()}), 201


@corporate_bp.route("/entries", methods=["GET"])
@role_required("Corporate")
def list_entries():
    query = FinanceEntry.query.filter_by(department=DEPARTMENT)
    query = _apply_date_filters(query)
    entry_type = request.args.get("entry_type")
    if entry_type in ENTRY_TYPES:
        query = query.filter(FinanceEntry.entry_type == entry_type)
    category = request.args.get("category")
    if category:
        query = query.filter(FinanceEntry.category == category)
    search = request.args.get("search")
    if search:
        like = f"%{search}%"
        query = query.filter(
            db.or_(
                FinanceEntry.remarks.ilike(like),
                FinanceEntry.generated_by.ilike(like),
                FinanceEntry.client_name.ilike(like),
                FinanceEntry.category.ilike(like),
                FinanceEntry.employee_name.ilike(like),
                FinanceEntry.exec_department.ilike(like),
            )
        )
    query = query.order_by(FinanceEntry.entry_date.desc(), FinanceEntry.id.desc())
    return jsonify({"entries": [e.to_dict() for e in query.all()]}), 200


@corporate_bp.route("/entries/<int:entry_id>", methods=["PUT"])
@role_required("Corporate")
def update_entry(entry_id):
    entry = FinanceEntry.query.filter_by(id=entry_id, department=DEPARTMENT).first()
    if not entry:
        return jsonify({"message": "Entry not found."}), 404
    data = request.get_json(silent=True) or {}
    if "entry_type" in data and data["entry_type"] in ENTRY_TYPES:
        entry.entry_type = data["entry_type"]
    if "category" in data:
        allowed = CONFIG["categories"].get(entry.entry_type, [])
        if data["category"] in allowed:
            entry.category = data["category"]
    if "amount" in data:
        try:
            amount = float(data["amount"])
            if amount > 0:
                entry.amount = amount
        except (TypeError, ValueError):
            pass
    if "generated_by" in data:
        entry.generated_by = data["generated_by"].strip() or None
    if "client_name" in data:
        entry.client_name = data["client_name"].strip() or None
    if "remarks" in data:
        entry.remarks = data["remarks"]
    if "entry_date" in data:
        parsed = _parse_date(data["entry_date"])
        if parsed:
            entry.entry_date = parsed

    # Executive compensation fields — use _parse_decimal so that sending an
    # empty string correctly *clears* the field instead of being ignored.
    if "exec_department" in data:
        entry.exec_department = data["exec_department"] or None
    if "employee_name" in data:
        entry.employee_name = (data["employee_name"] or "").strip() or None
    if "salary_amount" in data:
        entry.salary_amount = _parse_decimal(data["salary_amount"])
    if "allowance_amount" in data:
        entry.allowance_amount = _parse_decimal(data["allowance_amount"])

    try:
        db.session.commit()
    except Exception:
        db.session.rollback()
        current_app.logger.exception("Failed to update Corporate finance entry %s", entry_id)
        return jsonify({"message": "Internal server error."}), 500

    return jsonify({"message": "Entry updated.", "entry": entry.to_dict()}), 200


@corporate_bp.route("/entries/<int:entry_id>", methods=["DELETE"])
@role_required("Corporate")
def delete_entry(entry_id):
    entry = FinanceEntry.query.filter_by(id=entry_id, department=DEPARTMENT).first()
    if not entry:
        return jsonify({"message": "Entry not found."}), 404
    try:
        db.session.delete(entry)
        db.session.commit()
    except Exception:
        db.session.rollback()
        current_app.logger.exception("Failed to delete Corporate finance entry %s", entry_id)
        return jsonify({"message": "Internal server error."}), 500

    return jsonify({"message": "Entry deleted."}), 200


@corporate_bp.route("/summary", methods=["GET"])
@role_required("Corporate")
def finance_summary():
    entries = _apply_date_filters(FinanceEntry.query.filter_by(department=DEPARTMENT)).all()
    total_income = sum(float(e.amount) for e in entries if e.entry_type == "Income")
    total_expenses = sum(float(e.amount) for e in entries if e.entry_type == "Expenses")
    by_date = {}
    for e in entries:
        key = e.entry_date.isoformat()
        by_date.setdefault(key, {"date": key, "income": 0, "expenses": 0})
        by_date[key]["income" if e.entry_type == "Income" else "expenses"] += float(e.amount)
    trend = sorted(by_date.values(), key=lambda x: x["date"])
    by_category = {}
    for e in entries:
        by_category.setdefault(e.category, {"category": e.category, "amount": 0})
        by_category[e.category]["amount"] += float(e.amount)
    return jsonify({
        "department": DEPARTMENT,
        "total_income": total_income,
        "total_expenses": total_expenses,
        "profit": total_income - total_expenses,
        "entry_count": len(entries),
        "trend": trend,
        "category_breakdown": list(by_category.values()),}), 200
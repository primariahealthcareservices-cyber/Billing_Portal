# backend/routes/adminfunctionalunit.py
"""Administration Functional Unit routes — Income/Expenses/Capital entries."""
from datetime import datetime, date
from flask import Blueprint, request, jsonify
from flask_jwt_extended import get_jwt_identity

from models import db, FinanceEntry, ENTRY_TYPES, DEPARTMENT_CONFIG
from utils import role_required

DEPARTMENT = "Adminstrationfunctionalunit"
CONFIG = DEPARTMENT_CONFIG[DEPARTMENT]

CAPITAL_CATEGORIES = (
    "Equity Infusion",
    "Partner Contribution",
    "Asset Capitalization",
    "Reserve Fund Transfer",
    "Other Capital",
)

adminfunctionalunit_bp = Blueprint(
    "adminfunctionalunit",
    __name__,
    url_prefix="/api/adminstrationfunctionalunit"
)


def _parse_date(value, default=None):
    if not value:
        return default
    try:
        return datetime.strptime(value, "%Y-%m-%d").date()
    except ValueError:
        return default


def _apply_date_filters(query):
    start_date = _parse_date(request.args.get("start_date"))
    end_date = _parse_date(request.args.get("end_date"))
    if start_date:
        query = query.filter(FinanceEntry.entry_date >= start_date)
    if end_date:
        query = query.filter(FinanceEntry.entry_date <= end_date)
    return query


@adminfunctionalunit_bp.route("/options", methods=["GET"])
@role_required("Adminstrationfunctionalunit")
def options():
    return jsonify({
        "department": DEPARTMENT,
        "entry_types": CONFIG.get("entry_types", ENTRY_TYPES),
        "categories": CONFIG["categories"],
        "revenue_types": CONFIG["revenue_types"],
        "show_generated_by": CONFIG["show_generated_by"],
        "show_revenue_type": CONFIG["show_revenue_type"],
        "show_patient_fields": CONFIG["show_patient_fields"],
        "show_client_name": CONFIG["show_client_name"],
        "show_gst_number": CONFIG["show_gst_number"],
        "show_items": CONFIG["show_items"],
        "show_invoice": CONFIG["show_invoice"],
        "is_salary_category": CONFIG.get("is_salary_category"),
        "capital_categories": list(CAPITAL_CATEGORIES),
    }), 200


@adminfunctionalunit_bp.route("/entries", methods=["POST"])
@role_required("Adminstrationfunctionalunit")
def create_entry():
    data = request.get_json(silent=True) or {}
    entry_type = data.get("entry_type")

    # ====================== CAPITAL ENTRY ======================
    if entry_type == "Capital":
        errors = []
        capital_category = (data.get("capital_category") or data.get("fund_category") or "").strip()
        client_name = (data.get("client_name") or "").strip()
        purpose = (data.get("purpose") or "").strip()
        remarks = (data.get("remarks") or "").strip()
        entry_date = _parse_date(data.get("entry_date"), default=date.today())
        amount_raw = data.get("amount")

        if capital_category not in CAPITAL_CATEGORIES:
            errors.append(
                "capital_category must be one of: " + ", ".join(CAPITAL_CATEGORIES) + "."
            )
        if not client_name:
            errors.append("Name is required.")
        if not purpose:
            errors.append("Purpose is required.")
        try:
            amount = float(amount_raw)
            if amount <= 0:
                errors.append("Amount must be greater than 0.")
        except (TypeError, ValueError):
            errors.append("Amount must be a valid number.")

        if errors:
            return jsonify({"message": "Validation failed.", "errors": errors}), 400

        entry = FinanceEntry(
            department=DEPARTMENT,
            entry_type="Capital",
            category=capital_category,
            sub_category="Capital",
            fund_category=capital_category,  # reuse existing column
            client_name=client_name,
            amount=amount,
            purpose=purpose,
            remarks=remarks,
            entry_date=entry_date,
            created_by_id=get_jwt_identity(),
        )
        db.session.add(entry)
        db.session.commit()
        return jsonify({"message": "Capital entry created.", "entry": entry.to_dict()}), 201

    # ====================== INCOME / EXPENSES ======================
    category = data.get("category")
    amount = data.get("amount")
    remarks = data.get("remarks", "")

    generated_by = (data.get("generated_by") or "").strip() or None
    entry_date = _parse_date(data.get("entry_date"), default=date.today())

    employee_name = (data.get("employee_name") or "").strip() or None
    vehicle_type = (data.get("vehicle_type") or "").strip() or None

    errors = []

    salary_category = CONFIG.get("is_salary_category")
    if entry_type == "Expenses" and category == salary_category:
        return jsonify({
            "message": "Salary must be entered by Corporate Management only.",
            "errors": ["Personnel & Payroll entries are not allowed in Office Administration."]
        }), 403

    if entry_type not in ENTRY_TYPES:
        errors.append("entry_type must be Income, Expenses, or Capital.")
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
        amount=amount,
        remarks=remarks,
        entry_date=entry_date,
        created_by_id=get_jwt_identity(),
        employee_name=employee_name,
        vehicle_type=vehicle_type,
    )
    db.session.add(entry)
    db.session.commit()
    return jsonify({"message": "Entry created.", "entry": entry.to_dict()}), 201


@adminfunctionalunit_bp.route("/entries", methods=["GET"])
@role_required("Adminstrationfunctionalunit")
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
                FinanceEntry.category.ilike(like),
                FinanceEntry.employee_name.ilike(like),
            )
        )
    query = query.order_by(FinanceEntry.entry_date.desc(), FinanceEntry.id.desc())
    return jsonify({"entries": [e.to_dict() for e in query.all()]}), 200


@adminfunctionalunit_bp.route("/entries/<int:entry_id>", methods=["PUT"])
@role_required("Adminstrationfunctionalunit")
def update_entry(entry_id):
    entry = FinanceEntry.query.filter_by(id=entry_id, department=DEPARTMENT).first()
    if not entry:
        return jsonify({"message": "Entry not found."}), 404

    data = request.get_json(silent=True) or {}

    # ====================== CAPITAL UPDATE ======================
    if entry.entry_type == "Capital":
        errors = []
        capital_category = (
            data.get("capital_category")
            or data.get("fund_category")
            or entry.fund_category
            or ""
        ).strip()
        client_name = (data.get("client_name") or "").strip()
        purpose = (data.get("purpose") or "").strip()
        remarks = (data.get("remarks") or "").strip()
        amount_raw = data.get("amount")

        if capital_category not in CAPITAL_CATEGORIES:
            errors.append(
                "capital_category must be one of: " + ", ".join(CAPITAL_CATEGORIES) + "."
            )
        if not client_name:
            errors.append("Name is required.")
        if not purpose:
            errors.append("Purpose is required.")
        try:
            amount = float(amount_raw)
            if amount <= 0:
                errors.append("Amount must be greater than 0.")
        except (TypeError, ValueError):
            errors.append("Amount must be a valid number.")

        if errors:
            return jsonify({"message": "Validation failed.", "errors": errors}), 400

        entry.category = capital_category
        entry.sub_category = "Capital"
        entry.fund_category = capital_category
        entry.client_name = client_name
        entry.amount = amount
        entry.purpose = purpose
        entry.remarks = remarks

        if "entry_date" in data:
            parsed = _parse_date(data["entry_date"])
            if parsed:
                entry.entry_date = parsed

        db.session.commit()
        return jsonify({"message": "Capital entry updated.", "entry": entry.to_dict()}), 200

    # ====================== INCOME / EXPENSES UPDATE ======================
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
        entry.generated_by = (data.get("generated_by") or "").strip() or None
    if "remarks" in data:
        entry.remarks = data["remarks"]
    if "entry_date" in data:
        parsed = _parse_date(data["entry_date"])
        if parsed:
            entry.entry_date = parsed
    if "employee_name" in data:
        entry.employee_name = (data.get("employee_name") or "").strip() or None
    if "vehicle_type" in data:
        entry.vehicle_type = (data.get("vehicle_type") or "").strip() or None

    db.session.commit()
    return jsonify({"message": "Entry updated.", "entry": entry.to_dict()}), 200


@adminfunctionalunit_bp.route("/entries/<int:entry_id>", methods=["DELETE"])
@role_required("Adminstrationfunctionalunit")
def delete_entry(entry_id):
    entry = FinanceEntry.query.filter_by(id=entry_id, department=DEPARTMENT).first()
    if not entry:
        return jsonify({"message": "Entry not found."}), 404
    db.session.delete(entry)
    db.session.commit()
    return jsonify({"message": "Entry deleted."}), 200


@adminfunctionalunit_bp.route("/summary", methods=["GET"])
@role_required("Adminstrationfunctionalunit")
def finance_summary():
    entries = _apply_date_filters(FinanceEntry.query.filter_by(department=DEPARTMENT)).all()
    total_income = sum(float(e.amount) for e in entries if e.entry_type == "Income")
    total_expenses = sum(float(e.amount) for e in entries if e.entry_type == "Expenses")
    total_capital = sum(float(e.amount) for e in entries if e.entry_type == "Capital")

    by_date = {}
    for e in entries:
        key = e.entry_date.isoformat()
        by_date.setdefault(key, {"date": key, "income": 0, "expenses": 0, "capital": 0})
        if e.entry_type == "Income":
            by_date[key]["income"] += float(e.amount)
        elif e.entry_type == "Expenses":
            by_date[key]["expenses"] += float(e.amount)
        elif e.entry_type == "Capital":
            by_date[key]["capital"] += float(e.amount)
    trend = sorted(by_date.values(), key=lambda x: x["date"])

    by_category = {}
    for e in entries:
        by_category.setdefault(e.category, {"category": e.category, "amount": 0})
        by_category[e.category]["amount"] += float(e.amount)

    return jsonify({
        "department": DEPARTMENT,
        "total_income": total_income,
        "total_expenses": total_expenses,
        "total_capital": total_capital,
        "profit": total_income - total_expenses,
        "entry_count": len(entries),
        "trend": trend,
        "category_breakdown": list(by_category.values()),
    }), 200
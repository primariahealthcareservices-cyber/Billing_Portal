from datetime import datetime
from flask import Blueprint, request, jsonify
from sqlalchemy import or_, and_
from flask_jwt_extended import get_jwt_identity

from models import db, FinanceEntry, DEPARTMENT_CONFIG, ENTRY_TYPES
from utils import role_required

dental_bp = Blueprint("dental", __name__, url_prefix="/api/dental")

DEPARTMENT = "Dental"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _parse_date(value, default=None):
    if not value:
        return default
    try:
        return datetime.strptime(value, "%Y-%m-%d").date()
    except ValueError:
        return default


def _config():
    return DEPARTMENT_CONFIG[DEPARTMENT]


def _clean(value):
    if value is None:
        return None
    if isinstance(value, str):
        value = value.strip()
        return value or None
    return value


def _resolve_category(data):
    category = _clean(data.get("category"))
    other_category = _clean(data.get("other_category"))
    if category == "Others" and other_category:
        return other_category
    return category


# ---------------------------------------------------------------------------
# Department attribution
#
# A Dental employee's salary is recorded by Corporate with:
#     department = "Corporate", exec_department = "Dental"
# When the Dental user views their own dashboard, we must include those
# entries as well, otherwise the salary never shows up here.
# ---------------------------------------------------------------------------

def _dept_clause():
    return or_(
        FinanceEntry.department == DEPARTMENT,
        and_(
            FinanceEntry.department == "Corporate",
            FinanceEntry.exec_department == DEPARTMENT,
        ),
    )


def _apply_filters(query):
    args = request.args

    start_date = _parse_date(args.get("start_date"))
    end_date = _parse_date(args.get("end_date"))
    if start_date:
        query = query.filter(FinanceEntry.entry_date >= start_date)
    if end_date:
        query = query.filter(FinanceEntry.entry_date <= end_date)

    entry_type = args.get("entry_type")
    if entry_type in ENTRY_TYPES:
        query = query.filter(FinanceEntry.entry_type == entry_type)

    category = args.get("category")
    if category:
        query = query.filter(FinanceEntry.category == category)

    revenue_type = args.get("revenue_type")
    if revenue_type:
        query = query.filter(FinanceEntry.revenue_type == revenue_type)

    search = args.get("search")
    if search:
        like = f"%{search}%"
        query = query.filter(
            or_(
                FinanceEntry.remarks.ilike(like),
                FinanceEntry.generated_by.ilike(like),
                FinanceEntry.client_name.ilike(like),
                FinanceEntry.patient_name.ilike(like),
                FinanceEntry.patient_place.ilike(like),
                FinanceEntry.gst_number.ilike(like),
                FinanceEntry.category.ilike(like),
            )
        )
    return query


# ---------------------------------------------------------------------------
# Options
# ---------------------------------------------------------------------------

@dental_bp.route("/options", methods=["GET"])
@role_required("Dental")
def options():
    config = _config()
    return jsonify({
        "department": DEPARTMENT,
        "entry_types": ENTRY_TYPES,
        "categories": config["categories"],
        "revenue_types": config["revenue_types"],
        "show_generated_by": config["show_generated_by"],
        "show_revenue_type": config["show_revenue_type"],
        "show_patient_fields": config["show_patient_fields"],
        "show_client_name": config["show_client_name"],
        "show_gst_number": config["show_gst_number"],
        "gst_required_categories": config["gst_required_categories"],
        "show_items": config["show_items"],
        "show_invoice": config["show_invoice"],
        "show_gst_tax": config.get("show_gst_tax", False),
        "show_tax_invoice_number": config.get("show_tax_invoice_number", False),
    }), 200


# ---------------------------------------------------------------------------
# Entries list (includes Corporate salary entries for Dental employees)
# ---------------------------------------------------------------------------

@dental_bp.route("/entries", methods=["GET"])
@role_required("Dental")
def list_entries():
    query = FinanceEntry.query.filter(_dept_clause())
    query = _apply_filters(query)
    query = query.order_by(FinanceEntry.entry_date.desc(), FinanceEntry.id.desc())
    return jsonify({"entries": [e.to_dict() for e in query.all()]}), 200


# ---------------------------------------------------------------------------
# Summary (includes Corporate salary entries for Dental employees)
# ---------------------------------------------------------------------------

@dental_bp.route("/summary", methods=["GET"])
@role_required("Dental")
def summary():
    query = FinanceEntry.query.filter(_dept_clause())
    query = _apply_filters(query)
    entries = query.all()

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
        "category_breakdown": list(by_category.values()),
    }), 200


# ---------------------------------------------------------------------------
# Create entry
# ---------------------------------------------------------------------------

@dental_bp.route("/entries", methods=["POST"])
@role_required("Dental")
def create_entry():
    data = request.get_json(silent=True) or {}
    config = _config()

    entry_type = data.get("entry_type")
    resolved_category = _resolve_category(data)
    entry_date = _parse_date(data.get("entry_date"))
    amount_raw = data.get("amount")

    errors = []

    if entry_type not in ENTRY_TYPES:
        errors.append(f"entry_type must be one of: {', '.join(ENTRY_TYPES)}.")
    if not resolved_category:
        errors.append("category is required.")
    if not entry_date:
        errors.append("entry_date is required (YYYY-MM-DD).")

    amount = None
    if amount_raw in (None, ""):
        errors.append("amount is required.")
    else:
        try:
            amount = float(amount_raw)
            if amount < 0:
                errors.append("amount must be >= 0.")
        except (TypeError, ValueError):
            errors.append("amount must be numeric.")

    if entry_type in ENTRY_TYPES and resolved_category:
        valid_cats = config["categories"].get(entry_type, [])
        if valid_cats and resolved_category not in valid_cats:
            if "Others" not in valid_cats:
                errors.append(
                    f"category '{resolved_category}' is not valid for {entry_type}."
                )

    if errors:
        return jsonify({"message": "Validation failed.", "errors": errors}), 400

    user_id = get_jwt_identity()

    entry = FinanceEntry(
    department=DEPARTMENT,
    entry_type=entry_type,
    category=resolved_category,
    sub_category=_clean(data.get("sub_category")),
    generated_by=_clean(data.get("generated_by")),
    revenue_type=_clean(data.get("revenue_type")),
    patient_name=_clean(data.get("patient_name")),
    patient_place=_clean(data.get("patient_place")),
    client_name=_clean(data.get("client_name")),
    gst_number=_clean(data.get("gst_number")),

    # ✅ NEW — previously dropped, now saved
    employee_name=_clean(data.get("employee_name")),
    vehicle_type=_clean(data.get("vehicle_type")),
    purpose=_clean(data.get("purpose")),

    amount=amount,
    remarks=_clean(data.get("remarks")),
    entry_date=entry_date,
    created_by_id=user_id,
)

    if data.get("gst_tax_percent") not in (None, ""):
        try:
            entry.gst_tax_percent = float(data["gst_tax_percent"])
        except (TypeError, ValueError):
            pass
    entry.tax_invoice_number = _clean(data.get("tax_invoice_number"))

    db.session.add(entry)
    db.session.commit()

    return jsonify({"message": "Entry created.", "entry": entry.to_dict()}), 201


# ---------------------------------------------------------------------------
# Update entry
# ---------------------------------------------------------------------------

@dental_bp.route("/entries/<int:entry_id>", methods=["PUT"])
@role_required("Dental")
def update_entry(entry_id):
    # Only entries that truly belong to Dental (department="Dental") can be
    # edited from the Dental dashboard. Corporate salary rows are read-only here.
    entry = FinanceEntry.query.filter_by(id=entry_id, department=DEPARTMENT).first()
    if not entry:
        return jsonify({"message": "Entry not found."}), 404

    data = request.get_json(silent=True) or {}

    if "entry_type" in data:
        if data["entry_type"] not in ENTRY_TYPES:
            return jsonify({"message": "Invalid entry_type."}), 400
        entry.entry_type = data["entry_type"]

    if "category" in data:
        resolved = _resolve_category(data)
        if resolved:
            entry.category = resolved

    if "amount" in data and data["amount"] not in (None, ""):
        try:
            entry.amount = float(data["amount"])
        except (TypeError, ValueError):
            return jsonify({"message": "amount must be numeric."}), 400

    if "entry_date" in data:
        parsed = _parse_date(data["entry_date"])
        if not parsed:
            return jsonify({"message": "entry_date must be YYYY-MM-DD."}), 400
        entry.entry_date = parsed

    string_fields = (
    "sub_category", "generated_by", "revenue_type", "patient_name",
    "patient_place", "client_name", "gst_number", "remarks",
    "tax_invoice_number",
    # ✅ NEW — was missing before
    "employee_name", "vehicle_type", "purpose",
)
    for field in string_fields:
        if field in data:
            setattr(entry, field, _clean(data[field]))

    if "gst_tax_percent" in data:
        value = data["gst_tax_percent"]
        if value in (None, ""):
            entry.gst_tax_percent = None
        else:
            try:
                entry.gst_tax_percent = float(value)
            except (TypeError, ValueError):
                return jsonify({"message": "gst_tax_percent must be numeric."}), 400

    db.session.commit()
    return jsonify({"message": "Entry updated.", "entry": entry.to_dict()}), 200


# ---------------------------------------------------------------------------
# Delete entry
# ---------------------------------------------------------------------------

@dental_bp.route("/entries/<int:entry_id>", methods=["DELETE"])
@role_required("Dental")
def delete_entry(entry_id):
    # Same restriction as update — delete is only allowed for genuine Dental rows.
    entry = FinanceEntry.query.filter_by(id=entry_id, department=DEPARTMENT).first()
    if not entry:
        return jsonify({"message": "Entry not found."}), 404
    db.session.delete(entry)
    db.session.commit()
    return jsonify({"message": "Entry deleted."}), 200
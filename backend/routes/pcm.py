# backend/routes/pcm.py
"""PCM finance routes — Income/Expenses/Capital entries with Home Health categories.
Now includes salary entries from Corporate Management.
"""
from datetime import datetime, date
from flask import Blueprint, request, jsonify, send_file
from flask_jwt_extended import get_jwt_identity
from sqlalchemy import or_

from models import db, FinanceEntry, ENTRY_TYPES, DEPARTMENT_CONFIG
from utils import role_required
from excel_utils import parse_finance_entries_workbook, build_finance_entries_workbook

DEPARTMENT = "PCM"
CONFIG = DEPARTMENT_CONFIG[DEPARTMENT]
CAPITAL_CATEGORIES = (
    "Equity Infusion",
    "Partner Contribution",
    "Asset Capitalization",
    "Reserve Fund Transfer",
    "Other Capital",
)

pcm_bp = Blueprint("pcm", __name__, url_prefix="/api/pcm")


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


@pcm_bp.route("/options", methods=["GET"])
@role_required("PCM")
def options():
    salary_category = DEPARTMENT_CONFIG.get("Corporate", {}).get("is_salary_category", "Personnel & Payroll")
    return jsonify({
        "department": DEPARTMENT,
        "entry_types": CONFIG.get("entry_types", ENTRY_TYPES),
        "categories": CONFIG["categories"],
        "revenue_types": CONFIG["revenue_types"],
        "show_generated_by": CONFIG["show_generated_by"],
        "show_revenue_type": CONFIG["show_revenue_type"],
        "show_patient_fields": CONFIG["show_patient_fields"],
        "is_salary_category": salary_category,
        "capital_categories": list(CAPITAL_CATEGORIES),
    }), 200


@pcm_bp.route("/entries", methods=["POST"])
@role_required("PCM")
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
            fund_category=capital_category,
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
    remarks = (data.get("remarks") or "").strip()
    patient_name = (data.get("patient_name") or "").strip() or None
    patient_place = (data.get("patient_place") or "").strip() or None
    entry_date = _parse_date(data.get("entry_date"), default=date.today())

    employee_name = (data.get("employee_name") or "").strip() or None
    purpose = (data.get("purpose") or "").strip() or None
    vehicle_type = (data.get("vehicle_type") or "").strip() or None

    salary_category = DEPARTMENT_CONFIG.get("Corporate", {}).get("is_salary_category", "Personnel & Payroll")
    is_salary = (entry_type == "Expenses" and category == salary_category)

    errors = []

    if is_salary:
        errors.append("Salaries must be entered by Corporate Management only.")

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
        amount = 0

    if entry_type == "Expenses" and not is_salary and not remarks:
        errors.append("Remarks are required.")

    if errors:
        return jsonify({"message": "Validation failed.", "errors": errors}), 400

    entry = FinanceEntry(
        department=DEPARTMENT,
        entry_type=entry_type,
        category=category,
        patient_name=patient_name,
        patient_place=patient_place,
        amount=amount,
        remarks=remarks,
        entry_date=entry_date,
        created_by_id=get_jwt_identity(),
        employee_name=employee_name,
        purpose=purpose,
        vehicle_type=vehicle_type,
    )
    db.session.add(entry)
    db.session.commit()

    return jsonify({"message": "Entry created.", "entry": entry.to_dict()}), 201


@pcm_bp.route("/entries", methods=["GET"])
@role_required("PCM")
def list_entries():
    query = FinanceEntry.query.filter_by(department=DEPARTMENT)
    query = _apply_date_filters(query)

    salary_category = DEPARTMENT_CONFIG.get("Corporate", {}).get("is_salary_category", "Personnel & Payroll")
    salary_query = FinanceEntry.query.filter(
        FinanceEntry.department == "Corporate",
        FinanceEntry.exec_department == "PCM",
        FinanceEntry.entry_type == "Expenses",
        FinanceEntry.category == salary_category
    )
    start_date = _parse_date(request.args.get("start_date"))
    end_date = _parse_date(request.args.get("end_date"))
    if start_date:
        salary_query = salary_query.filter(FinanceEntry.entry_date >= start_date)
    if end_date:
        salary_query = salary_query.filter(FinanceEntry.entry_date <= end_date)

    combined_query = query.union(salary_query)

    entry_type = request.args.get("entry_type")
    if entry_type in ENTRY_TYPES:
        combined_query = combined_query.filter(FinanceEntry.entry_type == entry_type)

    category = request.args.get("category")
    if category:
        combined_query = combined_query.filter(FinanceEntry.category == category)

    search = request.args.get("search")
    if search:
        like = f"%{search}%"
        combined_query = combined_query.filter(
            or_(
                FinanceEntry.remarks.ilike(like),
                FinanceEntry.patient_name.ilike(like),
                FinanceEntry.patient_place.ilike(like),
                FinanceEntry.category.ilike(like),
                FinanceEntry.employee_name.ilike(like),
                FinanceEntry.client_name.ilike(like),
            )
        )

    combined_query = combined_query.order_by(FinanceEntry.entry_date.desc(), FinanceEntry.id.desc())
    return jsonify({"entries": [e.to_dict() for e in combined_query.all()]}), 200


@pcm_bp.route("/entries/<int:entry_id>", methods=["PUT"])
@role_required("PCM")
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
    new_type = data.get("entry_type", entry.entry_type)
    allowed_categories = CONFIG["categories"].get(new_type, [])

    errors = []

    salary_category = DEPARTMENT_CONFIG.get("Corporate", {}).get("is_salary_category", "Personnel & Payroll")
    new_category = data.get("category", entry.category)
    if new_category == salary_category and entry.category != salary_category:
        errors.append("Salaries must be entered by Corporate Management only.")

    if "entry_type" in data and data["entry_type"] in ENTRY_TYPES:
        entry.entry_type = data["entry_type"]

    if "category" in data:
        if data["category"] not in allowed_categories:
            errors.append(f"category must be one of: {', '.join(allowed_categories)}.")
        else:
            entry.category = data["category"]

    if "patient_name" in data:
        entry.patient_name = (data["patient_name"] or "").strip() or None
    if "patient_place" in data:
        entry.patient_place = (data["patient_place"] or "").strip() or None
    if "amount" in data:
        try:
            amount = float(data["amount"])
            if amount > 0:
                entry.amount = amount
        except (TypeError, ValueError):
            pass
    if "remarks" in data:
        entry.remarks = (data["remarks"] or "").strip()
    if "entry_date" in data:
        parsed = _parse_date(data["entry_date"])
        if parsed:
            entry.entry_date = parsed

    if "employee_name" in data:
        entry.employee_name = (data["employee_name"] or "").strip() or None
    if "purpose" in data:
        entry.purpose = (data["purpose"] or "").strip() or None
    if "vehicle_type" in data:
        entry.vehicle_type = (data["vehicle_type"] or "").strip() or None

    if entry.entry_type == "Expenses" and entry.category != salary_category and not entry.remarks:
        errors.append("Remarks are required.")

    if errors:
        return jsonify({"message": "Validation failed.", "errors": errors}), 400

    db.session.commit()
    return jsonify({"message": "Entry updated.", "entry": entry.to_dict()}), 200


@pcm_bp.route("/entries/<int:entry_id>", methods=["DELETE"])
@role_required("PCM")
def delete_entry(entry_id):
    entry = FinanceEntry.query.filter_by(id=entry_id, department=DEPARTMENT).first()
    if not entry:
        return jsonify({"message": "Entry not found."}), 404
    db.session.delete(entry)
    db.session.commit()
    return jsonify({"message": "Entry deleted."}), 200


@pcm_bp.route("/summary", methods=["GET"])
@role_required("PCM")
def finance_summary():
    query = FinanceEntry.query.filter_by(department=DEPARTMENT)
    query = _apply_date_filters(query)

    salary_category = DEPARTMENT_CONFIG.get("Corporate", {}).get("is_salary_category", "Personnel & Payroll")
    salary_query = FinanceEntry.query.filter(
        FinanceEntry.department == "Corporate",
        FinanceEntry.exec_department == "PCM",
        FinanceEntry.entry_type == "Expenses",
        FinanceEntry.category == salary_category
    )
    start_date = _parse_date(request.args.get("start_date"))
    end_date = _parse_date(request.args.get("end_date"))
    if start_date:
        salary_query = salary_query.filter(FinanceEntry.entry_date >= start_date)
    if end_date:
        salary_query = salary_query.filter(FinanceEntry.entry_date <= end_date)

    combined_query = query.union(salary_query)
    entries = combined_query.all()

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


@pcm_bp.route("/import", methods=["POST"])
@role_required("PCM")
def import_entries():
    file = request.files.get("file")
    if not file or file.filename == "":
        return jsonify({"message": "No file uploaded."}), 400
    if not file.filename.lower().endswith((".xlsx", ".xlsm")):
        return jsonify({"message": "Please upload an .xlsx file."}), 400

    try:
        rows, errors = parse_finance_entries_workbook(
            file.stream, CONFIG, ENTRY_TYPES, CONFIG["categories"]
        )
    except Exception:
        return jsonify({"message": "Could not read the uploaded file. Make sure it's a valid .xlsx."}), 400

    if not rows:
        return jsonify({
            "message": "No valid rows found in the uploaded sheet.",
            "imported": 0,
            "errors": errors,
        }), 400

    created_by_id = get_jwt_identity()
    for row in rows:
        db.session.add(FinanceEntry(
            department=DEPARTMENT,
            entry_type=row["entry_type"],
            category=row["category"],
            patient_name=row.get("patient_name"),
            patient_place=row.get("patient_place"),
            amount=row["amount"],
            remarks=row.get("remarks"),
            entry_date=row["entry_date"],
            created_by_id=created_by_id,
        ))
    db.session.commit()

    return jsonify({
        "message": f"Imported {len(rows)} entr{'y' if len(rows) == 1 else 'ies'}.",
        "imported": len(rows),
        "errors": errors,
    }), 201


@pcm_bp.route("/export", methods=["GET"])
@role_required("PCM")
def export_entries():
    query = _apply_date_filters(FinanceEntry.query.filter_by(department=DEPARTMENT))
    entries = query.order_by(FinanceEntry.entry_date.asc(), FinanceEntry.id.asc()).all()

    buffer = build_finance_entries_workbook(entries, CONFIG, DEPARTMENT)
    filename = f"PCM_Finance_Entries_{date.today().isoformat()}.xlsx"

    return send_file(
        buffer,
        as_attachment=True,
        download_name=filename,
        mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )
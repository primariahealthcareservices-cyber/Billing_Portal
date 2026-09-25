# backend/routes/corporate.py
import sys
import traceback
from datetime import datetime, date
from flask import Blueprint, request, jsonify
from flask_jwt_extended import get_jwt_identity

from models import db, FinanceEntry, ENTRY_TYPES, DEPARTMENT_CONFIG
from utils import role_required

DEPARTMENT = "Corporate"
CONFIG = DEPARTMENT_CONFIG[DEPARTMENT]
EXEC_DEPARTMENTS = CONFIG.get("exec_departments", [])

corporate_bp = Blueprint("corporate", __name__, url_prefix="/api/corporate")


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


def _to_float_or_none(value):
    if value is None or value == "":
        return None
    try:
        return float(value)
    except (ValueError, TypeError):
        return None


@corporate_bp.route("/options", methods=["GET"])
@role_required("Corporate")
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
        "gst_required_categories": CONFIG["gst_required_categories"],
        "show_items": CONFIG["show_items"],
        "show_invoice": CONFIG["show_invoice"],
        "show_gst_tax": CONFIG["show_gst_tax"],
        "show_tax_invoice_number": CONFIG["show_tax_invoice_number"],
        "exec_departments": EXEC_DEPARTMENTS,
        "is_salary_category": CONFIG.get("is_salary_category"),
    }), 200


@corporate_bp.route("/entries", methods=["POST"])
@role_required("Corporate")
def create_entry():
    try:
        data = request.get_json(silent=True) or {}
        print("📥 Received payload:", data)

        # ========== CAPITAL ENTRY ==========
        if data.get("entry_type") == "Capital":
            return _create_capital_entry(data)

        # ========== MULTI SALARY ENTRIES ==========
        if "entries" in data and isinstance(data["entries"], list):
            salary_entries = data["entries"]
            if not salary_entries:
                return jsonify({"message": "No employee entries provided."}), 400

            created = []
            errors = []
            for idx, emp_data in enumerate(salary_entries):
                emp_errors = _validate_salary_entry(emp_data)
                if emp_errors:
                    errors.append(f"Employee {idx+1}: " + "; ".join(emp_errors))
                    continue

                entry = _create_single_salary_entry(emp_data)
                if entry:
                    created.append(entry)
                else:
                    errors.append(f"Employee {idx+1}: failed to create.")

            if errors and not created:
                return jsonify({"message": "All employees failed.", "errors": errors}), 400
            elif errors:
                db.session.commit()
                return jsonify({
                    "message": f"Created {len(created)} of {len(salary_entries)} salary entries.",
                    "errors": errors,
                    "entries": [e.to_dict() for e in created]
                }), 201
            else:
                db.session.commit()
                return jsonify({
                    "message": f"Created {len(created)} salary entries.",
                    "entries": [e.to_dict() for e in created]
                }), 201

        # ========== SINGLE INCOME/EXPENSE ENTRY ==========
        errors = []
        entry_type = data.get("entry_type")
        category = data.get("category")
        generated_by = (data.get("generated_by") or "").strip()
        client_name = (data.get("client_name") or "").strip() or None
        amount = data.get("amount")
        remarks = data.get("remarks", "")
        entry_date = _parse_date(data.get("entry_date"), default=date.today())
        exec_department = data.get("exec_department") or None
        employee_name = (data.get("employee_name") or "").strip() or None
        salary_amount = _to_float_or_none(data.get("salary_amount"))
        allowance_amount = _to_float_or_none(data.get("allowance_amount"))

        if entry_type not in ENTRY_TYPES:
            errors.append("entry_type must be Income, Expenses, or Capital.")

        allowed_categories = CONFIG["categories"].get(entry_type, [])
        if category not in allowed_categories:
            errors.append(f"category must be one of: {', '.join(allowed_categories)}.")

        salary_category = CONFIG.get("is_salary_category")
        if entry_type == "Expenses" and category == salary_category:
            if not exec_department:
                errors.append("exec_department is required for Payroll Salaries.")
            elif exec_department not in EXEC_DEPARTMENTS:
                errors.append(f"exec_department must be one of: {', '.join(EXEC_DEPARTMENTS)}.")
            if not employee_name:
                errors.append("employee_name is required for Payroll Salaries.")
            sal = salary_amount or 0
            allow = allowance_amount or 0
            if sal <= 0 and allow <= 0:
                errors.append("At least one of Salary or TADA must be greater than 0.")

        try:
            amount = float(amount)
            if amount <= 0:
                errors.append("amount must be greater than 0.")
        except (TypeError, ValueError):
            errors.append("amount must be a number.")

        if errors:
            print("❌ Validation errors:", errors)
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
        db.session.add(entry)
        db.session.commit()
        print("✅ Entry created:", entry.id)
        return jsonify({"message": "Entry created.", "entry": entry.to_dict()}), 201

    except Exception as e:
        print("🔴 Exception in create_entry:", file=sys.stderr)
        traceback.print_exc()
        db.session.rollback()
        return jsonify({"message": "Internal server error", "error": str(e)}), 500


def _create_capital_entry(data):
    """Create a Capital entry with validation."""
    errors = []

    client_name = (data.get("client_name") or "").strip()
    amount = data.get("amount")
    purpose = (data.get("purpose") or "").strip()
    remarks = (data.get("remarks") or "").strip()
    entry_date = _parse_date(data.get("entry_date"), default=date.today())
    category = data.get("category", "Other Capital")

    if not client_name:
        errors.append("Name is required for Capital entries.")
    if not purpose:
        errors.append("Purpose is required for Capital entries.")
    if not category:
        errors.append("Category is required.")

    try:
        amount = float(amount)
        if amount <= 0:
            errors.append("Amount must be greater than 0.")
    except (TypeError, ValueError):
        errors.append("Amount must be a valid number.")

    if errors:
        return jsonify({"message": "Validation failed.", "errors": errors}), 400

    entry = FinanceEntry(
        department="Corporate",
        entry_type="Capital",
        category=category,
        generated_by=None,
        client_name=client_name,
        amount=amount,
        remarks=remarks,
        purpose=purpose,
        entry_date=entry_date,
        created_by_id=get_jwt_identity(),
    )
    db.session.add(entry)
    db.session.commit()
    print("✅ Capital entry created:", entry.id)
    return jsonify({"message": "Capital entry created.", "entry": entry.to_dict()}), 201


def _validate_salary_entry(emp_data):
    errors = []
    exec_department = emp_data.get("exec_department")
    employee_name = (emp_data.get("employee_name") or "").strip()
    salary_amount = _to_float_or_none(emp_data.get("salary_amount"))
    allowance_amount = _to_float_or_none(emp_data.get("allowance_amount"))

    if not exec_department:
        errors.append("Department is required.")
    elif exec_department not in EXEC_DEPARTMENTS:
        errors.append(f"Department must be one of: {', '.join(EXEC_DEPARTMENTS)}.")
    if not employee_name:
        errors.append("Employee name is required.")
    sal = salary_amount or 0
    allow = allowance_amount or 0
    if sal <= 0 and allow <= 0:
        errors.append("At least one of Salary or TADA must be greater than 0.")
    return errors


def _create_single_salary_entry(emp_data):
    salary_amount = _to_float_or_none(emp_data.get("salary_amount"))
    allowance_amount = _to_float_or_none(emp_data.get("allowance_amount"))
    total = (salary_amount or 0) + (allowance_amount or 0)
    if total <= 0:
        return None
    entry = FinanceEntry(
        department="Corporate",
        entry_type="Expenses",
        category=CONFIG.get("is_salary_category"),
        generated_by=None,
        client_name=None,
        amount=total,
        remarks=emp_data.get("remarks", ""),
        entry_date=_parse_date(emp_data.get("entry_date"), default=date.today()),
        created_by_id=get_jwt_identity(),
        exec_department=emp_data.get("exec_department"),
        employee_name=(emp_data.get("employee_name") or "").strip(),
        salary_amount=salary_amount,
        allowance_amount=allowance_amount,
    )
    db.session.add(entry)
    return entry


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

    exec_dept = request.args.get("exec_department")
    if exec_dept:
        query = query.filter(FinanceEntry.exec_department == exec_dept)

    search = request.args.get("search")
    if search:
        like = f"%{search}%"
        query = query.filter(
            (FinanceEntry.generated_by.ilike(like))
            | (FinanceEntry.client_name.ilike(like))
            | (FinanceEntry.employee_name.ilike(like))
            | (FinanceEntry.remarks.ilike(like))
            | (FinanceEntry.purpose.ilike(like))
        )

    query = query.order_by(FinanceEntry.entry_date.desc(), FinanceEntry.id.desc())
    entries = query.all()
    print(f"Corporate entries returned: {len(entries)}")
    return jsonify({"entries": [e.to_dict() for e in entries]}), 200


@corporate_bp.route("/entries/<int:entry_id>", methods=["PUT"])
@role_required("Corporate")
def update_entry(entry_id):
    entry = FinanceEntry.query.filter_by(id=entry_id, department=DEPARTMENT).first()
    if not entry:
        return jsonify({"message": "Entry not found."}), 404

    data = request.get_json(silent=True) or {}
    print(f"📝 Updating entry {entry_id} with data:", data)

    # ===== CAPITAL ENTRY UPDATE =====
    if entry.entry_type == "Capital":
        if "client_name" in data:
            entry.client_name = (data["client_name"] or "").strip() or None
        if "amount" in data:
            try:
                amt = float(data["amount"])
                if amt > 0:
                    entry.amount = amt
            except (TypeError, ValueError):
                pass
        if "purpose" in data:
            entry.purpose = (data["purpose"] or "").strip() or None
        if "entry_date" in data:
            parsed = _parse_date(data["entry_date"])
            if parsed:
                entry.entry_date = parsed
        if "category" in data:
            allowed = CONFIG["categories"].get("Capital", [])
            if data["category"] in allowed:
                entry.category = data["category"]
        if "remarks" in data:
            entry.remarks = data["remarks"]

        db.session.commit()
        return jsonify({"message": "Capital entry updated.", "entry": entry.to_dict()}), 200

    # ===== REGULAR ENTRY UPDATE =====
    if "entry_type" in data and data["entry_type"] in ENTRY_TYPES:
        entry.entry_type = data["entry_type"]
    if "category" in data:
        allowed = CONFIG["categories"].get(entry.entry_type, [])
        if data["category"] in allowed:
            entry.category = data["category"]
    if "generated_by" in data:
        entry.generated_by = (data["generated_by"] or "").strip() or None
    if "client_name" in data:
        entry.client_name = (data["client_name"] or "").strip() or None
    if "amount" in data:
        try:
            amt = float(data["amount"])
            if amt > 0:
                entry.amount = amt
        except (TypeError, ValueError):
            pass
    if "remarks" in data:
        entry.remarks = data["remarks"]
    if "entry_date" in data:
        parsed = _parse_date(data["entry_date"])
        if parsed:
            entry.entry_date = parsed
    if "exec_department" in data:
        if data["exec_department"] not in EXEC_DEPARTMENTS:
            return jsonify({"message": f"exec_department must be one of: {', '.join(EXEC_DEPARTMENTS)}."}), 400
        entry.exec_department = data["exec_department"]
    if "employee_name" in data:
        entry.employee_name = (data["employee_name"] or "").strip() or None
    if "salary_amount" in data:
        entry.salary_amount = _to_float_or_none(data["salary_amount"])
    if "allowance_amount" in data:
        entry.allowance_amount = _to_float_or_none(data["allowance_amount"])

    db.session.commit()
    print(f"✅ Entry {entry_id} updated.")
    return jsonify({"message": "Entry updated.", "entry": entry.to_dict()}), 200


@corporate_bp.route("/entries/<int:entry_id>", methods=["DELETE"])
@role_required("Corporate")
def delete_entry(entry_id):
    entry = FinanceEntry.query.filter_by(id=entry_id, department=DEPARTMENT).first()
    if not entry:
        return jsonify({"message": "Entry not found."}), 404
    db.session.delete(entry)
    db.session.commit()
    return jsonify({"message": "Entry deleted."}), 200


@corporate_bp.route("/summary", methods=["GET"])
@role_required("Corporate")
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
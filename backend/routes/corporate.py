# backend/routes/corporate.py
import sys
import traceback
from datetime import datetime, date
from flask import Blueprint, request, jsonify
from flask_jwt_extended import get_jwt_identity

from models import db, FinanceEntry, ENTRY_TYPES, DEPARTMENT_CONFIG, SALARY_CATEGORY
from utils import role_required

DEPARTMENT = "Corporate"
CONFIG = DEPARTMENT_CONFIG[DEPARTMENT]
EXEC_DEPARTMENTS = CONFIG.get("exec_departments", [])

# Every real department except Corporate can receive a Corpus Fund transfer.
VALID_TRANSFER_TARGETS = [d for d in DEPARTMENT_CONFIG.keys() if d != "Corporate"]

CORPUS_FUND_TYPE = "Corpus Fund"       # entry_type of the row in the TARGET department
CORPUS_FUND_CATEGORY = "Corpus Fund"   # category of the Corporate Expenses row

corporate_bp = Blueprint("corporate", __name__, url_prefix="/api/corporate")


# ----------------------------------------------------------------- helpers
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


def _clean_str(value):
    """Trim a value and return None if the result is empty."""
    if value is None:
        return None
    s = str(value).strip()
    return s or None


def _norm_exec_dept(value):
    """
    Normalize exec_department input:
      - strips whitespace
      - returns None for "" / null / whitespace-only
      - raises ValueError for non-string garbage
    """
    if value is None:
        return None
    if not isinstance(value, str):
        raise ValueError("exec_department must be a string.")
    return value.strip() or None


def _is_corporate_corpus_expense(entry):
    """Corporate-side row: Expenses -> Corpus Fund."""
    return (
        entry.department == DEPARTMENT
        and entry.entry_type == "Expenses"
        and entry.category == CORPUS_FUND_CATEGORY
    )


def _linked_dept_rows(corporate_entry):
    """Department-side Corpus Fund rows created from this Corporate expense."""
    return FinanceEntry.query.filter_by(
        linked_entry_id=corporate_entry.id,
        entry_type=CORPUS_FUND_TYPE,
    ).all()


# ----------------------------------------------------------------- options
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
        "capital_transfer_departments": list(VALID_TRANSFER_TARGETS),
        # Departments selectable under Expenses -> Corpus Fund
        "corpus_fund_departments": list(VALID_TRANSFER_TARGETS),
        "corpus_fund_category": CORPUS_FUND_CATEGORY,
        "is_salary_category": SALARY_CATEGORY,
    }), 200


# ------------------------------------------------------------------ create
@corporate_bp.route("/entries", methods=["POST"])
@role_required("Corporate")
def create_entry():
    try:
        data = request.get_json(silent=True) or {}
        print("📥 Received payload:", data)

        entry_type_in = (data.get("entry_type") or "").strip()
        category_in = (data.get("category") or "").strip()
        target_dept = (data.get("exec_department") or data.get("department") or "").strip()

        # ========== EXPENSES -> CORPUS FUND (Corporate expense + dept Corpus Fund) ==========
        is_corpus_fund_request = (
            entry_type_in == CORPUS_FUND_TYPE
            or (entry_type_in == "Expenses" and category_in == CORPUS_FUND_CATEGORY)
        )
        if is_corpus_fund_request:
            return _create_corpus_fund_entry(data)

        # ========== CAPITAL ENTRY (Corporate's own Capital) ==========
        if entry_type_in == "Capital":
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

        # ========== SINGLE INCOME/EXPENSE ENTRY (Corporate's own) ==========
        errors = []
        entry_type = entry_type_in
        category = category_in
        generated_by = (data.get("generated_by") or "").strip()
        client_name = (data.get("client_name") or "").strip() or None
        amount = data.get("amount")
        remarks = data.get("remarks", "")
        entry_date = _parse_date(data.get("entry_date"), default=date.today())
        exec_department = _clean_str(data.get("exec_department"))
        employee_name = _clean_str(data.get("employee_name"))
        salary_amount = _to_float_or_none(data.get("salary_amount"))
        allowance_amount = _to_float_or_none(data.get("allowance_amount"))

        if entry_type not in ENTRY_TYPES:
            errors.append("entry_type must be Income, Expenses, or Capital.")

        allowed_categories = CONFIG["categories"].get(entry_type, [])
        if category not in allowed_categories:
            errors.append(f"category must be one of: {', '.join(allowed_categories)}.")

        if entry_type == "Expenses" and category == SALARY_CATEGORY:
            if not exec_department:
                errors.append("exec_department is required for Salary & Payrolls.")
            elif exec_department not in EXEC_DEPARTMENTS:
                errors.append(f"exec_department must be one of: {', '.join(EXEC_DEPARTMENTS)}.")
            if not employee_name:
                errors.append("employee_name is required for Salary & Payrolls.")
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


def _create_corpus_fund_entry(data):
    """Expenses -> Corpus Fund, entered from the Corporate dashboard."""
    if isinstance(data.get("entries"), list):
        return _create_corpus_fund_batch(data)

    errors = []

    target_dept = (data.get("exec_department") or data.get("department") or "").strip()
    amount_raw = data.get("amount")
    purpose = (data.get("purpose") or "").strip()
    remarks = (data.get("remarks") or "").strip()
    generated_by = (data.get("generated_by") or "").strip() or None
    entry_date = _parse_date(data.get("entry_date"), default=date.today())
    client_name = (data.get("client_name") or "").strip()

    if not target_dept:
        errors.append("Department is required.")
    elif target_dept == "Corporate":
        errors.append("Department must not be Corporate.")
    elif target_dept not in VALID_TRANSFER_TARGETS:
        errors.append(f"Department must be one of: {', '.join(VALID_TRANSFER_TARGETS)}.")

    if not purpose:
        errors.append("Purpose is required.")

    amount = None
    try:
        amount = float(amount_raw)
        if amount <= 0:
            errors.append("Amount must be greater than 0.")
    except (TypeError, ValueError):
        errors.append("Amount must be a valid number.")

    if errors:
        return jsonify({"message": "Validation failed.", "errors": errors}), 400

    user_id = get_jwt_identity()

    try:
        corporate_row = FinanceEntry(
            department=DEPARTMENT,
            entry_type="Expenses",
            category=CORPUS_FUND_CATEGORY,
            generated_by=generated_by,
            client_name=client_name or f"Corpus Fund → {target_dept}",
            amount=amount,
            purpose=purpose,
            remarks=remarks,
            entry_date=entry_date,
            exec_department=target_dept,
            created_by_id=user_id,
        )
        db.session.add(corporate_row)
        db.session.flush()

        dept_row = FinanceEntry(
            department=target_dept,
            entry_type=CORPUS_FUND_TYPE,
            category=CORPUS_FUND_CATEGORY,
            sub_category=None,
            fund_category=None,
            generated_by=generated_by,
            client_name=client_name or f"Corporate → {target_dept}",
            amount=amount,
            purpose=purpose,
            remarks=remarks,
            entry_date=entry_date,
            exec_department=target_dept,
            created_by_id=user_id,
            linked_entry_id=corporate_row.id,
        )
        db.session.add(dept_row)
        db.session.commit()
    except Exception as exc:
        db.session.rollback()
        traceback.print_exc()
        return jsonify({
            "message": "Failed to create Corpus Fund entry.",
            "error": str(exc),
        }), 500

    print(f"✅ Corpus Fund: Corporate expense {corporate_row.id} + {target_dept} fund {dept_row.id}")
    return jsonify({
        "message": f"Corpus Fund recorded in Corporate Expenses and posted to {target_dept}.",
        "entry": corporate_row.to_dict(),
        "department_entry": dept_row.to_dict(),
    }), 201


def _create_corpus_fund_batch(data):
    """Split one Corpus Fund expense across several departments."""
    rows = data.get("entries") or []
    if not rows:
        return jsonify({"message": "Add at least one department."}), 400

    entry_date = _parse_date(data.get("entry_date"), default=date.today())
    generated_by = (data.get("generated_by") or "").strip() or None
    client_name = (data.get("client_name") or "").strip()
    shared_purpose = (data.get("purpose") or "").strip()
    shared_remarks = (data.get("remarks") or "").strip()

    errors = []
    clean = []
    for idx, row in enumerate(rows, start=1):
        dept = (row.get("exec_department") or row.get("department") or "").strip()
        purpose = (row.get("purpose") or shared_purpose or "").strip()
        remarks = (row.get("remarks") or shared_remarks or "").strip()
        row_errors = []

        if not dept:
            row_errors.append("Department is required.")
        elif dept == "Corporate":
            row_errors.append("Department must not be Corporate.")
        elif dept not in VALID_TRANSFER_TARGETS:
            row_errors.append("Invalid department.")

        if not purpose:
            row_errors.append("Purpose is required.")

        amount = None
        try:
            amount = float(row.get("amount"))
            if amount <= 0:
                row_errors.append("Amount must be greater than 0.")
        except (TypeError, ValueError):
            row_errors.append("Amount must be a valid number.")

        if row_errors:
            errors.append(f"Row {idx}: " + " ".join(row_errors))
        else:
            clean.append((dept, amount, purpose, remarks))

    if errors:
        return jsonify({"message": "Validation failed.", "errors": errors}), 400

    user_id = get_jwt_identity()
    created = []
    try:
        for dept, amount, purpose, remarks in clean:
            corporate_row = FinanceEntry(
                department=DEPARTMENT,
                entry_type="Expenses",
                category=CORPUS_FUND_CATEGORY,
                generated_by=generated_by,
                client_name=client_name or f"Corpus Fund → {dept}",
                amount=amount,
                purpose=purpose,
                remarks=remarks,
                entry_date=entry_date,
                exec_department=dept,
                created_by_id=user_id,
            )
            db.session.add(corporate_row)
            db.session.flush()

            dept_row = FinanceEntry(
                department=dept,
                entry_type=CORPUS_FUND_TYPE,
                category=CORPUS_FUND_CATEGORY,
                generated_by=generated_by,
                client_name=client_name or f"Corporate → {dept}",
                amount=amount,
                purpose=purpose,
                remarks=remarks,
                entry_date=entry_date,
                exec_department=dept,
                created_by_id=user_id,
                linked_entry_id=corporate_row.id,
            )
            db.session.add(dept_row)
            created.append(corporate_row)

        db.session.commit()
    except Exception as exc:
        db.session.rollback()
        traceback.print_exc()
        return jsonify({
            "message": "Failed to create Corpus Fund entries.",
            "error": str(exc),
        }), 500

    total = sum(c[1] for c in clean)
    return jsonify({
        "message": f"Corpus Fund split across {len(created)} department(s) (₹{total:,.2f}).",
        "entries": [e.to_dict() for e in created],
    }), 201


def _create_capital_entry(data):
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
    exec_department = _clean_str(emp_data.get("exec_department"))
    employee_name = _clean_str(emp_data.get("employee_name"))
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
        category=SALARY_CATEGORY,
        generated_by=None,
        client_name=None,
        amount=total,
        remarks=emp_data.get("remarks", ""),
        entry_date=_parse_date(emp_data.get("entry_date"), default=date.today()),
        created_by_id=get_jwt_identity(),
        exec_department=_clean_str(emp_data.get("exec_department")),
        employee_name=_clean_str(emp_data.get("employee_name")),
        salary_amount=salary_amount,
        allowance_amount=allowance_amount,
    )
    db.session.add(entry)
    return entry


# -------------------------------------------------------------------- list
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


# ------------------------------------------------------------------ update
@corporate_bp.route("/entries/<int:entry_id>", methods=["PUT"])
@role_required("Corporate")
def update_entry(entry_id):
    entry = FinanceEntry.query.filter_by(id=entry_id, department=DEPARTMENT).first()
    if not entry:
        return jsonify({"message": "Entry not found."}), 404

    data = request.get_json(silent=True) or {}
    print(f"📝 Updating entry {entry_id} with data:", data)

    # ---- Capital ----
    if entry.entry_type == "Capital":
        if "client_name" in data:
            entry.client_name = _clean_str(data["client_name"])
        if "amount" in data:
            try:
                amt = float(data["amount"])
                if amt > 0:
                    entry.amount = amt
            except (TypeError, ValueError):
                pass
        if "purpose" in data:
            entry.purpose = _clean_str(data["purpose"])
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

    # ---- Expenses -> Corpus Fund (Corporate row + linked department row) ----
    if _is_corporate_corpus_expense(entry):
        linked_rows = _linked_dept_rows(entry)

        if "exec_department" in data or "department" in data:
            new_dept = _clean_str(data.get("exec_department") or data.get("department"))
            if new_dept not in VALID_TRANSFER_TARGETS:
                return jsonify({
                    "message": f"Department must be one of: {', '.join(VALID_TRANSFER_TARGETS)}."
                }), 400
            entry.exec_department = new_dept
            for row in linked_rows:
                row.department = new_dept
                row.exec_department = new_dept

        if "amount" in data:
            try:
                amt = float(data["amount"])
                if amt > 0:
                    entry.amount = amt
                    for row in linked_rows:
                        row.amount = amt
            except (TypeError, ValueError):
                pass
        if "purpose" in data:
            val = _clean_str(data["purpose"])
            entry.purpose = val
            for row in linked_rows:
                row.purpose = val
        if "remarks" in data:
            entry.remarks = data["remarks"]
            for row in linked_rows:
                row.remarks = data["remarks"]
        if "generated_by" in data:
            val = _clean_str(data["generated_by"])
            entry.generated_by = val
            for row in linked_rows:
                row.generated_by = val
        if "client_name" in data:
            val = _clean_str(data["client_name"])
            entry.client_name = val
            for row in linked_rows:
                row.client_name = val
        if "entry_date" in data:
            parsed = _parse_date(data["entry_date"])
            if parsed:
                entry.entry_date = parsed
                for row in linked_rows:
                    row.entry_date = parsed

        db.session.commit()
        return jsonify({
            "message": "Corpus Fund entry updated.",
            "entry": entry.to_dict(),
            "department_entries": [r.to_dict() for r in linked_rows],
        }), 200

    # ---- Legacy Corpus Fund type stored under Corporate (if any) ----
    if entry.entry_type == CORPUS_FUND_TYPE:
        if "amount" in data:
            try:
                amt = float(data["amount"])
                if amt > 0:
                    entry.amount = amt
            except (TypeError, ValueError):
                pass
        if "purpose" in data:
            entry.purpose = _clean_str(data["purpose"])
        if "remarks" in data:
            entry.remarks = data["remarks"]
        if "entry_date" in data:
            parsed = _parse_date(data["entry_date"])
            if parsed:
                entry.entry_date = parsed
        db.session.commit()
        return jsonify({"message": "Corpus Fund entry updated.", "entry": entry.to_dict()}), 200

    # ---- Generic Income / Expenses ----
    # Moving a normal entry INTO Corpus Fund would skip the department posting.
    if data.get("category") == CORPUS_FUND_CATEGORY or data.get("entry_type") == CORPUS_FUND_TYPE:
        return jsonify({
            "message": "Cannot convert an entry to Corpus Fund. Create a new Corpus Fund expense instead."
        }), 400

    # Apply simple field updates first (entry_type / category / strings / date)
    if "entry_type" in data and data["entry_type"] in ENTRY_TYPES:
        entry.entry_type = data["entry_type"]
    if "category" in data:
        allowed = CONFIG["categories"].get(entry.entry_type, [])
        if data["category"] in allowed:
            entry.category = data["category"]
    if "generated_by" in data:
        entry.generated_by = _clean_str(data["generated_by"])
    if "client_name" in data:
        entry.client_name = _clean_str(data["client_name"])
    if "remarks" in data:
        entry.remarks = data["remarks"]
    if "entry_date" in data:
        parsed = _parse_date(data["entry_date"])
        if parsed:
            entry.entry_date = parsed

    # ------------------------------------------------------------------
    # exec_department handling (the actual bug fix)
    # ------------------------------------------------------------------
    if "exec_department" in data:
        try:
            new_exec = _norm_exec_dept(data.get("exec_department"))
        except ValueError as exc:
            return jsonify({"message": str(exc)}), 400

        if new_exec is None:
            # Empty / whitespace -> clear the field (this was the 400 trigger).
            entry.exec_department = None
        elif new_exec not in EXEC_DEPARTMENTS:
            return jsonify({
                "message": f"exec_department must be one of: {', '.join(EXEC_DEPARTMENTS)}."
            }), 400
        else:
            entry.exec_department = new_exec

    # employee_name / salary_amount / allowance_amount (used for Salary rows)
    if "employee_name" in data:
        entry.employee_name = _clean_str(data["employee_name"])
    if "salary_amount" in data:
        entry.salary_amount = _to_float_or_none(data["salary_amount"])
    if "allowance_amount" in data:
        entry.allowance_amount = _to_float_or_none(data["allowance_amount"])

    # ------------------------------------------------------------------
    # Salary revalidation + amount sync
    # ------------------------------------------------------------------
    if entry.entry_type == "Expenses" and entry.category == SALARY_CATEGORY:
        sal = entry.salary_amount or 0
        allow = entry.allowance_amount or 0
        if not entry.exec_department:
            return jsonify({"message": "exec_department is required for Salary & Payrolls."}), 400
        if not entry.employee_name:
            return jsonify({"message": "employee_name is required for Salary & Payrolls."}), 400
        if sal <= 0 and allow <= 0:
            return jsonify({"message": "At least one of Salary or TADA must be greater than 0."}), 400
        # Keep amount in sync with salary + TADA (unless caller explicitly sent amount)
        if "amount" not in data:
            entry.amount = sal + allow
        else:
            try:
                amt = float(data["amount"])
                if amt > 0:
                    entry.amount = amt
            except (TypeError, ValueError):
                pass
    else:
        # Non-salary rows: apply amount if present
        if "amount" in data:
            try:
                amt = float(data["amount"])
                if amt > 0:
                    entry.amount = amt
            except (TypeError, ValueError):
                pass

    db.session.commit()
    print(f"✅ Entry {entry_id} updated.")
    return jsonify({"message": "Entry updated.", "entry": entry.to_dict()}), 200


# ------------------------------------------------------------------ delete
@corporate_bp.route("/entries/<int:entry_id>", methods=["DELETE"])
@role_required("Corporate")
def delete_entry(entry_id):
    entry = FinanceEntry.query.filter_by(id=entry_id, department=DEPARTMENT).first()
    if not entry:
        return jsonify({"message": "Entry not found."}), 404

    if _is_corporate_corpus_expense(entry):
        for row in _linked_dept_rows(entry):
            db.session.delete(row)

    db.session.delete(entry)
    db.session.commit()
    return jsonify({"message": "Entry deleted."}), 200


# ----------------------------------------------------------------- summary
@corporate_bp.route("/summary", methods=["GET"])
@role_required("Corporate")
def finance_summary():
    entries = _apply_date_filters(FinanceEntry.query.filter_by(department=DEPARTMENT)).all()

    total_income = sum(float(e.amount) for e in entries if e.entry_type == "Income")
    total_expenses = sum(float(e.amount) for e in entries if e.entry_type == "Expenses")
    total_capital = sum(float(e.amount) for e in entries if e.entry_type == "Capital")

    total_corpus_fund = sum(
        float(e.amount) for e in entries
        if e.entry_type == "Expenses" and e.category == CORPUS_FUND_CATEGORY
    )

    by_date = {}
    for e in entries:
        key = e.entry_date.isoformat()
        by_date.setdefault(key, {"date": key, "income": 0, "expenses": 0, "capital": 0, "corpus_fund": 0})
        amt = float(e.amount)
        if e.entry_type == "Income":
            by_date[key]["income"] += amt
        elif e.entry_type == "Expenses":
            by_date[key]["expenses"] += amt
            if e.category == CORPUS_FUND_CATEGORY:
                by_date[key]["corpus_fund"] += amt
        elif e.entry_type == "Capital":
            by_date[key]["capital"] += amt
    trend = sorted(by_date.values(), key=lambda x: x["date"])

    by_category = {}
    for e in entries:
        by_category.setdefault(e.category, {"category": e.category, "amount": 0})
        by_category[e.category]["amount"] += float(e.amount)

    corpus_by_dept = {}
    for e in entries:
        if e.entry_type == "Expenses" and e.category == CORPUS_FUND_CATEGORY:
            d = e.exec_department or "Unassigned"
            corpus_by_dept[d] = corpus_by_dept.get(d, 0) + float(e.amount)

    return jsonify({
        "department": DEPARTMENT,
        "total_income": total_income,
        "total_expenses": total_expenses,
        "total_capital": total_capital,
        "total_corpus_fund": total_corpus_fund,
        "profit": total_income - total_expenses,
        "entry_count": len(entries),
        "trend": trend,
        "category_breakdown": list(by_category.values()),
        "corpus_fund_by_department": [
            {"department": k, "amount": v} for k, v in corpus_by_dept.items()
        ],
    }), 200
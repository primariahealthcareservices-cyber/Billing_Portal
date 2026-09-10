"""
Caredx routes.

Modules:
1. Lab Data Entry
2. Expenses (with Referral Amount)
3. Combined dashboard summary
4. Excel import/export

Caredx intentionally does NOT use the generic Finance Entry module.
"""

from datetime import datetime, date
from io import BytesIO

from flask import Blueprint, request, jsonify, send_file
from flask_jwt_extended import get_jwt_identity
from sqlalchemy import or_

from models import (
    db,
    User,
    CaredxLabEntry,
    CaredxExpense,
    FinanceEntry,
    DEPARTMENT_CONFIG,
)

from utils import role_required

from excel_utils import (
    parse_lab_entries_workbook,
    build_lab_entries_workbook,
)


caredx_bp = Blueprint(
    "caredx",
    __name__,
    url_prefix="/api/caredx",
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _parse_date(value, default=None):
    """
    Convert YYYY-MM-DD into a Python date.

    Returns default when value is empty or invalid.
    """
    if not value:
        return default

    if isinstance(value, date):
        return value

    try:
        return datetime.strptime(
            str(value),
            "%Y-%m-%d",
        ).date()
    except (ValueError, TypeError):
        return default


def _get_valid_user_id():
    """
    Return a valid users.id for the current JWT identity.

    Caredx created_by_id is nullable. This prevents an Excel import
    from failing when the JWT contains an ID that no longer exists
    in the users table.

    Returns:
        int | None
    """
    try:
        identity = get_jwt_identity()

        if identity is None:
            return None

        # JWT identity may be an integer or a string.
        user_id = int(identity)

        user = db.session.get(
            User,
            user_id,
        )

        if user is None:
            return None

        return user.id

    except (TypeError, ValueError):
        return None


def _apply_date_filters(query, date_column):
    """
    Apply optional start_date/end_date filters.
    """
    start_date = _parse_date(
        request.args.get("start_date")
    )

    end_date = _parse_date(
        request.args.get("end_date")
    )

    if start_date:
        query = query.filter(
            date_column >= start_date
        )

    if end_date:
        query = query.filter(
            date_column <= end_date
        )

    return query


def _lab_entry_from_payload(
    data,
    existing=None,
):
    """
    Validate and normalize Lab Data Entry data.
    """
    errors = []

    entry_date = _parse_date(
        data.get("entry_date")
    )

    patient_name = (
        data.get("patient_name") or ""
    ).strip()

    test_name = (
        data.get("test_name") or ""
    ).strip()

    if not entry_date:
        errors.append(
            "date is required (YYYY-MM-DD)."
        )

    if not patient_name:
        errors.append(
            "Name of the Patient is required."
        )

    if not test_name:
        errors.append(
            "Name of the Test is required."
        )

    numeric_fields = [
        "total_amount_paid",
        "cash",
        "online",
        "paid_to_other_labs",
        "rmp",
        "salaries_expense",
        "referral_amount",
        "sales",
    ]

    parsed_numbers = {}

    for field in numeric_fields:
        raw = data.get(
            field,
            0,
        )

        try:
            value = (
                float(raw)
                if raw not in (None, "")
                else 0.0
            )

            if value < 0:
                errors.append(
                    f"{field} cannot be negative."
                )

            parsed_numbers[field] = value

        except (TypeError, ValueError):
            errors.append(
                f"{field} must be a number."
            )

            parsed_numbers[field] = 0.0

    kwargs = {
        "entry_date": entry_date,
        "patient_name": patient_name,
        "test_name": test_name,
        "employee_name": (
            data.get("employee_name") or ""
        ).strip() or None,
        "expense_details": (
            data.get("expense_details") or ""
        ).strip() or None,
        "referral_by": (
            data.get("referral_by") or ""
        ).strip() or None,
        **parsed_numbers,
    }

    return kwargs, errors


# ---------------------------------------------------------------------------
# 1. LAB DATA ENTRY
# ---------------------------------------------------------------------------

@caredx_bp.route(
    "/lab-entries",
    methods=["POST"],
)
@role_required("Caredx")
def create_lab_entry():
    data = request.get_json(
        silent=True
    ) or {}

    kwargs, errors = _lab_entry_from_payload(
        data
    )

    if errors:
        return jsonify(
            {
                "message": "Validation failed.",
                "errors": errors,
            }
        ), 400

    entry = CaredxLabEntry(
        created_by_id=_get_valid_user_id(),
        **kwargs,
    )

    try:
        db.session.add(entry)
        db.session.commit()

    except Exception as exc:
        db.session.rollback()

        print(
            "Caredx lab entry create error:",
            exc,
        )

        return jsonify(
            {
                "message":
                    "Failed to create lab entry.",
            }
        ), 500

    return jsonify(
        {
            "message":
                "Lab entry created.",
            "entry":
                entry.to_dict(),
        }
    ), 201


@caredx_bp.route(
    "/lab-entries",
    methods=["GET"],
)
@role_required("Caredx")
def list_lab_entries():
    query = _apply_date_filters(
        CaredxLabEntry.query,
        CaredxLabEntry.entry_date,
    )

    search = (
        request.args.get("search") or ""
    ).strip()

    if search:
        like = f"%{search}%"

        query = query.filter(
            (CaredxLabEntry.patient_name.ilike(like))
            |
            (CaredxLabEntry.test_name.ilike(like))
            |
            (CaredxLabEntry.employee_name.ilike(like))
        )

    query = query.order_by(
        CaredxLabEntry.entry_date.desc(),
        CaredxLabEntry.id.desc(),
    )

    return jsonify(
        {
            "entries": [
                entry.to_dict()
                for entry in query.all()
            ]
        }
    ), 200


@caredx_bp.route(
    "/lab-entries/<int:entry_id>",
    methods=["PUT"],
)
@role_required("Caredx")
def update_lab_entry(entry_id):
    entry = CaredxLabEntry.query.get(
        entry_id
    )

    if not entry:
        return jsonify(
            {
                "message":
                    "Lab entry not found."
            }
        ), 404

    data = request.get_json(
        silent=True
    ) or {}

    merged = entry.to_dict()

    merged.update(data)

    kwargs, errors = _lab_entry_from_payload(
        merged,
        existing=entry,
    )

    if errors:
        return jsonify(
            {
                "message":
                    "Validation failed.",
                "errors": errors,
            }
        ), 400

    try:
        for key, value in kwargs.items():
            setattr(
                entry,
                key,
                value,
            )

        db.session.commit()

    except Exception as exc:
        db.session.rollback()

        print(
            "Caredx lab entry update error:",
            exc,
        )

        return jsonify(
            {
                "message":
                    "Failed to update lab entry."
            }
        ), 500

    return jsonify(
        {
            "message":
                "Lab entry updated.",
            "entry":
                entry.to_dict(),
        }
    ), 200


@caredx_bp.route(
    "/lab-entries/<int:entry_id>",
    methods=["DELETE"],
)
@role_required("Caredx")
def delete_lab_entry(entry_id):
    entry = CaredxLabEntry.query.get(
        entry_id
    )

    if not entry:
        return jsonify(
            {
                "message":
                    "Lab entry not found."
            }
        ), 404

    try:
        db.session.delete(entry)
        db.session.commit()

    except Exception as exc:
        db.session.rollback()

        print(
            "Caredx lab entry delete error:",
            exc,
        )

        return jsonify(
            {
                "message":
                    "Failed to delete lab entry."
            }
        ), 500

    return jsonify(
        {
            "message":
                "Lab entry deleted."
        }
    ), 200


# ---------------------------------------------------------------------------
# EXCEL IMPORT
# ---------------------------------------------------------------------------

@caredx_bp.route(
    "/lab-entries/import",
    methods=["POST"],
)
@role_required("Caredx")
def import_lab_entries():
    if "file" not in request.files:
        return jsonify(
            {
                "message":
                    "No file uploaded. Attach it under the 'file' field."
            }
        ), 400

    file = request.files["file"]

    if not file.filename:
        return jsonify(
            {
                "message":
                    "No file selected."
            }
        ), 400

    filename = file.filename.lower()

    if not filename.endswith(
        (".xlsx", ".xlsm")
    ):
        return jsonify(
            {
                "message":
                    "Please upload a .xlsx or .xlsm file."
            }
        ), 400

    try:
        rows, parse_errors = (
            parse_lab_entries_workbook(
                BytesIO(file.read())
            )
        )

    except Exception as exc:
        print(
            "Excel parsing error:",
            exc,
        )

        return jsonify(
            {
                "message":
                    "Could not read that file. Please upload a valid Excel file."
            }
        ), 400

    if (
        not rows
        and parse_errors
        and "Could not find"
        in parse_errors[0]
    ):
        return jsonify(
            {
                "message":
                    parse_errors[0]
            }
        ), 400

    user_id = _get_valid_user_id()

    imported = 0

    try:
        for row in rows:
            entry = CaredxLabEntry(
                created_by_id=user_id,
                **row,
            )

            db.session.add(entry)

            imported += 1

        db.session.commit()

    except Exception as exc:
        db.session.rollback()

        print(
            "Caredx Excel import database error:",
            exc,
        )

        return jsonify(
            {
                "message":
                    "Import failed while saving records to the database.",
                "error":
                    str(exc),
            }
        ), 500

    return jsonify(
        {
            "message":
                f"Imported {imported} row(s).",
            "imported":
                imported,
            "skipped":
                len(parse_errors),
            "errors":
                parse_errors[:20],
        }
    ), 200


# ---------------------------------------------------------------------------
# EXCEL EXPORT
# ---------------------------------------------------------------------------

@caredx_bp.route(
    "/lab-entries/export",
    methods=["GET"],
)
@role_required("Caredx")
def export_lab_entries():
    query = _apply_date_filters(
        CaredxLabEntry.query,
        CaredxLabEntry.entry_date,
    )

    entries = query.order_by(
        CaredxLabEntry.entry_date.asc(),
        CaredxLabEntry.id.asc(),
    ).all()

    try:
        workbook_stream = (
            build_lab_entries_workbook(
                entries
            )
        )

    except Exception as exc:
        print(
            "Excel export error:",
            exc,
        )

        return jsonify(
            {
                "message":
                    "Failed to create Excel export."
            }
        ), 500

    start_date = (
        request.args.get("start_date")
        or "all"
    )

    end_date = (
        request.args.get("end_date")
        or "time"
    )

    filename = (
        f"Caredx_Lab_Entries_"
        f"{start_date}_to_{end_date}.xlsx"
    )

    return send_file(
        workbook_stream,
        as_attachment=True,
        download_name=filename,
        mimetype=(
            "application/vnd."
            "openxmlformats-officedocument."
            "spreadsheetml.sheet"
        ),
    )


# ---------------------------------------------------------------------------
# 2. EXPENSES (UPDATED with referral_amount)
# ---------------------------------------------------------------------------

@caredx_bp.route(
    "/expenses",
    methods=["POST"],
)
@role_required("Caredx")
def create_expense():
    data = request.get_json(silent=True) or {}

    expense_date = _parse_date(data.get("expense_date"), default=date.today())
    category = (data.get("category") or "").strip()
    amount = data.get("amount")               # base expense (without referral)
    referral_amount = data.get("referral_amount", 0)
    remarks = (data.get("remarks") or "").strip()
    employee_name = (data.get("employee_name") or "").strip() or None
    purpose = (data.get("purpose") or "").strip() or None
    vehicle_type = (data.get("vehicle_type") or "").strip() or None

    errors = []

    if not category:
        errors.append("category is required.")

    # Prevent salary category from being created here
    salary_category = DEPARTMENT_CONFIG.get("Corporate", {}).get("is_salary_category", "Personnel & Payroll")
    if category == salary_category:
        errors.append("Salaries must be entered by Corporate Management only.")

    try:
        amount = float(amount)
        if amount <= 0:
            errors.append("Expense amount must be greater than 0.")
    except (TypeError, ValueError):
        errors.append("Expense amount must be a number.")
        amount = 0

    try:
        referral_amount = float(referral_amount)
        if referral_amount < 0:
            errors.append("Referral amount cannot be negative.")
    except (TypeError, ValueError):
        errors.append("Referral amount must be a number.")
        referral_amount = 0

    if errors:
        return jsonify({"message": "Validation failed.", "errors": errors}), 400

    expense = CaredxExpense(
        expense_date=expense_date,
        category=category,
        amount=amount,                     # base expense
        referral_amount=referral_amount,   # new field
        remarks=remarks,
        employee_name=employee_name,
        purpose=purpose,
        vehicle_type=vehicle_type,
        created_by_id=_get_valid_user_id(),
    )

    try:
        db.session.add(expense)
        db.session.commit()
    except Exception as exc:
        db.session.rollback()
        print("Caredx expense create error:", exc)
        return jsonify({"message": "Failed to create expense."}), 500

    return jsonify({"message": "Expense added.", "expense": expense.to_dict()}), 201


@caredx_bp.route(
    "/expenses",
    methods=["GET"],
)
@role_required("Caredx")
def list_expenses():
    # 1. Fetch regular CaredxExpense records
    query = _apply_date_filters(CaredxExpense.query, CaredxExpense.expense_date)
    search = (request.args.get("search") or "").strip()
    if search:
        like = f"%{search}%"
        query = query.filter(
            (CaredxExpense.category.ilike(like))
            | (CaredxExpense.remarks.ilike(like))
            | (CaredxExpense.employee_name.ilike(like))
            | (CaredxExpense.purpose.ilike(like))
        )
    caredx_expenses = query.order_by(
        CaredxExpense.expense_date.desc(),
        CaredxExpense.id.desc()
    ).all()

    # 2. Fetch salary entries from FinanceEntry for Caredx
    salary_category = DEPARTMENT_CONFIG.get("Corporate", {}).get("is_salary_category", "Personnel & Payroll")
    salary_query = FinanceEntry.query.filter(
        FinanceEntry.category == salary_category,
        or_(
            FinanceEntry.department == "Caredx",
            (FinanceEntry.department == "Corporate") & (FinanceEntry.exec_department == "Caredx")
        )
    )
    start_date = _parse_date(request.args.get("start_date"))
    end_date = _parse_date(request.args.get("end_date"))
    if start_date:
        salary_query = salary_query.filter(FinanceEntry.entry_date >= start_date)
    if end_date:
        salary_query = salary_query.filter(FinanceEntry.entry_date <= end_date)

    if search:
        like = f"%{search}%"
        salary_query = salary_query.filter(
            (FinanceEntry.employee_name.ilike(like))
            | (FinanceEntry.remarks.ilike(like))
        )

    salary_entries = salary_query.order_by(
        FinanceEntry.entry_date.desc(),
        FinanceEntry.id.desc()
    ).all()

    # 3. Convert salary entries to expense-like dicts
    salary_items = []
    for s in salary_entries:
        salary_items.append({
            "id": -s.id,  # negative to avoid collision with CaredxExpense IDs
            "expense_date": s.entry_date.isoformat(),
            "category": salary_category,
            "amount": float(s.amount),
            "referral_amount": 0,  # salaries don't have referral
            "remarks": f"Salary for {s.employee_name} ({s.exec_department}) - {s.remarks or ''}",
            "employee_name": s.employee_name,
            "purpose": s.remarks,
            "vehicle_type": s.vehicle_type,
            "_isSalary": True,
        })

    # 4. Combine and sort by date descending
    all_items = [e.to_dict() for e in caredx_expenses] + salary_items
    all_items.sort(key=lambda x: x["expense_date"], reverse=True)

    return jsonify({"expenses": all_items}), 200


@caredx_bp.route(
    "/expenses/<int:expense_id>",
    methods=["PUT"],
)
@role_required("Caredx")
def update_expense(expense_id):
    expense = CaredxExpense.query.get(expense_id)

    if not expense:
        return jsonify({"message": "Expense not found."}), 404

    data = request.get_json(silent=True) or {}

    try:
        if "category" in data:
            category = (data.get("category") or "").strip()
            if category:
                salary_category = DEPARTMENT_CONFIG.get("Corporate", {}).get("is_salary_category", "Personnel & Payroll")
                if category == salary_category:
                    return jsonify({"message": "Salaries must be entered by Corporate Management only."}), 400
                expense.category = category

        if "amount" in data:
            amount = float(data.get("amount"))
            if amount <= 0:
                return jsonify({"message": "Expense amount must be greater than 0."}), 400
            expense.amount = amount

        if "referral_amount" in data:
            referral_amount = float(data.get("referral_amount"))
            if referral_amount < 0:
                return jsonify({"message": "Referral amount cannot be negative."}), 400
            expense.referral_amount = referral_amount

        if "remarks" in data:
            expense.remarks = (data.get("remarks") or "").strip()

        if "employee_name" in data:
            expense.employee_name = (data.get("employee_name") or "").strip() or None

        if "purpose" in data:
            expense.purpose = (data.get("purpose") or "").strip() or None

        if "vehicle_type" in data:
            expense.vehicle_type = (data.get("vehicle_type") or "").strip() or None

        if "expense_date" in data:
            parsed_date = _parse_date(data.get("expense_date"))
            if parsed_date:
                expense.expense_date = parsed_date

        db.session.commit()

    except (TypeError, ValueError):
        db.session.rollback()
        return jsonify({"message": "Invalid expense amount."}), 400
    except Exception as exc:
        db.session.rollback()
        print("Caredx expense update error:", exc)
        return jsonify({"message": "Failed to update expense."}), 500

    return jsonify({"message": "Expense updated.", "expense": expense.to_dict()}), 200


@caredx_bp.route(
    "/expenses/<int:expense_id>",
    methods=["DELETE"],
)
@role_required("Caredx")
def delete_expense(expense_id):
    expense = CaredxExpense.query.get(expense_id)

    if not expense:
        return jsonify({"message": "Expense not found."}), 404

    try:
        db.session.delete(expense)
        db.session.commit()
    except Exception as exc:
        db.session.rollback()
        print("Caredx expense delete error:", exc)
        return jsonify({"message": "Failed to delete expense."}), 500

    return jsonify({"message": "Expense deleted."}), 200


# ---------------------------------------------------------------------------
# 3. COMBINED DASHBOARD SUMMARY (UPDATED)
# ---------------------------------------------------------------------------

@caredx_bp.route(
    "/lab-entries/summary",
    methods=["GET"],
)
@role_required("Caredx")
def lab_entries_summary():
    """
    Dashboard summary.

    Profit = Total Amount Paid - Total Expenses
    where Total Expenses includes:
        - CaredxExpense (amount + referral)
        - Salary entries (from FinanceEntry)
        - Lab entry 'paid_to_other_labs'
        - Lab entry 'referral_amount'
    """
    lab_entries = _apply_date_filters(
        CaredxLabEntry.query,
        CaredxLabEntry.entry_date,
    ).all()

    # Expenses: fetch both CaredxExpense and salary entries from FinanceEntry
    exp_query = _apply_date_filters(CaredxExpense.query, CaredxExpense.expense_date)
    caredx_expenses = exp_query.all()

    salary_category = DEPARTMENT_CONFIG.get("Corporate", {}).get("is_salary_category", "Personnel & Payroll")
    salary_query = FinanceEntry.query.filter(
        FinanceEntry.category == salary_category,
        or_(
            FinanceEntry.department == "Caredx",
            (FinanceEntry.department == "Corporate") & (FinanceEntry.exec_department == "Caredx")
        )
    )
    start_date = _parse_date(request.args.get("start_date"))
    end_date = _parse_date(request.args.get("end_date"))
    if start_date:
        salary_query = salary_query.filter(FinanceEntry.entry_date >= start_date)
    if end_date:
        salary_query = salary_query.filter(FinanceEntry.entry_date <= end_date)
    salary_entries = salary_query.all()

    # Helper to sum a field from lab entries
    def total(field):
        return sum(
            float(getattr(entry, field) or 0)
            for entry in lab_entries
        )

    total_amount_paid = total("total_amount_paid")
    total_paid_to_other_labs = total("paid_to_other_labs")
    total_referral = total("referral_amount")

    # Total expenses from CaredxExpense (amount + referral)
    caredx_expense_total = sum(
        float(e.amount or 0) + float(e.referral_amount or 0)
        for e in caredx_expenses
    )

    # Total salary expenses
    salary_total = sum(float(s.amount or 0) for s in salary_entries)

    # Grand total expenses = all costs
    total_expenses = (
        caredx_expense_total
        + salary_total
        + total_paid_to_other_labs
        + total_referral
    )

    # Profit = income - total costs
    profit = total_amount_paid - total_expenses

    # -----------------------------------------------------------------------
    # Daily trend (include all costs)
    # -----------------------------------------------------------------------
    by_date = {}

    # Income from lab entries
    for entry in lab_entries:
        if not entry.entry_date:
            continue
        key = entry.entry_date.isoformat()
        by_date.setdefault(
            key,
            {
                "date": key,
                "income": 0,
                "expenses": 0,
            },
        )
        by_date[key]["income"] += float(entry.total_amount_paid or 0)

    # Expenses from caredx_expenses (amount + referral)
    for expense in caredx_expenses:
        if not expense.expense_date:
            continue
        key = expense.expense_date.isoformat()
        by_date.setdefault(
            key,
            {
                "date": key,
                "income": 0,
                "expenses": 0,
            },
        )
        by_date[key]["expenses"] += float(expense.amount or 0) + float(expense.referral_amount or 0)

    # Salary expenses
    for salary in salary_entries:
        if not salary.entry_date:
            continue
        key = salary.entry_date.isoformat()
        by_date.setdefault(
            key,
            {
                "date": key,
                "income": 0,
                "expenses": 0,
            },
        )
        by_date[key]["expenses"] += float(salary.amount or 0)

    # Lab entry costs: paid_to_other_labs and referral_amount
    for entry in lab_entries:
        if not entry.entry_date:
            continue
        key = entry.entry_date.isoformat()
        by_date.setdefault(
            key,
            {
                "date": key,
                "income": 0,
                "expenses": 0,
            },
        )
        by_date[key]["expenses"] += float(entry.paid_to_other_labs or 0)
        by_date[key]["expenses"] += float(entry.referral_amount or 0)

    trend = sorted(
        by_date.values(),
        key=lambda item: item["date"],
    )

    # -----------------------------------------------------------------------
    # Expense category breakdown (include referral and paid_to_other_labs)
    # -----------------------------------------------------------------------
    by_category = {}

    # Caredx expenses (amount + referral)
    for expense in caredx_expenses:
        category = (expense.category or "Uncategorized")
        by_category.setdefault(
            category,
            {
                "category": category,
                "amount": 0,
            },
        )
        by_category[category]["amount"] += (
            float(expense.amount or 0) + float(expense.referral_amount or 0)
        )

    # Salary category
    if salary_total > 0:
        by_category.setdefault(
            salary_category,
            {"category": salary_category, "amount": 0}
        )
        by_category[salary_category]["amount"] += salary_total

    # Paid to other labs
    if total_paid_to_other_labs > 0:
        by_category.setdefault(
            "Paid to Other Labs",
            {"category": "Paid to Other Labs", "amount": 0}
        )
        by_category["Paid to Other Labs"]["amount"] += total_paid_to_other_labs

    # Referral amounts
    if total_referral > 0:
        by_category.setdefault(
            "Referral",
            {"category": "Referral", "amount": 0}
        )
        by_category["Referral"]["amount"] += total_referral

    return jsonify(
        {
            "entry_count": len(lab_entries),
            "total_amount_paid": total_amount_paid,
            "total_cash": total("cash"),
            "total_online": total("online"),
            "total_paid_to_other_labs": total_paid_to_other_labs,
            "total_rmp": total("rmp"),
            "total_salaries_expense": total("salaries_expense"),
            "total_referral_amount": total_referral,
            "total_sales": total("sales"),
            "total_expenses": total_expenses,
            "profit": profit,
            "expense_count": len(caredx_expenses) + len(salary_entries),
            "trend": trend,
            "category_breakdown": list(by_category.values()),
        }
    ), 200
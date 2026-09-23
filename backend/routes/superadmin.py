# backend/routes/superadmin.py
from datetime import datetime, date
from flask import Blueprint, request, jsonify, send_file
from sqlalchemy import func, or_
from flask_jwt_extended import get_jwt_identity

from models import (
    db, User, FinanceEntry, CaredxLabEntry, CaredxExpense,
    SalesEnterpriseKPI, MedTechLedger,   # <-- Added MedTechLedger
    ROLES, VALID_DEPARTMENTS, ENTRY_TYPES, DEPARTMENT_CONFIG,
)
from utils import role_required
from excel_utils import (
    parse_finance_entries_workbook, build_finance_entries_workbook,
    parse_lab_entries_workbook, build_lab_entries_workbook,
)

superadmin_bp = Blueprint("superadmin", __name__, url_prefix="/api/admin")


def _parse_date(value, default=None):
    if not value:
        return default
    try:
        return datetime.strptime(value, "%Y-%m-%d").date()
    except ValueError:
        return default


def _parse_quarter_year(quarter, year):
    """Return (start_date, end_date) for a given quarter (1-4) and year (YYYY)."""
    if not year:
        return None, None
    year = int(year)
    if quarter is None or quarter == "":
        start = datetime(year, 1, 1).date()
        end = datetime(year, 12, 31).date()
    else:
        quarter = int(quarter)
        if quarter == 1:
            start = datetime(year, 1, 1).date()
            end = datetime(year, 3, 31).date()
        elif quarter == 2:
            start = datetime(year, 4, 1).date()
            end = datetime(year, 6, 30).date()
        elif quarter == 3:
            start = datetime(year, 7, 1).date()
            end = datetime(year, 9, 30).date()
        elif quarter == 4:
            start = datetime(year, 10, 1).date()
            end = datetime(year, 12, 31).date()
        else:
            return None, None
    return start, end


# ----------------------------------------------------------------------
# User management (unchanged)
# ----------------------------------------------------------------------
@superadmin_bp.route("/roles", methods=["GET"])
@role_required("SuperAdmin")
def roles():
    return jsonify({"roles": ROLES}), 200


@superadmin_bp.route("/users", methods=["GET"])
@role_required("SuperAdmin")
def list_users():
    users = User.query.order_by(User.created_at.desc()).all()
    return jsonify({"users": [u.to_dict() for u in users]}), 200


@superadmin_bp.route("/users", methods=["POST"])
@role_required("SuperAdmin")
def create_user():
    data = request.get_json(silent=True) or {}
    name = (data.get("name") or "").strip()
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""
    role = data.get("role")
    department = data.get("department", role)

    errors = []
    if not name:
        errors.append("Name is required.")
    if not email:
        errors.append("Email is required.")
    if len(password) < 6:
        errors.append("Password must be at least 6 characters.")
    if role not in ROLES:
        errors.append(f"Role must be one of: {', '.join(ROLES)}.")
    if email and User.query.filter_by(email=email).first():
        errors.append("A user with this email already exists.")

    if errors:
        return jsonify({"message": "Validation failed.", "errors": errors}), 400

    user = User(name=name, email=email, role=role, department=department)
    user.set_password(password)
    db.session.add(user)
    db.session.commit()

    return jsonify({"message": "User created.", "user": user.to_dict()}), 201


@superadmin_bp.route("/users/<int:user_id>", methods=["PUT"])
@role_required("SuperAdmin")
def update_user(user_id):
    user = User.query.get(user_id)
    if not user:
        return jsonify({"message": "User not found."}), 404

    data = request.get_json(silent=True) or {}
    if "name" in data and data["name"].strip():
        user.name = data["name"].strip()
    if "role" in data and data["role"] in ROLES:
        user.role = data["role"]
    if "department" in data:
        user.department = data["department"]
    if "is_active" in data:
        user.is_active = bool(data["is_active"])
    if "password" in data and data["password"]:
        if len(data["password"]) < 6:
            return jsonify({"message": "Password must be at least 6 characters."}), 400
        user.set_password(data["password"])

    db.session.commit()
    return jsonify({"message": "User updated.", "user": user.to_dict()}), 200


@superadmin_bp.route("/users/<int:user_id>", methods=["DELETE"])
@role_required("SuperAdmin")
def delete_user(user_id):
    user = User.query.get(user_id)
    if not user:
        return jsonify({"message": "User not found."}), 404
    db.session.delete(user)
    db.session.commit()
    return jsonify({"message": "User deleted."}), 200


@superadmin_bp.route("/team-stats", methods=["GET"])
@role_required("SuperAdmin")
def team_stats():
    total_members = User.query.count()
    rows = (
        db.session.query(User.role, func.count(User.id))
        .group_by(User.role)
        .all()
    )
    by_role = [{"role": r, "count": c} for r, c in rows]

    return jsonify({
        "total_members": total_members,
        "by_role": by_role,
    }), 200


# ----------------------------------------------------------------------
# Overview – EXCLUDES SalesEnterprise
# ----------------------------------------------------------------------
@superadmin_bp.route("/overview", methods=["GET"])
@role_required("SuperAdmin")
def overview():
    start_date = _parse_date(request.args.get("start_date"))
    end_date = _parse_date(request.args.get("end_date"))

    total_members = User.query.count()
    active_members = User.query.filter_by(is_active=True).count()

    def sum_for(department, entry_type, start_date, end_date):
        query = db.session.query(func.coalesce(func.sum(FinanceEntry.amount), 0)).filter(
            FinanceEntry.entry_type == entry_type
        )
        if department is not None:
            query = query.filter(FinanceEntry.department == department)
        if start_date:
            query = query.filter(FinanceEntry.entry_date >= start_date)
        if end_date:
            query = query.filter(FinanceEntry.entry_date <= end_date)
        return float(query.scalar())

    def caredx_income(start_date, end_date):
        query = db.session.query(func.coalesce(func.sum(CaredxLabEntry.total_amount_paid), 0))
        if start_date:
            query = query.filter(CaredxLabEntry.entry_date >= start_date)
        if end_date:
            query = query.filter(CaredxLabEntry.entry_date <= end_date)
        return float(query.scalar())

    def caredx_expenses(start_date, end_date):
        exp_query = db.session.query(func.coalesce(func.sum(CaredxExpense.amount), 0))
        if start_date:
            exp_query = exp_query.filter(CaredxExpense.expense_date >= start_date)
        if end_date:
            exp_query = exp_query.filter(CaredxExpense.expense_date <= end_date)
        exp_total = float(exp_query.scalar())

        salary_category = DEPARTMENT_CONFIG.get("Corporate", {}).get("is_salary_category", "Personnel & Payroll")
        salary_query = db.session.query(func.coalesce(func.sum(FinanceEntry.amount), 0)).filter(
            FinanceEntry.category == salary_category,
            or_(
                FinanceEntry.department == "Caredx",
                (FinanceEntry.department == "Corporate") & (FinanceEntry.exec_department == "Caredx")
            )
        )
        if start_date:
            salary_query = salary_query.filter(FinanceEntry.entry_date >= start_date)
        if end_date:
            salary_query = salary_query.filter(FinanceEntry.entry_date <= end_date)
        salary_total = float(salary_query.scalar())

        return exp_total + salary_total

    by_department = []
    for dept in VALID_DEPARTMENTS:
        # Skip SalesEnterprise entirely
        if dept == "SalesEnterprise":
            continue
        if dept == "Caredx":
            income = caredx_income(start_date, end_date)
            expenses = caredx_expenses(start_date, end_date)
        else:
            # For MedTech, we need to include Ledger expenses in the overview
            if dept == "MedTech":
                # Finance expenses (excluding Ledger)
                fin_exp = sum_for(dept, "Expenses", start_date, end_date)
                # Ledger expenses
                ledger_query = db.session.query(func.coalesce(func.sum(MedTechLedger.total_amount), 0))
                if start_date:
                    ledger_query = ledger_query.filter(MedTechLedger.entry_date >= start_date)
                if end_date:
                    ledger_query = ledger_query.filter(MedTechLedger.entry_date <= end_date)
                ledger_exp = float(ledger_query.scalar())
                expenses = fin_exp + ledger_exp
                income = sum_for(dept, "Income", start_date, end_date)
            else:
                income = sum_for(dept, "Income", start_date, end_date)
                expenses = sum_for(dept, "Expenses", start_date, end_date)
        by_department.append({
            "department": dept,
            "income": income,
            "expenses": expenses,
            "profit": income - expenses,
        })

    total_income = sum(d["income"] for d in by_department)
    total_expenses = sum(d["expenses"] for d in by_department)

    return jsonify({
        "total_members": total_members,
        "active_members": active_members,
        "total_income": total_income,
        "total_expenses": total_expenses,
        "total_profit": total_income - total_expenses,
        "by_department": by_department,
    }), 200


# ----------------------------------------------------------------------
# Helpers for filtering finance entries
# ----------------------------------------------------------------------
def _apply_finance_filters(query, args):
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

    sub_category = args.get("sub_category")
    if sub_category:
        query = query.filter(FinanceEntry.sub_category == sub_category)

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


# ----------------------------------------------------------------------
# MedTech helpers – combine finance and ledger entries
# ----------------------------------------------------------------------
def _get_medtech_entries_with_ledger():
    """Fetch MedTech finance entries (excluding Ledger) + MedTechLedger entries, combined and paginated."""
    start_date = _parse_date(request.args.get("start_date"))
    end_date = _parse_date(request.args.get("end_date"))
    search = request.args.get("search")
    category = request.args.get("category")
    page = request.args.get("page", 1, type=int)
    per_page = request.args.get("per_page", 30, type=int)
    if page < 1:
        page = 1
    if per_page < 1:
        per_page = 1
    if per_page > 100:
        per_page = 100

    # 1. Finance entries (exclude Ledger category)
    finance_query = FinanceEntry.query.filter(
        FinanceEntry.department == "MedTech",
        FinanceEntry.category != "Ledger"
    )
    if start_date:
        finance_query = finance_query.filter(FinanceEntry.entry_date >= start_date)
    if end_date:
        finance_query = finance_query.filter(FinanceEntry.entry_date <= end_date)
    if category:
        finance_query = finance_query.filter(FinanceEntry.category == category)
    if search:
        like = f"%{search}%"
        finance_query = finance_query.filter(
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
    finance_entries = finance_query.order_by(FinanceEntry.entry_date.desc(), FinanceEntry.id.desc()).all()

    # 2. Ledger entries
    ledger_query = MedTechLedger.query
    if start_date:
        ledger_query = ledger_query.filter(MedTechLedger.entry_date >= start_date)
    if end_date:
        ledger_query = ledger_query.filter(MedTechLedger.entry_date <= end_date)
    if search:
        like = f"%{search}%"
        ledger_query = ledger_query.filter(
            or_(
                MedTechLedger.customer_name.ilike(like),
                MedTechLedger.remarks.ilike(like)
            )
        )
    # category filter does not apply to ledger (it's always Ledger)
    ledger_entries = ledger_query.order_by(MedTechLedger.entry_date.desc(), MedTechLedger.id.desc()).all()

    # 3. Convert to dict and combine
    combined = []
    for fe in finance_entries:
        d = fe.to_dict()
        d["_type"] = "finance"
        combined.append(d)
    for le in ledger_entries:
        combined.append({
            "id": le.id,
            "department": "MedTech",
            "entry_type": "Expenses",
            "category": "Ledger",
            "amount": float(le.total_amount or 0),
            "entry_date": le.entry_date.isoformat(),
            "remarks": le.remarks,
            "customer_name": le.customer_name,
            "paid": float(le.paid or 0),
            "balance": float(le.balance or 0),
            "_type": "ledger",
            "created_at": le.created_at.isoformat() if le.created_at else None,
        })

    # 4. Sort by date descending
    combined.sort(key=lambda x: (x["entry_date"], x["id"]), reverse=True)

    # 5. Paginate the combined list in memory
    total = len(combined)
    total_pages = (total + per_page - 1) // per_page if total > 0 else 0
    start_idx = (page - 1) * per_page
    end_idx = min(start_idx + per_page, total)
    paginated_entries = combined[start_idx:end_idx]

    return jsonify({
        "entries": paginated_entries,
        "pagination": {
            "page": page,
            "per_page": per_page,
            "total": total,
            "pages": total_pages,
        }
    }), 200


def _get_medtech_summary_with_ledger():
    """Return summary for MedTech including Ledger entries."""
    start_date = _parse_date(request.args.get("start_date"))
    end_date = _parse_date(request.args.get("end_date"))
    category = request.args.get("category")  # only used for finance entries

    # Finance entries (exclude Ledger)
    finance_query = FinanceEntry.query.filter(
        FinanceEntry.department == "MedTech",
        FinanceEntry.category != "Ledger"
    )
    if start_date:
        finance_query = finance_query.filter(FinanceEntry.entry_date >= start_date)
    if end_date:
        finance_query = finance_query.filter(FinanceEntry.entry_date <= end_date)
    if category:
        finance_query = finance_query.filter(FinanceEntry.category == category)
    finance_entries = finance_query.all()

    # Ledger entries
    ledger_query = MedTechLedger.query
    if start_date:
        ledger_query = ledger_query.filter(MedTechLedger.entry_date >= start_date)
    if end_date:
        ledger_query = ledger_query.filter(MedTechLedger.entry_date <= end_date)
    ledger_entries = ledger_query.all()

    # Combine all items
    all_items = []
    for fe in finance_entries:
        all_items.append({
            "entry_date": fe.entry_date,
            "entry_type": fe.entry_type,
            "category": fe.category,
            "amount": float(fe.amount),
        })
    for le in ledger_entries:
        all_items.append({
            "entry_date": le.entry_date,
            "entry_type": "Expenses",
            "category": "Ledger",
            "amount": float(le.total_amount or 0),
        })

    total_income = sum(item["amount"] for item in all_items if item["entry_type"] == "Income")
    total_expenses = sum(item["amount"] for item in all_items if item["entry_type"] == "Expenses")

    # Trend by date
    by_date = {}
    for item in all_items:
        key = item["entry_date"].isoformat()
        by_date.setdefault(key, {"date": key, "income": 0, "expenses": 0})
        if item["entry_type"] == "Income":
            by_date[key]["income"] += item["amount"]
        else:
            by_date[key]["expenses"] += item["amount"]
    trend = sorted(by_date.values(), key=lambda x: x["date"])

    # Category breakdown
    by_category = {}
    for item in all_items:
        cat = item["category"] or "Uncategorized"
        by_category.setdefault(cat, {"category": cat, "amount": 0})
        by_category[cat]["amount"] += item["amount"]

    return jsonify({
        "department": "MedTech",
        "total_income": total_income,
        "total_expenses": total_expenses,
        "profit": total_income - total_expenses,
        "entry_count": len(all_items),
        "trend": trend,
        "category_breakdown": list(by_category.values()),
    }), 200


# ----------------------------------------------------------------------
# Department options
# ----------------------------------------------------------------------
@superadmin_bp.route("/departments/<department>/options", methods=["GET"])
@role_required("SuperAdmin")
def department_options(department):
    if department not in VALID_DEPARTMENTS:
        return jsonify({"message": "Unknown department."}), 404

    config = DEPARTMENT_CONFIG[department]
    response = {
        "department": department,
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
    }
    if department == "Caredx":
        response["uses_lab_entries"] = True

    return jsonify(response), 200


# ----------------------------------------------------------------------
# Caredx helper – dynamic salary category
# ----------------------------------------------------------------------
def _get_caredx_entries_and_summary(for_summary=False):
    start_date = _parse_date(request.args.get("start_date"))
    end_date = _parse_date(request.args.get("end_date"))
    search = request.args.get("search")
    section = request.args.get("section")
    category = request.args.get("category")

    lab_entries = []
    expenses = []

    # -------------------- Lab entries --------------------
    if section is None or section == "lab":
        lab_query = CaredxLabEntry.query
        if start_date:
            lab_query = lab_query.filter(CaredxLabEntry.entry_date >= start_date)
        if end_date:
            lab_query = lab_query.filter(CaredxLabEntry.entry_date <= end_date)
        if search:
            like = f"%{search}%"
            lab_query = lab_query.filter(
                or_(
                    CaredxLabEntry.patient_name.ilike(like),
                    CaredxLabEntry.test_name.ilike(like),
                    CaredxLabEntry.employee_name.ilike(like),
                    CaredxLabEntry.referral_by.ilike(like),
                )
            )
        lab_entries = lab_query.order_by(
            CaredxLabEntry.entry_date.desc(),
            CaredxLabEntry.id.desc()
        ).all()

    # -------------------- Expenses --------------------
    if section is None or section == "expenses":
        exp_query = CaredxExpense.query
        if start_date:
            exp_query = exp_query.filter(CaredxExpense.expense_date >= start_date)
        if end_date:
            exp_query = exp_query.filter(CaredxExpense.expense_date <= end_date)
        if search:
            like = f"%{search}%"
            exp_query = exp_query.filter(
                or_(CaredxExpense.category.ilike(like), CaredxExpense.remarks.ilike(like))
            )
        if category:
            exp_query = exp_query.filter(CaredxExpense.category == category)
        caredx_expenses = exp_query.order_by(
            CaredxExpense.expense_date.desc(),
            CaredxExpense.id.desc()
        ).all()

        # Salary entries from Corporate
        salary_category = DEPARTMENT_CONFIG.get("Corporate", {}).get("is_salary_category", "Personnel & Payroll")
        salary_items = []
        if category is None or category == salary_category:
            salary_query = FinanceEntry.query.filter(
                FinanceEntry.category == salary_category,
                or_(
                    FinanceEntry.department == "Caredx",
                    (FinanceEntry.department == "Corporate") & (FinanceEntry.exec_department == "Caredx")
                )
            )
            if start_date:
                salary_query = salary_query.filter(FinanceEntry.entry_date >= start_date)
            if end_date:
                salary_query = salary_query.filter(FinanceEntry.entry_date <= end_date)
            if search:
                like = f"%{search}%"
                salary_query = salary_query.filter(
                    or_(FinanceEntry.employee_name.ilike(like), FinanceEntry.remarks.ilike(like))
                )
            salary_entries = salary_query.order_by(
                FinanceEntry.entry_date.desc(),
                FinanceEntry.id.desc()
            ).all()

            for s in salary_entries:
                salary_items.append({
                    "id": -s.id,
                    "expense_date": s.entry_date.isoformat(),
                    "category": salary_category,
                    "amount": float(s.amount),
                    "remarks": f"Salary for {s.employee_name} ({s.exec_department}) - {s.remarks or ''}",
                    "employee_name": s.employee_name,
                    "purpose": s.remarks,
                    "vehicle_type": s.vehicle_type,
                    "_isSalary": True,
                })

        all_expenses = [e.to_dict() for e in caredx_expenses] + salary_items
        all_expenses.sort(key=lambda x: x["expense_date"], reverse=True)
        expenses = all_expenses

    # ---- Return for entries (not summary) ----
    if not for_summary:
        return {
            "lab_entries": [e.to_dict() for e in lab_entries],
            "expenses": expenses
        }

    # ---- Build summary helpers ----
    def build_lab_summary(entries):
        total_income = sum(float(e.total_amount_paid) for e in entries)
        total_paid_other = sum(float(e.paid_to_other_labs or 0) for e in entries)
        by_date = {}
        for e in entries:
            key = e.entry_date.isoformat()
            by_date.setdefault(key, {"date": key, "income": 0, "expenses": 0})
            by_date[key]["income"] += float(e.total_amount_paid)
        trend = sorted(by_date.values(), key=lambda x: x["date"])
        by_category = {}
        for e in entries:
            cat = e.test_name or "Uncategorized"
            by_category.setdefault(cat, {"category": cat, "amount": 0})
            by_category[cat]["amount"] += float(e.total_amount_paid)
        return {
            "total_income": total_income,
            "total_paid_to_other_labs": total_paid_other,
            "entry_count": len(entries),
            "trend": trend,
            "category_breakdown": list(by_category.values()),
        }

    def build_expenses_summary(exp_list):
        total_expenses = sum(float(e["amount"]) for e in exp_list)
        by_date = {}
        for e in exp_list:
            key = e["expense_date"]
            by_date.setdefault(key, {"date": key, "expenses": 0})
            by_date[key]["expenses"] += float(e["amount"])
        trend = sorted(by_date.values(), key=lambda x: x["date"])
        by_category = {}
        for e in exp_list:
            cat = e["category"] or "Uncategorized"
            by_category.setdefault(cat, {"category": cat, "amount": 0})
            by_category[cat]["amount"] += float(e["amount"])
        return {
            "total_expenses": total_expenses,
            "entry_count": len(exp_list),
            "trend": trend,
            "category_breakdown": list(by_category.values()),
        }

    # ---- Return based on section ----
    if section == "lab":
        lab_summary = build_lab_summary(lab_entries)
        return {
            "department": "Caredx",
            "section": "lab",
            "total_income": lab_summary["total_income"],
            "total_expenses": 0,
            "total_paid_to_other_labs": lab_summary["total_paid_to_other_labs"],
            "profit": lab_summary["total_income"],
            "entry_count": lab_summary["entry_count"],
            "trend": lab_summary["trend"],
            "category_breakdown": lab_summary["category_breakdown"],
        }

    if section == "expenses":
        exp_summary = build_expenses_summary(expenses)
        return {
            "department": "Caredx",
            "section": "expenses",
            "total_income": 0,
            "total_expenses": exp_summary["total_expenses"],
            "total_paid_to_other_labs": 0,
            "profit": -exp_summary["total_expenses"],
            "entry_count": exp_summary["entry_count"],
            "trend": exp_summary["trend"],
            "category_breakdown": exp_summary["category_breakdown"],
        }

    # ---- Combined summary (section is None or "all") ----
    lab_summary = build_lab_summary(lab_entries)
    exp_summary = build_expenses_summary(expenses)

    total_income = lab_summary["total_income"]
    total_expenses = exp_summary["total_expenses"]
    total_paid_other = lab_summary["total_paid_to_other_labs"]

    # Merge trends
    trend_map = {}
    for item in lab_summary["trend"]:
        trend_map[item["date"]] = {"date": item["date"], "income": item["income"], "expenses": 0}
    for item in exp_summary["trend"]:
        if item["date"] in trend_map:
            trend_map[item["date"]]["expenses"] += item["expenses"]
        else:
            trend_map[item["date"]] = {"date": item["date"], "income": 0, "expenses": item["expenses"]}
    combined_trend = sorted(trend_map.values(), key=lambda x: x["date"])

    # Merge categories
    combined_categories = {}
    for item in lab_summary["category_breakdown"]:
        combined_categories[item["category"]] = {"category": item["category"], "amount": item["amount"]}
    for item in exp_summary["category_breakdown"]:
        if item["category"] in combined_categories:
            combined_categories[item["category"]]["amount"] += item["amount"]
        else:
            combined_categories[item["category"]] = {"category": item["category"], "amount": item["amount"]}

    return {
        "department": "Caredx",
        "total_income": total_income,
        "total_expenses": total_expenses,
        "total_paid_to_other_labs": total_paid_other,
        "profit": total_income - total_expenses,
        "entry_count": lab_summary["entry_count"] + exp_summary["entry_count"],
        "trend": combined_trend,
        "category_breakdown": list(combined_categories.values()),
    }


# ----------------------------------------------------------------------
# Department entries – with PAGINATION (for all non-SalesEnterprise depts)
# ----------------------------------------------------------------------
@superadmin_bp.route("/departments/<string:dept>/entries", methods=["GET"])
@role_required("SuperAdmin")
def dept_entries(dept):
    if dept not in VALID_DEPARTMENTS:
        return jsonify({"message": "Unknown department."}), 404

    # Special case: Caredx
    if dept == "Caredx":
        return jsonify(_get_caredx_entries_and_summary(for_summary=False)), 200

    # Special case: MedTech – include Ledger entries from MedTechLedger
    if dept == "MedTech":
        return _get_medtech_entries_with_ledger()

    # Other departments (regular FinanceEntry only)
    start_date = _parse_date(request.args.get("start_date"))
    end_date = _parse_date(request.args.get("end_date"))

    salary_category = DEPARTMENT_CONFIG.get("Corporate", {}).get("is_salary_category", "Personnel & Payroll")
    if dept == "Corporate":
        query = FinanceEntry.query.filter(
            FinanceEntry.department == "Corporate",
            or_(
                FinanceEntry.category != salary_category,
                (FinanceEntry.category == salary_category) & (FinanceEntry.exec_department == "Corporate")
            )
        )
    else:
        query = FinanceEntry.query.filter(
            or_(
                FinanceEntry.department == dept,
                (FinanceEntry.department == "Corporate") & (FinanceEntry.exec_department == dept) & (FinanceEntry.category == salary_category)
            )
        )

    if start_date:
        query = query.filter(FinanceEntry.entry_date >= start_date)
    if end_date:
        query = query.filter(FinanceEntry.entry_date <= end_date)

    entry_type = request.args.get("entry_type")
    if entry_type in ENTRY_TYPES:
        query = query.filter(FinanceEntry.entry_type == entry_type)

    category = request.args.get("category")
    if category:
        query = query.filter(FinanceEntry.category == category)

    revenue_type = request.args.get("revenue_type")
    if revenue_type:
        query = query.filter(FinanceEntry.revenue_type == revenue_type)

    search = request.args.get("search")
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

    page = request.args.get("page", 1, type=int)
    per_page = request.args.get("per_page", 30, type=int)
    if page < 1:
        page = 1
    if per_page < 1:
        per_page = 1
    if per_page > 100:
        per_page = 100

    total = query.count()
    query = query.order_by(FinanceEntry.entry_date.desc(), FinanceEntry.id.desc())
    paginated = query.paginate(page=page, per_page=per_page, error_out=False)
    entries = paginated.items

    return jsonify({
        "entries": [e.to_dict() for e in entries],
        "pagination": {
            "page": page,
            "per_page": per_page,
            "total": total,
            "pages": paginated.pages,
        }
    }), 200


# ----------------------------------------------------------------------
# Department summary (for all non-SalesEnterprise depts)
# ----------------------------------------------------------------------
@superadmin_bp.route("/departments/<string:dept>/summary", methods=["GET"])
@role_required("SuperAdmin")
def dept_summary(dept):
    if dept not in VALID_DEPARTMENTS:
        return jsonify({"message": "Unknown department."}), 404

    if dept == "Caredx":
        return jsonify(_get_caredx_entries_and_summary(for_summary=True)), 200

    # Special case: MedTech – include Ledger
    if dept == "MedTech":
        return _get_medtech_summary_with_ledger()

    start_date = _parse_date(request.args.get("start_date"))
    end_date = _parse_date(request.args.get("end_date"))

    salary_category = DEPARTMENT_CONFIG.get("Corporate", {}).get("is_salary_category", "Personnel & Payroll")
    if dept == "Corporate":
        query = FinanceEntry.query.filter(
            FinanceEntry.department == "Corporate",
            or_(
                FinanceEntry.category != salary_category,
                (FinanceEntry.category == salary_category) & (FinanceEntry.exec_department == "Corporate")
            )
        )
    else:
        query = FinanceEntry.query.filter(
            or_(
                FinanceEntry.department == dept,
                (FinanceEntry.department == "Corporate") & (FinanceEntry.exec_department == dept) & (FinanceEntry.category == salary_category)
            )
        )

    if start_date:
        query = query.filter(FinanceEntry.entry_date >= start_date)
    if end_date:
        query = query.filter(FinanceEntry.entry_date <= end_date)

    category = request.args.get("category")
    if category:
        query = query.filter(FinanceEntry.category == category)

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
        "department": dept,
        "total_income": total_income,
        "total_expenses": total_expenses,
        "profit": total_income - total_expenses,
        "entry_count": len(entries),
        "trend": trend,
        "category_breakdown": list(by_category.values()),
    }), 200


# ----------------------------------------------------------------------
# Excel export and import (unchanged)
# ----------------------------------------------------------------------
@superadmin_bp.route("/departments/<department>/export", methods=["GET"])
@role_required("SuperAdmin")
def department_export(department):
    if department not in VALID_DEPARTMENTS:
        return jsonify({"message": "Unknown department."}), 404

    if department == "Caredx":
        start_date = _parse_date(request.args.get("start_date"))
        end_date = _parse_date(request.args.get("end_date"))
        query = CaredxLabEntry.query
        if start_date:
            query = query.filter(CaredxLabEntry.entry_date >= start_date)
        if end_date:
            query = query.filter(CaredxLabEntry.entry_date <= end_date)
        entries = query.order_by(CaredxLabEntry.entry_date.asc(), CaredxLabEntry.id.asc()).all()
        buffer = build_lab_entries_workbook(entries)
        filename = f"Caredx_Lab_Entries_{date.today().isoformat()}.xlsx"
    else:
        config = DEPARTMENT_CONFIG[department]
        query = FinanceEntry.query.filter_by(department=department)
        # Apply filters
        start_date = _parse_date(request.args.get("start_date"))
        end_date = _parse_date(request.args.get("end_date"))
        if start_date:
            query = query.filter(FinanceEntry.entry_date >= start_date)
        if end_date:
            query = query.filter(FinanceEntry.entry_date <= end_date)
        category = request.args.get("category")
        if category:
            query = query.filter(FinanceEntry.category == category)
        revenue_type = request.args.get("revenue_type")
        if revenue_type:
            query = query.filter(FinanceEntry.revenue_type == revenue_type)
        search = request.args.get("search")
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
        entries = query.order_by(FinanceEntry.entry_date.asc(), FinanceEntry.id.asc()).all()
        buffer = build_finance_entries_workbook(entries, config, department)
        filename = f"{department}_Finance_Entries_{date.today().isoformat()}.xlsx"

    return send_file(
        buffer,
        as_attachment=True,
        download_name=filename,
        mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )


@superadmin_bp.route("/departments/<department>/import", methods=["POST"])
@role_required("SuperAdmin")
def department_import(department):
    if department not in VALID_DEPARTMENTS:
        return jsonify({"message": "Unknown department."}), 404

    file = request.files.get("file")
    if not file or file.filename == "":
        return jsonify({"message": "No file uploaded."}), 400
    if not file.filename.lower().endswith((".xlsx", ".xlsm")):
        return jsonify({"message": "Please upload an .xlsx file."}), 400

    created_by_id = get_jwt_identity()

    if department == "Caredx":
        try:
            rows, errors = parse_lab_entries_workbook(file.stream)
        except Exception:
            return jsonify({"message": "Could not read the uploaded file. Make sure it's a valid .xlsx."}), 400

        if not rows:
            return jsonify({
                "message": "No valid rows found in the uploaded sheet.",
                "imported": 0,
                "errors": errors,
            }), 400

        for row in rows:
            db.session.add(CaredxLabEntry(created_by_id=created_by_id, **row))
        db.session.commit()

        return jsonify({
            "message": f"Imported {len(rows)} lab entr{'y' if len(rows) == 1 else 'ies'}.",
            "imported": len(rows),
            "errors": errors,
        }), 201

    config = DEPARTMENT_CONFIG[department]
    try:
        rows, errors = parse_finance_entries_workbook(
            file.stream, config, ENTRY_TYPES, config["categories"]
        )
    except Exception:
        return jsonify({"message": "Could not read the uploaded file. Make sure it's a valid .xlsx."}), 400

    if not rows:
        return jsonify({
            "message": "No valid rows found in the uploaded sheet.",
            "imported": 0,
            "errors": errors,
        }), 400

    for row in rows:
        db.session.add(FinanceEntry(
            department=department,
            entry_type=row["entry_type"],
            category=row["category"],
            generated_by=row.get("generated_by"),
            revenue_type=row.get("revenue_type"),
            patient_name=row.get("patient_name"),
            patient_place=row.get("patient_place"),
            client_name=row.get("client_name"),
            gst_number=row.get("gst_number"),
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


# ===================== NEW: SalesEnterprise KPI endpoint =====================
@superadmin_bp.route("/salesenterprise/kpis", methods=["GET"])
@role_required("SuperAdmin")
def get_salesenterprise_kpis():
    """Return KPIs for SalesEnterprise, filtered by year and/or quarter."""
    year = request.args.get("year", type=int)
    quarter = request.args.get("quarter")  # "Q1" etc.
    query = SalesEnterpriseKPI.query
    if year:
        query = query.filter_by(year=year)
    if quarter:
        query = query.filter_by(quarter=quarter)
    kpis = query.order_by(SalesEnterpriseKPI.year.desc(), SalesEnterpriseKPI.quarter.desc()).all()
    return jsonify({"kpis": [k.to_dict() for k in kpis]}), 200
# backend/routes/superadmin.py
import io
from datetime import datetime, date
from flask import Blueprint, request, jsonify, send_file
from sqlalchemy import func, or_, and_
from flask_jwt_extended import get_jwt_identity

from models import (
    db, User, FinanceEntry, CaredxLabEntry, CaredxExpense,
    SalesEnterpriseKPI, MedTechLedger, EvergladesLedger,
    ROLES, VALID_DEPARTMENTS, ENTRY_TYPES, DEPARTMENT_CONFIG,
    SALARY_CATEGORY, dept_label,
)
from utils import role_required
from excel_utils import (
    parse_finance_entries_workbook, build_finance_entries_workbook,
    parse_lab_entries_workbook, build_lab_entries_workbook,
)

superadmin_bp = Blueprint("superadmin", __name__, url_prefix="/api/admin")

SALARY_CAT = SALARY_CATEGORY

# Departments that also have a separate "ledger" table
LEDGER_MODELS = {
    "MedTech": MedTechLedger,
    "Everglades": EvergladesLedger,
}


def _parse_date(value, default=None):
    if not value:
        return default
    if isinstance(value, date) and not isinstance(value, datetime):
        return value
    s = str(value).strip()
    if not s:
        return default
    if "T" in s:
        s = s.split("T", 1)[0]
    elif " " in s:
        s = s.split(" ", 1)[0]
    for fmt in ("%Y-%m-%d", "%d-%m-%Y", "%d/%m/%Y", "%m/%d/%Y"):
        try:
            return datetime.strptime(s, fmt).date()
        except ValueError:
            continue
    return default


def _parse_quarter_year(quarter, year):
    if not year:
        return None, None
    year = int(year)
    if quarter is None or quarter == "":
        start = datetime(year, 1, 1).date()
        end = datetime(year, 12, 31).date()
    else:
        quarter = int(quarter)
        if quarter == 1:
            start = datetime(year, 1, 1).date(); end = datetime(year, 3, 31).date()
        elif quarter == 2:
            start = datetime(year, 4, 1).date(); end = datetime(year, 6, 30).date()
        elif quarter == 3:
            start = datetime(year, 7, 1).date(); end = datetime(year, 9, 30).date()
        elif quarter == 4:
            start = datetime(year, 10, 1).date(); end = datetime(year, 12, 31).date()
        else:
            return None, None
    return start, end


def _dept_scope_filter(dept):
    """
    SQL filter selecting every FinanceEntry that belongs to a department.

    Salary entries are usually posted by Corporate on behalf of another
    department (department="Corporate", exec_department=<dept>), so for every
    department except Corporate we must include those rows too. This is what
    makes "Salary & Payrolls" show data for IT, IT Sales, PCM, Dental, etc.
    """
    if dept == "Corporate":
        return FinanceEntry.department == "Corporate"
    return or_(
        FinanceEntry.department == dept,
        and_(
            FinanceEntry.department == "Corporate",
            FinanceEntry.exec_department == dept,
            FinanceEntry.category == SALARY_CAT,
        ),
    )


def _entry_dict(e):
    d = e.to_dict()
    if e.category == SALARY_CAT:
        d["_isSalary"] = True
    return d


# ----------------------------------------------------------------------
# User management
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
    if not name: errors.append("Name is required.")
    if not email: errors.append("Email is required.")
    if len(password) < 6: errors.append("Password must be at least 6 characters.")
    if role not in ROLES: errors.append(f"Role must be one of: {', '.join(ROLES)}.")
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
    if "name" in data and data["name"].strip(): user.name = data["name"].strip()
    if "role" in data and data["role"] in ROLES: user.role = data["role"]
    if "department" in data: user.department = data["department"]
    if "is_active" in data: user.is_active = bool(data["is_active"])
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
    rows = db.session.query(User.role, func.count(User.id)).group_by(User.role).all()
    by_role = [{"role": r, "count": c} for r, c in rows]
    return jsonify({"total_members": total_members, "by_role": by_role}), 200


# ----------------------------------------------------------------------
# Overview
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
        if start_date: query = query.filter(FinanceEntry.entry_date >= start_date)
        if end_date: query = query.filter(FinanceEntry.entry_date <= end_date)
        return float(query.scalar())

    def sum_capital(start_date, end_date, department=None):
        query = db.session.query(func.coalesce(func.sum(FinanceEntry.amount), 0)).filter(
            FinanceEntry.entry_type == "Capital",
        )
        if department is not None:
            query = query.filter(FinanceEntry.department == department)
        if start_date: query = query.filter(FinanceEntry.entry_date >= start_date)
        if end_date: query = query.filter(FinanceEntry.entry_date <= end_date)
        return float(query.scalar())

    def caredx_income(start_date, end_date):
        query = db.session.query(func.coalesce(func.sum(CaredxLabEntry.total_amount_paid), 0))
        if start_date: query = query.filter(CaredxLabEntry.entry_date >= start_date)
        if end_date: query = query.filter(CaredxLabEntry.entry_date <= end_date)
        return float(query.scalar())

    def caredx_expenses(start_date, end_date):
        exp_query = db.session.query(func.coalesce(func.sum(CaredxExpense.amount), 0))
        if start_date: exp_query = exp_query.filter(CaredxExpense.expense_date >= start_date)
        if end_date: exp_query = exp_query.filter(CaredxExpense.expense_date <= end_date)
        exp_total = float(exp_query.scalar())

        # Referral amounts paid out from lab entries are also expenses
        ref_query = db.session.query(func.coalesce(func.sum(CaredxLabEntry.referral_amount), 0))
        if start_date: ref_query = ref_query.filter(CaredxLabEntry.entry_date >= start_date)
        if end_date: ref_query = ref_query.filter(CaredxLabEntry.entry_date <= end_date)
        ref_total = float(ref_query.scalar())

        # Amounts paid to other labs are also expenses
        other_labs_query = db.session.query(func.coalesce(func.sum(CaredxLabEntry.paid_to_other_labs), 0))
        if start_date: other_labs_query = other_labs_query.filter(CaredxLabEntry.entry_date >= start_date)
        if end_date: other_labs_query = other_labs_query.filter(CaredxLabEntry.entry_date <= end_date)
        other_labs_total = float(other_labs_query.scalar())

        salary_query = db.session.query(func.coalesce(func.sum(FinanceEntry.amount), 0)).filter(
            FinanceEntry.category == SALARY_CAT,
            or_(
                FinanceEntry.department == "Caredx",
                (FinanceEntry.department == "Corporate") & (FinanceEntry.exec_department == "Caredx")
            )
        )
        if start_date: salary_query = salary_query.filter(FinanceEntry.entry_date >= start_date)
        if end_date: salary_query = salary_query.filter(FinanceEntry.entry_date <= end_date)

        return exp_total + ref_total + other_labs_total + float(salary_query.scalar())

    def ledger_expenses(model, start_date, end_date):
        q = db.session.query(func.coalesce(func.sum(model.total_amount), 0))
        if start_date: q = q.filter(model.entry_date >= start_date)
        if end_date: q = q.filter(model.entry_date <= end_date)
        return float(q.scalar())

    by_department = []
    for dept in VALID_DEPARTMENTS:
        if dept == "SalesEnterprise":
            continue

        if dept == "Caredx":
            income = caredx_income(start_date, end_date)
            expenses = caredx_expenses(start_date, end_date)
        elif dept in LEDGER_MODELS:
            fin_exp = sum_for(dept, "Expenses", start_date, end_date)
            expenses = fin_exp + ledger_expenses(LEDGER_MODELS[dept], start_date, end_date)
            income = sum_for(dept, "Income", start_date, end_date)
        else:
            income = sum_for(dept, "Income", start_date, end_date)
            expenses = sum_for(dept, "Expenses", start_date, end_date)

        capital = sum_capital(start_date, end_date, department=dept)

        by_department.append({
            "department": dept,
            "income": income,
            "expenses": expenses,
            "capital": capital,
            "profit": income - expenses,
        })

    total_income = sum(d["income"] for d in by_department)
    total_expenses = sum(d["expenses"] for d in by_department)
    total_capital = sum(d["capital"] for d in by_department)
    total_funds = sum_for(None, "Funds", start_date, end_date)

    return jsonify({
        "total_members": total_members,
        "active_members": active_members,
        "total_income": total_income,
        "total_expenses": total_expenses,
        "total_capital": total_capital,
        "total_funds": total_funds,
        "total_profit": total_income - total_expenses,
        "by_department": by_department,
    }), 200


# ----------------------------------------------------------------------
# MedTech / Everglades helpers (shared — both have a ledger table)
# ----------------------------------------------------------------------
def _get_ledger_dept_entries(dept):
    Ledger = LEDGER_MODELS[dept]

    start_date = _parse_date(request.args.get("start_date"))
    end_date = _parse_date(request.args.get("end_date"))
    search = (request.args.get("search") or "").strip()
    category = (request.args.get("category") or "").strip()
    page = request.args.get("page", 1, type=int)
    per_page = request.args.get("per_page", 30, type=int)
    if page < 1: page = 1
    if per_page < 1: per_page = 1
    if per_page > 1000: per_page = 1000

    wants_salary = (category == "") or (category == SALARY_CAT)

    base_query = FinanceEntry.query.filter(
        FinanceEntry.department == dept,
        or_(FinanceEntry.category != "Ledger", FinanceEntry.category.is_(None)),
    )
    if wants_salary:
        base_query = base_query.filter(
            or_(FinanceEntry.category != SALARY_CAT, FinanceEntry.category.is_(None))
        )
    if start_date: base_query = base_query.filter(FinanceEntry.entry_date >= start_date)
    if end_date: base_query = base_query.filter(FinanceEntry.entry_date <= end_date)
    if category: base_query = base_query.filter(FinanceEntry.category == category)
    if search:
        like = f"%{search}%"
        base_query = base_query.filter(
            or_(
                FinanceEntry.remarks.ilike(like),
                FinanceEntry.generated_by.ilike(like),
                FinanceEntry.client_name.ilike(like),
                FinanceEntry.patient_name.ilike(like),
                FinanceEntry.patient_place.ilike(like),
                FinanceEntry.gst_number.ilike(like),
                FinanceEntry.category.ilike(like),
                FinanceEntry.employee_name.ilike(like),
            )
        )
    finance_entries = base_query.order_by(
        FinanceEntry.entry_date.desc(), FinanceEntry.id.desc()
    ).all()

    salary_entries = []
    if wants_salary:
        salary_query = FinanceEntry.query.filter(
            FinanceEntry.department == "Corporate",
            FinanceEntry.exec_department == dept,
            FinanceEntry.category == SALARY_CAT,
        )
        if start_date: salary_query = salary_query.filter(FinanceEntry.entry_date >= start_date)
        if end_date: salary_query = salary_query.filter(FinanceEntry.entry_date <= end_date)
        if search:
            like = f"%{search}%"
            salary_query = salary_query.filter(
                or_(
                    FinanceEntry.remarks.ilike(like),
                    FinanceEntry.employee_name.ilike(like),
                    FinanceEntry.category.ilike(like),
                )
            )
        salary_entries = salary_query.order_by(
            FinanceEntry.entry_date.desc(), FinanceEntry.id.desc()
        ).all()

    merged_finance = list(finance_entries) + list(salary_entries)
    merged_finance.sort(key=lambda e: (e.entry_date, e.id), reverse=True)

    include_ledger = (category == "") or (category == "Ledger")
    ledger_entries = []
    if include_ledger:
        ledger_query = Ledger.query
        if start_date: ledger_query = ledger_query.filter(Ledger.entry_date >= start_date)
        if end_date: ledger_query = ledger_query.filter(Ledger.entry_date <= end_date)
        if search:
            like = f"%{search}%"
            ledger_query = ledger_query.filter(
                or_(Ledger.customer_name.ilike(like), Ledger.remarks.ilike(like))
            )
        ledger_entries = ledger_query.order_by(
            Ledger.entry_date.desc(), Ledger.id.desc()
        ).all()

    combined = []
    for fe in merged_finance:
        d = _entry_dict(fe)
        d["_type"] = "finance"
        combined.append(d)
    for le in ledger_entries:
        combined.append({
            "id": le.id, "department": dept, "entry_type": "Expenses",
            "category": "Ledger", "amount": float(le.total_amount or 0),
            "entry_date": le.entry_date.isoformat(), "remarks": le.remarks,
            "customer_name": le.customer_name, "paid": float(le.paid or 0),
            "balance": float(le.balance or 0), "_type": "ledger",
            "payment_type": le.payment_type,
            "created_at": le.created_at.isoformat() if le.created_at else None,
        })

    combined.sort(key=lambda x: (x["entry_date"], x["id"]), reverse=True)
    total = len(combined)
    total_pages = (total + per_page - 1) // per_page if total > 0 else 0
    start_idx = (page - 1) * per_page
    end_idx = min(start_idx + per_page, total)

    return jsonify({
        "entries": combined[start_idx:end_idx],
        "pagination": {"page": page, "per_page": per_page, "total": total, "pages": total_pages},
    }), 200


def _get_ledger_dept_summary(dept):
    Ledger = LEDGER_MODELS[dept]

    start_date = _parse_date(request.args.get("start_date"))
    end_date = _parse_date(request.args.get("end_date"))
    category = (request.args.get("category") or "").strip()

    wants_salary = (category == "") or (category == SALARY_CAT)

    base_query = FinanceEntry.query.filter(
        FinanceEntry.department == dept,
        or_(FinanceEntry.category != "Ledger", FinanceEntry.category.is_(None)),
    )
    if wants_salary:
        base_query = base_query.filter(
            or_(FinanceEntry.category != SALARY_CAT, FinanceEntry.category.is_(None))
        )
    if start_date: base_query = base_query.filter(FinanceEntry.entry_date >= start_date)
    if end_date: base_query = base_query.filter(FinanceEntry.entry_date <= end_date)
    if category: base_query = base_query.filter(FinanceEntry.category == category)
    finance_entries = base_query.all()

    salary_entries = []
    if wants_salary:
        salary_query = FinanceEntry.query.filter(
            FinanceEntry.department == "Corporate",
            FinanceEntry.exec_department == dept,
            FinanceEntry.category == SALARY_CAT,
        )
        if start_date: salary_query = salary_query.filter(FinanceEntry.entry_date >= start_date)
        if end_date: salary_query = salary_query.filter(FinanceEntry.entry_date <= end_date)
        salary_entries = salary_query.all()

    include_ledger = (category == "") or (category == "Ledger")
    ledger_entries = []
    if include_ledger:
        ledger_query = Ledger.query
        if start_date: ledger_query = ledger_query.filter(Ledger.entry_date >= start_date)
        if end_date: ledger_query = ledger_query.filter(Ledger.entry_date <= end_date)
        ledger_entries = ledger_query.all()

    all_items = []
    for fe in list(finance_entries) + list(salary_entries):
        all_items.append({
            "entry_date": fe.entry_date, "entry_type": fe.entry_type,
            "category": fe.category, "amount": float(fe.amount),
        })
    for le in ledger_entries:
        all_items.append({
            "entry_date": le.entry_date, "entry_type": "Expenses",
            "category": "Ledger", "amount": float(le.total_amount or 0),
        })

    return jsonify(_summarize_items(dept, all_items)), 200


def _summarize_items(dept, all_items, extra=None):
    """Build the standard summary payload from a flat list of items."""
    total_income = sum(i["amount"] for i in all_items if i["entry_type"] == "Income")
    total_expenses = sum(i["amount"] for i in all_items if i["entry_type"] == "Expenses")
    total_capital = sum(i["amount"] for i in all_items if i["entry_type"] == "Capital")
    total_funds = sum(i["amount"] for i in all_items if i["entry_type"] == "Funds")

    by_date = {}
    for item in all_items:
        key = item["entry_date"].isoformat()
        by_date.setdefault(key, {"date": key, "income": 0, "expenses": 0, "capital": 0, "funds": 0})
        et = item["entry_type"]
        if et == "Income": by_date[key]["income"] += item["amount"]
        elif et == "Expenses": by_date[key]["expenses"] += item["amount"]
        elif et == "Capital": by_date[key]["capital"] += item["amount"]
        elif et == "Funds": by_date[key]["funds"] += item["amount"]
    trend = sorted(by_date.values(), key=lambda x: x["date"])

    by_category = {}
    for item in all_items:
        cat = item["category"] or "Uncategorized"
        by_category.setdefault(cat, {"category": cat, "amount": 0})
        by_category[cat]["amount"] += item["amount"]

    payload = {
        "department": dept,
        "total_income": total_income,
        "total_expenses": total_expenses,
        "total_capital": total_capital,
        "total_funds": total_funds,
        "profit": total_income - total_expenses,
        "entry_count": len(all_items),
        "trend": trend,
        "category_breakdown": list(by_category.values()),
    }
    if extra:
        payload.update(extra)
    return payload


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
        "department": department, "entry_types": ENTRY_TYPES,
        "categories": config["categories"], "revenue_types": config["revenue_types"],
        "show_generated_by": config["show_generated_by"],
        "show_revenue_type": config["show_revenue_type"],
        "show_patient_fields": config["show_patient_fields"],
        "show_client_name": config["show_client_name"],
        "show_gst_number": config["show_gst_number"],
        "gst_required_categories": config["gst_required_categories"],
        "show_items": config["show_items"], "show_invoice": config["show_invoice"],
    }
    if department == "Caredx":
        response["uses_lab_entries"] = True

    return jsonify(response), 200


# ----------------------------------------------------------------------
# Caredx helpers — paid_to_other_labs counts as an expense
# ----------------------------------------------------------------------
def _get_caredx_entries_and_summary(for_summary=False):
    start_date = _parse_date(request.args.get("start_date"))
    end_date = _parse_date(request.args.get("end_date"))
    search = (request.args.get("search") or "").strip()
    section = request.args.get("section")
    category = (request.args.get("category") or "").strip()

    lab_entries = []
    expenses = []

    if section is None or section == "lab":
        lab_query = CaredxLabEntry.query
        if start_date: lab_query = lab_query.filter(CaredxLabEntry.entry_date >= start_date)
        if end_date: lab_query = lab_query.filter(CaredxLabEntry.entry_date <= end_date)
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
            CaredxLabEntry.entry_date.desc(), CaredxLabEntry.id.desc()
        ).all()

    if section is None or section == "expenses":
        exp_query = CaredxExpense.query
        if start_date: exp_query = exp_query.filter(CaredxExpense.expense_date >= start_date)
        if end_date: exp_query = exp_query.filter(CaredxExpense.expense_date <= end_date)
        if search:
            like = f"%{search}%"
            exp_query = exp_query.filter(
                or_(CaredxExpense.category.ilike(like), CaredxExpense.remarks.ilike(like))
            )
        if category: exp_query = exp_query.filter(CaredxExpense.category == category)
        caredx_expenses = exp_query.order_by(
            CaredxExpense.expense_date.desc(), CaredxExpense.id.desc()
        ).all()

        salary_items = []
        if category == "" or category == SALARY_CAT or category == "Corpus Fund":
            salary_query = FinanceEntry.query.filter(
                or_(
                    (FinanceEntry.department == "Caredx")
                    & FinanceEntry.category.in_([SALARY_CAT, "Corpus Fund"]),
                    (FinanceEntry.department == "Corporate")
                    & (FinanceEntry.exec_department == "Caredx")
                    & (FinanceEntry.category == SALARY_CAT),
                )
            )
            if category == SALARY_CAT:
                salary_query = salary_query.filter(FinanceEntry.category == SALARY_CAT)
            elif category == "Corpus Fund":
                salary_query = salary_query.filter(FinanceEntry.category == "Corpus Fund")
            if start_date: salary_query = salary_query.filter(FinanceEntry.entry_date >= start_date)
            if end_date: salary_query = salary_query.filter(FinanceEntry.entry_date <= end_date)
            if search:
                like = f"%{search}%"
                salary_query = salary_query.filter(
                    or_(FinanceEntry.employee_name.ilike(like), FinanceEntry.remarks.ilike(like))
                )
            salary_entries = salary_query.order_by(
                FinanceEntry.entry_date.desc(), FinanceEntry.id.desc()
            ).all()

            for s in salary_entries:
                is_corpus = (s.category == "Corpus Fund")
                if is_corpus:
                    row_remarks = f"Corpus Fund for {dept_label(s.exec_department or 'Caredx')} - {s.remarks or ''}"
                else:
                    who = s.employee_name or "employee"
                    row_remarks = f"Salary for {who} - {s.remarks or ''}".rstrip(" -")
                salary_items.append({
                    "id": -s.id,
                    "expense_date": s.entry_date.isoformat(),
                    "entry_date": s.entry_date.isoformat(),
                    "category": s.category,
                    "entry_type": s.entry_type,
                    "amount": float(s.amount),
                    "salary_amount": float(s.salary_amount or 0),
                    "allowance_amount": float(s.allowance_amount or 0),
                    "exec_department": s.exec_department,
                    "exec_department_label": dept_label(s.exec_department),
                    "generated_by": s.generated_by,
                    "remarks": row_remarks,
                    "employee_name": s.employee_name,
                    "purpose": s.remarks,
                    "vehicle_type": s.vehicle_type,
                    "payment_type": s.payment_type,
                    "_isSalary": not is_corpus,
                    "_isCorpus": is_corpus,
                })
        all_expenses = [e.to_dict() for e in caredx_expenses] + salary_items
        all_expenses.sort(key=lambda x: x["expense_date"], reverse=True)
        expenses = all_expenses

    if not for_summary:
        return {"lab_entries": [e.to_dict() for e in lab_entries], "expenses": expenses}

    def build_lab_summary(entries):
        total_income = sum(float(e.total_amount_paid) for e in entries)
        total_paid_other = sum(float(e.paid_to_other_labs or 0) for e in entries)
        total_referral = sum(float(e.referral_amount or 0) for e in entries)

        by_date = {}
        for e in entries:
            key = e.entry_date.isoformat()
            by_date.setdefault(key, {"date": key, "income": 0, "expenses": 0})
            by_date[key]["income"] += float(e.total_amount_paid)
            by_date[key]["expenses"] += float(e.referral_amount or 0) + float(e.paid_to_other_labs or 0)

        trend = sorted(by_date.values(), key=lambda x: x["date"])
        by_category = {}
        for e in entries:
            cat = e.test_name or "Uncategorized"
            by_category.setdefault(cat, {"category": cat, "amount": 0})
            by_category[cat]["amount"] += float(e.total_amount_paid)

        return {
            "total_income": total_income,
            "total_paid_to_other_labs": total_paid_other,
            "total_referral": total_referral,
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
            "total_expenses": total_expenses, "entry_count": len(exp_list),
            "trend": trend, "category_breakdown": list(by_category.values()),
        }

    if section == "lab":
        lab_summary = build_lab_summary(lab_entries)
        lab_exp = lab_summary["total_referral"] + lab_summary["total_paid_to_other_labs"]
        return {
            "department": "Caredx", "section": "lab",
            "total_income": lab_summary["total_income"],
            "total_expenses": lab_exp,
            "total_paid_to_other_labs": lab_summary["total_paid_to_other_labs"],
            "profit": lab_summary["total_income"] - lab_exp,
            "entry_count": lab_summary["entry_count"],
            "trend": lab_summary["trend"], "category_breakdown": lab_summary["category_breakdown"],
        }

    if section == "expenses":
        exp_summary = build_expenses_summary(expenses)
        return {
            "department": "Caredx", "section": "expenses",
            "total_income": 0, "total_expenses": exp_summary["total_expenses"],
            "total_paid_to_other_labs": 0, "profit": -exp_summary["total_expenses"],
            "entry_count": exp_summary["entry_count"], "trend": exp_summary["trend"],
            "category_breakdown": exp_summary["category_breakdown"],
        }

    lab_summary = build_lab_summary(lab_entries)
    exp_summary = build_expenses_summary(expenses)

    total_income = lab_summary["total_income"]
    total_expenses = exp_summary["total_expenses"] + lab_summary["total_referral"] + lab_summary["total_paid_to_other_labs"]
    total_paid_other = lab_summary["total_paid_to_other_labs"]

    trend_map = {}
    for item in lab_summary["trend"]:
        trend_map[item["date"]] = {"date": item["date"], "income": item["income"], "expenses": item["expenses"]}
    for item in exp_summary["trend"]:
        if item["date"] in trend_map:
            trend_map[item["date"]]["expenses"] += item["expenses"]
        else:
            trend_map[item["date"]] = {"date": item["date"], "income": 0, "expenses": item["expenses"]}
    combined_trend = sorted(trend_map.values(), key=lambda x: x["date"])

    combined_categories = {}
    for item in lab_summary["category_breakdown"]:
        combined_categories[item["category"]] = {"category": item["category"], "amount": item["amount"]}
    for item in exp_summary["category_breakdown"]:
        if item["category"] in combined_categories:
            combined_categories[item["category"]]["amount"] += item["amount"]
        else:
            combined_categories[item["category"]] = {"category": item["category"], "amount": item["amount"]}

    return {
        "department": "Caredx", "total_income": total_income,
        "total_expenses": total_expenses, "total_paid_to_other_labs": total_paid_other,
        "profit": total_income - total_expenses,
        "entry_count": lab_summary["entry_count"] + exp_summary["entry_count"],
        "trend": combined_trend, "category_breakdown": list(combined_categories.values()),
    }


# ----------------------------------------------------------------------
# Department entries
# ----------------------------------------------------------------------
@superadmin_bp.route("/departments/<string:dept>/entries", methods=["GET"])
@role_required("SuperAdmin")
def dept_entries(dept):
    if dept not in VALID_DEPARTMENTS:
        return jsonify({"message": "Unknown department."}), 404

    if dept == "Caredx":
        return jsonify(_get_caredx_entries_and_summary(for_summary=False)), 200
    if dept in LEDGER_MODELS:
        return _get_ledger_dept_entries(dept)

    # Generic department (IT, IT Sales, PCM, Dental, Admin, R&D, Corporate...)
    start_date = _parse_date(request.args.get("start_date"))
    end_date = _parse_date(request.args.get("end_date"))
    search = (request.args.get("search") or "").strip()
    category = (request.args.get("category") or "").strip()
    revenue_type = (request.args.get("revenue_type") or "").strip()
    page = request.args.get("page", 1, type=int)
    per_page = request.args.get("per_page", 30, type=int)
    if page < 1: page = 1
    if per_page < 1: per_page = 1
    if per_page > 1000: per_page = 1000

    # ✅ includes Corporate-posted salary rows whose exec_department == dept
    q = FinanceEntry.query.filter(_dept_scope_filter(dept))
    if start_date: q = q.filter(FinanceEntry.entry_date >= start_date)
    if end_date: q = q.filter(FinanceEntry.entry_date <= end_date)
    if category: q = q.filter(FinanceEntry.category == category)
    if revenue_type:
        # revenue_type doesn't apply to salary rows, so keep them visible
        q = q.filter(
            or_(
                FinanceEntry.revenue_type == revenue_type,
                FinanceEntry.category == SALARY_CAT,
            )
        )
    if search:
        like = f"%{search}%"
        q = q.filter(
            or_(
                FinanceEntry.remarks.ilike(like),
                FinanceEntry.generated_by.ilike(like),
                FinanceEntry.client_name.ilike(like),
                FinanceEntry.patient_name.ilike(like),
                FinanceEntry.patient_place.ilike(like),
                FinanceEntry.gst_number.ilike(like),
                FinanceEntry.category.ilike(like),
                FinanceEntry.employee_name.ilike(like),
            )
        )

    total = q.count()
    total_pages = (total + per_page - 1) // per_page if total > 0 else 0
    entries = q.order_by(
        FinanceEntry.entry_date.desc(), FinanceEntry.id.desc()
    ).offset((page - 1) * per_page).limit(per_page).all()

    return jsonify({
        "entries": [_entry_dict(e) for e in entries],
        "pagination": {"page": page, "per_page": per_page, "total": total, "pages": total_pages},
    }), 200


# ----------------------------------------------------------------------
# Department summary
# ----------------------------------------------------------------------
@superadmin_bp.route("/departments/<string:dept>/summary", methods=["GET"])
@role_required("SuperAdmin")
def dept_summary(dept):
    if dept not in VALID_DEPARTMENTS:
        return jsonify({"message": "Unknown department."}), 404

    if dept == "Caredx":
        return jsonify(_get_caredx_entries_and_summary(for_summary=True)), 200
    if dept in LEDGER_MODELS:
        return _get_ledger_dept_summary(dept)

    start_date = _parse_date(request.args.get("start_date"))
    end_date = _parse_date(request.args.get("end_date"))
    category = (request.args.get("category") or "").strip()
    revenue_type = (request.args.get("revenue_type") or "").strip()

    q = FinanceEntry.query.filter(_dept_scope_filter(dept))
    if start_date: q = q.filter(FinanceEntry.entry_date >= start_date)
    if end_date: q = q.filter(FinanceEntry.entry_date <= end_date)
    if category: q = q.filter(FinanceEntry.category == category)
    if revenue_type:
        q = q.filter(
            or_(
                FinanceEntry.revenue_type == revenue_type,
                FinanceEntry.category == SALARY_CAT,
            )
        )
    entries = q.all()

    items = [{
        "entry_date": e.entry_date, "entry_type": e.entry_type,
        "category": e.category, "amount": float(e.amount),
    } for e in entries]

    total_corpus = sum(float(e.amount) for e in entries if e.category == "Corpus Fund")
    payload = _summarize_items(dept, items, extra={"total_corpus_fund": total_corpus})
    return jsonify(payload), 200


# ----------------------------------------------------------------------
# Excel export
# ----------------------------------------------------------------------
@superadmin_bp.route("/departments/<string:dept>/export", methods=["GET"])
@role_required("SuperAdmin")
def export_dept(dept):
    if dept not in VALID_DEPARTMENTS:
        return jsonify({"message": "Unknown department."}), 404

    start_date = _parse_date(request.args.get("start_date"))
    end_date = _parse_date(request.args.get("end_date"))
    category = (request.args.get("category") or "").strip()
    revenue_type = (request.args.get("revenue_type") or "").strip()

    if dept == "Caredx":
        data = _get_caredx_entries_and_summary(for_summary=False)
        wb = build_lab_entries_workbook(data["lab_entries"], data["expenses"])
    else:
        q = FinanceEntry.query.filter(_dept_scope_filter(dept))
        if start_date: q = q.filter(FinanceEntry.entry_date >= start_date)
        if end_date: q = q.filter(FinanceEntry.entry_date <= end_date)
        if category: q = q.filter(FinanceEntry.category == category)
        if revenue_type:
            q = q.filter(
                or_(
                    FinanceEntry.revenue_type == revenue_type,
                    FinanceEntry.category == SALARY_CAT,
                )
            )
        entries = q.order_by(FinanceEntry.entry_date.desc()).all()
        wb = build_finance_entries_workbook([e.to_dict() for e in entries])

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return send_file(
        buf,
        mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        as_attachment=True,
        download_name=f"{dept}_{start_date or 'all'}_{end_date or 'all'}.xlsx",
    )


# ----------------------------------------------------------------------
# Excel import
# ----------------------------------------------------------------------
@superadmin_bp.route("/departments/<string:dept>/import", methods=["POST"])
@role_required("SuperAdmin")
def import_dept(dept):
    if dept not in VALID_DEPARTMENTS:
        return jsonify({"message": "Unknown department.", "errors": []}), 404

    if "file" not in request.files:
        return jsonify({"message": "No file uploaded.", "errors": []}), 400
    file = request.files["file"]
    if not file.filename:
        return jsonify({"message": "Empty filename.", "errors": []}), 400
    if not (file.filename.lower().endswith(".xlsx") or file.filename.lower().endswith(".xlsm")):
        return jsonify({"message": "Only .xlsx or .xlsm files are supported.", "errors": []}), 400

    user_id = get_jwt_identity()
    user = User.query.get(user_id) if user_id else None
    generated_by = user.name if user else None

    try:
        if dept == "Caredx":
            parse_result = parse_lab_entries_workbook(file)
            if isinstance(parse_result, tuple) and len(parse_result) == 3:
                lab_rows, expense_rows, errors = parse_result
            elif isinstance(parse_result, tuple) and len(parse_result) == 2:
                lab_rows, expense_rows = parse_result
                errors = []
            else:
                lab_rows, expense_rows, errors = [], [], []

            imported = 0
            for row in lab_rows:
                db.session.add(CaredxLabEntry(**row))
                imported += 1
            for row in expense_rows:
                db.session.add(CaredxExpense(**row))
                imported += 1
            db.session.commit()
        else:
            parse_result = parse_finance_entries_workbook(file)
            if isinstance(parse_result, tuple) and len(parse_result) == 2:
                rows, errors = parse_result
            else:
                rows, errors = [], []

            imported = 0
            for row in rows:
                row.setdefault("department", dept)
                if generated_by and "generated_by" not in row:
                    row["generated_by"] = generated_by
                db.session.add(FinanceEntry(**row))
                imported += 1
            db.session.commit()

        return jsonify({"imported": imported, "errors": errors or []}), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({"message": f"Import failed: {str(e)}", "errors": []}), 400
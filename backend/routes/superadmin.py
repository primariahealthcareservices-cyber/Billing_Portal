from datetime import datetime, date
from flask import Blueprint, request, jsonify, send_file
from sqlalchemy import func, or_
from flask_jwt_extended import get_jwt_identity

from models import (
    db, User, FinanceEntry, CaredxLabEntry, CaredxExpense,
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
        query = db.session.query(func.coalesce(func.sum(CaredxExpense.amount), 0))
        if start_date:
            query = query.filter(CaredxExpense.expense_date >= start_date)
        if end_date:
            query = query.filter(CaredxExpense.expense_date <= end_date)
        return float(query.scalar())

    by_department = []
    for dept in VALID_DEPARTMENTS:
        if dept == "Caredx":
            income = caredx_income(start_date, end_date)
            expenses = caredx_expenses(start_date, end_date)
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


def _apply_finance_filters(query, args, department=None):
    """
    Apply common finance entry filters (date, type, category, search, revenue_type, sub_category).
    """
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


@superadmin_bp.route("/departments/<department>/options", methods=["GET"])
@role_required("SuperAdmin")
def department_options(department):
    if department not in VALID_DEPARTMENTS:
        return jsonify({"message": "Unknown department."}), 404

    if department == "Caredx":
        return jsonify({"department": "Caredx", "uses_lab_entries": True}), 200

    config = DEPARTMENT_CONFIG[department]
    return jsonify({
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
    }), 200


def _caredx_entries():
    start_date = _parse_date(request.args.get("start_date"))
    end_date = _parse_date(request.args.get("end_date"))
    search = request.args.get("search")
    section = request.args.get("section")
    category = request.args.get("category")

    lab_entries = []
    expenses = []

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
        lab_entries = lab_query.order_by(CaredxLabEntry.entry_date.desc(), CaredxLabEntry.id.desc()).all()

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
        expenses = exp_query.order_by(CaredxExpense.expense_date.desc(), CaredxExpense.id.desc()).all()

    return jsonify({
        "lab_entries": [e.to_dict() for e in lab_entries],
        "expenses": [e.to_dict() for e in expenses],
    }), 200


@superadmin_bp.route("/departments/<department>/entries", methods=["GET"])
@role_required("SuperAdmin")
def department_entries(department):
    if department not in VALID_DEPARTMENTS:
        return jsonify({"message": "Unknown department."}), 404

    if department == "Caredx":
        return _caredx_entries()

    query = FinanceEntry.query.filter_by(department=department)
    query = _apply_finance_filters(query, request.args, department=department)
    query = query.order_by(FinanceEntry.entry_date.desc(), FinanceEntry.id.desc())
    return jsonify({"entries": [e.to_dict() for e in query.all()]}), 200


@superadmin_bp.route("/departments/<department>/summary", methods=["GET"])
@role_required("SuperAdmin")
def department_summary(department):
    if department not in VALID_DEPARTMENTS:
        return jsonify({"message": "Unknown department."}), 404

    start_date = _parse_date(request.args.get("start_date"))
    end_date = _parse_date(request.args.get("end_date"))
    revenue_type = request.args.get("revenue_type")
    category = request.args.get("category")

    if department == "Caredx":
        section = request.args.get("section")

        if section == "lab":
            lab_query = CaredxLabEntry.query
            if start_date:
                lab_query = lab_query.filter(CaredxLabEntry.entry_date >= start_date)
            if end_date:
                lab_query = lab_query.filter(CaredxLabEntry.entry_date <= end_date)
            lab_entries = lab_query.all()
            total_income = sum(float(e.total_amount_paid) for e in lab_entries)
            total_paid = sum(float(e.paid_to_other_labs or 0) for e in lab_entries)

            by_date = {}
            for e in lab_entries:
                key = e.entry_date.isoformat()
                by_date.setdefault(key, {"date": key, "income": 0, "expenses": 0})
                by_date[key]["income"] += float(e.total_amount_paid)
            trend = sorted(by_date.values(), key=lambda x: x["date"])

            by_category = {}
            for e in lab_entries:
                cat = e.test_name or "Uncategorized"
                by_category.setdefault(cat, {"category": cat, "amount": 0})
                by_category[cat]["amount"] += float(e.total_amount_paid)
            category_breakdown = list(by_category.values())

            return jsonify({
                "department": "Caredx",
                "section": "lab",
                "total_income": total_income,
                "total_expenses": 0,
                "total_paid_to_other_labs": total_paid,
                "profit": total_income - total_paid,
                "entry_count": len(lab_entries),
                "trend": trend,
                "category_breakdown": category_breakdown,
            }), 200

        exp_query = CaredxExpense.query
        if start_date:
            exp_query = exp_query.filter(CaredxExpense.expense_date >= start_date)
        if end_date:
            exp_query = exp_query.filter(CaredxExpense.expense_date <= end_date)
        if category:
            exp_query = exp_query.filter(CaredxExpense.category == category)

        expenses = exp_query.all()
        total_expenses = sum(float(e.amount) for e in expenses)

        by_date = {}
        for e in expenses:
            key = e.expense_date.isoformat()
            by_date.setdefault(key, {"date": key, "expenses": 0})
            by_date[key]["expenses"] += float(e.amount)
        trend = sorted(by_date.values(), key=lambda x: x["date"])

        by_category = {}
        for e in expenses:
            by_category.setdefault(e.category, {"category": e.category, "amount": 0})
            by_category[e.category]["amount"] += float(e.amount)

        return jsonify({
            "department": "Caredx",
            "section": "expenses",
            "total_income": 0,
            "total_expenses": total_expenses,
            "total_paid_to_other_labs": 0,
            "profit": -total_expenses,
            "entry_count": len(expenses),
            "trend": trend,
            "category_breakdown": list(by_category.values()),
        }), 200

    # Standard departments
    query = FinanceEntry.query.filter_by(department=department)
    if start_date:
        query = query.filter(FinanceEntry.entry_date >= start_date)
    if end_date:
        query = query.filter(FinanceEntry.entry_date <= end_date)

    if revenue_type:
        query = query.filter(FinanceEntry.revenue_type == revenue_type)

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
        "department": department,
        "total_income": total_income,
        "total_expenses": total_expenses,
        "profit": total_income - total_expenses,
        "entry_count": len(entries),
        "trend": trend,
        "category_breakdown": list(by_category.values()),
    }), 200


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
        query = _apply_finance_filters(query, request.args, department=department)
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
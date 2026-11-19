# backend/routes/everglades.py
import json
from datetime import datetime, date
from flask import Blueprint, request, jsonify
from flask_jwt_extended import get_jwt_identity

from models import (
    db, FinanceEntry, FinanceEntryItem, ENTRY_TYPES,
    DEPARTMENT_CONFIG, EvergladesLedger, SALARY_CATEGORY,
)
from utils import role_required
from file_utils import save_invoice_file, delete_invoice_file

DEPARTMENT = "Everglades"
CONFIG = DEPARTMENT_CONFIG[DEPARTMENT]

CAPITAL_CATEGORIES = (
    "Equity Infusion",
    "Capital Equity",
    "Partner Contribution",
    "Asset Capitalization",
    "Reserve Fund Transfer",
    "Other Capital",
)

# Payment types allowed for Everglades entries
EVERGLADES_PAYMENT_TYPES = ("UPI", "Cash", "UPI+Cash", "Bank", "NEFT")

everglades_bp = Blueprint("everglades", __name__, url_prefix="/api/everglades")

# Everglades uses a simple amount-only form (no item rows)
EVERGLADES_ITEM_CATEGORIES = []


# ==================== HELPERS ====================
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


def _validate_items(items_data):
    clean_items = []
    errors = []
    items_total = 0.0
    if not isinstance(items_data, list):
        items_data = []
    for idx, item in enumerate(items_data, start=1):
        item_name = (item.get("item_name") or "").strip()
        try:
            quantity = float(item.get("quantity"))
        except (TypeError, ValueError):
            quantity = None
        try:
            unit_price = float(item.get("unit_price"))
        except (TypeError, ValueError):
            unit_price = None
        if not item_name:
            errors.append(f"Item {idx}: item name is required.")
            continue
        if quantity is None or quantity <= 0:
            errors.append(f"Item {idx} ({item_name}): quantity must be greater than 0.")
            continue
        if unit_price is None or unit_price < 0:
            errors.append(f"Item {idx} ({item_name}): unit price must be a valid number.")
            continue
        line_amount = round(quantity * unit_price, 2)
        items_total = round(items_total + line_amount, 2)
        clean_items.append({
            "item_name": item_name,
            "quantity": quantity,
            "unit_price": unit_price,
            "amount": line_amount,
        })
    if not clean_items and not errors:
        errors.append("Add at least one item.")
    return clean_items, items_total, errors


def _parse_gst_tax_percent(raw_value):
    if raw_value in (None, ""):
        return 0.0, None
    try:
        percent = float(raw_value)
    except (TypeError, ValueError):
        return 0.0, "gst_tax_percent must be a number."
    if percent < 0 or percent > 100:
        return 0.0, "gst_tax_percent must be between 0 and 100."
    return percent, None


def _parse_items_field(raw_items):
    if raw_items is None or raw_items == "":
        return []
    if isinstance(raw_items, list):
        return raw_items
    if isinstance(raw_items, str):
        try:
            return json.loads(raw_items)
        except (TypeError, ValueError):
            return None
    return None


@everglades_bp.route("/options", methods=["GET"])
@role_required("Everglades")
def options():
    return jsonify({
        "department": DEPARTMENT,
        "entry_types": ["Income", "Expenses", "Capital", "Ledger"],
        "categories": CONFIG["categories"],
        "revenue_types": CONFIG["revenue_types"],
        "show_generated_by": CONFIG["show_generated_by"],
        "show_revenue_type": CONFIG["show_revenue_type"],
        "show_client_name": CONFIG["show_client_name"],
        "show_gst_number": CONFIG["show_gst_number"],
        "gst_required_categories": CONFIG["gst_required_categories"],
        "show_items": CONFIG["show_items"],
        "show_invoice": CONFIG["show_invoice"],
        "show_gst_tax": CONFIG["show_gst_tax"],
        "show_tax_invoice_number": CONFIG["show_tax_invoice_number"],
        "is_salary_category": SALARY_CATEGORY,
        "is_ledger_category": "Ledger",
        "capital_categories": list(CAPITAL_CATEGORIES),
        "payment_types": list(EVERGLADES_PAYMENT_TYPES),
    }), 200


@everglades_bp.route("/clients", methods=["GET"])
@role_required("Everglades")
def get_clients():
    clients = db.session.query(FinanceEntry.client_name) \
        .filter(FinanceEntry.department == DEPARTMENT, FinanceEntry.client_name.isnot(None)) \
        .distinct().all()
    client_list = sorted([c[0] for c in clients if c[0]])
    return jsonify({"clients": client_list}), 200


@everglades_bp.route("/entries", methods=["POST"])
@role_required("Everglades")
def create_entry():
    is_json = request.is_json
    if is_json:
        data = request.get_json() or {}
    else:
        data = request.form

    entry_type = data.get("entry_type")

    # ====================== CAPITAL ENTRY ======================
    if entry_type == "Capital":
        errors = []
        capital_category = (data.get("capital_category") or data.get("fund_category") or data.get("category") or "").strip()
        client_name = (data.get("client_name") or "").strip()
        purpose = (data.get("purpose") or "").strip()
        remarks_val = (data.get("remarks") or "").strip()
        payment_type_val = (data.get("payment_type") or "").strip() or None
        entry_date_val = _parse_date(data.get("entry_date"), default=date.today())
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
            amount_val = float(amount_raw)
            if amount_val <= 0:
                errors.append("Amount must be greater than 0.")
        except (TypeError, ValueError):
            amount_val = 0
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
            payment_type=payment_type_val,
            amount=amount_val,
            purpose=purpose,
            remarks=remarks_val,
            entry_date=entry_date_val,
            created_by_id=get_jwt_identity(),
        )
        try:
            db.session.add(entry)
            db.session.commit()
        except Exception as exc:
            db.session.rollback()
            import traceback
            traceback.print_exc()
            return jsonify({"message": "Failed to create Capital entry.", "error": str(exc)}), 500
        return jsonify({"message": "Capital entry created.", "entry": entry.to_dict()}), 201

    # ---- LEDGER HANDLING ----
    category = data.get("category")
    remarks = data.get("remarks", "") or ""
    entry_date = _parse_date(data.get("entry_date"), default=date.today())

    if entry_type == "Ledger":
        category = "Ledger"
        if not is_json:
            return jsonify({"message": "Ledger entries must be sent as JSON."}), 400

        customer_name = (data.get("customer_name") or "").strip()
        try:
            total_amount = float(data.get("total_amount") or 0)
        except (TypeError, ValueError):
            total_amount = 0
        try:
            paid = float(data.get("paid") or 0)
        except (TypeError, ValueError):
            paid = 0
        balance = total_amount - paid

        if not customer_name:
            return jsonify({"message": "Customer name is required."}), 400
        if total_amount <= 0:
            return jsonify({"message": "Total amount must be greater than 0."}), 400

        ledger = EvergladesLedger(
            customer_name=customer_name,
            entry_date=entry_date,
            total_amount=total_amount,
            paid=paid,
            balance=balance,
            remarks=remarks,
            created_by_id=get_jwt_identity(),
        )
        try:
            db.session.add(ledger)
            db.session.commit()
        except Exception as exc:
            db.session.rollback()
            import traceback
            traceback.print_exc()
            return jsonify({"message": "Failed to create Ledger entry.", "error": str(exc)}), 500
        return jsonify({
            "message": "Ledger entry created.",
            "entry": ledger.to_dict(),
        }), 201

    # ---- REGULAR FINANCE ENTRY ----
    # Fields: Date, Type, Category, Client Name, Amount, Payment Type, Remarks
    # (no generated_by / revenue_type / gst_number / purpose / invoice)
    if is_json:
        return jsonify({"message": "Non-Ledger entries must be sent as form data."}), 400

    data = request.form
    client_name = (data.get("client_name") or "").strip() or None
    payment_type = (data.get("payment_type") or "").strip() or None
    remarks = (data.get("remarks") or "").strip()

    errors = []
    if entry_type not in ENTRY_TYPES:
        errors.append("entry_type must be Income, Expenses, or Capital.")
    allowed_categories = CONFIG["categories"].get(entry_type, [])
    if category not in allowed_categories:
        errors.append(f"category must be one of: {', '.join(allowed_categories)}.")
    if entry_type == "Expenses" and category == SALARY_CATEGORY:
        errors.append("Salaries must be entered by Corporate Management only.")
    if not client_name:
        errors.append("Client name is required.")
    if payment_type not in EVERGLADES_PAYMENT_TYPES:
        errors.append("payment_type must be one of: " + ", ".join(EVERGLADES_PAYMENT_TYPES) + ".")
    if not remarks:
        errors.append("Remarks are required.")
    try:
        amount_val = float(data.get("amount"))
        if amount_val <= 0:
            errors.append("Amount must be greater than 0.")
    except (TypeError, ValueError):
        amount_val = 0
        errors.append("Amount must be a valid number.")

    if errors:
        return jsonify({"message": "Validation failed.", "errors": errors}), 400

    amount_val = round(amount_val, 2)
    entry = FinanceEntry(
        department=DEPARTMENT,
        entry_type=entry_type,
        category=category,
        client_name=client_name,
        payment_type=payment_type,
        amount=amount_val,
        base_amount=amount_val,
        gst_tax_percent=0,
        gst_tax_amount=0,
        remarks=remarks,
        entry_date=entry_date,
        created_by_id=get_jwt_identity(),
    )
    try:
        db.session.add(entry)
        db.session.commit()
    except Exception as exc:
        db.session.rollback()
        import traceback
        traceback.print_exc()
        return jsonify({"message": "Failed to create entry.", "error": str(exc)}), 500
    return jsonify({"message": "Entry created.", "entry": entry.to_dict()}), 201


@everglades_bp.route("/entries", methods=["GET"])
@role_required("Everglades")
def list_entries():
    start_date = _parse_date(request.args.get("start_date"))
    end_date = _parse_date(request.args.get("end_date"))
    entry_type = request.args.get("entry_type")
    category = request.args.get("category")
    search = request.args.get("search")
    include_ledger = (category == "Ledger" or category is None)

    finance_query = FinanceEntry.query.filter_by(department=DEPARTMENT)
    if category and category != "Ledger":
        finance_query = finance_query.filter(FinanceEntry.category == category)
    else:
        finance_query = finance_query.filter(FinanceEntry.category != "Ledger")

    if start_date:
        finance_query = finance_query.filter(FinanceEntry.entry_date >= start_date)
    if end_date:
        finance_query = finance_query.filter(FinanceEntry.entry_date <= end_date)
    if entry_type:
        finance_query = finance_query.filter(FinanceEntry.entry_type == entry_type)
    if search:
        like = f"%{search}%"
        finance_query = finance_query.filter(
            (FinanceEntry.generated_by.ilike(like)) |
            (FinanceEntry.client_name.ilike(like)) |
            (FinanceEntry.gst_number.ilike(like)) |
            (FinanceEntry.tax_invoice_number.ilike(like)) |
            (FinanceEntry.remarks.ilike(like)) |
            (FinanceEntry.payment_type.ilike(like))
        )
    finance_entries = finance_query.order_by(
        FinanceEntry.entry_date.desc(), FinanceEntry.id.desc()
    ).all()

    ledger_entries = []
    if include_ledger:
        ledger_query = EvergladesLedger.query
        if start_date:
            ledger_query = ledger_query.filter(EvergladesLedger.entry_date >= start_date)
        if end_date:
            ledger_query = ledger_query.filter(EvergladesLedger.entry_date <= end_date)
        if search:
            like = f"%{search}%"
            ledger_query = ledger_query.filter(
                (EvergladesLedger.customer_name.ilike(like)) |
                (EvergladesLedger.remarks.ilike(like))
            )
        ledger_entries = ledger_query.order_by(
            EvergladesLedger.entry_date.desc(), EvergladesLedger.id.desc()
        ).all()

    combined = []
    for fe in finance_entries:
        d = fe.to_dict()
        d["_type"] = "finance"
        combined.append(d)
    for le in ledger_entries:
        combined.append({
            "id": le.id,
            "department": DEPARTMENT,
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

    combined.sort(key=lambda x: (x["entry_date"], x["id"]), reverse=True)
    return jsonify({"entries": combined}), 200


@everglades_bp.route("/entries/<int:entry_id>", methods=["PUT"])
@role_required("Everglades")
def update_entry(entry_id):
    entry = FinanceEntry.query.filter_by(id=entry_id, department=DEPARTMENT).first()

    # ---------------- CAPITAL ----------------
    if entry and entry.entry_type == "Capital":
        if request.is_json:
            data = request.get_json(silent=True) or {}
        else:
            data = request.form

        errors = []
        capital_category = (
            data.get("capital_category")
            or data.get("fund_category")
            or data.get("category")
            or entry.fund_category
            or ""
        ).strip()
        client_name = (data.get("client_name") or "").strip()
        purpose = (data.get("purpose") or "").strip()
        remarks_val = (data.get("remarks") or "").strip()
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
            amount_val = float(amount_raw)
            if amount_val <= 0:
                errors.append("Amount must be greater than 0.")
        except (TypeError, ValueError):
            amount_val = 0
            errors.append("Amount must be a valid number.")

        if errors:
            return jsonify({"message": "Validation failed.", "errors": errors}), 400

        entry.category = capital_category
        entry.sub_category = "Capital"
        entry.fund_category = capital_category
        entry.client_name = client_name
        entry.amount = amount_val
        entry.purpose = purpose
        entry.remarks = remarks_val
        if "payment_type" in data:
            entry.payment_type = (data.get("payment_type") or "").strip() or None

        if "entry_date" in data:
            parsed = _parse_date(data["entry_date"])
            if parsed:
                entry.entry_date = parsed

        try:
            db.session.commit()
        except Exception as exc:
            db.session.rollback()
            import traceback
            traceback.print_exc()
            return jsonify({"message": "Failed to update Capital entry.", "error": str(exc)}), 500
        return jsonify({"message": "Capital entry updated.", "entry": entry.to_dict()}), 200

    # ---------------- LEDGER ----------------
    if not entry:
        ledger = EvergladesLedger.query.get(entry_id)
        if ledger:
            if request.is_json:
                data = request.get_json(silent=True) or {}
            else:
                data = request.form

            if "customer_name" in data:
                ledger.customer_name = data["customer_name"].strip()
            if "entry_date" in data:
                parsed = _parse_date(data["entry_date"])
                if parsed:
                    ledger.entry_date = parsed
            if "total_amount" in data:
                try:
                    total = float(data["total_amount"])
                    if total >= 0:
                        ledger.total_amount = total
                except (TypeError, ValueError):
                    pass
            if "paid" in data:
                try:
                    paid = float(data["paid"])
                    if paid >= 0:
                        ledger.paid = paid
                except (TypeError, ValueError):
                    pass
            ledger.balance = ledger.total_amount - ledger.paid
            if "remarks" in data:
                ledger.remarks = data["remarks"]

            try:
                db.session.commit()
            except Exception as exc:
                db.session.rollback()
                import traceback
                traceback.print_exc()
                return jsonify({"message": "Failed to update Ledger entry.", "error": str(exc)}), 500
            return jsonify({"message": "Ledger entry updated.", "entry": ledger.to_dict()}), 200
        else:
            return jsonify({"message": "Entry not found."}), 404

    # ---------------- REGULAR ENTRY ----------------
    if request.is_json:
        data = request.get_json(silent=True) or {}
    else:
        data = request.form

    errors = []

    new_entry_type = data.get("entry_type", entry.entry_type) or entry.entry_type

    if "entry_type" in data and data["entry_type"] in ENTRY_TYPES:
        entry.entry_type = data["entry_type"]
    if "category" in data:
        allowed_categories = CONFIG["categories"].get(entry.entry_type, [])
        if data["category"] in allowed_categories:
            entry.category = data["category"]
        else:
            errors.append(f"category must be one of: {', '.join(allowed_categories)}")
    if entry.entry_type == "Expenses" and entry.category == SALARY_CATEGORY:
        errors.append("Salaries must be entered by Corporate Management only.")

    if "client_name" in data:
        client_name = (data["client_name"] or "").strip()
        if not client_name:
            errors.append("Client name is required.")
        else:
            entry.client_name = client_name

    if "payment_type" in data:
        pt = (data["payment_type"] or "").strip()
        if pt in EVERGLADES_PAYMENT_TYPES:
            entry.payment_type = pt
        else:
            errors.append("payment_type must be one of: " + ", ".join(EVERGLADES_PAYMENT_TYPES) + ".")

    if "remarks" in data:
        remarks_val = (data["remarks"] or "").strip()
        if not remarks_val:
            errors.append("Remarks are required.")
        else:
            entry.remarks = remarks_val

    if "entry_date" in data:
        parsed = _parse_date(data["entry_date"])
        if parsed:
            entry.entry_date = parsed

    amount_from_request = data.get("amount")
    if amount_from_request is not None and amount_from_request != "":
        try:
            base_amount = float(amount_from_request)
            if base_amount <= 0:
                errors.append("Amount must be greater than 0.")
        except (TypeError, ValueError):
            errors.append("amount must be a valid number.")
            base_amount = float(entry.base_amount) if entry.base_amount is not None else 0.0
    else:
        base_amount = float(entry.base_amount) if entry.base_amount is not None else 0.0

    # Everglades entries are simple: no item rows
    if entry.items:
        for old_item in list(entry.items):
            db.session.delete(old_item)
        entry.items = []

    if errors:
        db.session.rollback()
        return jsonify({"message": "Validation failed.", "errors": errors}), 400

    base_amount = round(base_amount, 2)
    entry.base_amount = base_amount
    entry.gst_tax_percent = 0
    entry.gst_tax_amount = 0
    entry.amount = base_amount

    try:
        db.session.commit()
    except Exception as exc:
        db.session.rollback()
        import traceback
        traceback.print_exc()
        return jsonify({"message": "Failed to update entry.", "error": str(exc)}), 500

    return jsonify({"message": "Entry updated.", "entry": entry.to_dict()}), 200


@everglades_bp.route("/entries/<int:entry_id>", methods=["DELETE"])
@role_required("Everglades")
def delete_entry(entry_id):
    entry = FinanceEntry.query.filter_by(id=entry_id, department=DEPARTMENT).first()
    if entry:
        delete_invoice_file(entry.invoice_filename)
        db.session.delete(entry)
        db.session.commit()
        return jsonify({"message": "Entry deleted."}), 200

    ledger = EvergladesLedger.query.get(entry_id)
    if ledger:
        db.session.delete(ledger)
        db.session.commit()
        return jsonify({"message": "Ledger entry deleted."}), 200

    return jsonify({"message": "Entry not found."}), 404


@everglades_bp.route("/ledger/history", methods=["GET"])
@role_required("Everglades")
def get_ledger_history():
    customer = request.args.get("customer", "").strip()
    if not customer:
        return jsonify({"history": []}), 200
    entries = EvergladesLedger.query.filter_by(customer_name=customer).order_by(
        EvergladesLedger.entry_date.asc(), EvergladesLedger.id.asc()
    ).all()
    return jsonify({"history": [e.to_dict() for e in entries]}), 200


@everglades_bp.route("/summary", methods=["GET"])
@role_required("Everglades")
def finance_summary():
    start_date = _parse_date(request.args.get("start_date"))
    end_date = _parse_date(request.args.get("end_date"))

    query = FinanceEntry.query.filter_by(department=DEPARTMENT).filter(
        FinanceEntry.category != "Ledger"
    )
    if start_date:
        query = query.filter(FinanceEntry.entry_date >= start_date)
    if end_date:
        query = query.filter(FinanceEntry.entry_date <= end_date)
    finance_entries = query.all()

    total_income = sum(float(e.amount) for e in finance_entries if e.entry_type == "Income")
    total_expenses = sum(float(e.amount) for e in finance_entries if e.entry_type == "Expenses")
    total_capital = sum(float(e.amount) for e in finance_entries if e.entry_type == "Capital")

    ledger_query = EvergladesLedger.query
    if start_date:
        ledger_query = ledger_query.filter(EvergladesLedger.entry_date >= start_date)
    if end_date:
        ledger_query = ledger_query.filter(EvergladesLedger.entry_date <= end_date)
    ledger_entries = ledger_query.all()
    total_expenses += sum(float(e.total_amount) for e in ledger_entries)

    all_items = list(finance_entries)
    for le in ledger_entries:
        class Dummy:
            pass
        dummy = Dummy()
        dummy.entry_date = le.entry_date
        dummy.entry_type = "Expenses"
        dummy.category = "Ledger"
        dummy.amount = le.total_amount
        all_items.append(dummy)

    by_date = {}
    for item in all_items:
        key = item.entry_date.isoformat()
        by_date.setdefault(key, {"date": key, "income": 0, "expenses": 0, "capital": 0})
        if item.entry_type == "Income":
            by_date[key]["income"] += float(item.amount)
        elif item.entry_type == "Expenses":
            by_date[key]["expenses"] += float(item.amount)
        elif item.entry_type == "Capital":
            by_date[key]["capital"] += float(item.amount)
    trend = sorted(by_date.values(), key=lambda x: x["date"])

    by_category = {}
    for item in all_items:
        cat = getattr(item, "category", "Uncategorized")
        by_category.setdefault(cat, {"category": cat, "amount": 0})
        by_category[cat]["amount"] += float(item.amount)

    return jsonify({
        "department": DEPARTMENT,
        "total_income": total_income,
        "total_expenses": total_expenses,
        "total_capital": total_capital,
        "profit": total_income - total_expenses,
        "entry_count": len(all_items),
        "trend": trend,
        "category_breakdown": list(by_category.values()),
    }), 200
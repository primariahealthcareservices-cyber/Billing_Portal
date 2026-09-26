from flask import Blueprint, request, jsonify
from flask_jwt_extended import get_jwt_identity
from sqlalchemy import func, or_, select
from models import (
    db, Medicine, MedicineCategory, Manufacturer, ManufacturerProduct, Vendor, MedicineBatch,
    Purchase, PurchaseItem, Sale, SaleItem, Expense, ExpenseCategory,
    StockMovement
)
from utils import role_required
from datetime import datetime, date, timedelta

pharmacy_bp = Blueprint("pharmacy", __name__, url_prefix="/api/pharmacy")

# ---------- HELPERS ----------
def generate_code(prefix, model, col):
    last = model.query.order_by(model.id.desc()).first()
    if last:
        try:
            num = int(getattr(last, col).split(prefix)[-1]) + 1
        except (ValueError, AttributeError):
            num = 1
    else:
        num = 1
    return f"{prefix}{num:06d}"

def _parse_date(val):
    if not val:
        return None
    try:
        return datetime.strptime(val, "%Y-%m-%d").date()
    except Exception:
        return None

def _safe_user_id():
    try:
        return int(get_jwt_identity())
    except (TypeError, ValueError):
        return None

# ---------- MEDICINE CRUD ----------
@pharmacy_bp.route("/medicines", methods=["GET"])
@role_required("Pharmacy")
def get_medicines():
    search = request.args.get("search")
    query = Medicine.query
    if search:
        query = query.filter(or_(
            Medicine.medicine_name.ilike(f"%{search}%"),
            Medicine.medicine_code.ilike(f"%{search}%")
        ))
    medicines = query.limit(50).all()
    return jsonify({"medicines": [m.to_dict() for m in medicines]}), 200

@pharmacy_bp.route("/medicines", methods=["POST"])
@role_required("Pharmacy")
def create_medicine():
    data = request.get_json() or {}
    medicine = Medicine(
        medicine_code=data.get("medicine_code") or generate_code("MED", Medicine, "medicine_code"),
        medicine_name=data["medicine_name"],
        generic_name=data.get("generic_name"),
        category_id=data.get("category_id"),
        manufacturer_id=data.get("manufacturer_id"),
        dosage=data.get("dosage"),
        strength=data.get("strength"),
        form=data.get("form"),
        unit=data.get("unit"),
        pack_size=data.get("pack_size"),
        hsn_code=data.get("hsn_code"),
        gst_percentage=data.get("gst_percentage", 0),
        reorder_level=data.get("reorder_level", 0),
        prescription_required=data.get("prescription_required", False)
    )
    db.session.add(medicine)
    db.session.commit()
    return jsonify({"message": "Medicine created", "medicine": medicine.to_dict()}), 201

@pharmacy_bp.route("/medicines/<int:id>", methods=["GET"])
@role_required("Pharmacy")
def get_medicine(id):
    medicine = Medicine.query.get_or_404(id)
    return jsonify(medicine.to_dict()), 200

@pharmacy_bp.route("/medicines/<int:id>", methods=["PUT"])
@role_required("Pharmacy")
def update_medicine(id):
    medicine = Medicine.query.get_or_404(id)
    data = request.get_json() or {}

    for field in [
        "medicine_code", "medicine_name", "generic_name", "category_id",
        "manufacturer_id", "dosage", "strength", "form", "unit",
        "pack_size", "hsn_code", "gst_percentage", "reorder_level",
        "prescription_required",
    ]:
        if field in data:
            setattr(medicine, field, data[field])

    db.session.commit()
    return jsonify({"message": "Medicine updated", "medicine": medicine.to_dict()}), 200

@pharmacy_bp.route("/medicines/<int:id>", methods=["DELETE"])
@role_required("Pharmacy")
def delete_medicine(id):
    medicine = Medicine.query.get_or_404(id)

    # Safety: block delete if medicine has batches linked
    if medicine.batches and len(medicine.batches) > 0:
        return jsonify({
            "error": "Cannot delete medicine with existing batches. Delete the batches first."
        }), 400

    db.session.delete(medicine)
    db.session.commit()
    return jsonify({"message": "Deleted"}), 200

# ---------- CATEGORIES ----------
@pharmacy_bp.route("/categories", methods=["GET"])
@role_required("Pharmacy")
def get_categories():
    categories = MedicineCategory.query.all()
    return jsonify([c.to_dict() for c in categories]), 200

@pharmacy_bp.route("/categories", methods=["POST"])
@role_required("Pharmacy")
def create_category():
    data = request.get_json()
    cat = MedicineCategory(name=data["name"], description=data.get("description"))
    db.session.add(cat)
    db.session.commit()
    return jsonify(cat.to_dict()), 201

@pharmacy_bp.route("/categories/<int:id>", methods=["PUT"])
@role_required("Pharmacy")
def update_category(id):
    cat = MedicineCategory.query.get_or_404(id)
    data = request.get_json()
    cat.name = data.get("name", cat.name)
    cat.description = data.get("description", cat.description)
    db.session.commit()
    return jsonify(cat.to_dict()), 200

@pharmacy_bp.route("/categories/<int:id>", methods=["DELETE"])
@role_required("Pharmacy")
def delete_category(id):
    cat = MedicineCategory.query.get_or_404(id)
    db.session.delete(cat)
    db.session.commit()
    return jsonify({"message": "Deleted"}), 200

# ---------- MANUFACTURERS ----------
# ---------- MANUFACTURERS ----------
@pharmacy_bp.route("/manufacturers", methods=["GET"])
@role_required("Pharmacy")
def get_manufacturers():
    items = Manufacturer.query.all()
    return jsonify([i.to_dict() for i in items]), 200


def _save_manufacturer_products(manufacturer, products_data):
    """
    Replace all products of this manufacturer with the incoming list.
    Each item: { product_name, quantity, unit_price, price }
    """
    # wipe existing
    for old in list(manufacturer.products):
        db.session.delete(old)

    total = 0.0
    for p in products_data or []:
        name = (p.get("product_name") or "").strip()
        if not name:
            continue
        try:
            qty = int(p.get("quantity") or 0)
            unit_price = float(p.get("unit_price") or 0)
            line_total = float(p.get("price") or 0)
        except (TypeError, ValueError):
            continue

        # if price not supplied, compute it
        if line_total <= 0:
            line_total = round(qty * unit_price, 2)

        db.session.add(ManufacturerProduct(
            manufacturer_id=manufacturer.id,
            product_name=name,
            quantity=qty,
            unit_price=unit_price,
            price=line_total,
        ))
        total += line_total

    return round(total, 2)


def _compute_payment_status(total_price, paid):
    if paid <= 0:
        return "Pending"
    if paid >= total_price:
        return "Paid"
    return "Partial"


@pharmacy_bp.route("/manufacturers", methods=["POST"])
@role_required("Pharmacy")
def create_manufacturer():
    data = request.get_json() or {}

    try:
        paid = float(data.get("paid") or 0)
    except (TypeError, ValueError):
        paid = 0.0

    item = Manufacturer(
        name=data["name"],
        contact=data.get("contact"),
        phone=data.get("phone"),
        email=data.get("email"),
        address=data.get("address"),
        gst_number=data.get("gst_number"),
        payment_type=data.get("payment_type"),
        paid=paid,
        balance=0,
        payment_status="Pending",
    )
    db.session.add(item)
    db.session.flush()   # get item.id

    total_price = _save_manufacturer_products(item, data.get("products") or [])
    item.balance = round(total_price - paid, 2)
    item.payment_status = data.get("payment_status") or _compute_payment_status(total_price, paid)

    db.session.commit()
    return jsonify(item.to_dict()), 201


@pharmacy_bp.route("/manufacturers/<int:id>", methods=["PUT"])
@role_required("Pharmacy")
def update_manufacturer(id):
    item = Manufacturer.query.get_or_404(id)
    data = request.get_json() or {}

    for field in ["name", "contact", "phone", "email", "address", "gst_number", "payment_type"]:
        if field in data:
            setattr(item, field, data[field])

    if "paid" in data and data["paid"] not in (None, ""):
        try:
            item.paid = float(data["paid"])
        except (TypeError, ValueError):
            pass

    # replace product list if provided
    if "products" in data:
        total_price = _save_manufacturer_products(item, data.get("products") or [])
    else:
        total_price = sum(float(p.price or 0) for p in item.products)

    item.balance = round(total_price - float(item.paid or 0), 2)
    item.payment_status = data.get("payment_status") or _compute_payment_status(total_price, float(item.paid or 0))

    db.session.commit()
    return jsonify(item.to_dict()), 200


@pharmacy_bp.route("/manufacturers/<int:id>", methods=["DELETE"])
@role_required("Pharmacy")
def delete_manufacturer(id):
    item = Manufacturer.query.get_or_404(id)
    db.session.delete(item)
    db.session.commit()
    return jsonify({"message": "Deleted"}), 200
# ---------- VENDORS ----------
@pharmacy_bp.route("/vendors", methods=["GET"])
@role_required("Pharmacy")
def get_vendors():
    vendors = Vendor.query.filter_by(status="Active").all()
    return jsonify([v.to_dict() for v in vendors]), 200

@pharmacy_bp.route("/vendors", methods=["POST"])
@role_required("Pharmacy")
def create_vendor():
    data = request.get_json()
    vendor = Vendor(
        vendor_code=data.get("vendor_code") or generate_code("VEN", Vendor, "vendor_code"),
        vendor_name=data["vendor_name"],
        contact_person=data.get("contact_person"),
        phone=data.get("phone"),
        email=data.get("email"),
        address=data.get("address"),
        gst_number=data.get("gst_number"),
        drug_license_number=data.get("drug_license_number"),
        payment_terms=data.get("payment_terms"),
        credit_limit=data.get("credit_limit", 0),
        opening_balance=data.get("opening_balance", 0),
        status=data.get("status", "Active")
    )
    db.session.add(vendor)
    db.session.commit()
    return jsonify(vendor.to_dict()), 201

@pharmacy_bp.route("/vendors/<int:id>", methods=["PUT"])
@role_required("Pharmacy")
def update_vendor(id):
    vendor = Vendor.query.get_or_404(id)
    data = request.get_json()
    for field in ["vendor_name", "contact_person", "phone", "email", "address",
                  "gst_number", "drug_license_number", "payment_terms",
                  "credit_limit", "opening_balance", "status"]:
        if field in data:
            setattr(vendor, field, data[field])
    db.session.commit()
    return jsonify(vendor.to_dict()), 200

@pharmacy_bp.route("/vendors/<int:id>", methods=["DELETE"])
@role_required("Pharmacy")
def delete_vendor(id):
    vendor = Vendor.query.get_or_404(id)
    db.session.delete(vendor)
    db.session.commit()
    return jsonify({"message": "Deleted"}), 200

# ---------- PURCHASES ----------
@pharmacy_bp.route("/purchases", methods=["GET"])
@role_required("Pharmacy")
def get_purchases():
    purchases = Purchase.query.order_by(Purchase.purchase_date.desc()).limit(100).all()
    return jsonify([p.to_dict() for p in purchases]), 200

@pharmacy_bp.route("/purchases/<int:id>", methods=["GET"])
@role_required("Pharmacy")
def get_purchase(id):
    purchase = Purchase.query.get_or_404(id)
    return jsonify(purchase.to_dict()), 200

@pharmacy_bp.route("/purchases/<int:id>", methods=["DELETE"])
@role_required("Pharmacy")
def delete_purchase(id):
    purchase = Purchase.query.get_or_404(id)
    db.session.delete(purchase)
    db.session.commit()
    return jsonify({"message": "Deleted"}), 200

@pharmacy_bp.route("/purchases", methods=["POST"])
@role_required("Pharmacy")
def create_purchase():
    data = request.get_json()

    purchase = Purchase(
        purchase_number=data.get("purchase_number") or generate_code("PUR", Purchase, "purchase_number"),
        vendor_id=data["vendor_id"],
        purchase_date=_parse_date(data.get("purchase_date")) or date.today(),
        grand_total=data.get("grand_total", 0),
        status=data.get("status", "pending"),
        created_by_id=_safe_user_id(),
    )
    db.session.add(purchase)
    db.session.commit()
    return jsonify(purchase.to_dict()), 201

@pharmacy_bp.route("/purchases/<int:id>", methods=["PUT"])
@role_required("Pharmacy")
def update_purchase(id):
    purchase = Purchase.query.get_or_404(id)
    data = request.get_json()

    for field in ["purchase_number", "vendor_id", "grand_total", "status"]:
        if field in data:
            setattr(purchase, field, data[field])

    if "purchase_date" in data:
        parsed = _parse_date(data["purchase_date"])
        if parsed:
            purchase.purchase_date = parsed

    db.session.commit()
    return jsonify(purchase.to_dict()), 200

# ---------- SALES ----------
@pharmacy_bp.route("/sales", methods=["GET"])
@role_required("Pharmacy")
def get_sales():
    sales = Sale.query.order_by(Sale.sale_date.desc()).limit(100).all()
    return jsonify([s.to_dict() for s in sales]), 200

@pharmacy_bp.route("/sales/<int:id>", methods=["GET"])
@role_required("Pharmacy")
def get_sale(id):
    sale = Sale.query.get_or_404(id)
    return jsonify(sale.to_dict()), 200
@pharmacy_bp.route("/sales/<int:id>/invoice", methods=["GET"])
@role_required("Pharmacy")
def get_sale_invoice(id):
    """
    Returns everything the frontend needs to render a printable invoice:
    - sale header
    - customer
    - line items (product name, batch, qty, rates, amount)
    - totals (subtotal, discount, gst, grand total, paid, balance)
    """
    sale = Sale.query.get_or_404(id)

    items = []
    for si in sale.items:
        # sale_item -> batch -> medicine
        batch = si.batch
        medicine = batch.medicine if batch else None

        items.append({
            "id": si.id,
            "medicine_name": medicine.medicine_name if medicine else "—",
            "medicine_code": medicine.medicine_code if medicine else "",
            "batch_number": batch.batch_number if batch else "",
            "expiry_date": batch.expiry_date.isoformat() if batch and batch.expiry_date else None,
            "quantity": int(si.quantity or 0),
            "selling_rate": float(si.selling_rate or 0),
            "mrp": float(si.mrp or 0),
            "gst_percentage": float(si.gst_percentage or 0),
            "discount_percentage": float(si.discount_percentage or 0),
            "amount": float(si.amount or 0),
        })

    subtotal = float(sale.subtotal or 0)
    discount = float(sale.discount or 0)
    gst_total = float(sale.gst_total or 0)
    grand_total = float(sale.grand_total or 0)
    paid = float(sale.paid_amount or 0)
    balance = round(grand_total - paid, 2)

    return jsonify({
        "sale": {
            "id": sale.id,
            "sale_number": sale.sale_number,
            "sale_date": sale.sale_date.isoformat() if sale.sale_date else None,
            "customer_name": sale.customer_name or "Walk-in Customer",
            "customer_phone": sale.customer_phone,
            "customer_email": sale.customer_email,
            "payment_method": sale.payment_method,
            "status": sale.status,
            "remarks": sale.remarks,
        },
        "items": items,
        "totals": {
            "subtotal": round(subtotal, 2),
            "discount": round(discount, 2),
            "gst_total": round(gst_total, 2),
            "grand_total": round(grand_total, 2),
            "paid": round(paid, 2),
            "balance": balance,
        },
        "company": {
            "name": "Primaria Pharmacy",
            "address": "Brodipeta,guntur,Andhra pradesh 522002",
            "phone": "+91 9247966494",
            "email": "info@primariacare.com",
            "gstin": "GSTINXXXXXXXXXX",
            "logo_url": "/primaria.png",
        },
    }), 200

@pharmacy_bp.route("/sales", methods=["POST"])
@role_required("Pharmacy")
def create_sale():
    data = request.get_json() or {}

    try:
        subtotal = float(data.get("subtotal") or 0)
        discount = float(data.get("discount") or 0)
        gst_percent = float(data.get("gst_percent") or 0)
        paid_amount = float(data.get("paid_amount") or 0)
    except (TypeError, ValueError):
        return jsonify({"error": "Invalid numeric values for subtotal/discount/gst_percent/paid_amount"}), 400

    taxable = max(subtotal - discount, 0)
    gst_total = round((taxable * gst_percent) / 100, 2)
    grand_total = round(taxable + gst_total, 2)

    try:
        sale = Sale(
            sale_number=data.get("sale_number") or generate_code("SAL", Sale, "sale_number"),
            customer_name=data.get("customer_name"),
            customer_phone=data.get("customer_phone"),
            sale_date=_parse_date(data.get("sale_date")) or date.today(),
            subtotal=subtotal,
            discount=discount,
            gst_percent=gst_percent,
            gst_total=gst_total,
            grand_total=grand_total,
            paid_amount=paid_amount,
            payment_method=data.get("payment_method"),
            status=data.get("status", "Completed"),
            remarks=data.get("remarks"),
            created_by_id=_safe_user_id(),
        )
        db.session.add(sale)
        db.session.commit()
        return jsonify({"message": "Sale created", "sale": sale.to_dict()}), 201
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 500

@pharmacy_bp.route("/sales/<int:id>", methods=["PUT"])
@role_required("Pharmacy")
def update_sale(id):
    sale = Sale.query.get_or_404(id)
    data = request.get_json() or {}

    for field in ["customer_name", "customer_phone", "payment_method",
                  "status", "remarks"]:
        if field in data:
            setattr(sale, field, data[field])

    if "sale_date" in data:
        parsed = _parse_date(data["sale_date"])
        if parsed:
            sale.sale_date = parsed

    for field in ["subtotal", "discount", "gst_percent", "paid_amount"]:
        if field in data and data[field] not in (None, ""):
            try:
                setattr(sale, field, float(data[field]))
            except (TypeError, ValueError):
                pass

    taxable = max(float(sale.subtotal or 0) - float(sale.discount or 0), 0)
    sale.gst_total = round((taxable * float(sale.gst_percent or 0)) / 100, 2)
    sale.grand_total = round(taxable + sale.gst_total, 2)

    db.session.commit()
    return jsonify({"message": "Sale updated", "sale": sale.to_dict()}), 200

@pharmacy_bp.route("/sales/<int:id>", methods=["DELETE"])
@role_required("Pharmacy")
def delete_sale(id):
    sale = Sale.query.get_or_404(id)
    db.session.delete(sale)
    db.session.commit()
    return jsonify({"message": "Deleted"}), 200

# ---------- CUSTOMERS ----------
@pharmacy_bp.route("/customers", methods=["GET"])
@role_required("Pharmacy")
def get_customers():
    customers = db.session.query(Sale.customer_name, Sale.customer_phone, Sale.customer_email)\
        .distinct().limit(100).all()
    return jsonify([{"name": c[0], "phone": c[1], "email": c[2]} for c in customers if c[0]]), 200

# ---------- INVENTORY (OPTIMISED) ----------
@pharmacy_bp.route("/inventory", methods=["GET"])
@role_required("Pharmacy")
def get_inventory():
    result = db.session.execute(
        select(
            Medicine.medicine_name,
            MedicineBatch.batch_number,
            MedicineBatch.expiry_date,
            MedicineBatch.quantity,
            MedicineBatch.mrp,
            MedicineBatch.purchase_rate
        ).join(Medicine, MedicineBatch.medicine_id == Medicine.id)
        .order_by(Medicine.medicine_name, MedicineBatch.expiry_date)
        .limit(200)
    ).all()
    inventory = [
        {
            "medicine": r[0],
            "expiry": r[2].isoformat(),
            "quantity": r[3],
            "mrp": float(r[4]),
            "purchase_rate": float(r[5]),
        }
        for r in result
    ]
    return jsonify({"inventory": inventory}), 200

@pharmacy_bp.route("/inventory/batches", methods=["GET"])
@role_required("Pharmacy")
def get_inventory_batches():
    batches = MedicineBatch.query.limit(100).all()
    return jsonify([b.to_dict() for b in batches]), 200

@pharmacy_bp.route("/inventory/expiry", methods=["GET"])
@role_required("Pharmacy")
def get_expiry():
    today = date.today()
    thirty_days = today + timedelta(days=30)
    batches = MedicineBatch.query.filter(
        MedicineBatch.expiry_date.between(today, thirty_days)
    ).order_by(MedicineBatch.expiry_date).limit(20).all()
    expiry = []
    for b in batches:
        days = (b.expiry_date - today).days
        expiry.append({
            "medicine": b.medicine.medicine_name,
            "batch": b.batch_number,
            "expiry": b.expiry_date.isoformat(),
            "days": days,
            "quantity": b.quantity
        })
    return jsonify({"expiry": expiry}), 200

@pharmacy_bp.route("/inventory/low-stock", methods=["GET"])
@role_required("Pharmacy")
def get_low_stock():
    low = db.session.query(
        Medicine.medicine_name,
        func.sum(MedicineBatch.quantity).label('total_qty'),
        Medicine.reorder_level
    ).join(MedicineBatch, Medicine.id == MedicineBatch.medicine_id)\
     .group_by(Medicine.id)\
     .having(func.sum(MedicineBatch.quantity) <= Medicine.reorder_level)\
     .limit(50).all()
    low_stock = [
        {"medicine": l[0], "stock": l[1], "reorder": l[2]}
        for l in low
    ]
    return jsonify({"low_stock": low_stock}), 200

# ---------- STOCK MOVEMENTS ----------
@pharmacy_bp.route("/stock-movements", methods=["GET"])
@role_required("Pharmacy")
def get_stock_movements():
    movements = StockMovement.query.order_by(StockMovement.created_at.desc()).limit(100).all()
    return jsonify([m.to_dict() for m in movements]), 200

# ---------- EXPENSES ----------
@pharmacy_bp.route("/expenses", methods=["GET"])
@role_required("Pharmacy")
def get_expenses():
    expenses = Expense.query.order_by(Expense.expense_date.desc()).limit(100).all()
    return jsonify([e.to_dict() for e in expenses]), 200

@pharmacy_bp.route("/expenses", methods=["POST"])
@role_required("Pharmacy")
def create_expense():
    data = request.get_json()
    expense = Expense(
        expense_number=data.get("expense_number") or generate_code("EXP", Expense, "expense_number"),
        expense_category_id=data["expense_category_id"],
        amount=data["amount"],
        payment_method=data.get("payment_method"),
        expense_date=_parse_date(data.get("expense_date")) or date.today(),
        description=data.get("description"),
        reference_number=data.get("reference_number"),
        created_by_id=_safe_user_id()
    )
    db.session.add(expense)
    db.session.commit()
    return jsonify(expense.to_dict()), 201

@pharmacy_bp.route("/expenses/<int:id>", methods=["PUT"])
@role_required("Pharmacy")
def update_expense(id):
    expense = Expense.query.get_or_404(id)
    data = request.get_json()
    for field in ["amount", "payment_method", "description", "reference_number"]:
        if field in data:
            setattr(expense, field, data[field])
    if "expense_date" in data:
        expense.expense_date = _parse_date(data["expense_date"]) or expense.expense_date
    db.session.commit()
    return jsonify(expense.to_dict()), 200

@pharmacy_bp.route("/expenses/<int:id>", methods=["DELETE"])
@role_required("Pharmacy")
def delete_expense(id):
    expense = Expense.query.get_or_404(id)
    db.session.delete(expense)
    db.session.commit()
    return jsonify({"message": "Deleted"}), 200

# ---------- REPORTS ----------
@pharmacy_bp.route("/reports/sales", methods=["GET"])
@role_required("Pharmacy")
def report_sales():
    start = _parse_date(request.args.get("start_date"))
    end = _parse_date(request.args.get("end_date"))
    query = Sale.query
    if start:
        query = query.filter(Sale.sale_date >= start)
    if end:
        query = query.filter(Sale.sale_date <= end)
    sales = query.all()
    total = sum(s.grand_total for s in sales)
    return jsonify({"total_sales": float(total), "count": len(sales), "sales": [s.to_dict() for s in sales]}), 200

@pharmacy_bp.route("/reports/purchases", methods=["GET"])
@role_required("Pharmacy")
def report_purchases():
    start = _parse_date(request.args.get("start_date"))
    end = _parse_date(request.args.get("end_date"))
    query = Purchase.query
    if start:
        query = query.filter(Purchase.purchase_date >= start)
    if end:
        query = query.filter(Purchase.purchase_date <= end)
    purchases = query.all()
    total = sum(p.grand_total for p in purchases)
    return jsonify({"total_purchases": float(total), "count": len(purchases), "purchases": [p.to_dict() for p in purchases]}), 200

@pharmacy_bp.route("/reports/profit", methods=["GET"])
@role_required("Pharmacy")
def report_profit():
    start = _parse_date(request.args.get("start_date"))
    end = _parse_date(request.args.get("end_date"))
    sale_query = Sale.query
    purchase_query = Purchase.query
    if start:
        sale_query = sale_query.filter(Sale.sale_date >= start)
        purchase_query = purchase_query.filter(Purchase.purchase_date >= start)
    if end:
        sale_query = sale_query.filter(Sale.sale_date <= end)
        purchase_query = purchase_query.filter(Purchase.purchase_date <= end)
    total_sales = sum(s.grand_total for s in sale_query.all())
    total_purchases = sum(p.grand_total for p in purchase_query.all())
    return jsonify({
        "total_sales": float(total_sales),
        "total_purchases": float(total_purchases),
        "profit": float(total_sales - total_purchases)
    }), 200

@pharmacy_bp.route("/reports/expenses", methods=["GET"])
@role_required("Pharmacy")
def report_expenses():
    start = _parse_date(request.args.get("start_date"))
    end = _parse_date(request.args.get("end_date"))
    query = Expense.query
    if start:
        query = query.filter(Expense.expense_date >= start)
    if end:
        query = query.filter(Expense.expense_date <= end)
    expenses = query.all()
    total = sum(e.amount for e in expenses)
    return jsonify({"total_expenses": float(total), "count": len(expenses), "expenses": [e.to_dict() for e in expenses]}), 200

# ---------- DASHBOARD SUMMARY (OPTIMISED) ----------
@pharmacy_bp.route("/dashboard-summary", methods=["GET"])
@role_required("Pharmacy")
def dashboard_summary():
    today = date.today()
    thirty_days = today + timedelta(days=30)

    total_items = db.session.query(func.coalesce(func.sum(MedicineBatch.quantity), 0)).scalar()
    total_value = db.session.query(func.coalesce(func.sum(MedicineBatch.quantity * MedicineBatch.mrp), 0)).scalar()

    expiry_batches = MedicineBatch.query.filter(
        MedicineBatch.expiry_date.between(today, thirty_days)
    ).order_by(MedicineBatch.expiry_date).limit(10).all()
    expiry = []
    for b in expiry_batches:
        days = (b.expiry_date - today).days
        expiry.append({
            "medicine": b.medicine.medicine_name,
            "batch": b.batch_number,
            "expiry": b.expiry_date.isoformat(),
            "days": days,
            "quantity": b.quantity
        })

    low = db.session.query(
        Medicine.medicine_name,
        func.sum(MedicineBatch.quantity).label('total_qty'),
        Medicine.reorder_level
    ).join(MedicineBatch, Medicine.id == MedicineBatch.medicine_id)\
     .group_by(Medicine.id)\
     .having(func.sum(MedicineBatch.quantity) <= Medicine.reorder_level)\
     .limit(20).all()
    low_stock = [
        {"medicine": l[0], "stock": l[1], "reorder": l[2]}
        for l in low
    ]

    return jsonify({
        "totalItems": total_items,
        "totalValue": float(total_value),
        "expiringSoon": len(expiry),
        "expiry": expiry,
        "lowStock": low_stock
    }), 200
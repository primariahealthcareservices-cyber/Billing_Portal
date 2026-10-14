# backend/models.py
from datetime import datetime
from flask_sqlalchemy import SQLAlchemy
from werkzeug.security import generate_password_hash, check_password_hash

db = SQLAlchemy()

# ---------- ROLES ----------
ROLES = [
    "SuperAdmin", "admin", "IT", "IT Sales", "PCM", "MedTech",
    "Caredx", "Corporate", "Adminstrationfunctionalunit",
    "ResearchDevelopment", "Dental", "SalesEnterprise", "Everglades",
]

# "Corpus Fund" as an ENTRY TYPE is used only for the row that lands in the
# TARGET department (IT, IT Sales, PCM ...). Corporate itself records the same
# money as an Expenses entry with category "Corpus Fund".
ENTRY_TYPES = ["Income", "Expenses", "Capital", "Corpus Fund"]

# ---------- STANDARD CATEGORIES (used by ALL departments for Income & Expenses) ----------
STANDARD_CATEGORIES = [
    "Salary & Payrolls",
    "Corpus Fund",              # Corporate: Expenses -> Corpus Fund
    "Referrals & Deposits",
    "Products & Innovation",
    "General Operations",
    "Camps & Events",
    "Marketing & Promos",
    "Travel & Hospitality",
    "Miscellaneous",
]

CAPITAL_CATEGORIES = [
    "Equity Infusion",
    "Partner Contribution",
    "Asset Capitalization",
    "Reserve Fund Transfer",
    "Other Capital",
]

SALARY_CATEGORY = "Salary & Payrolls"
CORPUS_FUND_CATEGORY = "Corpus Fund"
CORPUS_FUND_TYPE = "Corpus Fund"


def _build_categories():
    """Return a fresh dict of {Income, Expenses, Capital} lists."""
    return {
        "Income": list(STANDARD_CATEGORIES),
        "Expenses": list(STANDARD_CATEGORIES),
        "Capital": list(CAPITAL_CATEGORIES),
    }


# ---------- DEPARTMENT_CONFIG ----------
DEPARTMENT_CONFIG = {
    # =================== IT ===================
    "IT": {
        "entry_types": ["Income", "Expenses", "Capital"],
        "categories": _build_categories(),
        "revenue_types": ["Subscription", "One-Time", "Renewal", "Maintenance", "Other"],
        "show_generated_by": True,
        "show_revenue_type": True,
        "show_patient_fields": False,
        "show_client_name": True,
        "show_gst_number": False,
        "gst_required_categories": [],
        "show_items": False,
        "show_invoice": True,
        "show_gst_tax": False,
        "show_tax_invoice_number": False,
    },

    # =================== IT Sales ===================
    "IT Sales": {
        "entry_types": ["Income", "Expenses", "Capital"],
        "categories": _build_categories(),
        "revenue_types": ["Direct", "Recurring", "Project-based"],
        "show_generated_by": True,
        "show_revenue_type": True,
        "show_patient_fields": False,
        "show_client_name": True,
        "show_gst_number": True,
        "gst_required_categories": ["Products & Innovation"],
        "show_items": False,
        "show_invoice": True,
        "show_gst_tax": True,
        "show_tax_invoice_number": True,
    },

    # =================== Dental ===================
    "Dental": {
        "entry_types": ["Income", "Expenses", "Capital"],
        "categories": _build_categories(),
        "revenue_types": [],
        "show_generated_by": True,
        "show_revenue_type": False,
        "show_patient_fields": False,
        "show_client_name": False,
        "show_gst_number": False,
        "gst_required_categories": [],
        "show_items": False,
        "show_invoice": False,
        "show_gst_tax": False,
        "show_tax_invoice_number": False,
        "is_salary_category": SALARY_CATEGORY,
        "exec_departments": ["Dental"],
    },

    # =================== Caredx ===================
    "Caredx": {
        "entry_types": ["Income", "Expenses", "Capital"],
        "categories": _build_categories(),
        "revenue_types": ["Direct", "Recurring"],
        "show_generated_by": False,
        "show_revenue_type": True,
        "show_patient_fields": False,
        "show_client_name": False,
        "show_gst_number": False,
        "gst_required_categories": [],
        "show_items": False,
        "show_invoice": False,
        "show_gst_tax": False,
        "show_tax_invoice_number": False,
    },

    # =================== PCM ===================
    "PCM": {
        "entry_types": ["Income", "Expenses", "Capital"],
        "categories": _build_categories(),
        "revenue_types": [],
        "show_generated_by": False,
        "show_revenue_type": False,
        "show_patient_fields": True,
        "show_client_name": False,
        "show_gst_number": False,
        "gst_required_categories": [],
        "show_items": False,
        "show_invoice": False,
        "show_gst_tax": False,
        "show_tax_invoice_number": False,
    },

    # =================== MedTech ===================
    "MedTech": {
        "entry_types": ["Income", "Expenses", "Capital"],
        "categories": _build_categories(),
        "revenue_types": ["Direct", "Recurring"],
        "show_generated_by": True,
        "show_revenue_type": True,
        "show_patient_fields": False,
        "show_client_name": True,
        "show_gst_number": True,
        "gst_required_categories": [],
        "show_items": True,
        "show_invoice": True,
        "show_gst_tax": True,
        "show_tax_invoice_number": True,
    },

    # =================== Everglades (Pharmacy) ===================
    "Everglades": {
        "entry_types": ["Income", "Expenses", "Capital"],
        "categories": _build_categories(),
        "revenue_types": ["Direct", "Recurring", "Insurance"],
        "show_generated_by": True,
        "show_revenue_type": True,
        "show_patient_fields": False,
        "show_client_name": True,
        "show_gst_number": True,
        "gst_required_categories": [],
        "show_items": True,
        "show_invoice": True,
        "show_gst_tax": True,
        "show_tax_invoice_number": True,
    },

    # =================== Corporate ===================
    "Corporate": {
        # Corpus Fund is an Expenses CATEGORY for Corporate.
        # Saving one also posts a separate "Corpus Fund" entry to the chosen department.
        "entry_types": ["Income", "Expenses", "Capital"],
        "categories": _build_categories(),
        "revenue_types": [],
        "show_generated_by": True,
        "show_revenue_type": False,
        "show_patient_fields": False,
        "show_client_name": True,
        "show_gst_number": False,
        "gst_required_categories": [],
        "show_items": False,
        "show_invoice": False,
        "show_gst_tax": False,
        "show_tax_invoice_number": False,
        "is_salary_category": SALARY_CATEGORY,
        "exec_departments": [
            "Corporate", "Caredx", "MedTech", "IT", "IT Sales",
            "PCM", "Dental", "Adminstrationfunctionalunit", "Everglades"
        ],
    },

    # =================== Office Administration ===================
    "Adminstrationfunctionalunit": {
        "entry_types": ["Income", "Expenses", "Capital"],
        "categories": _build_categories(),
        "revenue_types": [],
        "show_generated_by": True,
        "show_revenue_type": False,
        "show_patient_fields": False,
        "show_client_name": False,
        "show_gst_number": False,
        "gst_required_categories": [],
        "show_items": False,
        "show_invoice": False,
        "show_gst_tax": False,
        "show_tax_invoice_number": False,
        "is_salary_category": SALARY_CATEGORY,
    },

    # =================== Research & Development ===================
    "ResearchDevelopment": {
        "entry_types": ["Income", "Expenses", "Capital"],
        "categories": _build_categories(),
        "revenue_types": [],
        "show_generated_by": True,
        "show_revenue_type": False,
        "show_patient_fields": False,
        "show_client_name": False,
        "show_gst_number": False,
        "gst_required_categories": [],
        "show_items": False,
        "show_invoice": False,
        "show_gst_tax": False,
        "show_tax_invoice_number": False,
    },
}

VALID_DEPARTMENTS = list(DEPARTMENT_CONFIG.keys())


# ---------- User model ----------
class User(db.Model):
    __tablename__ = "users"
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(120), nullable=False)
    email = db.Column(db.String(150), unique=True, nullable=False, index=True)
    password_hash = db.Column(db.String(255), nullable=False)
    role = db.Column(db.String(50), nullable=False)
    department = db.Column(db.String(100), nullable=True)
    is_active = db.Column(db.Boolean, default=True)
    temp_otp = db.Column(db.String(10), nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    entries = db.relationship("FinanceEntry", backref="creator", lazy=True)

    def set_password(self, raw_password):
        self.password_hash = generate_password_hash(raw_password)

    def check_password(self, raw_password):
        return check_password_hash(self.password_hash, raw_password)

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "email": self.email,
            "role": self.role,
            "department": self.department,
            "is_active": self.is_active,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


# ---------- FinanceEntry model ----------
class FinanceEntry(db.Model):
    __tablename__ = "finance_entries"
    id = db.Column(db.Integer, primary_key=True)
    department = db.Column(db.String(50), nullable=False)
    entry_type = db.Column(db.String(20), nullable=False)
    category = db.Column(db.String(60), nullable=False)
    sub_category = db.Column(db.String(60), nullable=True)
    fund_category = db.Column(db.String(50), nullable=True)
    generated_by = db.Column(db.String(120), nullable=True)
    revenue_type = db.Column(db.String(50), nullable=True)
    patient_name = db.Column(db.String(150), nullable=True)
    patient_place = db.Column(db.String(150), nullable=True)
    client_name = db.Column(db.String(150), nullable=True)
    gst_number = db.Column(db.String(20), nullable=True)

    amount = db.Column(db.Numeric(14, 2), nullable=False)
    base_amount = db.Column(db.Numeric(14, 2), nullable=True)
    gst_tax_percent = db.Column(db.Numeric(5, 2), nullable=True)
    gst_tax_amount = db.Column(db.Numeric(14, 2), nullable=True, default=0)
    tax_invoice_number = db.Column(db.String(50), nullable=True)

    exec_department = db.Column(db.String(50), nullable=True)
    employee_name = db.Column(db.String(150), nullable=True)
    salary_amount = db.Column(db.Numeric(14, 2), nullable=True)
    allowance_amount = db.Column(db.Numeric(14, 2), nullable=True)

    vehicle_type = db.Column(db.String(100), nullable=True)
    purpose = db.Column(db.Text, nullable=True)
    team = db.Column(db.String(100), nullable=True)
    remarks = db.Column(db.Text, nullable=True)

    invoice_filename = db.Column(db.String(255), nullable=True)
    invoice_original_name = db.Column(db.String(255), nullable=True)
    invoice_mimetype = db.Column(db.String(100), nullable=True)

    entry_date = db.Column(db.Date, nullable=False)
    created_by_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    extra_data = db.Column(db.JSON, nullable=True)

    # Links the department-side "Corpus Fund" row to the Corporate
    # "Expenses / Corpus Fund" row that created it (so edit/delete stay in sync).
    linked_entry_id = db.Column(db.Integer, nullable=True, index=True)

    items = db.relationship(
        "FinanceEntryItem", backref="entry", lazy=True,
        cascade="all, delete-orphan", order_by="FinanceEntryItem.id",
    )

    def to_dict(self):
        return {
            "id": self.id,
            "department": self.department,
            "entry_type": self.entry_type,
            "category": self.category,
            "sub_category": self.sub_category,
            "fund_category": self.fund_category,
            "generated_by": self.generated_by,
            "revenue_type": self.revenue_type,
            "patient_name": self.patient_name,
            "patient_place": self.patient_place,
            "client_name": self.client_name,
            "gst_number": self.gst_number,
            "amount": float(self.amount),
            "base_amount": float(self.base_amount) if self.base_amount is not None else None,
            "gst_tax_percent": float(self.gst_tax_percent) if self.gst_tax_percent is not None else None,
            "gst_tax_amount": float(self.gst_tax_amount) if self.gst_tax_amount is not None else None,
            "tax_invoice_number": self.tax_invoice_number,
            "exec_department": self.exec_department,
            "employee_name": self.employee_name,
            "salary_amount": float(self.salary_amount) if self.salary_amount is not None else None,
            "allowance_amount": float(self.allowance_amount) if self.allowance_amount is not None else None,
            "vehicle_type": self.vehicle_type,
            "purpose": self.purpose,
            "team": self.team,
            "remarks": self.remarks,
            "invoice_url": f"/api/files/invoices/{self.invoice_filename}" if self.invoice_filename else None,
            "invoice_original_name": self.invoice_original_name,
            "invoice_mimetype": self.invoice_mimetype,
            "entry_date": self.entry_date.isoformat() if self.entry_date else None,
            "items": [i.to_dict() for i in self.items],
            "extra_data": self.extra_data,
            "linked_entry_id": self.linked_entry_id,
            "created_by": self.creator.name if self.creator else None,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


# ---------- FinanceEntryItem model ----------
class FinanceEntryItem(db.Model):
    __tablename__ = "finance_entry_items"
    id = db.Column(db.Integer, primary_key=True)
    finance_entry_id = db.Column(db.Integer, db.ForeignKey("finance_entries.id", ondelete="CASCADE"), nullable=False)
    item_name = db.Column(db.String(200), nullable=False)
    quantity = db.Column(db.Numeric(12, 2), nullable=False, default=1)
    unit_price = db.Column(db.Numeric(14, 2), nullable=False, default=0)
    amount = db.Column(db.Numeric(14, 2), nullable=False, default=0)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            "id": self.id,
            "item_name": self.item_name,
            "quantity": float(self.quantity),
            "unit_price": float(self.unit_price),
            "amount": float(self.amount),
        }


# ---------- MedTechLedger model ----------
class MedTechLedger(db.Model):
    __tablename__ = "medtech_ledger"
    id = db.Column(db.Integer, primary_key=True)
    customer_name = db.Column(db.String(150), nullable=False)
    entry_date = db.Column(db.Date, nullable=False)
    total_amount = db.Column(db.Numeric(14, 2), nullable=False, default=0)
    paid = db.Column(db.Numeric(14, 2), nullable=False, default=0)
    balance = db.Column(db.Numeric(14, 2), nullable=False, default=0)
    remarks = db.Column(db.Text, nullable=True)
    created_by_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    invoice_filename = db.Column(db.String(255), nullable=True)
    invoice_original_name = db.Column(db.String(255), nullable=True)
    invoice_mimetype = db.Column(db.String(100), nullable=True)

    def to_dict(self):
        return {
            "id": self.id,
            "customer_name": self.customer_name,
            "entry_date": self.entry_date.isoformat() if self.entry_date else None,
            "total_amount": float(self.total_amount or 0),
            "paid": float(self.paid or 0),
            "balance": float(self.balance or 0),
            "remarks": self.remarks,
            "invoice_url": f"/api/files/invoices/{self.invoice_filename}" if self.invoice_filename else None,
            "invoice_original_name": self.invoice_original_name,
            "invoice_mimetype": self.invoice_mimetype,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


# ---------- EvergladesLedger model ----------
class EvergladesLedger(db.Model):
    __tablename__ = "everglades_ledger"
    id = db.Column(db.Integer, primary_key=True)
    customer_name = db.Column(db.String(150), nullable=False)
    entry_date = db.Column(db.Date, nullable=False)
    total_amount = db.Column(db.Numeric(14, 2), nullable=False, default=0)
    paid = db.Column(db.Numeric(14, 2), nullable=False, default=0)
    balance = db.Column(db.Numeric(14, 2), nullable=False, default=0)
    remarks = db.Column(db.Text, nullable=True)
    created_by_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    invoice_filename = db.Column(db.String(255), nullable=True)
    invoice_original_name = db.Column(db.String(255), nullable=True)
    invoice_mimetype = db.Column(db.String(100), nullable=True)

    def to_dict(self):
        return {
            "id": self.id,
            "customer_name": self.customer_name,
            "entry_date": self.entry_date.isoformat() if self.entry_date else None,
            "total_amount": float(self.total_amount or 0),
            "paid": float(self.paid or 0),
            "balance": float(self.balance or 0),
            "remarks": self.remarks,
            "invoice_url": f"/api/files/invoices/{self.invoice_filename}" if self.invoice_filename else None,
            "invoice_original_name": self.invoice_original_name,
            "invoice_mimetype": self.invoice_mimetype,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


# ---------- CaredxLabEntry model ----------
class CaredxLabEntry(db.Model):
    __tablename__ = "caredx_lab_entries"
    id = db.Column(db.Integer, primary_key=True)
    entry_date = db.Column(db.Date, nullable=False)
    patient_name = db.Column(db.String(150), nullable=False)
    test_name = db.Column(db.String(255), nullable=False)
    total_amount_paid = db.Column(db.Numeric(14, 2), nullable=False, default=0)
    employee_name = db.Column(db.String(150), nullable=True)
    cash = db.Column(db.Numeric(14, 2), nullable=False, default=0)
    online = db.Column(db.Numeric(14, 2), nullable=False, default=0)
    paid_to_other_labs = db.Column(db.Numeric(14, 2), nullable=False, default=0)
    rmp = db.Column(db.Numeric(14, 2), nullable=False, default=0)
    salaries_expense = db.Column(db.Numeric(14, 2), nullable=False, default=0)
    expense_details = db.Column(db.Text, nullable=True)
    referral_by = db.Column(db.String(150), nullable=True)
    referral_amount = db.Column(db.Numeric(14, 2), nullable=False, default=0)
    sales = db.Column(db.Numeric(14, 2), nullable=False, default=0)
    created_by_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def to_dict(self):
        return {
            "id": self.id,
            "entry_date": self.entry_date.isoformat() if self.entry_date else None,
            "patient_name": self.patient_name,
            "test_name": self.test_name,
            "total_amount_paid": float(self.total_amount_paid or 0),
            "employee_name": self.employee_name,
            "cash": float(self.cash or 0),
            "online": float(self.online or 0),
            "paid_to_other_labs": float(self.paid_to_other_labs or 0),
            "rmp": float(self.rmp or 0),
            "salaries_expense": float(self.salaries_expense or 0),
            "expense_details": self.expense_details,
            "referral_by": self.referral_by,
            "referral_amount": float(self.referral_amount or 0),
            "sales": float(self.sales or 0),
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


# ---------- CaredxExpense model ----------
class CaredxExpense(db.Model):
    __tablename__ = "caredx_expenses"
    id = db.Column(db.Integer, primary_key=True)
    expense_date = db.Column(db.Date, nullable=False)
    category = db.Column(db.String(150), nullable=False)
    amount = db.Column(db.Numeric(14, 2), nullable=False)
    referral_amount = db.Column(db.Numeric(14, 2), nullable=False, default=0)
    remarks = db.Column(db.Text, nullable=True)
    employee_name = db.Column(db.String(150), nullable=True)
    purpose = db.Column(db.Text, nullable=True)
    vehicle_type = db.Column(db.String(100), nullable=True)
    created_by_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def to_dict(self):
        return {
            "id": self.id,
            "expense_date": self.expense_date.isoformat() if self.expense_date else None,
            "category": self.category,
            "amount": float(self.amount or 0),
            "referral_amount": float(self.referral_amount or 0),
            "remarks": self.remarks,
            "employee_name": self.employee_name,
            "purpose": self.purpose,
            "vehicle_type": self.vehicle_type,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


# ---------- SalesEnterpriseKPI model ----------
class SalesEnterpriseKPI(db.Model):
    __tablename__ = "sales_enterprise_kpis"
    id = db.Column(db.Integer, primary_key=True)
    year = db.Column(db.Integer, nullable=False)
    quarter = db.Column(db.String(2), nullable=False)
    department = db.Column(db.String(50), nullable=False, default='IT')
    month = db.Column(db.String(20), nullable=False, default='January')
    revenue_growth = db.Column(db.Numeric(8, 2), nullable=True)
    win_rate = db.Column(db.Numeric(8, 2), nullable=True)
    stage_conversion = db.Column(db.Numeric(8, 2), nullable=True)
    pipeline_coverage = db.Column(db.Numeric(8, 2), nullable=True)
    sales_cycle_length = db.Column(db.Numeric(8, 2), nullable=True)
    cac = db.Column(db.Numeric(14, 2), nullable=True)
    rep_productivity = db.Column(db.Numeric(14, 2), nullable=True)
    ramp_time = db.Column(db.Numeric(8, 2), nullable=True)
    lead_response_time = db.Column(db.Numeric(8, 2), nullable=True)
    nrr = db.Column(db.Numeric(8, 2), nullable=True)
    quota_attainment = db.Column(db.Numeric(8, 2), nullable=True)
    forecast_accuracy = db.Column(db.Numeric(8, 2), nullable=True)
    created_by_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (db.UniqueConstraint('year', 'quarter', name='uq_sales_kpi_year_quarter'),)

    def to_dict(self):
        return {
            "id": self.id,
            "year": self.year,
            "quarter": self.quarter,
            'department': self.department,
            'month': self.month,
            "revenue_growth": float(self.revenue_growth) if self.revenue_growth is not None else None,
            "win_rate": float(self.win_rate) if self.win_rate is not None else None,
            "stage_conversion": float(self.stage_conversion) if self.stage_conversion is not None else None,
            "pipeline_coverage": float(self.pipeline_coverage) if self.pipeline_coverage is not None else None,
            "sales_cycle_length": float(self.sales_cycle_length) if self.sales_cycle_length is not None else None,
            "cac": float(self.cac) if self.cac is not None else None,
            "rep_productivity": float(self.rep_productivity) if self.rep_productivity is not None else None,
            "ramp_time": float(self.ramp_time) if self.ramp_time is not None else None,
            "lead_response_time": float(self.lead_response_time) if self.lead_response_time is not None else None,
            "nrr": float(self.nrr) if self.nrr is not None else None,
            "quota_attainment": float(self.quota_attainment) if self.quota_attainment is not None else None,
            "forecast_accuracy": float(self.forecast_accuracy) if self.forecast_accuracy is not None else None,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


# ---------- Notification model ----------
class Notification(db.Model):
    __tablename__ = "notifications"
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    message = db.Column(db.Text, nullable=False)
    is_read = db.Column(db.Boolean, default=False)
    related_type = db.Column(db.String(30), nullable=True)
    related_id = db.Column(db.Integer, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    user = db.relationship("User", backref="notifications")


# ===========================================================================
# SCHEMA SYNC
# ===========================================================================
def ensure_schema_columns():
    """Add any missing columns to existing tables. MySQL-safe, idempotent."""
    from sqlalchemy import text

    required_columns = [
        ("users", "temp_otp", "VARCHAR(10) NULL"),

        ("finance_entries", "sub_category",           "VARCHAR(60) NULL"),
        ("finance_entries", "fund_category",          "VARCHAR(50) NULL"),
        ("finance_entries", "base_amount",            "DECIMAL(14,2) NULL"),
        ("finance_entries", "gst_tax_percent",        "DECIMAL(5,2) NULL"),
        ("finance_entries", "gst_tax_amount",         "DECIMAL(14,2) NULL DEFAULT 0"),
        ("finance_entries", "tax_invoice_number",     "VARCHAR(50) NULL"),
        ("finance_entries", "exec_department",        "VARCHAR(50) NULL"),
        ("finance_entries", "employee_name",          "VARCHAR(150) NULL"),
        ("finance_entries", "salary_amount",          "DECIMAL(14,2) NULL"),
        ("finance_entries", "allowance_amount",       "DECIMAL(14,2) NULL"),
        ("finance_entries", "vehicle_type",           "VARCHAR(100) NULL"),
        ("finance_entries", "purpose",                "TEXT NULL"),
        ("finance_entries", "team",                   "VARCHAR(100) NULL"),
        ("finance_entries", "invoice_filename",       "VARCHAR(255) NULL"),
        ("finance_entries", "invoice_original_name",  "VARCHAR(255) NULL"),
        ("finance_entries", "invoice_mimetype",       "VARCHAR(100) NULL"),
        ("finance_entries", "extra_data",             "JSON NULL"),
        ("finance_entries", "linked_entry_id",        "INT NULL"),

        ("caredx_expenses", "referral_amount", "DECIMAL(14,2) NOT NULL DEFAULT 0"),
        ("caredx_expenses", "employee_name",   "VARCHAR(150) NULL"),
        ("caredx_expenses", "purpose",         "TEXT NULL"),
        ("caredx_expenses", "vehicle_type",    "VARCHAR(100) NULL"),

        ("caredx_lab_entries", "cash",               "DECIMAL(14,2) NOT NULL DEFAULT 0"),
        ("caredx_lab_entries", "online",             "DECIMAL(14,2) NOT NULL DEFAULT 0"),
        ("caredx_lab_entries", "paid_to_other_labs", "DECIMAL(14,2) NOT NULL DEFAULT 0"),
        ("caredx_lab_entries", "rmp",                "DECIMAL(14,2) NOT NULL DEFAULT 0"),
        ("caredx_lab_entries", "salaries_expense",   "DECIMAL(14,2) NOT NULL DEFAULT 0"),
        ("caredx_lab_entries", "expense_details",    "TEXT NULL"),
        ("caredx_lab_entries", "referral_by",        "VARCHAR(150) NULL"),
        ("caredx_lab_entries", "referral_amount",    "DECIMAL(14,2) NOT NULL DEFAULT 0"),
        ("caredx_lab_entries", "sales",              "DECIMAL(14,2) NOT NULL DEFAULT 0"),

        ("medtech_ledger", "invoice_filename",      "VARCHAR(255) NULL"),
        ("medtech_ledger", "invoice_original_name", "VARCHAR(255) NULL"),
        ("medtech_ledger", "invoice_mimetype",      "VARCHAR(100) NULL"),

        ("everglades_ledger", "invoice_filename",      "VARCHAR(255) NULL"),
        ("everglades_ledger", "invoice_original_name", "VARCHAR(255) NULL"),
        ("everglades_ledger", "invoice_mimetype",      "VARCHAR(100) NULL"),
    ]

    added = 0
    for table, column, ddl in required_columns:
        try:
            exists = db.session.execute(
                text(
                    "SELECT COUNT(*) FROM information_schema.columns "
                    "WHERE table_schema = DATABASE() "
                    "AND table_name = :t AND column_name = :c"
                ),
                {"t": table, "c": column},
            ).scalar()

            if not exists:
                db.session.execute(text(
                    f"ALTER TABLE `{table}` ADD COLUMN `{column}` {ddl}"
                ))
                db.session.commit()
                print(f"✅ Added column {table}.{column}")
                added += 1
        except Exception as exc:
            db.session.rollback()
            print(f"⚠️  Could not add {table}.{column}: {exc}")

    if added == 0:
        print("ℹ️  Schema already up to date — no columns added.")
    else:
        print(f"✅ Schema sync complete — {added} column(s) added.")


# ===========================================================================
# Ensure entry_type column is VARCHAR (not ENUM) so "Corpus Fund" is accepted
# ===========================================================================
def ensure_entry_type_is_varchar():
    """
    Older schemas created entry_type as ENUM('Income','Expenses','Capital').
    Those reject the 'Corpus Fund' value → MySQL 1265 → 500.
    This converts the column to VARCHAR(20) once. Idempotent.
    """
    from sqlalchemy import text
    try:
        col_type = db.session.execute(
            text(
                "SELECT DATA_TYPE FROM information_schema.columns "
                "WHERE table_schema = DATABASE() "
                "AND table_name = 'finance_entries' "
                "AND column_name = 'entry_type'"
            )
        ).scalar()

        if col_type and str(col_type).lower() in ("enum", "char"):
            db.session.execute(text(
                "ALTER TABLE finance_entries "
                "MODIFY COLUMN entry_type VARCHAR(20) NOT NULL"
            ))
            db.session.commit()
            print(f"✅ Converted finance_entries.entry_type from {col_type} → VARCHAR(20)")
        else:
            print(f"ℹ️  finance_entries.entry_type is already {col_type or 'VARCHAR'}.")
    except Exception as exc:
        db.session.rollback()
        print(f"⚠️  Could not convert entry_type column: {exc}")


# ===========================================================================
# LEGACY CATEGORY MIGRATION
# ===========================================================================
LEGACY_CATEGORY_MAP = {
    "Payroll Salaries": SALARY_CATEGORY,
    "Personnel & Payroll": SALARY_CATEGORY,
    "R&D Salaries": SALARY_CATEGORY,

    "Travel & Entertainment": "Travel & Hospitality",
    "Travel & Entertainment (T&E)": "Travel & Hospitality",
    "Travel and Mileage Reimbursement": "Travel & Hospitality",

    "Marketing": "Marketing & Promos",
    "Marketing Expenses": "Marketing & Promos",

    "Assets & Infra Cost": "Products & Innovation",
    "Supplies & Equipments": "Products & Innovation",
    "Supplies and Equipments": "Products & Innovation",
    "Supplies & Equipment": "Products & Innovation",
    "Office Supplies & Equipment": "Products & Innovation",
    "Dental Supplies & Consumables": "Products & Innovation",
    "Equipment Purchase & Maintenance": "Products & Innovation",
    "Lab Fees & Prosthetics": "Products & Innovation",
    "Pharmaceuticals & Inventory": "Products & Innovation",
    "Lab Consumables": "Products & Innovation",
    "Equipment": "Products & Innovation",
    "Lab Supplies": "Products & Innovation",
    "Testing": "Products & Innovation",
    "Wholesales": "Products & Innovation",
    "B2B Revenue": "Products & Innovation",
    "B2C Revenue": "Products & Innovation",

    "Office Management": "General Operations",
    "Facilities & Overhead": "General Operations",
    "Clinical Overhead": "General Operations",
    "Specimen Collection": "General Operations",
    "Equipment Maintenance": "General Operations",
    "Waste Management": "General Operations",
    "Billing Administration": "General Operations",
    "Service Revenue": "General Operations",
    "Business Services Revenue": "General Operations",
    "Internal allocations": "General Operations",
    "Back Office Logistics": "General Operations",
    "Field Labour and Nursing Care": "General Operations",
    "Field Labor and Nursing Care": "General Operations",
    "Digital Health": "General Operations",
    "Equipment & Supplies": "General Operations",
    "Home Medical Supplies and DME": "General Operations",
    "Point-of-Care Technology and Telecom": "General Operations",
    "Intake, Scheduling, and Back-Office Logistics": "General Operations",
    "Regulatory and Risk Management": "General Operations",
    "Outsourced Services": "General Operations",
    "Innovation": "General Operations",

    "Guest Concierge": "Camps & Events",
    "Events-Conferences-Training": "Camps & Events",
    "Camp": "Camps & Events",
    "Walkin/Person": "Camps & Events",
    "Health Screenings": "Camps & Events",
    "Vaccinations": "Camps & Events",
    "Consultation Fees": "Camps & Events",
    "Consulting": "Camps & Events",

    "Referral": "Referrals & Deposits",
    "Referrals": "Referrals & Deposits",
    "Lab": "Referrals & Deposits",
    "Doctor Consultation": "Referrals & Deposits",
    "Clinical Procedures": "Referrals & Deposits",
    "Diagnostics & X-Ray": "Referrals & Deposits",
    "Dental Operations": "Referrals & Deposits",
    "Prescription Sales": "Referrals & Deposits",
    "OTC Sales": "Referrals & Deposits",
    "Insurance Claims": "Referrals & Deposits",
    "Home Delivery": "Referrals & Deposits",
    "Loyalty & Subscription Revenue": "Referrals & Deposits",
    "B2B Wholesale": "Referrals & Deposits",
    "Web Services": "Referrals & Deposits",
    "Portal Services": "Referrals & Deposits",

    "Management Fees": "Miscellaneous",
    "Legal Governance": "Miscellaneous",
    "Legal/Administrative Expenses": "Miscellaneous",
    "Sales Enablement & Tech Stack": "Miscellaneous",
    "Miscellaneous Categories": "Miscellaneous",
    "Goodwill": "Miscellaneous",
    "Grants": "Miscellaneous",
    "Funding": "Miscellaneous",
    "Other": "Miscellaneous",
    "Others": "Miscellaneous",
    "Uncategorized": "Miscellaneous",
}


def migrate_all_categories():
    """One-shot migration: rewrite any legacy categories to the new standardized ones."""
    from sqlalchemy import update
    migrated = 0
    try:
        for old, new in LEGACY_CATEGORY_MAP.items():
            if old == new:
                continue
            try:
                count = db.session.query(FinanceEntry).filter(
                    FinanceEntry.category == old
                ).count()
                if count > 0:
                    db.session.execute(
                        update(FinanceEntry)
                        .where(FinanceEntry.category == old)
                        .values(category=new)
                    )
                    migrated += count
            except Exception as exc:
                db.session.rollback()
                print(f"⚠️  FinanceEntry migration skipped for '{old}': {exc}")

        for old, new in LEGACY_CATEGORY_MAP.items():
            if old == new:
                continue
            try:
                count = db.session.query(CaredxExpense).filter(
                    CaredxExpense.category == old
                ).count()
                if count > 0:
                    db.session.execute(
                        update(CaredxExpense)
                        .where(CaredxExpense.category == old)
                        .values(category=new)
                    )
                    migrated += count
            except Exception as exc:
                db.session.rollback()
                print(f"⚠️  CaredxExpense migration skipped for '{old}': {exc}")

        if migrated > 0:
            db.session.commit()
            print(f"✅ Category migration complete ({migrated} entries updated).")
        else:
            print("ℹ️  No category migration needed.")
    except Exception as exc:
        db.session.rollback()
        print(f"⚠️  migrate_all_categories failed: {exc}")
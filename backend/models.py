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

# Master list — used by superadmin/validation code that doesn't care about dept-level filtering
# Master list — used by superadmin/validation code that doesn't care about dept-level filtering
ENTRY_TYPES = ["Income", "Expenses", "Capital"]

# ---------- DEPARTMENT_CONFIG ----------
DEPARTMENT_CONFIG = {
    # =================== IT ===================
    "IT": {
        "entry_types": ["Income", "Expenses", "Capital"],
        "categories": {
            "Income": ["Web Services", "Portal Services", "Corpus Fund", "Others"],
            "Expenses": [
                "Personnel & Payroll",
                "Travel & Entertainment (T&E)",
                "Marketing",
                "Supplies & Equipments",
                "Facilities & Overhead",
                "General Operations",
                "Innovation",
                "Guest Concierge",
                "Business Services Revenue",
                "Miscellaneous",
                "Outsourced Services",
                "Events-Conferences-Training",
                "Corpus Fund",
                "Other"
            ],
            "Capital": [
                "Equity Infusion",
                "Partner Contribution",
                "Asset Capitalization",
                "Reserve Fund Transfer",
                "Other Capital"
            ],
        },
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
        "categories": {
            "Income": [
                "Professional Services & Implementation",
                "Software Licenses & SaaS Subscriptions",
                "Managed Services & Support (MSP)",
                "Hardware & Infrastructure Reselling",
                "Hardware Sales",
                "Consulting",
                "Support & Maintenance",
                "Internal allocations",
                "Business Services Revenue",
                "Corpus Fund",
                "Others"
            ],
            "Expenses": [
                "Personnel & Payroll",
                "Sales Enablement & Tech Stack",
                "Legal/Administrative Expenses",
                "Outsourced Services",
                "Facilities & Overhead",
                "Travel & Entertainment (T&E)",
                "Marketing",
                "Supplies & Equipments",
                "Guest Concierge",
                "Events-Conferences-Training",
                "Business Services Revenue",
                "Miscellaneous",
                "General Operations",
                "Innovation",
                "Consulting",
                "Management Fees",
                "Corpus Fund",
                "Other"
            ],
            "Capital": [
                "Equity Infusion",
                "Partner Contribution",
                "Asset Capitalization",
                "Reserve Fund Transfer",
                "Other Capital"
            ],
        },
        "revenue_types": ["Direct", "Recurring", "Project-based"],
        "show_generated_by": True,
        "show_revenue_type": True,
        "show_patient_fields": False,
        "show_client_name": True,
        "show_gst_number": True,
        "gst_required_categories": ["Hardware Sales", "Hardware & Infrastructure Reselling"],
        "show_items": False,
        "show_invoice": True,
        "show_gst_tax": True,
        "show_tax_invoice_number": True,
    },

    # =================== Dental ===================
    "Dental": {
        "entry_types": ["Income", "Expenses", "Capital"],
        "categories": {
            "Income": [
                "Dental Operations",
                "Doctor Consultation",
                "Clinical Procedures",
                "Diagnostics & X-Ray",
                "Corpus Fund",
                "Other",
            ],
            "Expenses": [
                "Payroll Salaries",
                "Personnel & Payroll",
                "Travel & Entertainment (T&E)",
                "Marketing",
                "Dental Supplies & Consumables",
                "Equipment Purchase & Maintenance",
                "Lab Fees & Prosthetics",
                "Facilities & Overhead",
                "General Operations",
                "Innovation",
                "Guest Concierge",
                "Business Services Revenue",
                "Miscellaneous",
                "Outsourced Services",
                "Events-Conferences-Training",
                "Consulting",
                "Management Fees",
                "Corpus Fund",
                "Other",
            ],
            "Capital": [
                "Equity Infusion",
                "Partner Contribution",
                "Asset Capitalization",
                "Reserve Fund Transfer",
                "Other Capital"
            ],
        },
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
        "is_salary_category": "Payroll Salaries",
        "exec_departments": ["Dental"],
    },

    # =================== Caredx ===================
    "Caredx": {
        "entry_types": ["Income", "Expenses", "Capital"],
        "categories": {
            "Income": ["Lab", "Camp", "Walkin/Person", "Referral", "Corpus Fund"],
            "Expenses": [
                "Personnel & Payroll",
                "Travel & Entertainment (T&E)",
                "Marketing",
                "Supplies & Equipments",
                "Facilities & Overhead",
                "Innovation",
                "Guest Concierge",
                "Events-Conferences-Training",
                "Business Services Revenue",
                "Miscellaneous",
                "Outsourced Services",
                "Lab Consumables",
                "Clinical Overhead",
                "Specimen Collection",
                "Equipment Maintenance",
                "Waste Management",
                "Billing Administration",
                "Corpus Fund",
            ],
            "Capital": [
                "Equity Infusion",
                "Partner Contribution",
                "Asset Capitalization",
                "Reserve Fund Transfer",
                "Other Capital"
            ],
        },
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
        "categories": {
            "Income": [
                "Field Labour and Nursing Care",
                "Digital Health",
                "Equipment & Supplies",
                "Back Office Logistics",
                "Corpus Fund"
            ],
            "Expenses": [
                "Personnel & Payroll",
                "Outsourced Services",
                "Facilities & Overhead",
                "Marketing",
                "Guest Concierge",
                "Events-Conferences-Training",
                "Business Services Revenue",
                "Miscellaneous",
                "General Operations",
                "Innovation",
                "Supplies & Equipment",
                "Corpus Fund",
                "Other"
            ],
            "Capital": [
                "Equity Infusion",
                "Partner Contribution",
                "Asset Capitalization",
                "Reserve Fund Transfer",
                "Other Capital"
            ],
        },
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
        "categories": {
            "Income": ["B2B Revenue", "B2C Revenue", "Business Services Revenue", "Goodwill", "Corpus Fund"],
            "Expenses": [
                "Personnel & Payroll",
                "Travel & Entertainment (T&E)",
                "Marketing",
                "Supplies & Equipments",
                "Wholesales",
                "Facilities & Overhead",
                "General Operations",
                "Innovation",
                "Guest Concierge",
                "Business Services Revenue",
                "Miscellaneous",
                "Outsourced Services",
                "Events-Conferences-Training",
                "Ledger",
                "Goodwill",
                "Corpus Fund",
                "Other"
            ],
            "Capital": [
                "Equity Infusion",
                "Partner Contribution",
                "Asset Capitalization",
                "Reserve Fund Transfer",
                "Other Capital"
            ],
        },
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
        "categories": {
            "Income": [
                "Prescription Sales",
                "OTC Sales",
                "Insurance Claims",
                "Consultation Fees",
                "Health Screenings",
                "Vaccinations",
                "Home Delivery",
                "Loyalty & Subscription Revenue",
                "B2B Wholesale",
                "Business Services Revenue",
                "Goodwill",
                "Corpus Fund",
                "Other",
            ],
            "Expenses": [
                "Personnel & Payroll",
                "Travel & Entertainment (T&E)",
                "Marketing",
                "Pharmaceuticals & Inventory",
                "Supplies & Equipments",
                "Facilities & Overhead",
                "General Operations",
                "Innovation",
                "Guest Concierge",
                "Business Services Revenue",
                "Miscellaneous",
                "Outsourced Services",
                "Events-Conferences-Training",
                "Consulting",
                "Management Fees",
                "Ledger",
                "Goodwill",
                "Corpus Fund",
                "Other",
            ],
            "Capital": [
                "Equity Infusion",
                "Partner Contribution",
                "Asset Capitalization",
                "Reserve Fund Transfer",
                "Other Capital"
            ],
        },
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
        "entry_types": ["Income", "Expenses", "Capital"],
        "categories": {
            "Income": [
                "Consulting",
                "Management Fees",
                "Corpus Fund",
                "Other"
            ],
            "Expenses": [
                "Personnel & Payroll",
                "Travel & Entertainment (T&E)",
                "Marketing",
                "Facilities & Overhead",
                "General Operations",
                "Innovation",
                "Supplies and Equipments",
                "Legal Governance",
                "Guest Concierge",
                "Business Services Revenue",
                "Miscellaneous",
                "Outsourced Services",
                "Events-Conferences-Training",
                "Corpus Fund"
            ],
            "Capital": [
                "Equity Infusion",
                "Partner Contribution",
                "Asset Capitalization",
                "Reserve Fund Transfer",
                "Other Capital"
            ]
        },
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
        "is_salary_category": "Personnel & Payroll",
        "exec_departments": [
            "Corporate", "Caredx", "MedTech", "IT", "IT Sales",
            "PCM", "Dental", "Adminstrationfunctionalunit", "Everglades"
        ],
    },

    # =================== Office Administration ===================
    "Adminstrationfunctionalunit": {
        "entry_types": ["Income", "Expenses", "Capital"],
        "categories": {
            "Income": ["Other"],
            "Expenses": [
                "Personnel & Payroll",
                "Travel & Entertainment (T&E)",
                "Marketing",
                "Facilities & Overhead",
                "General Operations",
                "Innovation",
                "Supplies & Equipment",
                "Guest Concierge",
                "Business Services Revenue",
                "Miscellaneous",
                "Management Fees",
                "Outsourced Services",
                "Events-Conferences-Training",
                "Corpus Fund",
                "Other"
            ],
            "Capital": [
                "Equity Infusion",
                "Partner Contribution",
                "Asset Capitalization",
                "Reserve Fund Transfer",
                "Other Capital"
            ],
        },
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
        "is_salary_category": "Personnel & Payroll",
    },

    # =================== Research & Development ===================
    "ResearchDevelopment": {
        "entry_types": ["Income", "Expenses", "Capital"],
        "categories": {
            "Income": ["Grants", "Funding", "Other"],
            "Expenses": [
                "R&D Salaries",
                "Lab Supplies",
                "Equipment",
                "Testing",
                "Corpus Fund",
                "Other"
            ],
            "Capital": [
                "Equity Infusion",
                "Partner Contribution",
                "Asset Capitalization",
                "Reserve Fund Transfer",
                "Other Capital"
            ],
        },
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

    items = db.relationship(
        "FinanceEntryItem",
        backref="entry",
        lazy=True,
        cascade="all, delete-orphan",
        order_by="FinanceEntryItem.id",
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
            "invoice_url": f"/files/invoices/{self.invoice_filename}" if self.invoice_filename else None,
            "invoice_original_name": self.invoice_original_name,
            "invoice_mimetype": self.invoice_mimetype,
            "entry_date": self.entry_date.isoformat() if self.entry_date else None,
            "items": [i.to_dict() for i in self.items],
            "extra_data": self.extra_data,
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

    def to_dict(self):
        return {
            "id": self.id,
            "customer_name": self.customer_name,
            "entry_date": self.entry_date.isoformat() if self.entry_date else None,
            "total_amount": float(self.total_amount or 0),
            "paid": float(self.paid or 0),
            "balance": float(self.balance or 0),
            "remarks": self.remarks,
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

    def to_dict(self):
        return {
            "id": self.id,
            "customer_name": self.customer_name,
            "entry_date": self.entry_date.isoformat() if self.entry_date else None,
            "total_amount": float(self.total_amount or 0),
            "paid": float(self.paid or 0),
            "balance": float(self.balance or 0),
            "remarks": self.remarks,
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


# ---------- Migration functions ----------
def migrate_corporate_categories():
    """Rename existing Corporate entries from old category names to new ones."""
    from sqlalchemy import update
    category_map = {
        "Payroll Salaries": "Personnel & Payroll",
        "Travel & Entertainment": "Travel & Entertainment (T&E)",
        "Marketing Expenses": "Marketing",
        "Assets & Infra Cost": "Office Supplies & Equipment",
        "Office Management": "Facilities & Overhead",
        "Service Revenue": "Business Services Revenue",
        "Miscellaneous Categories": "Miscellaneous",
    }
    migrated = 0
    for old, new in category_map.items():
        count = db.session.query(FinanceEntry).filter(
            FinanceEntry.department == "Corporate",
            FinanceEntry.category == old
        ).count()
        if count > 0:
            stmt = update(FinanceEntry).where(
                FinanceEntry.department == "Corporate",
                FinanceEntry.category == old
            ).values(category=new)
            db.session.execute(stmt)
            print(f"✅ Migrated {count} entries from '{old}' to '{new}'")
            migrated += count
    if migrated > 0:
        db.session.commit()
        print(f"✅ Corporate category migration complete ({migrated} entries updated).")
    else:
        print("ℹ️ No Corporate category migration needed.")


def migrate_office_admin_categories():
    """Rename existing Office Admin entries from old category names to new ones."""
    from sqlalchemy import update
    category_map = {
        "Travel & Entertainment": "Travel & Entertainment (T&E)",
        "Marketing Expenses": "Marketing",
        "Assets & Infra Cost": "Office Supplies & Equipment",
        "Office Management": "Facilities & Overhead",
        "Service Revenue": "Business Services Revenue",
        "Miscellaneous Categories": "Miscellaneous",
        "Legal Governance": "Miscellaneous",
        "Supplies and Equipments": "Supplies & Equipment",
    }
    migrated = 0
    for old, new in category_map.items():
        count = db.session.query(FinanceEntry).filter(
            FinanceEntry.department == "Adminstrationfunctionalunit",
            FinanceEntry.category == old
        ).count()
        if count > 0:
            stmt = update(FinanceEntry).where(
                FinanceEntry.department == "Adminstrationfunctionalunit",
                FinanceEntry.category == old
            ).values(category=new)
            db.session.execute(stmt)
            print(f"✅ Migrated {count} entries from '{old}' to '{new}'")
            migrated += count
    if migrated > 0:
        db.session.commit()
        print(f"✅ Office Admin category migration complete ({migrated} entries updated).")
    else:
        print("ℹ️ No Office Admin category migration needed.")


def migrate_caredx_expense_categories():
    """Rename existing Caredx Expense entries from old category names to new ones."""
    from sqlalchemy import update
    category_map = {
        "Payroll Salaries": "Personnel & Payroll",
        "Travel & Entertainment": "Travel & Entertainment (T&E)",
        "Marketing Expenses": "Marketing",
        "Assets & Infra Cost": "Supplies & Equipments",
        "Office Management": "Facilities & Overhead",
        "Service Revenue": "Business Services Revenue",
        "Miscellaneous Categories": "Miscellaneous",
        "Reagents and Laboratory Consumables": "Lab Consumables",
        "Specialized Clinical Labor": "Clinical Overhead",
        "Logistics, Couriers, and Specimen Collection": "Specimen Collection",
        "Equipment Maintenance, Leases, and Automation": "Equipment Maintenance",
        "Waste Management, Compliance, and Safety": "Waste Management",
        "Billing, Revenue Cycle, and Administration": "Billing Administration",
        "Legal Governance": "Miscellaneous",
        "General Operations": "Miscellaneous",
    }
    migrated = 0
    for old, new in category_map.items():
        count = db.session.query(CaredxExpense).filter(
            CaredxExpense.category == old
        ).count()
        if count > 0:
            stmt = update(CaredxExpense).where(
                CaredxExpense.category == old
            ).values(category=new)
            db.session.execute(stmt)
            print(f"✅ Migrated {count} Caredx expense entries from '{old}' to '{new}'")
            migrated += count
    if migrated > 0:
        db.session.commit()
        print(f"✅ Caredx expense category migration complete ({migrated} entries updated).")
    else:
        print("ℹ️ No Caredx expense category migration needed.")


def migrate_it_categories():
    """Rename existing IT entries from old category names to new ones."""
    from sqlalchemy import update
    category_map = {
        "Payroll Salaries": "Personnel & Payroll",
        "Travel & Entertainment": "Travel & Entertainment (T&E)",
        "Marketing Expenses": "Marketing",
        "Assets & Infra Cost": "Supplies & Equipments",
        "Office Management": "Facilities & Overhead",
        "Service Revenue": "Business Services Revenue",
        "Miscellaneous Categories": "Miscellaneous",
        "Legal Governance": "Miscellaneous",
        "Supplies and Equipments": "Supplies & Equipments",
    }
    migrated = 0
    for old, new in category_map.items():
        count = db.session.query(FinanceEntry).filter(
            FinanceEntry.department == "IT",
            FinanceEntry.category == old
        ).count()
        if count > 0:
            stmt = update(FinanceEntry).where(
                FinanceEntry.department == "IT",
                FinanceEntry.category == old
            ).values(category=new)
            db.session.execute(stmt)
            print(f"✅ Migrated {count} IT entries from '{old}' to '{new}'")
            migrated += count
    if migrated > 0:
        db.session.commit()
        print(f"✅ IT category migration complete ({migrated} entries updated).")
    else:
        print("ℹ️ No IT category migration needed.")


def migrate_itsales_categories():
    """Rename existing IT Sales entries from old category names to new ones."""
    from sqlalchemy import update
    category_map = {
        "Payroll Salaries": "Personnel & Payroll",
        "Travel & Entertainment": "Travel & Entertainment (T&E)",
        "Marketing Expenses": "Marketing",
        "Assets & Infra Cost": "Supplies & Equipments",
        "Office Management": "Facilities & Overhead",
        "Service Revenue": "Business Services Revenue",
        "Miscellaneous Categories": "Miscellaneous",
        "Legal Governance": "Miscellaneous",
    }
    migrated = 0
    for old, new in category_map.items():
        count = db.session.query(FinanceEntry).filter(
            FinanceEntry.department == "IT Sales",
            FinanceEntry.category == old
        ).count()
        if count > 0:
            stmt = update(FinanceEntry).where(
                FinanceEntry.department == "IT Sales",
                FinanceEntry.category == old
            ).values(category=new)
            db.session.execute(stmt)
            print(f"✅ Migrated {count} IT Sales entries from '{old}' to '{new}'")
            migrated += count
    if migrated > 0:
        db.session.commit()
        print(f"✅ IT Sales category migration complete ({migrated} entries updated).")
    else:
        print("ℹ️ No IT Sales category migration needed.")


def migrate_medtech_categories():
    """Rename existing MedTech entries from old category names to new ones."""
    from sqlalchemy import update
    category_map = {
        "Payroll Salaries": "Personnel & Payroll",
        "Travel & Entertainment": "Travel & Entertainment (T&E)",
        "Marketing Expenses": "Marketing",
        "Assets & Infra Cost": "Supplies & Equipments",
        "Office Management": "Facilities & Overhead",
        "Service Revenue": "Business Services Revenue",
        "Miscellaneous Categories": "Miscellaneous",
        "Legal Governance": "Miscellaneous",
    }
    migrated = 0
    for old, new in category_map.items():
        count = db.session.query(FinanceEntry).filter(
            FinanceEntry.department == "MedTech",
            FinanceEntry.category == old
        ).count()
        if count > 0:
            stmt = update(FinanceEntry).where(
                FinanceEntry.department == "MedTech",
                FinanceEntry.category == old
            ).values(category=new)
            db.session.execute(stmt)
            print(f"✅ Migrated {count} MedTech entries from '{old}' to '{new}'")
            migrated += count
    if migrated > 0:
        db.session.commit()
        print(f"✅ MedTech category migration complete ({migrated} entries updated).")
    else:
        print("ℹ️ No MedTech category migration needed.")


def migrate_pcm_categories():
    """Rename existing PCM entries from old category names to new ones."""
    from sqlalchemy import update
    category_map = {
        "Payroll Salaries": "Personnel & Payroll",
        "Travel & Entertainment": "Miscellaneous",
        "Marketing Expenses": "Marketing",
        "Assets & Infra Cost": "Supplies & Equipment",
        "Office Management": "Facilities & Overhead",
        "Service Revenue": "Business Services Revenue",
        "Miscellaneous Categories": "Miscellaneous",
        "Legal Governance": "Miscellaneous",
        "Office Supplies & Equipment": "Supplies & Equipment",
        "Point-of-Care Technology and Telecom": "Digital Health",
        "Home Medical Supplies and DME": "Equipment & Supplies",
        "Intake, Scheduling, and Back-Office Logistics": "Back Office Logistics",
        "Regulatory and Risk Management": "Miscellaneous",
        "Supplies and Equipments": "Supplies & Equipment",
        "Field Labor and Nursing Care": "Field Labour and Nursing Care",
        "Travel and Mileage Reimbursement": "Back Office Logistics",
    }
    migrated = 0
    for old, new in category_map.items():
        count = db.session.query(FinanceEntry).filter(
            FinanceEntry.department == "PCM",
            FinanceEntry.category == old
        ).count()
        if count > 0:
            stmt = update(FinanceEntry).where(
                FinanceEntry.department == "PCM",
                FinanceEntry.category == old
            ).values(category=new)
            db.session.execute(stmt)
            print(f"✅ Migrated {count} PCM entries from '{old}' to '{new}'")
            migrated += count
    if migrated > 0:
        db.session.commit()
        print(f"✅ PCM category migration complete ({migrated} entries updated).")
    else:
        print("ℹ️ No PCM category migration needed.")


def migrate_everglades_categories():
    """Rename existing Everglades entries from old category names to new ones."""
    from sqlalchemy import update
    category_map = {
        "Payroll Salaries": "Personnel & Payroll",
        "Travel & Entertainment": "Travel & Entertainment (T&E)",
        "Marketing Expenses": "Marketing",
        "Assets & Infra Cost": "Supplies & Equipments",
        "Office Management": "Facilities & Overhead",
        "Service Revenue": "Business Services Revenue",
        "Miscellaneous Categories": "Miscellaneous",
        "Legal Governance": "Miscellaneous",
    }
    migrated = 0
    for old, new in category_map.items():
        count = db.session.query(FinanceEntry).filter(
            FinanceEntry.department == "Everglades",
            FinanceEntry.category == old
        ).count()
        if count > 0:
            stmt = update(FinanceEntry).where(
                FinanceEntry.department == "Everglades",
                FinanceEntry.category == old
            ).values(category=new)
            db.session.execute(stmt)
            print(f"✅ Migrated {count} Everglades entries from '{old}' to '{new}'")
            migrated += count
    if migrated > 0:
        db.session.commit()
        print(f"✅ Everglades category migration complete ({migrated} entries updated).")
    else:
        print("ℹ️ No Everglades category migration needed.")
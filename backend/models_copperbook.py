# billing-portal/backend/models_copperbook.py
from models import db
from datetime import datetime


class CopperBookRequest(db.Model):
    __tablename__ = "copper_book_requests"

    id = db.Column(db.Integer, primary_key=True)
    request_number = db.Column(db.String(30), unique=True, nullable=False)
    remote_id = db.Column(db.Integer, nullable=True)
    department = db.Column(db.String(50), nullable=False)
    assignee_mode = db.Column(db.String(20), default="department")
    raised_by_name = db.Column(db.String(150), nullable=True)
    raised_by_email = db.Column(db.String(150), nullable=True)
    purpose = db.Column(db.String(255), nullable=False)
    description = db.Column(db.Text, nullable=False)
    remarks = db.Column(db.Text, nullable=True)
    status = db.Column(db.String(30), default="pending")
    assigned_to_role = db.Column(db.String(20), default="finance")
    is_payroll = db.Column(db.Boolean, default=False)
    amount = db.Column(db.Numeric(14, 2), nullable=True)

    finance_action_by = db.Column(db.String(150), nullable=True)
    finance_action_at = db.Column(db.DateTime, nullable=True)
    finance_remarks = db.Column(db.Text, nullable=True)

    ceo_action_by = db.Column(db.String(150), nullable=True)
    ceo_action_at = db.Column(db.DateTime, nullable=True)
    ceo_remarks = db.Column(db.Text, nullable=True)

    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    assignees = db.relationship(
        "CopperBookAssignee", backref="request", cascade="all, delete-orphan"
    )
    attachments = db.relationship(
        "CopperBookAttachment", backref="request", cascade="all, delete-orphan"
    )
    employee_entries = db.relationship(
        "CopperBookEmployeeEntry", backref="request", cascade="all, delete-orphan"
    )


class CopperBookAssignee(db.Model):
    __tablename__ = "copper_book_assignees"

    id = db.Column(db.Integer, primary_key=True)
    request_id = db.Column(
        db.Integer, db.ForeignKey("copper_book_requests.id", ondelete="CASCADE"), nullable=False
    )
    employee_name = db.Column(db.String(150), nullable=False)


class CopperBookAttachment(db.Model):
    __tablename__ = "copper_book_attachments"

    id = db.Column(db.Integer, primary_key=True)
    request_id = db.Column(
        db.Integer, db.ForeignKey("copper_book_requests.id", ondelete="CASCADE"), nullable=False
    )
    file_data = db.Column(db.LargeBinary(length=(2**32) - 1), nullable=False)
    filename = db.Column(db.String(255))
    mimetype = db.Column(db.String(100))
    uploaded_at = db.Column(db.DateTime, default=datetime.utcnow)


class CopperBookEmployeeEntry(db.Model):
    __tablename__ = "copper_book_employee_entries"

    id = db.Column(db.Integer, primary_key=True)
    request_id = db.Column(
        db.Integer, db.ForeignKey("copper_book_requests.id", ondelete="CASCADE"), nullable=False
    )
    employee_id = db.Column(db.Integer, nullable=True)
    employee_name = db.Column(db.String(150), nullable=False)
    employee_department = db.Column(db.String(100), nullable=True)
    monthly_salary = db.Column(db.Numeric(14, 2), nullable=False, default=0)
    td_da = db.Column(db.Numeric(14, 2), nullable=False, default=0)
    total_amount = db.Column(db.Numeric(14, 2), nullable=False, default=0)
    status = db.Column(db.String(20), nullable=False, default="pending")
    remarks = db.Column(db.Text, nullable=True)
    action_by = db.Column(db.String(150), nullable=True)
    action_at = db.Column(db.DateTime, nullable=True)

    # ✅ NEW — per-employee attachment metadata
    attachment_filename = db.Column(db.String(255), nullable=True)
    attachment_original_name = db.Column(db.String(255), nullable=True)
    attachment_mimetype = db.Column(db.String(100), nullable=True)
StaffPortal — backend/app/models.py :     # ✅ NEW
    account_number = db.Column(db.String(50), nullable=True)
    employee_id_no = db.Column(db.String(50), nullable=True)
"account_number": self.account_number or "",
"employee_id_no": self.employee_id_no or "", and 
StaffPortal — backend/app/routes/tickets.py : def notify(user_id, message, related_id=None):
    """Creates the in-app notification AND emails the person."""
    notif = Notification(
        user_id=user_id,
        message=message,
        is_read=False,
        related_type="ticket",
        related_id=related_id,
    )
    db.session.add(notif)

    user = User.query.get(user_id)
    if user and user.email:
        try:
            from app.email_templates import send_branded_email
            send_branded_email(
                recipient=user.email,
                subject="Ticket Update",
                heading="Ticket Notification",
                intro=message,
                closing="Open the Staff Portal to view details and take action.",
            )
        except Exception as mail_err:
            print("Mail error: " + str(mail_err))

            FinanceHub — backend/routes/auth.py: def send_otp_email(user_email, otp_code):
    subject = "Finance Hub — Verification Code"
    body = f"Your OTP code is: {otp_code}. It expires in 10 minutes."
    html = f"""<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#f5f7fb;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" cellspacing="0" cellpadding="0" style="width:100%;background:#f5f7fb;padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" cellspacing="0" cellpadding="0" style="max-width:520px;width:100%;background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 4px 18px rgba(15,23,42,0.06);">
        <tr><td style="padding:22px 26px;background:linear-gradient(135deg,#0ea5e9 0%,#2563eb 100%);">
          <div style="color:#fff;font-size:17px;font-weight:700;">Primaria HealthCare Services</div>
          <div style="color:#dbeafe;font-size:12px;margin-top:2px;">Finance Hub</div>
        </td></tr>
        <tr><td style="padding:28px 26px;">
          <h2 style="margin:0;color:#0f172a;font-size:20px;">Your Verification Code</h2>
          <p style="margin:12px 0 0;color:#475569;font-size:14px;line-height:1.6;">Use the code below to complete your sign-in to Finance Hub.</p>
          <div style="margin:22px 0;padding:18px;text-align:center;background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;">
            <div style="font-size:12px;color:#1e40af;letter-spacing:1px;font-weight:600;">VERIFICATION CODE</div>
            <div style="font-size:32px;font-weight:800;color:#1e3a8a;letter-spacing:6px;margin-top:6px;">{otp_code}</div>
          </div>
          <p style="margin:0;color:#64748b;font-size:13px;">This code is valid for 10 minutes. Do not share it with anyone.</p>
        </td></tr>
        <tr><td style="padding:18px 26px;border-top:1px solid #e2e8f0;background:#f8fafc;color:#94a3b8;font-size:11px;">
          This is an automated message from Primaria HealthCare Services.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>"""
    send_email(user_email, subject, body, html_body=html)

    and backend\models_copperbook.py : 
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
    amount = db.Column(db.Numeric(14, 2), nullable=True)          # for General Expenses

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

    frontend/src/pages/shared/CopperBookForm.jsx : Add state: const [employeeFiles, setEmployeeFiles] = useState({});

In the payroll table, add a <th>Upload</th> header and a matching <td> per row with a file input keyed by e.employee_id, wired to setEmployeeFiles.

In handleSubmit's payroll block, after appending employee_entries, add:

jsx
employeeEntries.forEach((e, idx) => {
  const f = employeeFiles[e.employee_id];
  if (f) fd.append(`employee_file_${idx}`, f);
});
On successful submit, also call setEmployeeFiles({});
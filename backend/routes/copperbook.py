# billing-portal/backend/routes/copperbook.py
import os
import json
import math
import traceback
from datetime import datetime, timedelta
import requests

from flask import Blueprint, request, jsonify, Response
from flask_jwt_extended import jwt_required, get_jwt_identity
from sqlalchemy import or_, func
from sqlalchemy.orm import selectinload

from models import db, User, Notification
from models_copperbook import (
    CopperBookRequest, CopperBookAssignee, CopperBookAttachment, CopperBookEmployeeEntry,
)
from utils import send_email

cb_bp = Blueprint("copperbook", __name__, url_prefix="/api/copperbook")

BRAND = "Primaria HealthCare Services"
PAYROLL_CATEGORY = "Salary & Payrolls"

# Capital Equity = requests raised from StaffPortal with
#   department = "Corporate Management"  AND  category = "Capital Equity"
CAPITAL_EQUITY_CATEGORY = "Capital Equity"
CAPITAL_EQUITY_DEPARTMENT = "Corporate Management"

# Business Unit dropdown - exactly these departments (same names as StaffPortal)
BUSINESS_UNITS = [
    "Office Administration",
    "CareDx",
    "MedTech",
    "IT Development",
    "IT Sales",
    "PCM",
    "Everglades",
    "Corporate Management",
]

# Largest amount the `amount` column can hold (DECIMAL(12,2) -> 9,999,999,999.99).
# If you later widen the column, raise this number too.
MAX_AMOUNT = 9_999_999_999.99

# Roles allowed to Edit / Delete a request
MANAGE_ROLES = ("SuperAdmin", "admin", "Corporate")

VIEW_STATUSES = ("pending", "forwarded_to_ceo", "approved", "rejected")
ENTRY_VIEWS = ("pending", "approved", "rejected")


def _service_token_ok():
    expected = os.getenv("FINANCEHUB_SERVICE_TOKEN") or ""
    got = request.headers.get("X-Service-Token") or ""
    return bool(expected) and expected == got


def _fmt_money(v):
    try:
        return f"₹ {float(v):,.2f}"
    except Exception:
        return "—"


def _parse_date(raw):
    if raw is None:
        return None
    raw = str(raw).strip()
    if not raw or raw.lower() in ("null", "none", "undefined"):
        return None
    for fmt, size in (("%Y-%m-%d", 10), ("%d-%m-%Y", 10), ("%d/%m/%Y", 10), ("%Y/%m/%d", 10)):
        try:
            return datetime.strptime(raw[:size], fmt).date()
        except ValueError:
            continue
    return None


REFERENCE_DATE_KEYS = (
    "reference_date", "referenceDate", "ref_date", "refDate",
    "reference", "date_reference", "entry_date",
)


def _extract_reference_date(form):
    for k in REFERENCE_DATE_KEYS:
        v = form.get(k)
        if v not in (None, ""):
            return _parse_date(v)
    return None


def _request_amount(r):
    if r.amount is not None:
        return float(r.amount)
    if r.is_payroll and r.employee_entries:
        return float(sum((e.total_amount or 0) for e in r.employee_entries))
    return None


def _roll_up_status(req):
    statuses = [e.status for e in req.employee_entries]
    if not statuses:
        return req.status
    if all(s == "approved" for s in statuses):
        return "approved"
    if all(s == "rejected" for s in statuses):
        return "rejected"
    if any(s == "pending" for s in statuses):
        return "forwarded_to_ceo"
    return "partially_approved"


def _sum_by(r, status):
    return float(sum((e.total_amount or 0) for e in r.employee_entries if e.status == status))


def _count_by(r, status):
    return sum(1 for e in r.employee_entries if e.status == status)


def _status_groups(r):
    entries = r.employee_entries
    if r.is_payroll and entries:
        groups = []
        for st in ENTRY_VIEWS:
            es = [e for e in entries if e.status == st]
            if not es:
                continue
            key = st
            if st == "pending":
                key = r.status if r.status in VIEW_STATUSES else "pending"
            groups.append((key, float(sum((e.total_amount or 0) for e in es)), len(es)))
        return groups
    return [(r.status, _request_amount(r), None)]


def _serialize_row(r, group, is_split):
    key, amount, count = group
    d = _serialize(r)
    d["request_status"] = r.status
    d["request_amount"] = _request_amount(r)
    d["status"] = key
    d["amount"] = amount
    d["row_key"] = f"{r.id}-{key}"
    d["display_status"] = key
    d["display_amount"] = amount
    d["display_count"] = count
    d["is_split"] = is_split
    return d


# ─────────────────────────────────────────────────────────────────
# CAPITAL EQUITY helpers
# ─────────────────────────────────────────────────────────────────
def _is_capital_equity(r):
    """Corporate Management + Capital Equity category."""
    cat = (r.category or "").strip().lower()
    dept = (r.department or "").strip().lower()
    return cat == CAPITAL_EQUITY_CATEGORY.lower() and CAPITAL_EQUITY_DEPARTMENT.lower() in dept


def _effective_date(r):
    """Reference date if present, otherwise the created date."""
    ref = getattr(r, "reference_date", None)
    if ref:
        return ref
    return r.created_at.date() if r.created_at else None


def _amounts_by_status(r):
    """Split a request's amount into approved / rejected / pending buckets."""
    out = {"approved": 0.0, "rejected": 0.0, "pending": 0.0}
    if r.is_payroll and r.employee_entries:
        for e in r.employee_entries:
            key = e.status if e.status in out else "pending"
            out[key] += float(e.total_amount or 0)
        return out
    amt = float(_request_amount(r) or 0)
    if r.status == "approved":
        out["approved"] = amt
    elif r.status == "rejected":
        out["rejected"] = amt
    else:
        out["pending"] = amt
    return out


def _capital_equity_summary(start, end, department=None):
    """
    Capital Equity / Approved / Rejected / Balance for the selected period.

      Capital Equity = total Capital Equity given in the period  (SAME for every department)
      Approved       = approved spending of the selected department (all departments if none)
      Rejected       = rejected spending of the selected department (all departments if none)
      Balance        = carried forward + Capital Equity - Approved of ALL departments
                       (SAME for every department - it is the shared pool that is left)

    Example: month 1 -> equity 10,00,000, approved 8,00,000 => balance 2,00,000
             month 2 -> equity 10,00,000 => balance 2,00,000 + 10,00,000 = 12,00,000
    """
    dept_key = _dept_key(department)
    rows = CopperBookRequest.query.options(
        selectinload(CopperBookRequest.employee_entries)
    ).all()

    open_equity = open_approved = 0.0
    equity = approved_all = 0.0
    approved_dept = rejected_dept = 0.0

    for r in rows:
        d = _effective_date(r)
        if d is None:
            continue

        before = bool(start and d < start)
        after = bool(end and d > end)
        if after:
            continue

        if _is_capital_equity(r):
            if r.status == "rejected":
                continue
            amt = float(_request_amount(r) or 0)
            if before:
                open_equity += amt
            else:
                equity += amt
        else:
            b = _amounts_by_status(r)
            in_dept = (not dept_key) or (_dept_key(r.department) == dept_key)
            if before:
                open_approved += b["approved"]
            else:
                approved_all += b["approved"]
                if in_dept:
                    approved_dept += b["approved"]
                    rejected_dept += b["rejected"]

    opening_balance = open_equity - open_approved
    balance = opening_balance + equity - approved_all
    return {
        "capital_equity": round(equity, 2),
        "opening_balance": round(opening_balance, 2),
        "approved": round(approved_dept, 2),
        "rejected": round(rejected_dept, 2),
        "balance": round(balance, 2),
    }


def _dept_key(name):
    """'Everglades (Pharmacy)' and 'Everglades' are the same business unit."""
    return (name or "").split("(")[0].strip().lower()


def _can_manage(user):
    return bool(user) and user.role in MANAGE_ROLES


def _branded_html(heading: str, intro: str, details: dict, message: str, closing: str) -> str:
    rows = ""
    for k, v in (details or {}).items():
        rows += (
            f'<tr>'
            f'<td style="padding:9px 14px;border-bottom:1px solid #eef2f7;'
            f'color:#64748b;font-size:13px;width:38%;">{k}</td>'
            f'<td style="padding:9px 14px;border-bottom:1px solid #eef2f7;'
            f'color:#0f172a;font-size:13px;font-weight:600;">{v}</td>'
            f'</tr>'
        )
    details_block = (
        f'<table role="presentation" cellspacing="0" cellpadding="0" '
        f'style="width:100%;border:1px solid #e2e8f0;border-radius:10px;'
        f'overflow:hidden;margin-top:18px;">{rows}</table>'
    ) if rows else ""

    return f"""<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#f5f7fb;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" cellspacing="0" cellpadding="0" style="width:100%;background:#f5f7fb;padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" cellspacing="0" cellpadding="0" style="max-width:580px;width:100%;background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 4px 18px rgba(15,23,42,0.06);">
        <tr><td style="padding:22px 26px;background:linear-gradient(135deg,#0ea5e9 0%,#2563eb 100%);">
          <div style="color:#fff;font-size:17px;font-weight:700;">{BRAND}</div>
          <div style="color:#dbeafe;font-size:12px;margin-top:2px;">Finance Hub</div>
        </td></tr>
        <tr><td style="padding:28px 26px 10px;">
          <h2 style="margin:0;color:#0f172a;font-size:20px;font-weight:700;line-height:1.3;">{heading}</h2>
          <p style="margin:12px 0 0;color:#475569;font-size:14px;line-height:1.6;white-space:pre-line;">{intro}</p>
          {details_block}
          <p style="margin:18px 0 0;color:#334155;font-size:14px;line-height:1.65;white-space:pre-line;">{message}</p>
          <p style="margin:22px 0 0;color:#64748b;font-size:13px;line-height:1.6;white-space:pre-line;">{closing}</p>
        </td></tr>
        <tr><td style="padding:22px 26px;border-top:1px solid #e2e8f0;background:#f8fafc;">
          <p style="margin:0;color:#64748b;font-size:12px;line-height:1.55;">
            This is an automated message from {BRAND}. Please do not reply directly.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>"""


def _notify_role_async(
    role_names,
    *,
    in_app_message,
    related_id=None,
    email_subject=None,
    email_heading=None,
    email_intro=None,
    email_details=None,
    email_message=None,
    email_closing=None,
):
    if isinstance(role_names, str):
        role_names = [role_names]

    users = User.query.filter(User.role.in_(role_names), User.is_active == True).all()
    if not users:
        return

    for u in users:
        db.session.add(Notification(
            user_id=u.id, message=in_app_message, is_read=False,
            related_type="copperbook", related_id=related_id,
        ))

    if not email_subject:
        return

    html = _branded_html(
        heading=email_heading or "CopperBook Update",
        intro=email_intro or "Hello,",
        details=email_details or {},
        message=email_message or in_app_message,
        closing=email_closing or ("Thank you.\n\nWarm regards,\n" + BRAND),
    )
    plain = f"{email_heading or 'CopperBook Update'}\n\n{email_intro or ''}\n"
    for k, v in (email_details or {}).items():
        plain += f"{k}: {v}\n"
    plain += f"\n{email_message or in_app_message}\n\n{email_closing or BRAND}"

    for u in users:
        if u.email:
            try:
                send_email(u.email, email_subject, plain, html_body=html)
            except Exception as e:
                print("[notify] email enqueue failed:", e)


def _entry_to_dict(e):
    return {
        "id": e.id,
        "employee_id": e.employee_id,
        "employee_name": e.employee_name,
        "employee_department": e.employee_department,
        "monthly_salary": float(e.monthly_salary or 0),
        "td_da": float(e.td_da or 0),
        "total_amount": float(e.total_amount or 0),
        "status": e.status,
        "remarks": e.remarks,
        "action_by": e.action_by,
        "action_at": e.action_at.isoformat() if e.action_at else None,
        "attachment_filename": e.attachment_original_name or e.attachment_filename,
        "attachment_mimetype": e.attachment_mimetype,
    }


def _serialize(r, with_files=False):
    return {
        "id": r.id,
        "remote_id": r.remote_id,
        "request_number": r.request_number,
        "department": r.department,
        "business_unit": r.department,
        "category": r.category,
        "assignee_mode": r.assignee_mode,
        "assignee_names": [a.employee_name for a in r.assignees],
        "raised_by_name": r.raised_by_name,
        "raised_by_email": r.raised_by_email,
        "purpose": r.purpose,
        "description": r.description,
        "remarks": r.remarks,
        "status": r.status,
        "assigned_to_role": r.assigned_to_role,
        "is_payroll": bool(r.is_payroll),
        "is_capital_equity": _is_capital_equity(r),
        "amount": _request_amount(r),
        "reference_date": (
            r.reference_date.isoformat()
            if getattr(r, "reference_date", None) else None
        ),
        "display_amount": _request_amount(r),
        "display_status": r.status,
        "approved_amount": _sum_by(r, "approved"),
        "rejected_amount": _sum_by(r, "rejected"),
        "pending_amount": _sum_by(r, "pending"),
        "approved_count": _count_by(r, "approved"),
        "rejected_count": _count_by(r, "rejected"),
        "pending_count": _count_by(r, "pending"),
        "finance_action_by": r.finance_action_by,
        "finance_action_at": r.finance_action_at.isoformat() if r.finance_action_at else None,
        "finance_remarks": r.finance_remarks,
        "ceo_action_by": r.ceo_action_by,
        "ceo_action_at": r.ceo_action_at.isoformat() if r.ceo_action_at else None,
        "ceo_remarks": r.ceo_remarks,
        "created_at": r.created_at.isoformat() if r.created_at else None,
        "employee_entries": [_entry_to_dict(e) for e in r.employee_entries] if with_files else [],
        "attachments": [{"id": f.id, "filename": f.filename} for f in r.attachments] if with_files else [],
    }


def _sync_to_staffportal(req: CopperBookRequest):
    base = (os.getenv("STAFFPORTAL_BASE_URL") or "").rstrip("/")
    token = os.getenv("COPPERBOOK_CALLBACK_TOKEN") or ""
    if not base or not token:
        return
    payload = {
        "remote_id": req.remote_id,
        "status": req.status,
        "finance_action_by": req.finance_action_by,
        "finance_remarks": req.finance_remarks,
        "ceo_action_by": req.ceo_action_by,
        "ceo_remarks": req.ceo_remarks,
        "employee_entries": [_entry_to_dict(e) for e in req.employee_entries],
    }
    try:
        requests.post(
            f"{base}/api/copperbook/sync",
            json=payload,
            headers={"X-Service-Token": token},
            timeout=3,
        )
    except Exception:
        pass


def _sync_edit_to_staffportal(req: CopperBookRequest):
    """Push an edit made in the Billing Portal to the Staff Portal.
    Returns (ok, message). Never raises."""
    base = (os.getenv("STAFFPORTAL_BASE_URL") or "").rstrip("/")
    token = os.getenv("COPPERBOOK_CALLBACK_TOKEN") or ""
    if not base or not token:
        return False, "STAFFPORTAL_BASE_URL / COPPERBOOK_CALLBACK_TOKEN not set."
    payload = {
        "event": "edit",
        "remote_id": req.remote_id,
        "request_number": req.request_number,
        "department": req.department,
        "category": req.category,
        "purpose": req.purpose,
        "description": req.description,
        "remarks": req.remarks,
        "amount": None if req.is_payroll else _request_amount(req),
        "reference_date": (
            req.reference_date.isoformat()
            if getattr(req, "reference_date", None) else None
        ),
    }
    try:
        resp = requests.post(
            f"{base}/api/copperbook/sync",
            json=payload,
            headers={"X-Service-Token": token},
            timeout=8,
        )
        if resp.ok:
            return True, "ok"
        print(f"[copperbook] edit sync failed {req.request_number}: {resp.status_code} {resp.text[:300]}")
        return False, f"Staff Portal responded {resp.status_code}"
    except Exception as e:
        print(f"[copperbook] edit sync error {req.request_number}:", e)
        return False, str(e)


@cb_bp.route("/intake-ping", methods=["GET", "OPTIONS"])
def intake_ping():
    if request.method == "OPTIONS":
        return ("", 204)
    if not _service_token_ok():
        return jsonify({"ok": False, "error": "Unauthorized"}), 401
    return jsonify({"ok": True}), 200


@cb_bp.route("/intake", methods=["POST", "OPTIONS"])
def intake():
    if request.method == "OPTIONS":
        return ("", 204)
    if not _service_token_ok():
        return jsonify({"error": "Unauthorized"}), 401

    try:
        d = request.form
        is_payroll = (d.get("is_payroll") or "0") == "1"

        raw_amount = d.get("amount")
        try:
            amount_val = float(raw_amount) if raw_amount not in (None, "", "null") else None
        except (TypeError, ValueError):
            amount_val = None

        category = (d.get("category") or "").strip() or None
        if is_payroll and not category:
            category = PAYROLL_CATEGORY

        reference_date = _extract_reference_date(d)

        incoming_no = (d.get("request_number") or "").strip()
        if incoming_no and incoming_no != "PENDING":
            existing = CopperBookRequest.query.filter_by(request_number=incoming_no).first()
            if existing:
                if hasattr(existing, "reference_date") and reference_date and not existing.reference_date:
                    existing.reference_date = reference_date
                if not existing.remote_id and d.get("remote_id"):
                    try:
                        existing.remote_id = int(d.get("remote_id"))
                    except (TypeError, ValueError):
                        pass
                db.session.commit()
                return jsonify({"message": "Already received", "id": existing.id, "request_number": existing.request_number}), 200

        req = CopperBookRequest(
            request_number=d.get("request_number") or "PENDING",
            remote_id=int(d.get("remote_id")) if d.get("remote_id") else None,
            department=d.get("department") or "",
            category=category,
            assignee_mode=d.get("assignee_mode") or "department",
            raised_by_name=d.get("raised_by_name"),
            raised_by_email=d.get("raised_by_email"),
            purpose=d.get("purpose") or "",
            description=d.get("description") or "",
            remarks=d.get("remarks") or None,
            status="pending",
            assigned_to_role="finance",
            is_payroll=is_payroll,
            amount=amount_val,
        )
        if hasattr(CopperBookRequest, "reference_date"):
            req.reference_date = reference_date

        db.session.add(req)
        db.session.flush()

        names_raw = (d.get("assignee_names") or "").strip()
        if names_raw:
            for name in names_raw.split(","):
                name = name.strip()
                if name:
                    db.session.add(CopperBookAssignee(request_id=req.id, employee_name=name))

        entries = []
        if is_payroll:
            raw = d.get("employee_entries") or "[]"
            try:
                entries = json.loads(raw)
            except Exception:
                entries = []
            for idx, e in enumerate(entries):
                ms = float(e.get("monthly_salary") or 0)
                td = float(e.get("td_da") or 0)
                row = CopperBookEmployeeEntry(
                    request_id=req.id,
                    employee_id=e.get("employee_id"),
                    employee_name=e.get("employee_name") or "",
                    employee_department=e.get("employee_department") or "",
                    monthly_salary=ms, td_da=td, total_amount=ms + td,
                    status="pending",
                )
                f = request.files.get(f"employee_file_{idx}")
                if f and f.filename:
                    row.attachment_data = f.read()
                    row.attachment_filename = f.filename
                    row.attachment_original_name = f.filename
                    row.attachment_mimetype = f.mimetype or "application/octet-stream"
                db.session.add(row)

        if is_payroll and req.amount is None and entries:
            req.amount = round(sum(
                float(e.get("monthly_salary") or 0) + float(e.get("td_da") or 0)
                for e in entries
            ), 2)

        for f in request.files.getlist("attachments"):
            if f and f.filename:
                db.session.add(CopperBookAttachment(
                    request_id=req.id, file_data=f.read(),
                    filename=f.filename, mimetype=f.mimetype or "application/octet-stream",
                ))

        detail_rows = {
            "Request Number": req.request_number,
            "Submitted By": req.raised_by_name or "—",
            "Department": req.department or "—",
            "Category": req.category or "—",
            "Purpose": req.purpose,
            "Submitted On": datetime.utcnow().strftime("%d %b %Y, %I:%M %p UTC"),
        }
        if getattr(req, "reference_date", None):
            detail_rows["Reference Date"] = req.reference_date.strftime("%d %b %Y")
        if req.amount is not None:
            detail_rows["Requested Amount"] = _fmt_money(req.amount)

        _notify_role_async(
            ["SuperAdmin", "Corporate"],
            in_app_message=f"New CopperBook {req.request_number} pending review.",
            related_id=req.id,
            email_subject=f"CopperBook — New Request {req.request_number}",
            email_heading="New CopperBook Request",
            email_details=detail_rows,
        )
        db.session.commit()

        return jsonify({"message": "Received", "id": req.id, "request_number": req.request_number}), 201

    except Exception as e:
        db.session.rollback()
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@cb_bp.route("/list", methods=["GET", "OPTIONS"])
@jwt_required()
def list_all():
    if request.method == "OPTIONS":
        return ("", 204)

    status = request.args.get("status")
    scope = request.args.get("scope", "finance")
    payroll_only = request.args.get("payroll") == "1"
    category = (request.args.get("category") or "").strip()
    start_date_str = (request.args.get("start_date") or "").strip()
    end_date_str = (request.args.get("end_date") or "").strip()
    search = (request.args.get("search") or "").strip()
    department = (request.args.get("department") or "").strip()
    page = max(1, request.args.get("page", 1, type=int))
    per_page = min(100, max(1, request.args.get("per_page", 25, type=int)))

    # "Capital Equity" chip is handled after grouping (so chip counts stay stable)
    equity_chip = status == "capital_equity"
    if equity_chip:
        status = None

    q = CopperBookRequest.query.options(selectinload(CopperBookRequest.employee_entries))

    if category:
        q = q.filter(CopperBookRequest.category == category)
    if scope == "ceo":
        q = q.filter(CopperBookRequest.assigned_to_role == "ceo")
    if payroll_only:
        q = q.filter(CopperBookRequest.is_payroll == True)  # noqa: E712
    if department:
        _dk = _dept_key(department)
        _col = func.lower(func.trim(CopperBookRequest.department))
        q = q.filter(or_(_col == _dk, _col.like(_dk + " (%")))

    # Date filter uses the same "effective date" as the ordering:
    # reference_date if present, otherwise the created date.
    eff_date_col = func.coalesce(
        CopperBookRequest.reference_date,
        func.date(CopperBookRequest.created_at),
    )

    start_d = end_d = None
    if start_date_str:
        try:
            start_d = datetime.strptime(start_date_str, "%Y-%m-%d").date()
            q = q.filter(eff_date_col >= start_d)
        except ValueError:
            start_d = None
    if end_date_str:
        try:
            end_d = datetime.strptime(end_date_str, "%Y-%m-%d").date()
            q = q.filter(eff_date_col <= end_d)
        except ValueError:
            end_d = None

    if search:
        like = f"%{search}%"
        q = q.filter(or_(
            CopperBookRequest.request_number.ilike(like),
            CopperBookRequest.department.ilike(like),
            CopperBookRequest.category.ilike(like),
            CopperBookRequest.purpose.ilike(like),
            CopperBookRequest.description.ilike(like),
            CopperBookRequest.raised_by_name.ilike(like),
        ))

    all_rows = (
        q.order_by(
            eff_date_col.desc(),
            CopperBookRequest.created_at.desc(),
        )
        .all()
    )

    flat = []
    for r in all_rows:
        groups = _status_groups(r)
        split = len(groups) > 1
        for g in groups:
            flat.append((r, g, split))

    summary = {"all": {
        "count": len(flat),
        "amount": round(sum((g[1] or 0) for _, g, _ in flat), 2),
    }}
    for st in VIEW_STATUSES:
        m = [x for x in flat if x[1][0] == st]
        summary[st] = {
            "count": len(m),
            "amount": round(sum((x[1][1] or 0) for x in m), 2),
        }
    eq_rows = [x for x in flat if _is_capital_equity(x[0])]
    summary["capital_equity"] = {
        "count": len(eq_rows),
        "amount": round(sum((x[1][1] or 0) for x in eq_rows), 2),
    }

    if equity_chip:
        sel = eq_rows
    elif status:
        sel = [x for x in flat if x[1][0] == status]
    else:
        sel = flat

    # Business Unit dropdown options: the fixed list of departments
    departments = list(BUSINESS_UNITS)

    total = len(sel)
    start = (page - 1) * per_page
    page_rows = sel[start:start + per_page]

    return jsonify({
        "requests": [_serialize_row(r, g, sp) for r, g, sp in page_rows],
        "summary": summary,
        "equity": _capital_equity_summary(start_d, end_d, department),
        "departments": departments,
        "view_total": round(sum((x[1][1] or 0) for x in sel), 2),
        "pagination": {
            "page": page, "per_page": per_page, "total": total,
            "pages": (total + per_page - 1) // per_page,
        },
    }), 200


@cb_bp.route("/<int:rid>", methods=["GET", "OPTIONS"])
@jwt_required()
def detail(rid):
    if request.method == "OPTIONS":
        return ("", 204)
    r = CopperBookRequest.query.get_or_404(rid)
    return jsonify(_serialize(r, with_files=True)), 200


# ─────────────────────────────────────────────────────────────────
# EDIT (PUT) and DELETE routes
# ─────────────────────────────────────────────────────────────────
@cb_bp.route("/<int:rid>", methods=["PUT", "OPTIONS"])
@jwt_required()
def update_request(rid):
    if request.method == "OPTIONS":
        return ("", 204)

    uid = int(get_jwt_identity())
    user = User.query.get(uid)
    req = CopperBookRequest.query.get_or_404(rid)

    if not user:
        return jsonify({"error": "User not found"}), 404
    if not _can_manage(user):
        return jsonify({"error": "You do not have permission to edit requests."}), 403

    data = request.get_json(silent=True) or {}
    purpose = (data.get("purpose") or req.purpose or "").strip()
    description = (data.get("description") or req.description or "").strip()
    remarks = (data.get("remarks") or "").strip() or None
    category = (data.get("category") or req.category or "").strip()
    department = (data.get("department") or req.department or "").strip()

    if not purpose:
        return jsonify({"error": "Purpose is required."}), 400
    # Only enforce the length rule when the description is actually being changed
    if description != (req.description or "").strip() and len(description) < 10:
        return jsonify({"error": "Description must be at least 10 characters."}), 400

    req.purpose = purpose
    req.description = description
    req.remarks = remarks
    if department:
        req.department = department
    if not req.is_payroll:
        req.category = category or None

    raw_ref = (data.get("reference_date") or "").strip()
    if raw_ref and hasattr(CopperBookRequest, "reference_date"):
        try:
            req.reference_date = datetime.strptime(raw_ref, "%Y-%m-%d").date()
        except ValueError:
            return jsonify({"error": "Invalid reference_date (YYYY-MM-DD)."}), 400

    # Payroll amount is derived from employee entries, so it is not editable.
    if not req.is_payroll and data.get("amount") not in (None, ""):
        try:
            amt = float(data.get("amount"))
        except (TypeError, ValueError):
            db.session.rollback()
            return jsonify({"error": "Invalid amount."}), 400
        if not math.isfinite(amt):
            db.session.rollback()
            return jsonify({"error": "Invalid amount."}), 400
        if amt > MAX_AMOUNT:
            db.session.rollback()
            return jsonify({
                "error": f"Amount is too large. The maximum allowed is {_fmt_money(MAX_AMOUNT)}."
            }), 400
        if amt > 0:
            req.amount = round(amt, 2)

    try:
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        traceback.print_exc()
        return jsonify({"error": f"Could not save the changes: {e.__class__.__name__}. Check the amount and date values."}), 400

    # Mirror the edit (including the reference date) to the Staff Portal
    synced, sync_msg = _sync_edit_to_staffportal(req)

    return jsonify({
        "message": "Updated.",
        "request": _serialize(req, with_files=True),
        "staffportal_synced": synced,
        "staffportal_message": None if synced else sync_msg,
    }), 200


@cb_bp.route("/<int:rid>", methods=["DELETE", "OPTIONS"])
@jwt_required()
def delete_request(rid):
    if request.method == "OPTIONS":
        return ("", 204)

    uid = int(get_jwt_identity())
    user = User.query.get(uid)
    req = CopperBookRequest.query.get_or_404(rid)

    if not user:
        return jsonify({"error": "User not found"}), 404
    if not _can_manage(user):
        return jsonify({"error": "You do not have permission to delete requests."}), 403

    request_number = req.request_number  # read before the object is deleted

    try:
        CopperBookEmployeeEntry.query.filter_by(request_id=req.id).delete(synchronize_session=False)
        CopperBookAssignee.query.filter_by(request_id=req.id).delete(synchronize_session=False)
        CopperBookAttachment.query.filter_by(request_id=req.id).delete(synchronize_session=False)
        db.session.expire(req)
        db.session.delete(req)
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        traceback.print_exc()
        return jsonify({"error": f"Delete failed: {e}"}), 500

    return jsonify({"message": f"Deleted {request_number}."}), 200


# ─────────────────────────────────────────────────────────────────
# ACTIONS (Finance, CEO, Employee)
# ─────────────────────────────────────────────────────────────────
@cb_bp.route("/<int:rid>/finance-action", methods=["POST", "OPTIONS"])
@jwt_required()
def finance_action(rid):
    if request.method == "OPTIONS":
        return ("", 204)
    uid = get_jwt_identity()
    try:
        uid = int(uid)
    except Exception:
        pass
    user = User.query.get(uid)
    if not user or user.role not in ("SuperAdmin", "admin", "Corporate"):
        return jsonify({"error": "Forbidden"}), 403

    r = CopperBookRequest.query.get_or_404(rid)
    payload = request.get_json(silent=True) or {}
    action = payload.get("action")
    remarks = (payload.get("remarks") or "").strip()
    if action not in ("approve", "reject", "forward_to_ceo"):
        return jsonify({"error": "Invalid action."}), 400
    if action == "reject" and not remarks:
        return jsonify({"error": "Rejection reason is required."}), 400

    if action == "approve":
        r.status = "approved"
    elif action == "reject":
        r.status = "rejected"
    else:
        r.status = "forwarded_to_ceo"
        r.assigned_to_role = "ceo"

    if r.is_payroll and action in ("approve", "reject"):
        new_entry_status = "approved" if action == "approve" else "rejected"
        for e in r.employee_entries:
            if e.status == "pending":
                e.status = new_entry_status
                e.remarks = e.remarks or remarks or None
                e.action_by = user.name
                e.action_at = datetime.utcnow()

    r.finance_action_by = user.name
    r.finance_action_at = datetime.utcnow()
    r.finance_remarks = remarks or None
    db.session.commit()

    _sync_to_staffportal(r)

    verb = {"approve": "approved", "reject": "rejected", "forward_to_ceo": "forwarded to the CEO"}[action]
    _notify_role_async(
        ["SuperAdmin", "Corporate"],
        in_app_message=f"CopperBook {r.request_number} was {verb} by {user.name}.",
        related_id=r.id,
        email_subject=f"CopperBook — Request {r.request_number} {verb.title()}",
        email_heading=f"CopperBook Request {verb.title()}",
        email_details={
            "Request Number": r.request_number,
            "Amount": _fmt_money(_request_amount(r)),
            "Action": verb.title(),
            **({"Remarks": remarks} if remarks else {}),
        },
    )
    db.session.commit()

    return jsonify({"message": f"Marked {r.status}.", "request": _serialize(r)}), 200


@cb_bp.route("/<int:rid>/ceo-action", methods=["POST", "OPTIONS"])
@jwt_required()
def ceo_action(rid):
    if request.method == "OPTIONS":
        return ("", 204)
    uid = get_jwt_identity()
    try:
        uid = int(uid)
    except Exception:
        pass
    user = User.query.get(uid)
    if not user or user.role not in ("SuperAdmin", "admin"):
        return jsonify({"error": "Only SuperAdmin / CEO can act."}), 403

    r = CopperBookRequest.query.get_or_404(rid)
    if r.status != "forwarded_to_ceo":
        return jsonify({"error": f"Request {r.request_number} is not pending CEO action."}), 400

    payload = request.get_json(silent=True) or {}
    action = payload.get("action")
    remarks = (payload.get("remarks") or "").strip()

    if action not in ("approve", "reject"):
        return jsonify({"error": "Invalid action."}), 400
    if action == "reject" and not remarks:
        return jsonify({"error": "Rejection reason is required."}), 400

    now = datetime.utcnow()

    if action == "approve":
        r.status = "approved"
        if r.is_payroll:
            for e in r.employee_entries:
                if e.status == "pending":
                    e.status = "approved"
                    e.remarks = e.remarks or remarks or None
                    e.action_by = user.name
                    e.action_at = now
    else:
        r.status = "rejected"
        if r.is_payroll:
            for e in r.employee_entries:
                if e.status == "pending":
                    e.status = "rejected"
                    e.remarks = e.remarks or remarks or None
                    e.action_by = user.name
                    e.action_at = now

    r.ceo_action_by = user.name
    r.ceo_action_at = now
    r.ceo_remarks = remarks or None
    db.session.commit()

    _sync_to_staffportal(r)

    verb = "approved" if action == "approve" else "rejected"
    _notify_role_async(
        ["SuperAdmin", "Corporate"],
        in_app_message=f"CopperBook {r.request_number} was {verb} by CEO {user.name}.",
        related_id=r.id,
        email_subject=f"CopperBook — Request {r.request_number} {verb.title()} by CEO",
        email_heading=f"CEO {verb.title()} CopperBook Request {r.request_number}",
        email_details={
            "Request Number": r.request_number,
            "Decision": verb.title(),
            **({"Remarks": remarks} if remarks else {}),
        },
    )
    db.session.commit()

    return jsonify({"message": f"Request {verb}.", "request": _serialize(r, with_files=True)}), 200


@cb_bp.route("/employee-entry/<int:entry_id>/action", methods=["POST", "OPTIONS"])
@jwt_required()
def employee_entry_action(entry_id):
    if request.method == "OPTIONS":
        return ("", 204)
    uid = get_jwt_identity()
    try:
        uid = int(uid)
    except Exception:
        pass
    user = User.query.get(uid)
    if not user or user.role not in ("SuperAdmin", "admin"):
        return jsonify({"error": "Only SuperAdmin / CEO can act."}), 403

    entry = CopperBookEmployeeEntry.query.get_or_404(entry_id)
    req = entry.request

    payload = request.get_json(silent=True) or {}
    action = payload.get("action")
    remarks = (payload.get("remarks") or "").strip()
    if action not in ("approve", "reject"):
        return jsonify({"error": "Invalid action."}), 400

    entry.status = "approved" if action == "approve" else "rejected"
    entry.remarks = remarks or None
    entry.action_by = user.name
    entry.action_at = datetime.utcnow()

    req.status = _roll_up_status(req)
    if req.status != "forwarded_to_ceo":
        req.ceo_action_by = user.name
        req.ceo_action_at = datetime.utcnow()

    db.session.commit()
    _sync_to_staffportal(req)

    return jsonify({"message": "Entry updated.", "entry": _entry_to_dict(entry)}), 200


@cb_bp.route("/<int:rid>/approve-all-entries", methods=["POST", "OPTIONS"])
@jwt_required()
def approve_all_entries(rid):
    if request.method == "OPTIONS":
        return ("", 204)
    uid = get_jwt_identity()
    try:
        uid = int(uid)
    except Exception:
        pass
    user = User.query.get(uid)
    if not user or user.role not in ("SuperAdmin", "admin"):
        return jsonify({"error": "Forbidden"}), 403

    req = CopperBookRequest.query.get_or_404(rid)
    if not req.is_payroll:
        return jsonify({"error": "Not a payroll request."}), 400

    payload = request.get_json(silent=True) or {}
    default_remarks = (payload.get("remarks") or "").strip() or None

    now = datetime.utcnow()
    approved_count = 0
    for e in req.employee_entries:
        if e.status != "pending":
            continue
        e.status = "approved"
        e.remarks = e.remarks or default_remarks
        e.action_by = user.name
        e.action_at = now
        approved_count += 1

    req.status = _roll_up_status(req)
    req.ceo_action_by = user.name
    req.ceo_action_at = now
    req.ceo_remarks = default_remarks
    db.session.commit()
    _sync_to_staffportal(req)

    _notify_role_async(
        ["SuperAdmin", "Corporate"],
        in_app_message=f"{approved_count} pending payroll entries in {req.request_number} were approved by {user.name}.",
        related_id=req.id,
        email_subject=f"Payroll — {approved_count} Entries Approved in {req.request_number}",
        email_heading="Payroll Batch Approval Complete",
        email_intro=(
            f"Hello,\n\n{approved_count} pending payroll entries in request "
            f"{req.request_number} were approved by {user.name} in a single action."
        ),
        email_details={
            "Request Number": req.request_number,
            "Entries Approved": str(approved_count),
            "Approved Amount": _fmt_money(_sum_by(req, "approved")),
            "Rejected Amount": _fmt_money(_sum_by(req, "rejected")),
            "Grand Total": _fmt_money(_request_amount(req)),
            "Request Status": (req.status or "").replace("_", " ").title(),
            "Approved By": user.name,
            "Approved On": now.strftime("%d %b %Y, %I:%M %p UTC"),
            **({"Remarks": default_remarks} if default_remarks else {}),
        },
        email_message="This is a system notification. No action is required from your side.",
        email_closing="Best regards,\n" + BRAND,
    )
    db.session.commit()

    return jsonify({
        "message": f"Approved {approved_count} entries.",
        "approved_count": approved_count,
        "request": _serialize(req, with_files=True),
    }), 200


# ─────────────────────────────────────────────────────────────────
# ATTACHMENTS
# ─────────────────────────────────────────────────────────────────
@cb_bp.route("/attachment/<int:aid>", methods=["GET", "OPTIONS"])
@jwt_required()
def download_attachment(aid):
    if request.method == "OPTIONS":
        return ("", 204)
    a = CopperBookAttachment.query.get_or_404(aid)
    return Response(
        a.file_data, mimetype=a.mimetype or "application/octet-stream",
        headers={"Content-Disposition": f'attachment; filename="{a.filename}"'},
    )


@cb_bp.route("/employee-attachment/<int:entry_id>", methods=["GET", "OPTIONS"])
@jwt_required()
def download_employee_attachment(entry_id):
    if request.method == "OPTIONS":
        return ("", 204)
    e = CopperBookEmployeeEntry.query.get_or_404(entry_id)
    if not e.attachment_data:
        return jsonify({"error": "No file attached"}), 404
    return Response(
        e.attachment_data,
        mimetype=e.attachment_mimetype or "application/octet-stream",
        headers={"Content-Disposition":
                 f'attachment; filename="{e.attachment_original_name or e.attachment_filename}"'},
    )
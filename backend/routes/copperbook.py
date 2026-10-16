# billing-portal/backend/routes/copperbook.py
import os
import json
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

# Chips on the main CopperBook page
VIEW_STATUSES = ("pending", "forwarded_to_ceo", "approved", "rejected")
# Statuses that are decided per employee entry for payroll requests
ENTRY_VIEWS = ("pending", "approved", "rejected")


# ─────────────────────────────────────────────────────────────────
def _service_token_ok():
    expected = os.getenv("FINANCEHUB_SERVICE_TOKEN") or ""
    got = request.headers.get("X-Service-Token") or ""
    return bool(expected) and expected == got


def _fmt_money(v):
    try:
        return f"₹ {float(v):,.2f}"
    except Exception:
        return "—"


def _request_amount(r):
    """Stored amount, or fall back to the sum of payroll entries."""
    if r.amount is not None:
        return float(r.amount)
    if r.is_payroll and r.employee_entries:
        return float(sum((e.total_amount or 0) for e in r.employee_entries))
    return None


def _roll_up_status(req):
    """Request status derived from its employee entries."""
    statuses = [e.status for e in req.employee_entries]
    if not statuses:
        return req.status
    if all(s == "approved" for s in statuses):
        return "approved"
    if all(s == "rejected" for s in statuses):
        return "rejected"
    if any(s == "pending" for s in statuses):
        return "forwarded_to_ceo"      # still has entries waiting
    return "partially_approved"        # mix of approved + rejected, none pending


def _sum_by(r, status):
    return float(sum((e.total_amount or 0) for e in r.employee_entries if e.status == status))


def _count_by(r, status):
    return sum(1 for e in r.employee_entries if e.status == status)


def _status_groups(r):
    """Split a request into (status_key, amount, entry_count) groups.

    Payroll requests with employee entries produce ONE group per entry status,
    so CB-1025 with one approved + one rejected entry becomes two rows:
        (approved, 46.00, 1) and (rejected, 129.00, 1)
    Pending entries inherit the request-level status (pending / forwarded_to_ceo,
    or approved / rejected if Finance decided the whole request).
    Everything else stays a single group using the request's own status.
    """
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
    # Keep the whole-request values under new names...
    d["request_status"] = r.status
    d["request_amount"] = _request_amount(r)
    # ...and make the standard fields describe THIS row only, so existing
    # pages that read `amount` / `status` show the per-status split.
    d["status"] = key
    d["amount"] = amount
    d["row_key"] = f"{r.id}-{key}"
    d["display_status"] = key
    d["display_amount"] = amount
    d["display_count"] = count
    d["is_split"] = is_split
    return d


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
    """Bulk-insert notification rows + fire branded HTML emails."""
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
        closing=email_closing or (
            "Thank you.\n\nWarm regards,\n" + BRAND
        ),
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
        "business_unit": r.department,  # Department == Business Unit
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
        "amount": _request_amount(r),
        # what the main page should show for the active chip
        "display_amount": _request_amount(r),
        "display_status": r.status,
        # per-status split of the payroll entries
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
        "status": req.status,  # may now be "partially_approved"
        "finance_action_by": req.finance_action_by,
        "finance_remarks": req.finance_remarks,
        "ceo_action_by": req.ceo_action_by,
        "ceo_remarks": req.ceo_remarks,
        # includes employee_id, which the staff portal uses to match entries
        "employee_entries": [_entry_to_dict(e) for e in req.employee_entries],
    }
    try:
        resp = requests.post(
            f"{base}/api/copperbook/sync",
            json=payload,
            headers={"X-Service-Token": token},
            timeout=3,
        )
        print(f"[copperbook→staffportal] {req.request_number} {resp.status_code}")
    except Exception as e:
        print("[copperbook→staffportal] FAILED:", e)


# ─────────────────────────────────────────────────────────────────
# INTAKE
# ─────────────────────────────────────────────────────────────────
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
                    row.attachment_data = f.read()  # previously the content was dropped
                    row.attachment_filename = f.filename
                    row.attachment_original_name = f.filename
                    row.attachment_mimetype = f.mimetype or "application/octet-stream"
                db.session.add(row)

        # Fallback: per-employee payroll without an amount → store the grand total
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

        # ── Professional email to Finance + CEO ─────────────────────
        detail_rows = {
            "Request Number": req.request_number,
            "Submitted By": req.raised_by_name or "—",
            "Department": req.department or "—",
            "Category": req.category or "—",
            "Purpose": req.purpose,
            "Submitted On": datetime.utcnow().strftime("%d %b %Y, %I:%M %p UTC"),
        }
        if req.amount is not None:
            detail_rows["Requested Amount"] = _fmt_money(req.amount)
        if is_payroll and entries:
            detail_rows["Payroll Entries"] = str(len(entries))

        _notify_role_async(
            ["SuperAdmin", "Corporate"],
            in_app_message=f"New CopperBook {req.request_number} from {req.raised_by_name} ({req.department}) — pending Finance review.",
            related_id=req.id,
            email_subject=f"CopperBook — New Request {req.request_number} Pending Your Review",
            email_heading="A New CopperBook Request Requires Your Review",
            email_intro=(
                "Hello,\n\n"
                "A new CopperBook request has been submitted through the Staff Portal and is now pending "
                "Finance review. Please log in to the Finance Hub to review the full details and record a decision."
            ),
            email_details=detail_rows,
            email_message=(
                "You can approve the request, reject it with remarks, or forward it to the CEO "
                "for a final decision — all from the CopperBook page in the Finance Hub."
            ),
            email_closing="Thank you for your timely attention.\n\nBest regards,\n" + BRAND,
        )
        db.session.commit()

        return jsonify({"message": "Received", "id": req.id, "request_number": req.request_number}), 201

    except Exception as e:
        db.session.rollback()
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


# ─────────────────────────────────────────────────────────────────
# LIST — supports status, scope, payroll, category, date range, and search
# ─────────────────────────────────────────────────────────────────
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
    page = max(1, request.args.get("page", 1, type=int))
    per_page = min(100, max(1, request.args.get("per_page", 25, type=int)))

    q = CopperBookRequest.query.options(selectinload(CopperBookRequest.employee_entries))
    if scope == "ceo":
        q = q.filter(CopperBookRequest.assigned_to_role == "ceo")
    if payroll_only:
        q = q.filter(CopperBookRequest.is_payroll == True)  # noqa: E712
    if category:
        q = q.filter(CopperBookRequest.category == category)

    # ── Date range filter ─────────────────────────────────────────
    if start_date_str:
        try:
            sd = datetime.strptime(start_date_str, "%Y-%m-%d")
            q = q.filter(CopperBookRequest.created_at >= sd)
        except ValueError:
            pass
    if end_date_str:
        try:
            ed = datetime.strptime(end_date_str, "%Y-%m-%d") + timedelta(days=1)
            q = q.filter(CopperBookRequest.created_at < ed)
        except ValueError:
            pass

    # ── Search filter ─────────────────────────────────────────────
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

    all_rows = q.order_by(CopperBookRequest.created_at.desc()).all()

    # ── Expand each request into one row per status group ─────────
    flat = []  # (request, group, is_split)
    for r in all_rows:
        groups = _status_groups(r)
        split = len(groups) > 1
        for g in groups:
            flat.append((r, g, split))

    # ── Chip counts + totals (same filters, one entry per chip) ───
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

    # ── Apply the selected chip, then paginate ────────────────────
    sel = [x for x in flat if x[1][0] == status] if status else flat
    total = len(sel)
    start = (page - 1) * per_page
    page_rows = sel[start:start + per_page]

    return jsonify({
        "requests": [_serialize_row(r, g, sp) for r, g, sp in page_rows],
        "summary": summary,
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
# FINANCE ACTION
# ─────────────────────────────────────────────────────────────────
@cb_bp.route("/<int:rid>/finance-action", methods=["POST", "OPTIONS"])
@jwt_required()
def finance_action(rid):
    if request.method == "OPTIONS":
        return ("", 204)
    uid = get_jwt_identity()
    try: uid = int(uid)
    except: pass
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
        r.status = "forwarded_to_ceo"; r.assigned_to_role = "ceo"

    # Whole-request approve/reject also decides the entries still pending,
    # so the Approved / Rejected chips stay consistent.
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
        email_intro=f"Hello,\n\n{user.name} has {verb} CopperBook request {r.request_number}.",
        email_details={
            "Request Number": r.request_number,
            "Department": r.department or "—",
            "Category": r.category or "—",
            "Amount": _fmt_money(_request_amount(r)),
            "Action": verb.title(),
            "Action By": user.name,
            "Action On": datetime.utcnow().strftime("%d %b %Y, %I:%M %p UTC"),
            **({"Remarks": remarks} if remarks else {}),
        },
        email_message="This is a system notification. No action is required from your side.",
        email_closing="Best regards,\n" + BRAND,
    )
    db.session.commit()  # persist the notification rows added above

    return jsonify({"message": f"Marked {r.status}.", "request": _serialize(r)}), 200


# ─────────────────────────────────────────────────────────────────
# CEO ACTION (final decision on requests forwarded by Finance)
# ─────────────────────────────────────────────────────────────────
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

    # Only allow CEO to act on requests that were actually forwarded
    if r.status != "forwarded_to_ceo":
        return jsonify({
            "error": f"Request {r.request_number} is not pending CEO action "
                     f"(current status: {r.status})."
        }), 400

    payload = request.get_json(silent=True) or {}
    action = payload.get("action")
    remarks = (payload.get("remarks") or "").strip()

    if action not in ("approve", "reject"):
        return jsonify({"error": "Invalid action. Must be 'approve' or 'reject'."}), 400
    if action == "reject" and not remarks:
        return jsonify({"error": "Rejection reason is required."}), 400

    now = datetime.utcnow()

    if action == "approve":
        r.status = "approved"
        # Approve any employee entries that are still pending
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

    # Sync back to the staff portal
    _sync_to_staffportal(r)

    # Notify Finance + SuperAdmin
    verb = "approved" if action == "approve" else "rejected"
    _notify_role_async(
        ["SuperAdmin", "Corporate"],
        in_app_message=(
            f"CopperBook {r.request_number} was {verb} by CEO {user.name}."
        ),
        related_id=r.id,
        email_subject=f"CopperBook — Request {r.request_number} {verb.title()} by CEO",
        email_heading=f"CEO {verb.title()} CopperBook Request {r.request_number}",
        email_intro=(
            f"Hello,\n\nCEO {user.name} has {verb} CopperBook request "
            f"{r.request_number}."
        ),
        email_details={
            "Request Number": r.request_number,
            "Department": r.department or "—",
            "Category": r.category or "—",
            "Amount": _fmt_money(_request_amount(r)),
            "Decision": verb.title(),
            "Decided By": user.name,
            "Decided On": now.strftime("%d %b %Y, %I:%M %p UTC"),
            **({"Remarks": remarks} if remarks else {}),
        },
        email_message="This is a system notification. No action is required from your side.",
        email_closing="Best regards,\n" + BRAND,
    )
    db.session.commit()  # persist the notification rows added above

    return jsonify({
        "message": f"Request {verb}.",
        "request": _serialize(r, with_files=True),
    }), 200


# ─────────────────────────────────────────────────────────────────
# PER-EMPLOYEE ACTION
# ─────────────────────────────────────────────────────────────────
@cb_bp.route("/employee-entry/<int:entry_id>/action", methods=["POST", "OPTIONS"])
@jwt_required()
def employee_entry_action(entry_id):
    if request.method == "OPTIONS":
        return ("", 204)
    uid = get_jwt_identity()
    try: uid = int(uid)
    except: pass
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

    # Request status is derived from the entries (approved / rejected / partially_approved)
    req.status = _roll_up_status(req)
    if req.status != "forwarded_to_ceo":  # nothing pending anymore
        req.ceo_action_by = user.name
        req.ceo_action_at = datetime.utcnow()

    db.session.commit()
    _sync_to_staffportal(req)

    verb = "approved" if entry.status == "approved" else "rejected"
    _notify_role_async(
        ["SuperAdmin", "Corporate"],
        in_app_message=f"Payroll entry for {entry.employee_name} in {req.request_number} was {entry.status}.",
        related_id=req.id,
        email_subject=f"Payroll — Entry for {entry.employee_name} {verb.title()}",
        email_heading=f"Payroll Entry {verb.title()}",
        email_intro=(
            f"Hello,\n\nThe payroll entry for {entry.employee_name} in request "
            f"{req.request_number} has been {verb} by {user.name}."
        ),
        email_details={
            "Request Number": req.request_number,
            "Employee": entry.employee_name,
            "Monthly Salary": _fmt_money(entry.monthly_salary),
            "TD / DA": _fmt_money(entry.td_da),
            "Total": _fmt_money(entry.total_amount),
            "Status": entry.status.title(),
            **({"Remarks": entry.remarks} if entry.remarks else {}),
        },
        email_message="This is a system notification. No action is required from your side.",
        email_closing="Best regards,\n" + BRAND,
    )
    db.session.commit()  # persist the notification rows added above

    return jsonify({"message": "Entry updated.", "entry": _entry_to_dict(entry)}), 200


# ─────────────────────────────────────────────────────────────────
# BATCH APPROVE
# ─────────────────────────────────────────────────────────────────
@cb_bp.route("/<int:rid>/approve-all-entries", methods=["POST", "OPTIONS"])
@jwt_required()
def approve_all_entries(rid):
    if request.method == "OPTIONS":
        return ("", 204)
    uid = get_jwt_identity()
    try: uid = int(uid)
    except: pass
    user = User.query.get(uid)
    if not user or user.role not in ("SuperAdmin", "admin"):
        return jsonify({"error": "Only SuperAdmin / CEO can act."}), 403

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

    # Previously rejected entries stay rejected → request may be "partially_approved"
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
    db.session.commit()  # persist the notification rows added above

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
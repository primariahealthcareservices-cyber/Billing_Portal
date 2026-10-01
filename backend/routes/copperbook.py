# billing-portal/backend/routes/copperbook.py
import os
import traceback
from datetime import datetime
import requests

from flask import Blueprint, request, jsonify, Response, current_app
from flask_jwt_extended import jwt_required, get_jwt_identity

from models import db, User, Notification
from models_copperbook import (
    CopperBookRequest, CopperBookAssignee, CopperBookAttachment,
)
from utils import role_required, send_email

cb_bp = Blueprint("copperbook", __name__, url_prefix="/api/copperbook")


# ───────────────────────────────────────────────────────────────────────
# Helpers
# ───────────────────────────────────────────────────────────────────────
def _service_token_ok():
    expected = os.getenv("FINANCEHUB_SERVICE_TOKEN") or ""
    got = request.headers.get("X-Service-Token") or ""
    return bool(expected) and expected == got


def _notify_role(role_names, message, related_id=None):
    if isinstance(role_names, str):
        role_names = [role_names]
    users = User.query.filter(User.role.in_(role_names), User.is_active == True).all()
    for u in users:
        try:
            db.session.add(Notification(
                user_id=u.id, message=message, is_read=False,
                related_type="copperbook", related_id=related_id,
            ))
        except Exception:
            pass
        if u.email:
            send_email(u.email, "CopperBook Update", message)
    try:
        db.session.commit()
    except Exception:
        db.session.rollback()


def _serialize(r, with_files=False):
    data = {
        "id": r.id,
        "remote_id": r.remote_id,
        "request_number": r.request_number,
        "department": r.department,
        "assignee_mode": r.assignee_mode,
        "assignee_names": [a.employee_name for a in r.assignees],
        "raised_by_name": r.raised_by_name,
        "raised_by_email": r.raised_by_email,
        "purpose": r.purpose,
        "description": r.description,
        "remarks": r.remarks,
        "status": r.status,
        "assigned_to_role": r.assigned_to_role,
        "finance_action_by": r.finance_action_by,
        "finance_action_at": r.finance_action_at.isoformat() if r.finance_action_at else None,
        "finance_remarks": r.finance_remarks,
        "ceo_action_by": r.ceo_action_by,
        "ceo_action_at": r.ceo_action_at.isoformat() if r.ceo_action_at else None,
        "ceo_remarks": r.ceo_remarks,
        "created_at": r.created_at.isoformat() if r.created_at else None,
    }
    if with_files:
        data["attachments"] = [{"id": f.id, "filename": f.filename} for f in r.attachments]
    return data


def _sync_to_staffportal(req: CopperBookRequest):
    """Push the finance/CEO decision back to StaffPortal."""
    base = (os.getenv("STAFFPORTAL_BASE_URL") or "http://localhost:5000").rstrip("/")
    token = os.getenv("COPPERBOOK_CALLBACK_TOKEN") or ""

    if not token:
        print("[copperbook→staffportal] SKIPPED — COPPERBOOK_CALLBACK_TOKEN not set in env")
        return

    payload = {
        "remote_id": req.remote_id,
        "status": req.status,
        "finance_action_by": req.finance_action_by,
        "finance_remarks": req.finance_remarks,
        "ceo_action_by": req.ceo_action_by,
        "ceo_remarks": req.ceo_remarks,
    }

    url = f"{base}/api/copperbook/sync"
    print(f"[copperbook→staffportal] POST {url} "
          f"remote_id={req.remote_id} status={req.status}")

    try:
        resp = requests.post(
            url, json=payload,
            headers={"X-Service-Token": token},
            timeout=8,
        )
        print(f"[copperbook→staffportal] HTTP {resp.status_code}: {resp.text[:300]}")
    except Exception as e:
        print("[copperbook→staffportal] FAILED:", e)


# ───────────────────────────────────────────────────────────────────────
# INTAKE (server-to-server from StaffPortal)
# ───────────────────────────────────────────────────────────────────────
@cb_bp.route("/intake", methods=["POST", "OPTIONS"])
def intake():
    if request.method == "OPTIONS":
        return ("", 204)

    if not _service_token_ok():
        print("[copperbook/intake] token mismatch — rejecting")
        return jsonify({"error": "Unauthorized"}), 401

    try:
        d = request.form
        req = CopperBookRequest(
            request_number=d.get("request_number") or "PENDING",
            remote_id=int(d.get("remote_id")) if d.get("remote_id") else None,
            department=d.get("department") or "",
            assignee_mode=d.get("assignee_mode") or "department",
            raised_by_name=d.get("raised_by_name"),
            raised_by_email=d.get("raised_by_email"),
            purpose=d.get("purpose") or "",
            description=d.get("description") or "",
            remarks=d.get("remarks") or None,
            status="pending",
            assigned_to_role="finance",
        )
        db.session.add(req)
        db.session.flush()

        names_raw = (d.get("assignee_names") or "").strip()
        if names_raw:
            for name in names_raw.split(","):
                name = name.strip()
                if name:
                    db.session.add(CopperBookAssignee(
                        request_id=req.id, employee_name=name,
                    ))

        for f in request.files.getlist("attachments"):
            if f and f.filename:
                db.session.add(CopperBookAttachment(
                    request_id=req.id,
                    file_data=f.read(),
                    filename=f.filename,
                    mimetype=f.mimetype or "application/octet-stream",
                ))

        db.session.commit()
        print(f"[copperbook/intake] {req.request_number} from {req.raised_by_name}")

        _notify_role(
            ["SuperAdmin", "Corporate"],
            f"New CopperBook {req.request_number} from {req.raised_by_name} ({req.department}) — pending review",
            related_id=req.id,
        )

        return jsonify({
            "message": "Received",
            "id": req.id,
            "request_number": req.request_number,
        }), 201

    except Exception as e:
        db.session.rollback()
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


# ───────────────────────────────────────────────────────────────────────
# LIST
# ───────────────────────────────────────────────────────────────────────
@cb_bp.route("/list", methods=["GET", "OPTIONS"])
@jwt_required()
def list_all():
    if request.method == "OPTIONS":
        return ("", 204)

    uid = get_jwt_identity()
    try:
        uid = int(uid)
    except Exception:
        pass
    user = User.query.get(uid)
    if not user:
        return jsonify({"error": "User not found"}), 404

    status = request.args.get("status")
    scope = request.args.get("scope", "finance")

    q = CopperBookRequest.query
    if scope == "ceo":
        q = q.filter(CopperBookRequest.assigned_to_role == "ceo")
    if status:
        q = q.filter(CopperBookRequest.status == status)

    rows = q.order_by(CopperBookRequest.created_at.desc()).all()
    return jsonify({"requests": [_serialize(r) for r in rows]}), 200


@cb_bp.route("/<int:rid>", methods=["GET", "OPTIONS"])
@jwt_required()
def detail(rid):
    if request.method == "OPTIONS":
        return ("", 204)
    r = CopperBookRequest.query.get_or_404(rid)
    return jsonify(_serialize(r, with_files=True)), 200


# ───────────────────────────────────────────────────────────────────────
# FINANCE ACTION
# ───────────────────────────────────────────────────────────────────────
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
        return jsonify({"error": "Only Finance / SuperAdmin can act."}), 403

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

    r.finance_action_by = user.name
    r.finance_action_at = datetime.utcnow()
    r.finance_remarks = remarks or None
    db.session.commit()

    print(f"[copperbook] {r.request_number} → {r.status} by {user.name}")

    _sync_to_staffportal(r)

    if action == "forward_to_ceo":
        _notify_role("SuperAdmin", f"CopperBook {r.request_number} forwarded to you.", related_id=r.id)
    else:
        _notify_role(["SuperAdmin", "Corporate"],
                     f"CopperBook {r.request_number} marked {r.status}.", related_id=r.id)

    return jsonify({"message": f"Marked {r.status}.", "request": _serialize(r)}), 200


# ───────────────────────────────────────────────────────────────────────
# CEO ACTION
# ───────────────────────────────────────────────────────────────────────
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
        return jsonify({"error": "Only CEO / SuperAdmin can act."}), 403

    r = CopperBookRequest.query.get_or_404(rid)
    payload = request.get_json(silent=True) or {}
    action = payload.get("action")
    remarks = (payload.get("remarks") or "").strip()

    if action not in ("approve", "reject"):
        return jsonify({"error": "Invalid action."}), 400
    if action == "reject" and not remarks:
        return jsonify({"error": "Rejection reason is required."}), 400

    r.status = "approved" if action == "approve" else "rejected"
    r.ceo_action_by = user.name
    r.ceo_action_at = datetime.utcnow()
    r.ceo_remarks = remarks or None
    db.session.commit()

    print(f"[copperbook] CEO {r.status} {r.request_number}")

    _sync_to_staffportal(r)
    _notify_role(["SuperAdmin", "Corporate"],
                 f"CEO {r.status} CopperBook {r.request_number}.", related_id=r.id)

    return jsonify({"message": f"CEO marked {r.status}.", "request": _serialize(r)}), 200


# ───────────────────────────────────────────────────────────────────────
# ATTACHMENT DOWNLOAD
# ───────────────────────────────────────────────────────────────────────
@cb_bp.route("/attachment/<int:aid>", methods=["GET", "OPTIONS"])
@jwt_required()
def download_attachment(aid):
    if request.method == "OPTIONS":
        return ("", 204)
    a = CopperBookAttachment.query.get_or_404(aid)
    return Response(
        a.file_data,
        mimetype=a.mimetype or "application/octet-stream",
        headers={"Content-Disposition": f'attachment; filename="{a.filename}"'},
    )
# backend/routes/auth.py
import json
import random
import secrets
import time
from flask import Blueprint, request, jsonify
from flask_jwt_extended import create_access_token, jwt_required, get_jwt_identity, get_jwt

from models import db, User
from utils import send_email, get_redis_client

auth_bp = Blueprint("auth", __name__, url_prefix="/api/auth")

OTP_EXPIRY_SECONDS = 600
VERIFY_GRACE_SECONDS = 30
RESET_OTP_TTL = 600          # 10 minutes for password-reset OTP
TWO_FA_ROLES = {"admin", "superadmin", "salesenterprise"}

BRAND = "Primaria HealthCare Services"


# ─────────────────────────────────────────────────────────────────
# Redis helpers
# ─────────────────────────────────────────────────────────────────
def _otp_key(temp_token):
    return f"2fa:otp:{temp_token}"


def _store_2fa(temp_token, payload):
    get_redis_client().set(_otp_key(temp_token), json.dumps(payload), ex=OTP_EXPIRY_SECONDS)


def _load_2fa(temp_token):
    raw = get_redis_client().get(_otp_key(temp_token))
    return json.loads(raw) if raw else None


def _update_2fa(temp_token, payload):
    get_redis_client().set(_otp_key(temp_token), json.dumps(payload), keepttl=True)


def _delete_2fa(temp_token):
    get_redis_client().delete(_otp_key(temp_token))


# ─────────────────────────────────────────────────────────────────
# Shared branded HTML email helper
# ─────────────────────────────────────────────────────────────────
def _branded_otp_html(heading: str, intro: str, otp_code: str, closing: str) -> str:
    return f"""<!DOCTYPE html>
<html>
  <body style="margin:0;padding:0;background:#f5f7fb;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" cellspacing="0" cellpadding="0" style="width:100%;background:#f5f7fb;padding:24px 0;">
      <tr><td align="center">
        <table role="presentation" cellspacing="0" cellpadding="0" style="max-width:520px;width:100%;background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 4px 18px rgba(15,23,42,0.06);">
          <tr>
            <td style="padding:22px 26px;background:linear-gradient(135deg,#0ea5e9 0%,#2563eb 100%);">
              <div style="color:#ffffff;font-size:17px;font-weight:700;">{BRAND}</div>
              <div style="color:#dbeafe;font-size:12px;margin-top:2px;">Finance Hub</div>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 26px;">
              <h2 style="margin:0;color:#0f172a;font-size:20px;">{heading}</h2>
              <p style="margin:12px 0 0;color:#475569;font-size:14px;line-height:1.6;">{intro}</p>
              <div style="margin:22px 0;padding:18px;text-align:center;background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;">
                <div style="font-size:12px;color:#1e40af;letter-spacing:1px;font-weight:600;">YOUR CODE</div>
                <div style="font-size:32px;font-weight:800;color:#1e3a8a;letter-spacing:6px;margin-top:6px;">{otp_code}</div>
              </div>
              <p style="margin:0;color:#64748b;font-size:13px;">{closing}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:18px 26px;border-top:1px solid #e2e8f0;background:#f8fafc;color:#94a3b8;font-size:11px;">
              This is an automated message from {BRAND}.<br/>
              Please do not reply directly to this email.
            </td>
          </tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>"""


# ─────────────────────────────────────────────────────────────────
# Send OTP email for 2FA login
# ─────────────────────────────────────────────────────────────────
def send_otp_email(user_email, otp_code):
    subject = "Finance Hub — Verification Code"
    body = f"Your OTP code is: {otp_code}. It expires in 10 minutes."
    html = _branded_otp_html(
        heading="Your Verification Code",
        intro="Use the code below to complete your sign-in to Finance Hub.",
        otp_code=otp_code,
        closing="This code is valid for 10 minutes. Do not share it with anyone.",
    )
    send_email(user_email, subject, body, html_body=html)


def send_reset_email(user_email, otp_code):
    subject = "Finance Hub — Password Reset Code"
    body = f"Your password reset code is: {otp_code}. It expires in 10 minutes."
    html = _branded_otp_html(
        heading="Your Password Reset Code",
        intro="You requested to reset the password for your Finance Hub account. Enter the code below to continue.",
        otp_code=otp_code,
        closing="This code is valid for 10 minutes. If you did not request this, please ignore this email.",
    )
    send_email(user_email, subject, body, html_body=html)


# ─────────────────────────────────────────────────────────────────
# LOGIN
# ─────────────────────────────────────────────────────────────────
@auth_bp.route("/login", methods=["POST"])
def login():
    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""

    if not email or not password:
        return jsonify({"message": "Email and password are required."}), 400

    user = User.query.filter_by(email=email).first()

    if not user or not user.check_password(password):
        return jsonify({"message": "Invalid email or password."}), 401

    if not user.is_active:
        return jsonify({"message": "This account has been disabled. Contact SuperAdmin."}), 403

    if user.role.lower() in TWO_FA_ROLES:
        temp_token = secrets.token_urlsafe(32)
        otp_code = f"{secrets.randbelow(1000000):06d}"

        _store_2fa(temp_token, {
            "user_id": user.id,
            "otp": otp_code,
            "created_at": time.time(),
            "verified": False,
            "verified_at": None,
            "access_token": None,
        })

        send_otp_email(user.email, otp_code)

        return jsonify({
            "success": True,
            "requires_2fa": True,
            "temp_token": temp_token
        }), 200

    additional_claims = {"role": user.role, "name": user.name}
    access_token = create_access_token(identity=str(user.id), additional_claims=additional_claims)

    return jsonify({
        "access_token": access_token,
        "user": user.to_dict(),
    }), 200


# ─────────────────────────────────────────────────────────────────
# VERIFY 2FA OTP
# ─────────────────────────────────────────────────────────────────
@auth_bp.route("/verify-otp", methods=["POST"])
def verify_otp():
    data = request.get_json(silent=True) or {}
    temp_token = data.get("temp_token")
    otp = data.get("otp")

    if not temp_token or not otp:
        return jsonify({"message": "Temp token and OTP are required."}), 400

    temp_data = _load_2fa(temp_token)
    if not temp_data:
        return jsonify({"message": "Invalid or expired 2FA session."}), 401

    if temp_data.get("verified"):
        age = time.time() - (temp_data.get("verified_at") or 0)
        if age <= VERIFY_GRACE_SECONDS and temp_data.get("access_token"):
            user = User.query.get(temp_data["user_id"])
            if not user or not user.is_active:
                _delete_2fa(temp_token)
                return jsonify({"message": "User not found or disabled."}), 403
            return jsonify({
                "access_token": temp_data["access_token"],
                "user": user.to_dict(),
            }), 200
        _delete_2fa(temp_token)
        return jsonify({"message": "Invalid or expired 2FA session."}), 401

    if str(temp_data.get("otp")) != str(otp):
        return jsonify({"message": "Incorrect verification code."}), 401

    user_id = temp_data["user_id"]
    user = User.query.get(user_id)

    if not user:
        _delete_2fa(temp_token)
        return jsonify({"message": "User not found."}), 404

    if not user.is_active:
        _delete_2fa(temp_token)
        return jsonify({"message": "This account has been disabled. Contact SuperAdmin."}), 403

    additional_claims = {"role": user.role, "name": user.name}
    access_token = create_access_token(
        identity=str(user.id),
        additional_claims=additional_claims,
    )

    temp_data["verified"] = True
    temp_data["verified_at"] = time.time()
    temp_data["access_token"] = access_token
    _update_2fa(temp_token, temp_data)

    return jsonify({
        "access_token": access_token,
        "user": user.to_dict(),
    }), 200


# ─────────────────────────────────────────────────────────────────
# ME
# ─────────────────────────────────────────────────────────────────
@auth_bp.route("/me", methods=["GET"])
@jwt_required()
def me():
    user_id = get_jwt_identity()
    user = User.query.get(user_id)
    if not user:
        return jsonify({"message": "User not found."}), 404
    return jsonify({"user": user.to_dict()}), 200


# ─────────────────────────────────────────────────────────────────
# FORGOT PASSWORD — 3-step flow
# ─────────────────────────────────────────────────────────────────

@auth_bp.route("/forgot-password", methods=["POST"])
def forgot_password():
    """
    Step 1 — user submits their email; we send a 6-digit reset OTP.
    Always returns 200 to avoid leaking which emails are registered.
    """
    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()

    if not email:
        return jsonify({"message": "Email is required."}), 400

    user = User.query.filter_by(email=email).first()

    # Don't leak account existence.
    if not user:
        return jsonify({
            "message": "If that email is registered, a reset code has been sent.",
        }), 200

    if not user.is_active:
        return jsonify({
            "message": "This account is deactivated. Please contact the SuperAdmin.",
        }), 403

    otp = f"{random.randint(100000, 999999)}"
    user.temp_otp = otp
    db.session.commit()

    send_reset_email(user.email, otp)

    return jsonify({
        "message": "Reset code sent. Please check your email.",
        "user_id": user.id,
        "email_masked": _mask_email(user.email),
    }), 200


@auth_bp.route("/forgot-verify-otp", methods=["POST"])
def forgot_verify_otp():
    """
    Step 2 — verify the reset OTP. Does NOT clear it here;
    /reset-password clears it after the password is set.
    """
    data = request.get_json(silent=True) or {}
    user_id = data.get("user_id")
    otp = (data.get("otp") or "").strip()

    if not user_id or not otp:
        return jsonify({"message": "User ID and OTP are required."}), 400

    user = User.query.get(user_id)
    if not user:
        return jsonify({"message": "User not found."}), 404

    if not user.temp_otp or user.temp_otp != otp:
        return jsonify({"message": "Invalid or expired code."}), 401

    # Issue a short-lived reset_token so /reset-password can prove the OTP
    # was verified in this session without resending the raw OTP.
    reset_token = secrets.token_urlsafe(24)
    get_redis_client().set(
        f"pwreset:{reset_token}",
        json.dumps({"user_id": user.id, "verified_at": time.time()}),
        ex=RESET_OTP_TTL,
    )

    return jsonify({
        "message": "Code verified.",
        "reset_token": reset_token,
    }), 200


@auth_bp.route("/reset-password", methods=["POST"])
def reset_password():
    """
    Step 3 — set the new password. Requires the reset_token issued in step 2,
    and (belt-and-braces) the raw OTP so a stolen token alone is useless.
    """
    data = request.get_json(silent=True) or {}
    reset_token = data.get("reset_token")
    otp = (data.get("otp") or "").strip()
    new_password = data.get("new_password") or ""

    if not reset_token or not otp or not new_password:
        return jsonify({"message": "reset_token, otp, and new_password are required."}), 400

    if len(new_password) < 6:
        return jsonify({"message": "Password must be at least 6 characters."}), 400

    raw = get_redis_client().get(f"pwreset:{reset_token}")
    if not raw:
        return jsonify({"message": "Reset session has expired. Please restart the flow."}), 401

    try:
        sess = json.loads(raw)
    except Exception:
        return jsonify({"message": "Reset session is corrupted."}), 401

    user = User.query.get(sess.get("user_id"))
    if not user:
        return jsonify({"message": "User not found."}), 404

    if not user.temp_otp or user.temp_otp != otp:
        return jsonify({"message": "OTP mismatch. Please restart the reset flow."}), 401

    user.set_password(new_password)
    user.temp_otp = None
    db.session.commit()

    # Invalidate the reset token so it can't be reused
    get_redis_client().delete(f"pwreset:{reset_token}")

    return jsonify({"message": "Password reset successfully. You can now sign in."}), 200


# ─────────────────────────────────────────────────────────────────
# Helper
# ─────────────────────────────────────────────────────────────────
def _mask_email(email: str) -> str:
    """j***@example.com — friendly masked display for the UI."""
    try:
        local, _, domain = email.partition("@")
        if len(local) <= 1:
            return f"{local}***@{domain}"
        return f"{local[0]}***{local[-1]}@{domain}"
    except Exception:
        return email
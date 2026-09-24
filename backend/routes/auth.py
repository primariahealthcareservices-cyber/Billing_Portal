# backend/routes/auth.py
import secrets
import smtplib
import time
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from flask import Blueprint, request, jsonify, current_app
from flask_jwt_extended import create_access_token, jwt_required, get_jwt_identity, get_jwt

from models import db, User

auth_bp = Blueprint("auth", __name__, url_prefix="/api/auth")

# In-memory store for 2FA (Use Redis in production)
TEMP_2FA_STORE = {}

# How long a verified temp_token stays valid for idempotent re-submits (seconds).
VERIFY_GRACE_SECONDS = 30


# ================================
# Send OTP Email (Gmail SMTP)
# ================================
def send_otp_email(user_email, otp_code):
    config = current_app.config
    subject = "Your Finance Hub Verification Code"
    body = f"Your OTP code is: {otp_code}. It expires in 10 minutes."

    msg = MIMEMultipart()
    msg['From'] = config['MAIL_USERNAME']
    msg['To'] = user_email
    msg['Subject'] = subject
    msg.attach(MIMEText(body, 'plain'))

    try:
        server = smtplib.SMTP_SSL(config['MAIL_SERVER'], config['MAIL_PORT'])
        server.login(config['MAIL_USERNAME'], config['MAIL_PASSWORD'])
        server.sendmail(config['MAIL_USERNAME'], user_email, msg.as_string())
        server.quit()
        print(f"OTP sent successfully to {user_email}")
    except Exception as e:
        print(f"Failed to send email: {e}")


# ================================
# LOGIN ROUTE (Supports 2FA)
# ================================
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

    # 2FA for Admin / SuperAdmin / SalesEnterprise
    if user.role.lower() in ["admin", "superadmin", "salesenterprise"]:
        temp_token = secrets.token_urlsafe(32)
        otp_code = f"{secrets.randbelow(1000000):06d}"

        TEMP_2FA_STORE[temp_token] = {
            "user_id": user.id,
            "otp": otp_code,
            "created_at": time.time(),
            "verified": False,
            "verified_at": None,
            "access_token": None,
        }

        send_otp_email(user.email, otp_code)

        return jsonify({
            "success": True,
            "requires_2fa": True,
            "temp_token": temp_token
        }), 200

    # Normal login
    additional_claims = {"role": user.role, "name": user.name}
    access_token = create_access_token(identity=str(user.id), additional_claims=additional_claims)

    return jsonify({
        "access_token": access_token,
        "user": user.to_dict(),
    }), 200


# ================================
# VERIFY OTP ROUTE — idempotent within a grace window
# ================================
@auth_bp.route("/verify-otp", methods=["POST"])
def verify_otp():
    data = request.get_json(silent=True) or {}
    temp_token = data.get("temp_token")
    otp = data.get("otp")

    if not temp_token or not otp:
        return jsonify({"message": "Temp token and OTP are required."}), 400

    temp_data = TEMP_2FA_STORE.get(temp_token)
    if not temp_data:
        return jsonify({"message": "Invalid or expired 2FA session."}), 401

    # Already verified and still within grace window → return the same token (idempotent).
    if temp_data.get("verified"):
        age = time.time() - (temp_data.get("verified_at") or 0)
        if age <= VERIFY_GRACE_SECONDS and temp_data.get("access_token"):
            user = User.query.get(temp_data["user_id"])
            if not user or not user.is_active:
                # Clean up and refuse
                TEMP_2FA_STORE.pop(temp_token, None)
                return jsonify({"message": "User not found or disabled."}), 403
            return jsonify({
                "access_token": temp_data["access_token"],
                "user": user.to_dict(),
            }), 200
        # Grace expired → drop entry and fall through to normal verification
        TEMP_2FA_STORE.pop(temp_token, None)
        return jsonify({"message": "Invalid or expired 2FA session."}), 401

    # Not yet verified → check OTP
    if str(temp_data.get("otp")) != str(otp):
        return jsonify({"message": "Incorrect verification code."}), 401

    user_id = temp_data["user_id"]
    user = User.query.get(user_id)

    if not user:
        TEMP_2FA_STORE.pop(temp_token, None)
        return jsonify({"message": "User not found."}), 404

    if not user.is_active:
        TEMP_2FA_STORE.pop(temp_token, None)
        return jsonify({"message": "This account has been disabled. Contact SuperAdmin."}), 403

    # Issue the access token
    additional_claims = {"role": user.role, "name": user.name}
    access_token = create_access_token(
        identity=str(user.id),
        additional_claims=additional_claims,
    )

    # ✅ Mark verified instead of deleting — makes re-submits idempotent
    temp_data["verified"] = True
    temp_data["verified_at"] = time.time()
    temp_data["access_token"] = access_token
    TEMP_2FA_STORE[temp_token] = temp_data

    return jsonify({
        "access_token": access_token,
        "user": user.to_dict(),
    }), 200


# ================================
# ME ROUTE
# ================================
@auth_bp.route("/me", methods=["GET"])
@jwt_required()
def me():
    user_id = get_jwt_identity()
    user = User.query.get(user_id)
    if not user:
        return jsonify({"message": "User not found."}), 404
    return jsonify({"user": user.to_dict()}), 200
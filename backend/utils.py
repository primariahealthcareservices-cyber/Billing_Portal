# billing-portal/backend/utils.py
from functools import wraps
from flask import request, jsonify, current_app
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from flask_jwt_extended import get_jwt, verify_jwt_in_request, get_jwt_identity
from models import User


def role_required(required_role):
    def decorator(f):
        @wraps(f)
        def decorated(*args, **kwargs):
            # Allow OPTIONS requests (CORS preflight) to pass without auth
            if request.method == 'OPTIONS':
                return f(*args, **kwargs)
            try:
                verify_jwt_in_request()
                identity = get_jwt_identity()
                if identity is None:
                    return jsonify({"message": "Invalid token."}), 401
                user = User.query.get(identity)
                if user is None:
                    return jsonify({"message": "User not found."}), 401
                # SuperAdmin can access any route
                if user.role == "SuperAdmin":
                    return f(*args, **kwargs)
                if user.role != required_role:
                    return jsonify({"message": "Insufficient permissions."}), 403
            except Exception:
                return jsonify({"message": "Invalid or missing token."}), 401
            return f(*args, **kwargs)
        return decorated
    return decorator


# ─────────────────────────────────────────────────────────────────────────
# NEW: Simple email helper — mirrors the pattern used in routes/auth.py
# ─────────────────────────────────────────────────────────────────────────
def send_email(to_email: str, subject: str, body: str) -> bool:
    """
    Send a plain-text email via Gmail SMTP using the same config values
    that auth.py uses (MAIL_SERVER, MAIL_PORT, MAIL_USERNAME, MAIL_PASSWORD).

    Returns True on success, False on failure (never raises).
    """
    try:
        cfg = current_app.config
        msg = MIMEMultipart()
        msg["From"] = cfg["MAIL_USERNAME"]
        msg["To"] = to_email
        msg["Subject"] = subject
        msg.attach(MIMEText(body, "plain"))

        server = smtplib.SMTP_SSL(cfg["MAIL_SERVER"], cfg["MAIL_PORT"])
        server.login(cfg["MAIL_USERNAME"], cfg["MAIL_PASSWORD"])
        server.sendmail(cfg["MAIL_USERNAME"], to_email, msg.as_string())
        server.quit()
        print(f"[email] Sent to {to_email}: {subject}")
        return True
    except Exception as e:
        print(f"[email] FAILED to {to_email}: {e}")
        return False
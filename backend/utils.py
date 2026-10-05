# billing-portal/backend/utils.py
from functools import wraps
from concurrent.futures import ThreadPoolExecutor
from flask import request, jsonify, current_app
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from flask_jwt_extended import get_jwt, verify_jwt_in_request, get_jwt_identity
from models import User

# ── Background thread pool for non-blocking emails ─────────────────
_EMAIL_EXECUTOR = ThreadPoolExecutor(max_workers=4, thread_name_prefix="mail")


def role_required(required_role):
    def decorator(f):
        @wraps(f)
        def decorated(*args, **kwargs):
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
                if user.role == "SuperAdmin":
                    return f(*args, **kwargs)
                if user.role != required_role:
                    return jsonify({"message": "Insufficient permissions."}), 403
            except Exception:
                return jsonify({"message": "Invalid or missing token."}), 401
            return f(*args, **kwargs)
        return decorated
    return decorator


# ── Blocking send (kept for compatibility) ────────────────────────
def _send_email_sync(app, to_email, subject, body):
    try:
        with app.app_context():
            cfg = app.config
            msg = MIMEMultipart()
            msg["From"] = cfg["MAIL_USERNAME"]
            msg["To"] = to_email
            msg["Subject"] = subject
            msg.attach(MIMEText(body, "plain"))

            server = smtplib.SMTP_SSL(cfg["MAIL_SERVER"], cfg["MAIL_PORT"], timeout=10)
            server.login(cfg["MAIL_USERNAME"], cfg["MAIL_PASSWORD"])
            server.sendmail(cfg["MAIL_USERNAME"], to_email, msg.as_string())
            server.quit()
            print(f"[email] Sent to {to_email}")
    except Exception as e:
        print(f"[email] FAILED to {to_email}: {e}")


# ── Non-blocking send — used everywhere ───────────────────────────
def send_email(to_email, subject, body):
    """Fire-and-forget email. Returns immediately."""
    if not to_email:
        return True
    try:
        app = current_app._get_current_object()
    except Exception:
        # No app context — skip
        return False
    _EMAIL_EXECUTOR.submit(_send_email_sync, app, to_email, subject, body)
    return True
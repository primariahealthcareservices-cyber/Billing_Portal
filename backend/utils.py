# billing-portal/backend/utils.py
from functools import wraps
from concurrent.futures import ThreadPoolExecutor
from flask import request, jsonify, current_app
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from flask_jwt_extended import get_jwt, verify_jwt_in_request, get_jwt_identity
from models import User

_EMAIL_EXECUTOR = ThreadPoolExecutor(max_workers=4, thread_name_prefix="mail")


# ─────────────────────────────────────────────────────────────────
# Redis — shared client used by 2FA / OTP storage
# ─────────────────────────────────────────────────────────────────
def get_redis_client():
    """
    Return a Redis client bound to the current app. Prefers the
    already-initialized `app.config["REDIS_CLIENT"]` (an instance of
    CacheClient from config.py). Falls back to a simple in-memory
    dict-backed stub if Redis is unavailable so auth still works.

    The returned object implements `set(key, value, ex=None, keepttl=False)`,
    `get(key)`, and `delete(key)` — which is exactly what auth.py uses.
    """
    try:
        app = current_app._get_current_object()
    except Exception:
        # No app context — return a fresh local stub
        return _InMemoryRedis()

    # Prefer the shared client injected at app startup
    client = app.config.get("REDIS_CLIENT")
    if client is not None and hasattr(client, "setex"):
        return _CacheClientAdapter(client)

    # Fallback: build one on demand
    try:
        import redis as _redis
        url = app.config.get("REDIS_URL", "redis://localhost:6379/0")
        r = _redis.from_url(url, decode_responses=True)
        r.ping()
        return _RawRedisAdapter(r)
    except Exception:
        return _InMemoryRedis()


class _CacheClientAdapter:
    """
    Wraps config.CacheClient (which exposes setex/get/delete) to expose the
    standard Redis set(key, value, ex=..., keepttl=...) signature.
    """
    def __init__(self, cache_client):
        self._c = cache_client

    def set(self, key, value, ex=None, keepttl=False):
        if ex is None:
            ex = 600
        self._c.setex(key, ex, value)

    def get(self, key):
        v = self._c.get(key)
        if isinstance(v, bytes):
            return v.decode("utf-8")
        return v

    def delete(self, key):
        self._c.delete(key)


class _RawRedisAdapter:
    def __init__(self, raw):
        self._r = raw

    def set(self, key, value, ex=None, keepttl=False):
        self._r.set(key, value, ex=ex, keepttl=keepttl)

    def get(self, key):
        return self._r.get(key)

    def delete(self, key):
        self._r.delete(key)


class _InMemoryRedis:
    """Minimal local fallback — per-process dict. Not shared across workers."""
    _store = {}

    def set(self, key, value, ex=None, keepttl=False):
        self._store[key] = value

    def get(self, key):
        return self._store.get(key)

    def delete(self, key):
        self._store.pop(key, None)


# ─────────────────────────────────────────────────────────────────
# Role guard
# ─────────────────────────────────────────────────────────────────
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


# ─────────────────────────────────────────────────────────────────
# Email sender (fire-and-forget + optional HTML)
# ─────────────────────────────────────────────────────────────────
def _send_email_sync(app, to_email, subject, body, html_body=None):
    try:
        with app.app_context():
            cfg = app.config
            msg = MIMEMultipart("alternative")
            msg["From"] = cfg["MAIL_USERNAME"]
            msg["To"] = to_email
            msg["Subject"] = subject
            msg.attach(MIMEText(body, "plain"))
            if html_body:
                msg.attach(MIMEText(html_body, "html"))

            server = smtplib.SMTP_SSL(cfg["MAIL_SERVER"], cfg["MAIL_PORT"], timeout=10)
            server.login(cfg["MAIL_USERNAME"], cfg["MAIL_PASSWORD"])
            server.sendmail(cfg["MAIL_USERNAME"], to_email, msg.as_string())
            server.quit()
            print(f"[email] Sent to {to_email}")
    except Exception as e:
        print(f"[email] FAILED to {to_email}: {e}")


def send_email(to_email, subject, body, html_body=None):
    """Fire-and-forget email. Returns immediately."""
    if not to_email:
        return True
    try:
        app = current_app._get_current_object()
    except Exception:
        return False
    _EMAIL_EXECUTOR.submit(_send_email_sync, app, to_email, subject, body, html_body)
    return True
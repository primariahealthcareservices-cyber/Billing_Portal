# billing-portal/backend/routes/notifications.py
from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from models import db, Notification

notifications_bp = Blueprint("notifications", __name__, url_prefix="/api/notifications")


def _uid_int():
    uid = get_jwt_identity()
    try:
        return int(uid)
    except Exception:
        return uid


@notifications_bp.route("/my", methods=["GET", "OPTIONS"])
@jwt_required()
def my_notifications():
    if request.method == "OPTIONS":
        return ("", 204)
    uid = _uid_int()
    rows = (
        Notification.query
        .filter_by(user_id=uid)
        .order_by(Notification.created_at.desc())
        .limit(50)
        .all()
    )
    return jsonify({
        "notifications": [
            {
                "id": n.id,
                "message": n.message,
                "is_read": bool(n.is_read),
                "related_type": n.related_type,
                "related_id": n.related_id,
                "created_at": n.created_at.isoformat() if n.created_at else None,
            }
            for n in rows
        ]
    }), 200


@notifications_bp.route("/unread-count", methods=["GET", "OPTIONS"])
@jwt_required()
def unread_count():
    if request.method == "OPTIONS":
        return ("", 204)
    uid = _uid_int()
    count = Notification.query.filter_by(user_id=uid, is_read=False).count()
    return jsonify({"count": count}), 200


@notifications_bp.route("/<int:nid>/read", methods=["PUT", "OPTIONS"])
@jwt_required()
def mark_read(nid):
    if request.method == "OPTIONS":
        return ("", 204)
    uid = _uid_int()
    n = Notification.query.filter_by(id=nid, user_id=uid).first()
    if not n:
        return jsonify({"error": "Notification not found"}), 404
    n.is_read = True
    db.session.commit()
    return jsonify({"message": "Marked as read"}), 200


@notifications_bp.route("/read-all", methods=["PUT", "OPTIONS"])
@jwt_required()
def mark_all_read():
    if request.method == "OPTIONS":
        return ("", 204)
    uid = _uid_int()
    Notification.query.filter_by(user_id=uid, is_read=False).update({"is_read": True})
    db.session.commit()
    return jsonify({"message": "All marked as read"}), 200
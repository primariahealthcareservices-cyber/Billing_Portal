# backend/routes/files.py
from flask import Blueprint, send_from_directory, abort, request, jsonify
from flask_jwt_extended import decode_token
from file_utils import UPLOAD_ROOT

files_bp = Blueprint("files", __name__, url_prefix="/api/files")


@files_bp.route("/invoices/<path:filename>", methods=["GET", "OPTIONS"])
def get_invoice(filename):
    if request.method == "OPTIONS":
        return ("", 204)

    # 1. Token from Authorization header
    auth_header = request.headers.get("Authorization")
    token = None
    if auth_header and auth_header.startswith("Bearer "):
        token = auth_header.split(" ")[1]

    # 2. Fallback: ?token=, ?jwt=, or any query param containing "token"
    if not token:
        token = request.args.get("token")
    if not token:
        token = request.args.get("jwt")
    if not token:
        for key, value in request.args.items():
            if "token" in key.lower():
                token = value
                break

    if not token:
        return jsonify({"msg": "Missing token."}), 401

    try:
        decode_token(token)
    except Exception:
        return jsonify({"msg": "Invalid or expired token."}), 401

    as_attachment = request.args.get("download") == "1"
    try:
        return send_from_directory(
            UPLOAD_ROOT, filename, as_attachment=as_attachment,
        )
    except Exception:
        abort(404)
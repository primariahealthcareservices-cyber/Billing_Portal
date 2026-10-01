# backend/app.py
import sys
import traceback
from flask import Flask, jsonify
from flask_cors import CORS
from flask_jwt_extended import JWTManager

from config import Config
from models import db, migrate_corporate_categories, migrate_everglades_categories


def create_app():
    app = Flask(__name__)
    app.config.from_object(Config)

    app.config["REDIS_CLIENT"] = Config.get_redis()

    db.init_app(app)

    # ── Data migrations (must run inside app context) ───────────────────
    with app.app_context():
        migrate_corporate_categories()
        migrate_everglades_categories()

    JWTManager(app)

    # ── CORS: allow the FinanceHub Vite dev server on 5174 ──────────────
    CORS(app, resources={
        r"/api/*": {
            "origins": [
                "http://localhost:5174",
                "http://127.0.0.1:5174",
            ]
        }
    },
        supports_credentials=True,
        allow_headers=["Content-Type", "Authorization", "X-Service-Token"],
        expose_headers=["Content-Disposition"],
        methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        automatic_options=True,
    )

    # ── Import blueprints ───────────────────────────────────────────────
    from routes.auth import auth_bp
    from routes.it import it_bp
    from routes.pcm import pcm_bp
    from routes.medtech import medtech_bp
    from routes.caredx import caredx_bp
    from routes.superadmin import superadmin_bp
    from routes.files import files_bp
    from routes.corporate import corporate_bp
    from routes.adminfunctionalunit import adminfunctionalunit_bp
    from routes.researchdevelopment import researchdevelopment_bp
    from routes.itsales import itsales_bp
    from routes.salesenterprise import salesenterprise_bp
    from routes.dental import dental_bp
    from routes.everglades import everglades_bp
    from routes.copperbook import cb_bp
    from routes.notifications import notifications_bp

    app.register_blueprint(auth_bp)
    app.register_blueprint(it_bp)
    app.register_blueprint(pcm_bp)
    app.register_blueprint(medtech_bp)
    app.register_blueprint(caredx_bp)
    app.register_blueprint(superadmin_bp)
    app.register_blueprint(files_bp)
    app.register_blueprint(corporate_bp)
    app.register_blueprint(adminfunctionalunit_bp)
    app.register_blueprint(researchdevelopment_bp)
    app.register_blueprint(itsales_bp)
    app.register_blueprint(salesenterprise_bp)
    app.register_blueprint(dental_bp)
    app.register_blueprint(everglades_bp)
    app.register_blueprint(cb_bp)
    app.register_blueprint(notifications_bp)

    # ── Create any missing tables (safe, non-destructive) ───────────────
    # We import the new models here so SQLAlchemy registers them with the
    # metadata BEFORE db.create_all() runs. This creates:
    #   - notifications
    #   - copper_book_requests
    #   - copper_book_assignees
    #   - copper_book_attachments
    with app.app_context():
        from models import Notification  # noqa: F401
        from models_copperbook import (  # noqa: F401
            CopperBookRequest, CopperBookAssignee, CopperBookAttachment,
        )
        db.create_all()

    # ── Health check + global error handler ─────────────────────────────
    @app.route("/api/health", methods=["GET"])
    def health():
        return jsonify({"status": "ok"}), 200

    @app.errorhandler(Exception)
    def handle_exception(e):
        print("🔴 Unhandled Exception:", file=sys.stderr)
        traceback.print_exc()
        return jsonify({
            "message": "Internal server error",
            "error": str(e) if app.debug else None
        }), 500

    return app


app = create_app()

if __name__ == "__main__":
    app.run(debug=True, port=5001)
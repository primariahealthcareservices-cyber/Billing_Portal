# backend/app.py
import sys
import traceback
from flask import Flask, jsonify, request
from flask_cors import CORS
from flask_jwt_extended import JWTManager

from config import Config
from models import db, migrate_corporate_categories

def create_app():
    app = Flask(__name__)
    app.config.from_object(Config)

    app.config["REDIS_CLIENT"] = Config.get_redis()

    db.init_app(app)

    with app.app_context():
        migrate_corporate_categories()

    JWTManager(app)

    # ✅ CORS – explicit origin, single header
    CORS(app, resources={r"/api/*": {"origins": "http://localhost:5173"}}, supports_credentials=True)

    # Register blueprints
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
    app.run(debug=True, port=5000)
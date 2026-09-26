from flask import Flask, jsonify, request
from flask_cors import CORS
from flask_jwt_extended import JWTManager

from config import Config
from models import db


def create_app():
    app = Flask(__name__)
    app.config.from_object(Config)

    # Attach Redis client (may be None)
    redis_client = Config.get_redis()
    if redis_client is None:
        print("⚠️ Redis not available. OTP features will be disabled.")
    app.config["REDIS_CLIENT"] = redis_client

    db.init_app(app)
    JWTManager(app)

    # NO global CORS here – we use after_request only
    # CORS(app, resources={r"/api/*": {"origins": app.config["FRONTEND_ORIGIN"]}}, supports_credentials=True)

    @app.after_request
    def after_request(response):
        origin = app.config.get("FRONTEND_ORIGIN", "http://localhost:5173")
        # Only add if not already present (avoid duplicates)
        if not response.headers.get('Access-Control-Allow-Origin'):
            response.headers.add('Access-Control-Allow-Origin', origin)
        response.headers.add('Access-Control-Allow-Headers', 'Content-Type,Authorization')
        response.headers.add('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS')
        response.headers.add('Access-Control-Allow-Credentials', 'true')
        return response

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
    from routes.pharmacy import pharmacy_bp

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
    app.register_blueprint(pharmacy_bp)

    @app.route("/api/health", methods=["GET"])
    def health():
        return jsonify({"status": "ok"}), 200

    @app.errorhandler(404)
    def not_found(e):
        return jsonify({"message": "Route not found."}), 404

    @app.errorhandler(500)
    def server_error(e):
        response = jsonify({"message": "Internal server error."})
        response.status_code = 500
        # Add CORS headers to error response
        origin = app.config.get("FRONTEND_ORIGIN", "http://localhost:5173")
        response.headers.add('Access-Control-Allow-Origin', origin)
        response.headers.add('Access-Control-Allow-Headers', 'Content-Type,Authorization')
        response.headers.add('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS')
        response.headers.add('Access-Control-Allow-Credentials', 'true')
        return response

    return app


app = create_app()

if __name__ == "__main__":
    app.run(debug=True, port=5000)
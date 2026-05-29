"""
Gamified Referral & Virality SDK — Backend (Flask).

Application factory wiring SQLAlchemy (PostgreSQL), Redis (cache + anti-fraud),
Geo-IP resolution and the referral / admin blueprints.

Run locally:
    pip install -r requirements.txt
    flask --app app run --debug
or:
    python app.py
"""
import logging

from flask import Flask, jsonify
from flask_cors import CORS

from blueprints.admin import admin_bp
from blueprints.referral import referral_bp
from config import Config
from extensions import init_redis
from geoip_service import init_geoip
from models import Project, db

logging.basicConfig(level=logging.INFO)


def create_app(config_class: type = Config) -> Flask:
    app = Flask(__name__)
    app.config.from_object(config_class)

    # --- Extensions --------------------------------------------------------
    CORS(app, resources={r"/api/*": {"origins": "*"}})
    db.init_app(app)
    init_redis(app)
    init_geoip(app)

    # --- Blueprints --------------------------------------------------------
    app.register_blueprint(referral_bp)
    app.register_blueprint(admin_bp)

    # --- Health + bootstrap ------------------------------------------------
    @app.get("/health")
    def health():
        return jsonify(status="ok")

    @app.errorhandler(404)
    def not_found(_):
        return jsonify(error="Not found"), 404

    @app.errorhandler(500)
    def server_error(_):
        db.session.rollback()
        return jsonify(error="Internal server error"), 500

    with app.app_context():
        db.create_all()
        _seed_demo_project(app)

    return app


def _seed_demo_project(app) -> None:
    """Create a deterministic demo project on first boot for easy testing."""
    demo_id = "proj_demo_local"
    demo_key = "demo_api_key_local_dev"
    if Project.query.filter_by(project_id=demo_id).first() is None:
        project = Project(
            project_id=demo_id,
            api_key=demo_key,
            name="Demo Project",
            points_per_referral=app.config["DEFAULT_POINTS_PER_REFERRAL"],
            fraud_detection_enabled=True,
            rate_limit_per_minute=app.config["RATE_LIMIT_REQUESTS"],
        )
        db.session.add(project)
        db.session.commit()
        app.logger.info(
            "Seeded demo project -> project_id=%s api_key=%s", demo_id, demo_key
        )


app = create_app()


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)

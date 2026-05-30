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

from flask import Flask, jsonify, redirect, render_template_string, request
from flask_cors import CORS

from blueprints.admin import admin_bp
from blueprints.referral import referral_bp
from config import Config
from extensions import init_redis
from geoip_service import get_client_ip, init_geoip, resolve_country
from models import Project, ReferralEvent, User, db

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

    _INVITE_PAGE = """<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Opening invite…</title>
<style>
  body{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;
       background:#0b1020;color:#e2e8f0;display:flex;min-height:100vh;
       align-items:center;justify-content:center;margin:0;text-align:center}
  .card{padding:32px;max-width:360px}
  a.btn{display:inline-block;margin-top:20px;padding:14px 28px;border-radius:14px;
        background:#6366f1;color:#fff;text-decoration:none;font-weight:700;font-size:16px}
  .code{font-family:monospace;color:#a5b4fc;font-size:18px}
  p{color:#94a3b8;font-size:14px;margin-top:12px}
</style></head>
<body><div class="card">
  <h2>🎉 You've been invited!</h2>
  <p>Invite code: <span class="code">{{ code }}</span></p>
  <a class="btn" href="{{ deep_link }}">Open App</a>
  <p>Tap the button above to open the app and claim your invite.</p>
  <script>
    // Attempt auto-open — works in some browsers/WebViews.
    setTimeout(function(){ window.location.href = "{{ deep_link }}"; }, 400);
  </script>
</div></body></html>"""

    @app.get("/i/<code>")
    def invite_redirect(code: str):
        """
        Public invite landing page — no auth required.

        Two responsibilities:
          1. Record a `click` event immediately (so the dashboard Conversion Funnel
             shows 'Clicked' even before the user opens the app).
          2. Return an HTML interstitial with a tap-able link to `referralsdk://invite?code=…`
             instead of a bare 302 redirect. Browsers block automatic redirects to custom
             schemes; a user-initiated tap is always allowed.
        """
        code = (code or "").upper().strip()

        inviter = User.query.filter_by(invite_code=code).first()
        if inviter is not None:
            ip = get_client_ip(request)
            db.session.add(
                ReferralEvent(
                    project_pk=inviter.project_pk,
                    event_type=ReferralEvent.EVENT_CLICK,
                    invite_code=code,
                    ip_address=ip,
                    country=resolve_country(ip),
                )
            )
            db.session.commit()

        deep_link = f"referralsdk://invite?code={code}"
        return render_template_string(_INVITE_PAGE, code=code, deep_link=deep_link)

    @app.errorhandler(404)
    def not_found(_):
        return jsonify(error="Not found"), 404

    @app.errorhandler(500)
    def server_error(_):
        db.session.rollback()
        return jsonify(error="Internal server error"), 500

    with app.app_context():
        db.create_all()
        # Idempotent migration: add last_daily_claim_at if the column doesn't
        # exist yet (handles databases created before this feature was added).
        try:
            from sqlalchemy import text
            db.session.execute(
                text(
                    "ALTER TABLE users ADD COLUMN IF NOT EXISTS "
                    "last_daily_claim_at TIMESTAMPTZ"
                )
            )
            db.session.commit()
        except Exception as exc:
            db.session.rollback()
            app.logger.warning("Migration for last_daily_claim_at skipped: %s", exc)
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

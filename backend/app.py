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
import json
import logging

from flask import Flask, jsonify, redirect, render_template_string, request
from flask_cors import CORS

from blueprints.admin import admin_bp
from blueprints.referral import referral_bp
from config import Config
from extensions import get_redis, init_redis
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
  <a class="btn" href="{{ open_url }}">Open App</a>
  <p>Tap the button above to open the app and claim your invite.</p>
  <script>
    // Attempt auto-open — works in some browsers/WebViews. Routes through /open so the
    // inviter is credited the moment the invite is opened, before the app even launches.
    setTimeout(function(){ window.location.href = "{{ open_url }}"; }, 400);
  </script>
</div></body></html>"""

    _LAUNCH_PAGE = """<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Opening app…</title>
<style>
  body{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;
       background:#0b1020;color:#e2e8f0;display:flex;min-height:100vh;
       align-items:center;justify-content:center;margin:0;text-align:center}
  .card{padding:32px;max-width:360px}
  a.btn{display:inline-block;margin-top:20px;padding:14px 28px;border-radius:14px;
        background:#22c55e;color:#fff;text-decoration:none;font-weight:700;font-size:16px}
  p{color:#94a3b8;font-size:14px;margin-top:12px}
</style></head>
<body><div class="card">
  <h2>🎉 Reward sent!</h2>
  <p>Your friend just earned points. Opening the app…</p>
  <a class="btn" href="{{ deep_link }}">Open App</a>
  <script>
    setTimeout(function(){ window.location.href = "{{ deep_link }}"; }, 300);
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

        open_url = f"/i/{code}/open"
        return render_template_string(_INVITE_PAGE, code=code, open_url=open_url)

    @app.get("/i/<code>/open")
    def invite_open(code: str):
        """
        Credit the inviter the instant the recipient taps "Open App" on the landing
        page — before the mobile app even launches — then deep-link into the app.

        Prototype behavior: NO per-user / per-IP de-duplication. Every tap awards the
        inviter points_per_referral. (The app's own /api/referral/track call may also
        award on cold start; duplicate credits are acceptable for this prototype.)
        """
        code = (code or "").upper().strip()

        inviter = User.query.filter_by(invite_code=code).first()
        if inviter is not None:
            project = Project.query.filter_by(id=inviter.project_pk).first()
            ip = get_client_ip(request)
            points = project.points_per_referral if project else 0
            inviter.points_balance += points
            db.session.add(
                ReferralEvent(
                    project_pk=inviter.project_pk,
                    event_type=ReferralEvent.EVENT_ATTRIBUTED,
                    invite_code=code,
                    ip_address=ip,
                    country=resolve_country(ip),
                    points_delta=points,
                    meta=json.dumps({"source": "web_open", "inviter": inviter.user_id}),
                )
            )
            db.session.commit()
            # Invalidate the inviter's cached balance so the app / portal see the new total now.
            if project is not None:
                try:
                    get_redis().delete(f"balance:{project.project_id}:{inviter.user_id}")
                except Exception:
                    pass
            app.logger.info(
                "Web-open award: code=%s inviter=%s +%d -> %d",
                code, inviter.user_id, points, inviter.points_balance,
            )

        deep_link = f"referralsdk://invite?code={code}"
        return render_template_string(_LAUNCH_PAGE, deep_link=deep_link)

    @app.errorhandler(404)
    def not_found(_):
        return jsonify(error="Not found"), 404

    @app.errorhandler(500)
    def server_error(_):
        db.session.rollback()
        return jsonify(error="Internal server error"), 500

    with app.app_context():
        db.create_all()
        _ensure_daily_bonus_column(app)   # dialect-agnostic migration
        _migrate_demo_country(app, old="Mexico", new="Israel")
        _normalize_local_countries(app)
        _seed_demo_project(app)

    return app


def _ensure_daily_bonus_column(app) -> None:
    """
    Idempotent, dialect-agnostic migration for users.last_daily_claim_at.

    Uses the SQLAlchemy inspector to check whether the column already exists,
    and only then issues a plain ALTER TABLE ... ADD COLUMN with a type that
    is valid on the active dialect. Works on SQLite (local dev), PostgreSQL
    and MySQL, for both freshly-created and pre-existing databases.
    """
    from sqlalchemy import inspect as sa_inspect, text

    try:
        inspector = sa_inspect(db.engine)
        columns = {c["name"] for c in inspector.get_columns("users")}
        if "last_daily_claim_at" in columns:
            return  # already present

        dialect = db.engine.dialect.name  # 'sqlite' | 'postgresql' | 'mysql'
        if dialect == "postgresql":
            col_type = "TIMESTAMPTZ"
        elif dialect == "mysql":
            col_type = "DATETIME"
        else:  # sqlite and everything else
            col_type = "TIMESTAMP"

        # No "IF NOT EXISTS" — we already checked above, and SQLite/MySQL
        # don't support that clause for ADD COLUMN.
        db.session.execute(
            text(f"ALTER TABLE users ADD COLUMN last_daily_claim_at {col_type}")
        )
        db.session.commit()
        app.logger.info("Added users.last_daily_claim_at (%s).", dialect)
    except Exception as exc:
        db.session.rollback()
        app.logger.warning("daily-bonus column migration skipped: %s", exc)


def _migrate_demo_country(app, old: str, new: str) -> None:
    """Update legacy demo-country placeholder stored in existing user and event rows."""
    try:
        updated_users = User.query.filter_by(country=old).update({"country": new})
        updated_events = ReferralEvent.query.filter_by(country=old).update({"country": new})
        db.session.commit()
        if updated_users or updated_events:
            app.logger.info(
                "Migrated country %s -> %s: %d user(s), %d event(s)",
                old, new, updated_users, updated_events,
            )
    except Exception as exc:
        db.session.rollback()
        app.logger.warning("Demo-country migration skipped: %s", exc)


def _normalize_local_countries(app) -> None:
    """
    Re-point local/demo traffic to the real local country.

    A phone on the same LAN reaches the server from a private IP that cannot be
    geo-located, so older rows were tagged with random placeholder countries (and
    users keep their first-seen country forever). Rewrite private-IP events and
    demo-placeholder users to the resolved local country so the portal's Live
    Activity Feed and Country Breakdown reflect the truth.
    """
    from geoip_service import resolve_country, _is_private, _DEMO_COUNTRIES

    try:
        local = resolve_country("127.0.0.1")  # private -> local country

        updated_events = 0
        for e in ReferralEvent.query.all():
            if e.ip_address and _is_private(e.ip_address) and e.country != local:
                e.country = local
                updated_events += 1

        updated_users = (
            User.query.filter(User.country.in_(_DEMO_COUNTRIES))
            .update({"country": local}, synchronize_session=False)
        )
        db.session.commit()
        if updated_events or updated_users:
            app.logger.info(
                "Normalized local countries -> %s: %d event(s), %d user(s)",
                local, updated_events, updated_users,
            )
    except Exception as exc:
        db.session.rollback()
        app.logger.warning("local-country normalization skipped: %s", exc)


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

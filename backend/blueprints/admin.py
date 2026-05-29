"""
Admin / analytics blueprint — powers the Developer Portal.

Endpoints aggregate ReferralEvent / User data for the dashboards and expose the
remote-config update used by the Campaign Manager ("Save & Sync").
"""
from datetime import datetime, timedelta, timezone

from flask import Blueprint, g, jsonify, request
from sqlalchemy import func

from models import Project, ReferralEvent, User, db
from security import require_credentials

admin_bp = Blueprint("admin", __name__, url_prefix="/api/admin")


@admin_bp.get("/overview")
@require_credentials
def overview():
    """Top stat cards + conversion funnel for the project."""
    project = g.project
    base = ReferralEvent.query.filter_by(project_pk=project.id)

    def count(event_type: str) -> int:
        return base.filter_by(event_type=event_type).count()

    generated = count(ReferralEvent.EVENT_GENERATED)
    clicks = count(ReferralEvent.EVENT_CLICK)
    installs = count(ReferralEvent.EVENT_INSTALL)
    attributed = count(ReferralEvent.EVENT_ATTRIBUTED)

    total_users = User.query.filter_by(project_pk=project.id).count()
    referred_users = User.query.filter(
        User.project_pk == project.id, User.referred_by.isnot(None)
    ).count()

    # Viral K-factor ≈ invites sent per user * conversion rate.
    invites_per_user = (generated / total_users) if total_users else 0
    conversion = (attributed / generated) if generated else 0
    k_factor = round(invites_per_user * conversion, 2)

    return jsonify(
        stats={
            "total_referrals": attributed,
            "total_users": total_users,
            "referred_users": referred_users,
            "k_factor": k_factor,
        },
        funnel=[
            {"stage": "Links Generated", "value": generated},
            {"stage": "Clicked", "value": clicks},
            {"stage": "App Installs", "value": installs},
            {"stage": "Successful Referrals", "value": attributed},
        ],
    )


@admin_bp.get("/activity")
@require_credentials
def activity():
    """Recent activity feed."""
    project = g.project
    limit = min(int(request.args.get("limit", 25)), 100)
    events = (
        ReferralEvent.query.filter_by(project_pk=project.id)
        .order_by(ReferralEvent.created_at.desc())
        .limit(limit)
        .all()
    )
    return jsonify(events=[e.to_dict() for e in events])


@admin_bp.get("/demographics")
@require_credentials
def demographics():
    """Country breakdown derived from Geo-IP data."""
    project = g.project
    rows = (
        db.session.query(User.country, func.count(User.id))
        .filter(User.project_pk == project.id, User.country.isnot(None))
        .group_by(User.country)
        .order_by(func.count(User.id).desc())
        .all()
    )
    return jsonify(
        countries=[{"country": c or "Unknown", "users": n} for c, n in rows]
    )


@admin_bp.get("/stability")
@require_credentials
def stability():
    """SDK health score + error/blocked timeline (last 14 days)."""
    project = g.project
    since = datetime.now(timezone.utc) - timedelta(days=14)

    rows = (
        db.session.query(
            func.date(ReferralEvent.created_at).label("day"),
            ReferralEvent.event_type,
            func.count(ReferralEvent.id),
        )
        .filter(
            ReferralEvent.project_pk == project.id,
            ReferralEvent.created_at >= since,
        )
        .group_by("day", ReferralEvent.event_type)
        .all()
    )

    timeline: dict[str, dict] = {}
    total = 0
    failures = 0
    for day, event_type, n in rows:
        key = str(day)
        bucket = timeline.setdefault(key, {"date": key, "errors": 0, "blocked": 0})
        total += n
        if event_type == ReferralEvent.EVENT_ERROR:
            bucket["errors"] += n
            failures += n
        elif event_type == ReferralEvent.EVENT_BLOCKED:
            bucket["blocked"] += n
            failures += n

    health = round(100 - (failures / total * 100), 2) if total else 100.0

    return jsonify(
        health_score=health,
        timeline=sorted(timeline.values(), key=lambda x: x["date"]),
    )


@admin_bp.get("/fraud-logs")
@require_credentials
def fraud_logs():
    """Triggered anti-fraud rate-limit events."""
    project = g.project
    limit = min(int(request.args.get("limit", 50)), 200)
    events = (
        ReferralEvent.query.filter_by(
            project_pk=project.id, event_type=ReferralEvent.EVENT_BLOCKED
        )
        .order_by(ReferralEvent.created_at.desc())
        .limit(limit)
        .all()
    )
    return jsonify(logs=[e.to_dict() for e in events])


@admin_bp.get("/config")
@require_credentials
def get_config():
    """Return the current remote configuration."""
    return jsonify(config=g.project.to_dict())


@admin_bp.put("/config")
@require_credentials
def update_config():
    """Update remote rules (Save & Sync) and persist to PostgreSQL."""
    data = request.get_json(silent=True) or {}
    project: Project = g.project

    if "points_per_referral" in data:
        try:
            project.points_per_referral = max(0, int(data["points_per_referral"]))
        except (TypeError, ValueError):
            return jsonify(error="points_per_referral must be an integer"), 400

    if "fraud_detection_enabled" in data:
        project.fraud_detection_enabled = bool(data["fraud_detection_enabled"])

    if "rate_limit_per_minute" in data:
        try:
            project.rate_limit_per_minute = max(1, int(data["rate_limit_per_minute"]))
        except (TypeError, ValueError):
            return jsonify(error="rate_limit_per_minute must be an integer"), 400

    db.session.commit()
    return jsonify(status="synced", config=project.to_dict())

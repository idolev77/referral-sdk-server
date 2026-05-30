"""
Admin / analytics blueprint — powers the Developer Portal.

Endpoints aggregate ReferralEvent / User data for the dashboards and expose the
remote-config update used by the Campaign Manager ("Save & Sync").
"""
from datetime import datetime, timedelta, timezone

from flask import Blueprint, g, jsonify, request
from sqlalchemy import func

from models import ConfigChange, Project, ReferralEvent, User, db
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

    # --- Week-over-week deltas -------------------------------------------
    now = datetime.now(timezone.utc)
    week_ago = now - timedelta(days=7)
    two_weeks_ago = now - timedelta(days=14)

    def count_event_in(event_type, start, end=None):
        q = base.filter_by(event_type=event_type).filter(
            ReferralEvent.created_at >= start
        )
        if end is not None:
            q = q.filter(ReferralEvent.created_at < end)
        return q.count()

    def count_users_in(start, end=None, referred_only=False):
        q = User.query.filter(
            User.project_pk == project.id,
            User.created_at >= start,
        )
        if end is not None:
            q = q.filter(User.created_at < end)
        if referred_only:
            q = q.filter(User.referred_by.isnot(None))
        return q.count()

    def pct_change(cur, prev):
        if prev == 0:
            return None  # not enough history to compute
        return round((cur - prev) / prev * 100, 1)

    tw_attr = count_event_in(ReferralEvent.EVENT_ATTRIBUTED, week_ago)
    lw_attr = count_event_in(ReferralEvent.EVENT_ATTRIBUTED, two_weeks_ago, week_ago)

    tw_users = count_users_in(week_ago)
    lw_users = count_users_in(two_weeks_ago, week_ago)

    tw_referred = count_users_in(week_ago, referred_only=True)
    lw_referred = count_users_in(two_weeks_ago, week_ago, referred_only=True)

    tw_gen = count_event_in(ReferralEvent.EVENT_GENERATED, week_ago)
    lw_gen = count_event_in(ReferralEvent.EVENT_GENERATED, two_weeks_ago, week_ago)
    tw_k = round((tw_gen / tw_users) * (tw_attr / tw_gen), 2) if tw_users and tw_gen else 0
    lw_k = round((lw_gen / lw_users) * (lw_attr / lw_gen), 2) if lw_users and lw_gen else 0

    return jsonify(
        stats={
            "total_referrals": attributed,
            "total_users": total_users,
            "referred_users": referred_users,
            "k_factor": k_factor,
            "deltas": {
                "total_referrals": pct_change(tw_attr, lw_attr),
                "total_users": pct_change(tw_users, lw_users),
                "referred_users": pct_change(tw_referred, lw_referred),
                "k_factor": pct_change(tw_k, lw_k),
            },
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


@admin_bp.get("/leaderboard")
@require_credentials
def leaderboard():
    """Top referrers ranked by successful attributions."""
    project = g.project
    limit = min(int(request.args.get("limit", 10)), 50)

    rows = (
        db.session.query(
            User.user_id,
            User.invite_code,
            User.points_balance,
            User.country,
            func.count(ReferralEvent.id).label("referral_count"),
        )
        .outerjoin(
            ReferralEvent,
            (ReferralEvent.invite_code == User.invite_code)
            & (ReferralEvent.event_type == ReferralEvent.EVENT_ATTRIBUTED)
            & (ReferralEvent.project_pk == project.id),
        )
        .filter(User.project_pk == project.id)
        .group_by(
            User.id, User.user_id, User.invite_code, User.points_balance, User.country
        )
        .order_by(func.count(ReferralEvent.id).desc())
        .limit(limit)
        .all()
    )

    return jsonify(
        leaderboard=[
            {
                "rank": i + 1,
                "user_id": r.user_id,
                "invite_code": r.invite_code,
                "points": r.points_balance or 0,
                "referrals": r.referral_count or 0,
                "country": r.country,
            }
            for i, r in enumerate(rows)
        ]
    )


@admin_bp.get("/config")
@require_credentials
def get_config():
    """Return the current remote configuration."""
    return jsonify(config=g.project.to_dict())


@admin_bp.put("/config")
@require_credentials
def update_config():
    """Update remote rules (Save & Sync), persist to PostgreSQL, and log every change."""
    data = request.get_json(silent=True) or {}
    project: Project = g.project
    changes: list[ConfigChange] = []

    def _log(field: str, old, new):
        if str(old) != str(new):
            changes.append(
                ConfigChange(
                    project_pk=project.id,
                    field=field,
                    old_value=str(old),
                    new_value=str(new),
                )
            )

    if "points_per_referral" in data:
        try:
            new_val = max(0, int(data["points_per_referral"]))
        except (TypeError, ValueError):
            return jsonify(error="points_per_referral must be an integer"), 400
        _log("points_per_referral", project.points_per_referral, new_val)
        project.points_per_referral = new_val

    if "fraud_detection_enabled" in data:
        new_val = bool(data["fraud_detection_enabled"])
        _log("fraud_detection_enabled", project.fraud_detection_enabled, new_val)
        project.fraud_detection_enabled = new_val

    if "rate_limit_per_minute" in data:
        try:
            new_val = max(1, int(data["rate_limit_per_minute"]))
        except (TypeError, ValueError):
            return jsonify(error="rate_limit_per_minute must be an integer"), 400
        _log("rate_limit_per_minute", project.rate_limit_per_minute, new_val)
        project.rate_limit_per_minute = new_val

    if "welcome_bonus" in data:
        try:
            new_val = max(0, int(data["welcome_bonus"]))
        except (TypeError, ValueError):
            return jsonify(error="welcome_bonus must be an integer"), 400
        _log("welcome_bonus", project.welcome_bonus, new_val)
        project.welcome_bonus = new_val

    if "max_referrals_per_user" in data:
        try:
            new_val = max(0, int(data["max_referrals_per_user"]))
        except (TypeError, ValueError):
            return jsonify(error="max_referrals_per_user must be an integer"), 400
        _log("max_referrals_per_user", project.max_referrals_per_user, new_val)
        project.max_referrals_per_user = new_val

    for change in changes:
        db.session.add(change)
    db.session.commit()
    return jsonify(status="synced", config=project.to_dict(), changes_logged=len(changes))


@admin_bp.get("/config-audit")
@require_credentials
def config_audit():
    """Return the full audit trail of config changes for this project."""
    project = g.project
    limit = min(int(request.args.get("limit", 50)), 200)
    entries = (
        ConfigChange.query.filter_by(project_pk=project.id)
        .order_by(ConfigChange.changed_at.desc())
        .limit(limit)
        .all()
    )
    return jsonify(audit=[e.to_dict() for e in entries])

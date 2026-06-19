"""
Admin / analytics blueprint — powers the Developer Portal.

Endpoints aggregate ReferralEvent / User data for the dashboards and expose the
remote-config update used by the Campaign Manager ("Save & Sync").
"""
from datetime import datetime, timedelta, timezone

from flask import Blueprint, g, jsonify, request
from sqlalchemy import case, func

from cache import cached_admin_view
from models import ConfigChange, Project, ReferralEvent, User, db
from security import require_credentials

admin_bp = Blueprint("admin", __name__, url_prefix="/api/admin")


@admin_bp.get("/overview")
@require_credentials
@cached_admin_view("overview")
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
@cached_admin_view("demographics")
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


@admin_bp.get("/signups")
@require_credentials
@cached_admin_view("signups")
def signups():
    """
    New members (people joining) over time, bucketed by day or hour.

    Fully aggregated in SQL (one row per bucket) so the payload size and work
    scale with the number of *buckets*, not the number of users — and the result
    is cached behind the versioned admin cache.

    Query args:
        granularity = "day" (default) | "hour"
        days        = look-back window (default 30 for day, 2 for hour)
    """
    project = g.project
    granularity = request.args.get("granularity", "day")
    if granularity not in ("day", "hour"):
        granularity = "day"

    default_days = 2 if granularity == "hour" else 30
    max_days = 14 if granularity == "hour" else 365
    try:
        days = min(max(int(request.args.get("days", default_days)), 1), max_days)
    except (TypeError, ValueError):
        days = default_days

    since = datetime.now(timezone.utc) - timedelta(days=days)

    # Dialect-aware time-bucket expression (PostgreSQL in prod, SQLite in dev).
    dialect = db.engine.dialect.name
    if dialect == "postgresql":
        bucket = func.date_trunc(granularity, User.created_at)
    else:  # sqlite / others
        fmt = "%Y-%m-%d %H:00" if granularity == "hour" else "%Y-%m-%d"
        bucket = func.strftime(fmt, User.created_at)

    rows = (
        db.session.query(bucket.label("bucket"), func.count(User.id))
        .filter(User.project_pk == project.id, User.created_at >= since)
        .group_by("bucket")
        .order_by("bucket")
        .all()
    )

    series = [
        {
            "ts": b.isoformat() if hasattr(b, "isoformat") else str(b),
            "count": int(n),
        }
        for b, n in rows
    ]

    return jsonify(
        granularity=granularity,
        days=days,
        total=sum(p["count"] for p in series),
        series=series,
    )


@admin_bp.get("/economy")
@require_credentials
@cached_admin_view("economy")
def economy():
    """Points economy: issued vs redeemed, outstanding liability, sources, 30-day flow."""
    project = g.project
    now = datetime.now(timezone.utc)
    since = now - timedelta(days=30)

    # Positive deltas are points issued; negative deltas are points redeemed.
    issued_expr = func.coalesce(
        func.sum(case((ReferralEvent.points_delta > 0, ReferralEvent.points_delta), else_=0)),
        0,
    )
    redeemed_expr = func.coalesce(
        func.sum(case((ReferralEvent.points_delta < 0, -ReferralEvent.points_delta), else_=0)),
        0,
    )

    # Totals + per-event-type breakdown in a single grouped query (one row per
    # event type, not one row per event).
    issued = redeemed = 0
    sources = {"Referral Rewards": 0, "Daily Bonus": 0, "Other": 0}
    type_rows = (
        db.session.query(ReferralEvent.event_type, issued_expr, redeemed_expr)
        .filter(ReferralEvent.project_pk == project.id)
        .group_by(ReferralEvent.event_type)
        .all()
    )
    for event_type, iss, red in type_rows:
        iss, red = int(iss or 0), int(red or 0)
        issued += iss
        redeemed += red
        if event_type in (ReferralEvent.EVENT_INSTALL, ReferralEvent.EVENT_ATTRIBUTED):
            sources["Referral Rewards"] += iss
        elif event_type == ReferralEvent.EVENT_DAILY_BONUS:
            sources["Daily Bonus"] += iss
        else:
            sources["Other"] += iss

    # 30-day issued/redeemed flow, aggregated by day in SQL.
    timeline_rows = (
        db.session.query(
            func.date(ReferralEvent.created_at).label("day"),
            issued_expr,
            redeemed_expr,
        )
        .filter(
            ReferralEvent.project_pk == project.id,
            ReferralEvent.created_at >= since,
        )
        .group_by("day")
        .all()
    )
    timeline = [
        {"date": str(day), "issued": int(iss or 0), "redeemed": int(red or 0)}
        for day, iss, red in timeline_rows
    ]

    outstanding = (
        db.session.query(func.coalesce(func.sum(User.points_balance), 0))
        .filter(User.project_pk == project.id)
        .scalar()
    ) or 0

    return jsonify(
        issued=issued,
        redeemed=redeemed,
        outstanding=int(outstanding),
        redemption_rate=round(redeemed / issued * 100, 1) if issued else 0.0,
        sources=[{"source": k, "points": v} for k, v in sources.items() if v > 0],
        timeline=sorted(timeline, key=lambda x: x["date"]),
    )


@admin_bp.get("/referral-tree")
@require_credentials
@cached_admin_view("referral-tree")
def referral_tree():
    """Viral tree derived from User.referred_by: generations, depth, downstream reach."""
    project = g.project
    users = User.query.filter_by(project_pk=project.id).all()

    by_id = {u.user_id: u for u in users}
    children: dict[str, list] = {}
    for u in users:
        ref = u.referred_by
        if ref and ref in by_id and ref != u.user_id:
            children.setdefault(ref, []).append(u.user_id)

    total_users = len(users)
    referred = sum(1 for u in users if u.referred_by and u.referred_by in by_id)
    organic = total_users - referred

    # Generation (depth) of each user — 0 = organic root, 1 = direct referral, etc.
    depth_cache: dict[str, int] = {}

    def depth_of(uid, stack):
        if uid in depth_cache:
            return depth_cache[uid]
        u = by_id.get(uid)
        if not u or not u.referred_by or u.referred_by not in by_id or uid in stack:
            depth_cache[uid] = 0
            return 0
        d = 1 + depth_of(u.referred_by, stack | {uid})
        depth_cache[uid] = d
        return d

    generations: dict[int, int] = {}
    max_depth = 0
    for u in users:
        d = depth_of(u.user_id, set())
        max_depth = max(max_depth, d)
        generations[d] = generations.get(d, 0) + 1

    # Total descendants (downstream reach) per referrer.
    downstream_cache: dict[str, int] = {}

    def downstream(uid, stack):
        if uid in downstream_cache:
            return downstream_cache[uid]
        total = 0
        for c in children.get(uid, []):
            if c in stack:
                continue
            total += 1 + downstream(c, stack | {uid})
        downstream_cache[uid] = total
        return total

    top = []
    for u in users:
        direct = len(children.get(u.user_id, []))
        if direct == 0:
            continue
        top.append({
            "user_id": u.user_id,
            "invite_code": u.invite_code,
            "direct": direct,
            "downstream": downstream(u.user_id, set()),
            "points": u.points_balance,
        })
    top.sort(key=lambda x: (x["downstream"], x["direct"]), reverse=True)

    generations_out = [
        {"depth": d, "label": "Organic" if d == 0 else f"Gen {d}", "users": n}
        for d, n in sorted(generations.items())
    ]

    return jsonify(
        total_users=total_users,
        total_referred=referred,
        organic_users=organic,
        max_depth=max_depth,
        viral_pct=round(referred / total_users * 100, 1) if total_users else 0.0,
        generations=generations_out,
        top_referrers=top[:10],
    )


@admin_bp.get("/conversion")
@require_credentials
@cached_admin_view("conversion")
def conversion():
    """Funnel conversion rates + click→attributed latency + per-country conversion."""
    project = g.project
    base = ReferralEvent.query.filter_by(project_pk=project.id)

    generated = base.filter_by(event_type=ReferralEvent.EVENT_GENERATED).count()
    clicks = base.filter_by(event_type=ReferralEvent.EVENT_CLICK).count()
    attributed = base.filter_by(event_type=ReferralEvent.EVENT_ATTRIBUTED).count()

    def rate(num, den):
        return round(num / den * 100, 1) if den else 0.0

    # First click / first attribution per invite code, computed in SQL so we
    # transfer one row per code instead of every click/attribution event.
    first_click = dict(
        base.with_entities(
            ReferralEvent.invite_code, func.min(ReferralEvent.created_at)
        )
        .filter(
            ReferralEvent.event_type == ReferralEvent.EVENT_CLICK,
            ReferralEvent.invite_code.isnot(None),
        )
        .group_by(ReferralEvent.invite_code)
        .all()
    )
    first_attr = dict(
        base.with_entities(
            ReferralEvent.invite_code, func.min(ReferralEvent.created_at)
        )
        .filter(
            ReferralEvent.event_type == ReferralEvent.EVENT_ATTRIBUTED,
            ReferralEvent.invite_code.isnot(None),
        )
        .group_by(ReferralEvent.invite_code)
        .all()
    )

    deltas = []
    for c, t_attr in first_attr.items():
        t_click = first_click.get(c)
        if t_click and t_attr >= t_click:
            deltas.append((t_attr - t_click).total_seconds())
    deltas.sort()

    median = deltas[len(deltas) // 2] if deltas else None
    avg = round(sum(deltas) / len(deltas), 1) if deltas else None

    bucket_defs = [
        ("<1m", 0, 60), ("1-5m", 60, 300), ("5-30m", 300, 1800),
        ("30m-1h", 1800, 3600), ("1h-1d", 3600, 86400), (">1d", 86400, float("inf")),
    ]
    buckets = [
        {"label": label, "count": sum(1 for d in deltas if lo <= d < hi)}
        for label, lo, hi in bucket_defs
    ]

    def country_counts(event_type):
        country_label = func.coalesce(ReferralEvent.country, "Unknown")
        rows = (
            base.with_entities(country_label, func.count(ReferralEvent.id))
            .filter(
                ReferralEvent.event_type == event_type,
                ReferralEvent.invite_code.isnot(None),
            )
            .group_by(country_label)
            .all()
        )
        return {country: n for country, n in rows}

    country_clicks = country_counts(ReferralEvent.EVENT_CLICK)
    country_attr = country_counts(ReferralEvent.EVENT_ATTRIBUTED)

    by_country = []
    for country in set(list(country_clicks) + list(country_attr)):
        cl = country_clicks.get(country, 0)
        at = country_attr.get(country, 0)
        by_country.append({
            "country": country,
            "clicks": cl,
            "attributed": at,
            "rate": round(at / cl * 100, 1) if cl else None,
        })
    by_country.sort(key=lambda x: x["attributed"], reverse=True)

    return jsonify(
        counts={"generated": generated, "clicked": clicks, "attributed": attributed},
        rates={
            "click_through": rate(clicks, generated),
            "attribution": rate(attributed, clicks),
            "end_to_end": rate(attributed, generated),
        },
        time_to_convert={
            "median_seconds": median,
            "avg_seconds": avg,
            "sample_size": len(deltas),
            "buckets": buckets,
        },
        by_country=by_country[:8],
    )


@admin_bp.get("/stability")
@require_credentials
@cached_admin_view("stability")
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
@cached_admin_view("leaderboard")
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

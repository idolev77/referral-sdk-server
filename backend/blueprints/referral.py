"""
Referral API blueprint.

These endpoints are consumed by the mobile Client SDK. Every endpoint validates
the x-api-key / x-project-id headers and the deep-link tracking endpoint is
protected by the Redis anti-fraud rate limiter.
"""
import json
import secrets
from datetime import timedelta

from flask import Blueprint, g, jsonify, request

from cache import invalidate_project_cache
from extensions import get_redis
from geoip_service import get_client_ip, resolve_country
from models import ReferralEvent, User, db
from security import rate_limit, require_credentials

referral_bp = Blueprint("referral", __name__, url_prefix="/api/referral")


def _generate_invite_code() -> str:
    return secrets.token_urlsafe(6).replace("_", "").replace("-", "")[:8].upper()


def _get_or_create_user(project, user_id, country=None) -> User:
    user = User.query.filter_by(project_pk=project.id, user_id=user_id).first()
    if user is None:
        user = User(project_pk=project.id, user_id=user_id, points_balance=0)
        db.session.add(user)
    if country and not user.country:
        user.country = country
    return user


@referral_bp.post("/generate")
@require_credentials
def generate():
    """Create (or fetch) a unique invite code + shareable link for a user."""
    data = request.get_json(silent=True) or {}
    user_id = data.get("user_id")
    if not user_id:
        return jsonify(error="user_id is required"), 400

    project = g.project
    ip = get_client_ip(request)
    country = resolve_country(ip)

    user = _get_or_create_user(project, user_id, country)

    if not user.invite_code:
        code = _generate_invite_code()
        # Guarantee global uniqueness.
        while User.query.filter_by(invite_code=code).first() is not None:
            code = _generate_invite_code()
        user.invite_code = code

    db.session.add(
        ReferralEvent(
            project_pk=project.id,
            event_type=ReferralEvent.EVENT_GENERATED,
            invite_code=user.invite_code,
            user_id=user_id,
            ip_address=ip,
            country=country,
        )
    )
    db.session.commit()

    # New `generated` event shifts the funnel / K-factor — refresh admin caches.
    invalidate_project_cache(project.project_id)

    base = request.host_url.rstrip("/")
    return jsonify(
        invite_code=user.invite_code,
        invite_link=f"{base}/i/{user.invite_code}",
        deep_link=f"referralsdk://invite?code={user.invite_code}",
    )


@referral_bp.post("/track")
@require_credentials
@rate_limit
def track():
    """
    Handle a deep-link click / install attribution.

    Body: { invite_code, new_user_id, stage? }  stage in {click, install, attributed}
    On a successful attribution the inviter is credited points_per_referral.
    """
    data = request.get_json(silent=True) or {}
    invite_code = (data.get("invite_code") or "").upper()
    new_user_id = data.get("new_user_id")
    stage = data.get("stage", ReferralEvent.EVENT_ATTRIBUTED)

    if not invite_code:
        return jsonify(error="invite_code is required"), 400

    project = g.project
    ip = get_client_ip(request)
    country = resolve_country(ip)

    inviter = User.query.filter_by(
        project_pk=project.id, invite_code=invite_code
    ).first()
    if inviter is None:
        return jsonify(error="Invalid invite_code"), 404

    points_awarded = 0

    # Record the funnel event.
    db.session.add(
        ReferralEvent(
            project_pk=project.id,
            event_type=stage,
            invite_code=invite_code,
            user_id=new_user_id,
            ip_address=ip,
            country=country,
        )
    )

    # Credit points + link referee only on a successful attribution.
    if stage == ReferralEvent.EVENT_ATTRIBUTED and new_user_id:
        referee = _get_or_create_user(project, new_user_id, country)
        if referee.referred_by is None and referee.user_id != inviter.user_id:
            referee.referred_by = inviter.user_id
            points_awarded = project.points_per_referral
            inviter.points_balance += points_awarded
            db.session.add(
                ReferralEvent(
                    project_pk=project.id,
                    event_type=ReferralEvent.EVENT_INSTALL,
                    invite_code=invite_code,
                    user_id=new_user_id,
                    ip_address=ip,
                    country=country,
                    points_delta=points_awarded,
                    meta=json.dumps({"inviter": inviter.user_id}),
                )
            )

    db.session.commit()

    # A new funnel event (click/install/attributed) changes every dashboard
    # aggregate — invalidate the project's admin caches.
    invalidate_project_cache(project.project_id)

    # Invalidate the inviter's cached balance so the next /balance call
    # returns the fresh DB value and not a stale Redis entry.
    if points_awarded > 0:
        try:
            get_redis().delete(f"balance:{project.project_id}:{inviter.user_id}")
        except Exception:
            pass

    return jsonify(
        status="ok",
        stage=stage,
        points_awarded=points_awarded,
        inviter_balance=inviter.points_balance,
    )


@referral_bp.get("/balance")
@require_credentials
def balance():
    """Return the current points balance for a user (Redis cached)."""
    user_id = request.args.get("user_id")
    if not user_id:
        return jsonify(error="user_id query param is required"), 400

    project = g.project
    cache = get_redis()
    cache_key = f"balance:{project.project_id}:{user_id}"

    try:
        cached = cache.get(cache_key)
        if cached is not None:
            return jsonify(user_id=user_id, points_balance=int(cached), cached=True)
    except Exception:
        cache = None

    user = User.query.filter_by(project_pk=project.id, user_id=user_id).first()
    if user is None:
        return jsonify(error="User not found"), 404

    if cache is not None:
        try:
            cache.setex(cache_key, 15, user.points_balance)
        except Exception:
            pass

    return jsonify(user_id=user_id, points_balance=user.points_balance, cached=False)


@referral_bp.post("/claim")
@require_credentials
def claim():
    """Deduct points for a reward redemption."""
    data = request.get_json(silent=True) or {}
    user_id = data.get("user_id")
    cost = data.get("cost")

    if not user_id or cost is None:
        return jsonify(error="user_id and cost are required"), 400
    try:
        cost = int(cost)
    except (TypeError, ValueError):
        return jsonify(error="cost must be an integer"), 400
    if cost <= 0:
        return jsonify(error="cost must be positive"), 400

    project = g.project
    user = User.query.filter_by(project_pk=project.id, user_id=user_id).first()
    if user is None:
        return jsonify(error="User not found"), 404
    if user.points_balance < cost:
        return jsonify(error="Insufficient points", balance=user.points_balance), 402

    user.points_balance -= cost
    db.session.add(
        ReferralEvent(
            project_pk=project.id,
            event_type=ReferralEvent.EVENT_CLAIM,
            user_id=user_id,
            points_delta=-cost,
            meta=json.dumps({"reward_cost": cost}),
        )
    )
    db.session.commit()

    # Invalidate cached balance + admin economy aggregates (points redeemed).
    try:
        get_redis().delete(f"balance:{project.project_id}:{user_id}")
    except Exception:
        pass
    invalidate_project_cache(project.project_id)

    return jsonify(status="ok", user_id=user_id, points_balance=user.points_balance)


_DAILY_BONUS_POINTS = 2
_DAILY_BONUS_COOLDOWN = timedelta(hours=24)


@referral_bp.post("/daily-bonus")
@require_credentials
def daily_bonus():
    """
    Award 2 points once every 24 hours.

    The cooldown is enforced entirely on the server using the UTC timestamp
    stored in `users.last_daily_claim_at` — changing the device clock has
    no effect.

    Returns 200 on success or 429 with `retry_after_seconds` when the
    cooldown has not yet expired.
    """
    from models import _utcnow  # local import to avoid circular refs at module level

    data = request.get_json(silent=True) or {}
    user_id = data.get("user_id")
    if not user_id:
        return jsonify(error="user_id is required"), 400

    project = g.project
    ip = get_client_ip(request)
    country = resolve_country(ip)

    user = _get_or_create_user(project, user_id, country)

    now = _utcnow()

    if user.last_daily_claim_at is not None:
        # Ensure both datetimes are timezone-aware before subtracting.
        last = user.last_daily_claim_at
        if last.tzinfo is None:
            from datetime import timezone
            last = last.replace(tzinfo=timezone.utc)

        elapsed = now - last
        if elapsed < _DAILY_BONUS_COOLDOWN:
            remaining = int((_DAILY_BONUS_COOLDOWN - elapsed).total_seconds())
            return jsonify(
                error="Daily bonus already claimed",
                retry_after_seconds=remaining,
            ), 429

    # Credit the bonus.
    user.points_balance += _DAILY_BONUS_POINTS
    user.last_daily_claim_at = now

    db.session.add(
        ReferralEvent(
            project_pk=project.id,
            event_type=ReferralEvent.EVENT_DAILY_BONUS,
            user_id=user_id,
            ip_address=ip,
            country=country,
            points_delta=_DAILY_BONUS_POINTS,
            meta=json.dumps({"bonus_points": _DAILY_BONUS_POINTS}),
        )
    )
    db.session.commit()

    # Invalidate cached balance + admin economy/activity aggregates.
    try:
        get_redis().delete(f"balance:{project.project_id}:{user_id}")
    except Exception:
        pass
    invalidate_project_cache(project.project_id)

    return jsonify(
        status="ok",
        user_id=user_id,
        points_awarded=_DAILY_BONUS_POINTS,
        points_balance=user.points_balance,
        next_claim_at=(now + _DAILY_BONUS_COOLDOWN).isoformat(),
    )

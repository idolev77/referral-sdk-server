"""
Security & anti-fraud decorators.

  * require_credentials : validates x-api-key + x-project-id headers and injects
                          the resolved Project into flask.g.
  * rate_limit          : Redis sliding-window limiter (per IP + endpoint).
                          When exceeded it logs a `blocked` ReferralEvent so the
                          portal's Anti-Fraud Logs table can render it.
"""
import functools
import json
import logging

from flask import g, jsonify, request

from extensions import get_redis
from geoip_service import get_client_ip, resolve_country
from models import Project, ReferralEvent, db

logger = logging.getLogger("antifraud")


def require_credentials(fn):
    """Validate x-api-key + x-project-id, load Project into flask.g.project."""

    @functools.wraps(fn)
    def wrapper(*args, **kwargs):
        api_key = request.headers.get("x-api-key")
        project_id = request.headers.get("x-project-id")

        if not api_key or not project_id:
            return (
                jsonify(error="Missing x-api-key or x-project-id header"),
                401,
            )

        project = Project.query.filter_by(
            project_id=project_id, api_key=api_key
        ).first()
        if project is None:
            return jsonify(error="Invalid project credentials"), 403

        g.project = project
        return fn(*args, **kwargs)

    return wrapper


def rate_limit(fn):
    """
    Sliding-window rate limiter keyed by (project, endpoint, ip).

    Honors each project's `rate_limit_per_minute` and `fraud_detection_enabled`
    remote config. Blocked attempts are logged as `blocked` ReferralEvents.
    """

    @functools.wraps(fn)
    def wrapper(*args, **kwargs):
        project = getattr(g, "project", None)

        # If fraud detection is disabled for this project, skip limiting.
        if project is not None and not project.fraud_detection_enabled:
            return fn(*args, **kwargs)

        limit = project.rate_limit_per_minute if project else 5
        window = 60
        ip = get_client_ip(request)
        key = f"ratelimit:{getattr(project, 'project_id', 'anon')}:{request.endpoint}:{ip}"

        redis_client = get_redis()
        try:
            current = redis_client.incr(key)
            if current == 1:
                redis_client.expire(key, window)
        except Exception:
            # Redis unavailable -> fail open (never block real traffic on infra error).
            return fn(*args, **kwargs)

        if current > limit:
            ttl = redis_client.ttl(key)
            logger.warning(
                "Rate limit exceeded ip=%s endpoint=%s project=%s",
                ip,
                request.endpoint,
                getattr(project, "project_id", None),
            )
            _log_blocked(project, ip, request.endpoint)
            return (
                jsonify(
                    error="Rate limit exceeded. Slow down.",
                    retry_after_seconds=ttl,
                ),
                429,
            )

        return fn(*args, **kwargs)

    return wrapper


def _log_blocked(project, ip, endpoint) -> None:
    if project is None:
        return
    try:
        country = resolve_country(ip)
        evt = ReferralEvent(
            project_pk=project.id,
            event_type=ReferralEvent.EVENT_BLOCKED,
            ip_address=ip,
            country=country,
            meta=json.dumps({"endpoint": endpoint, "reason": "rate_limit"}),
        )
        db.session.add(evt)
        db.session.commit()
    except Exception:
        db.session.rollback()

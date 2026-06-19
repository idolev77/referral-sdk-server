"""
Read-through caching for the heavy admin analytics endpoints.

Strategy — cache-aside with *debounced* version-based invalidation
------------------------------------------------------------------
Every cached payload's Redis key embeds the project's *current cache version*:

    admin:{project_id}:v{version}:{endpoint}:{query_args}

A single O(1) ``INCR`` on the version counter instantly orphans *all* of the
project's cached entries at once — without a ``KEYS``/``SCAN`` sweep — and the
orphaned keys expire on their own TTL shortly after.

The naive approach bumps the version on *every* write. Under real SDK traffic
(clicks, installs, attributions, claims, daily bonuses) writes are constant, so
the version churns continuously and the heavy analytics endpoints are recomputed
on almost every dashboard load — the cache barely helps.

To fix that without sacrificing freshness, invalidation is **debounced** with a
leading + trailing edge, coordinated entirely in Redis (no background worker):

* **Leading edge** — the first write after a quiet period bumps the version
  immediately (``SET cooldown NX EX`` wins) and opens a cooldown window. So an
  idle dashboard still reflects a fresh write on the very next read.
* **Coalescing** — further writes *inside* the window don't bump; they just set
  a ``dirty`` flag. A burst of N writes costs at most one version bump.
* **Trailing edge** — once the window elapses, the next read (or write) sees the
  ``dirty`` flag, applies a single bump and clears it. So writes that landed
  during a burst become visible within ~one window, not only at TTL expiry.

Net effect: at most ~one version bump per debounce window per project, the cache
stays warm during steady traffic, and worst-case staleness is bounded by the
window (with the TTL as the ultimate backstop). The whole layer is best-effort:
if Redis is unavailable the views fall back to serving directly from the
database, never erroring.
"""
import functools
import os

from flask import Response, g, request

from extensions import get_redis

# Analytics dashboards tolerate brief staleness; this is the backstop TTL.
ADMIN_CACHE_TTL = 120  # seconds

# Coalescing window for invalidations: a burst of writes within this many
# seconds triggers at most one version bump. Tunable via env.
ADMIN_CACHE_DEBOUNCE_SECONDS = int(os.getenv("ADMIN_CACHE_DEBOUNCE_SECONDS", "10"))


def _version_key(project_id: str) -> str:
    return f"admin:ver:{project_id}"


def _cooldown_key(project_id: str) -> str:
    return f"admin:ver:cooldown:{project_id}"


def _dirty_key(project_id: str) -> str:
    return f"admin:ver:dirty:{project_id}"


def _bump_version(redis, project_id: str) -> None:
    """Apply one version bump and clear any pending-write flag."""
    redis.incr(_version_key(project_id))
    redis.delete(_dirty_key(project_id))


def _current_version(project_id: str):
    """
    Return the project's cache version, or None if Redis is unreachable.

    Applies the *trailing edge* of the debounce: if writes were coalesced during
    a cooldown window that has since elapsed, fold them into a single version
    bump now so this and subsequent reads reflect them.
    """
    try:
        redis = get_redis()
        # Trailing edge — pending writes exist and the previous window is over.
        if redis.get(_dirty_key(project_id)):
            window = max(ADMIN_CACHE_DEBOUNCE_SECONDS, 1)
            if redis.set(_cooldown_key(project_id), "1", nx=True, ex=window):
                _bump_version(redis, project_id)
        v = redis.get(_version_key(project_id))
        return v if v is not None else "0"
    except Exception:
        return None


def invalidate_project_cache(project_id: str) -> None:
    """
    Debounced invalidation of every cached admin payload for a project.

    Leading edge: the first write in a quiet period bumps the version right away
    and opens a cooldown window. Writes within the window are coalesced (only a
    ``dirty`` flag is set) and folded into a single bump on the trailing edge
    (see :func:`_current_version`). Safe to call on every write; never raises.
    """
    if not project_id:
        return
    try:
        redis = get_redis()
        window = max(ADMIN_CACHE_DEBOUNCE_SECONDS, 1)
        # Leading edge: win the cooldown -> bump immediately. Otherwise we're
        # inside an active window, so just record that a write is pending.
        if redis.set(_cooldown_key(project_id), "1", nx=True, ex=window):
            _bump_version(redis, project_id)
        else:
            redis.set(_dirty_key(project_id), "1")
    except Exception:
        pass  # caching is best-effort — a write must never fail on Redis error


def cached_admin_view(name: str, ttl: int = ADMIN_CACHE_TTL):
    """
    Cache-aside decorator for read-only admin analytics endpoints.

    Place it *below* ``@require_credentials`` so ``g.project`` is already set::

        @admin_bp.get("/overview")
        @require_credentials
        @cached_admin_view("overview")
        def overview():
            ...

    On a cache HIT the stored JSON body is returned verbatim (no DB query, no
    re-serialization). On a MISS the wrapped view runs and its JSON body is
    stored under the versioned key with the backstop TTL.
    """

    def decorator(fn):
        @functools.wraps(fn)
        def wrapper(*args, **kwargs):
            project = getattr(g, "project", None)
            version = _current_version(project.project_id) if project else None

            # No project context or Redis down -> serve straight from the DB.
            if project is None or version is None:
                return fn(*args, **kwargs)

            # Embed query args (e.g. ?limit=) so variants don't collide; the
            # version segment retires them all on the next write.
            args_sig = ":".join(f"{k}={v}" for k, v in sorted(request.args.items()))
            key = f"admin:{project.project_id}:v{version}:{name}:{args_sig}"

            try:
                cached = get_redis().get(key)
            except Exception:
                cached = None
            if cached is not None:
                resp = Response(cached, mimetype="application/json")
                resp.headers["X-Cache"] = "HIT"
                return resp

            # MISS — compute, then store the serialized JSON body.
            resp = fn(*args, **kwargs)
            try:
                get_redis().setex(key, ttl, resp.get_data(as_text=True))
                resp.headers["X-Cache"] = "MISS"
            except Exception:
                pass
            return resp

        return wrapper

    return decorator

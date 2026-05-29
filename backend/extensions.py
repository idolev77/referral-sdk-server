"""Shared Redis client + cache helpers."""
import os

import redis

_redis_client: redis.Redis | None = None


def init_redis(app) -> redis.Redis:
    """Create a single shared Redis connection pool for the app."""
    global _redis_client
    _redis_client = redis.Redis.from_url(
        app.config["REDIS_URL"], decode_responses=True
    )
    return _redis_client


def get_redis() -> redis.Redis:
    """Return the shared Redis client (lazily creating one if needed)."""
    global _redis_client
    if _redis_client is None:
        _redis_client = redis.Redis.from_url(
            os.getenv("REDIS_URL", "redis://localhost:6379/0"),
            decode_responses=True,
        )
    return _redis_client

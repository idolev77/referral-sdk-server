"""
Application configuration.

Loads settings from environment variables (with sane local defaults) so the
same codebase runs identically in development, staging and production.
"""
import os

from dotenv import load_dotenv

load_dotenv()


class Config:
    """Base configuration shared across all environments."""

    # --- Flask core ---------------------------------------------------------
    SECRET_KEY = os.getenv("SECRET_KEY", "dev-secret-change-me")
    JSON_SORT_KEYS = False

    # --- PostgreSQL (SQLAlchemy) -------------------------------------------
    SQLALCHEMY_DATABASE_URI = os.getenv(
        "DATABASE_URL",
        "postgresql://postgres:postgres@localhost:5432/referral_sdk",
    )
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    SQLALCHEMY_ENGINE_OPTIONS = {
        "pool_pre_ping": True,
        "pool_recycle": 280,
    }

    # --- Redis (cache + anti-fraud rate-limiting) --------------------------
    REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")

    # --- Anti-fraud rate limiting ------------------------------------------
    RATE_LIMIT_REQUESTS = int(os.getenv("RATE_LIMIT_REQUESTS", "5"))
    RATE_LIMIT_WINDOW_SECONDS = int(os.getenv("RATE_LIMIT_WINDOW_SECONDS", "60"))

    # --- Geo-IP -------------------------------------------------------------
    # Optional path to a MaxMind GeoLite2-Country.mmdb file. When absent the
    # service falls back to a lightweight HTTP lookup / "Unknown".
    GEOIP_DB_PATH = os.getenv("GEOIP_DB_PATH", "")

    # --- Referral economy defaults -----------------------------------------
    DEFAULT_POINTS_PER_REFERRAL = int(os.getenv("DEFAULT_POINTS_PER_REFERRAL", "100"))

    # --- Local-dev geo -----------------------------------------------------
    # Country attributed to private / LAN traffic (e.g. a phone on the same Wi-Fi),
    # which has no geo-locatable public IP. Empty -> auto-detect the server's own
    # public-IP country (falls back to "Israel").
    LOCAL_DEV_COUNTRY = os.getenv("LOCAL_DEV_COUNTRY", "")

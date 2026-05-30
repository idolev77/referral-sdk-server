"""
Geo-IP resolution.

Resolves a request IP address to a country. Strategy:
  1. If a MaxMind GeoLite2 .mmdb is configured -> fast local lookup.
  2. Otherwise fall back to a free HTTP lookup (ip-api.com), cached in Redis.
  3. Private / loopback IPs resolve to a deterministic demo country so local
     development still produces meaningful demographics.
"""
import ipaddress

import requests

from extensions import get_redis

_GEO_CACHE_TTL = 60 * 60 * 24  # 24h
_geoip_reader = None
_DEMO_COUNTRIES = [
    "United States", "India", "Brazil", "Germany",
    "United Kingdom", "Nigeria", "Indonesia", "Israel",
]


def _init_reader(app) -> None:
    global _geoip_reader
    path = app.config.get("GEOIP_DB_PATH")
    if path:
        try:
            import geoip2.database  # imported lazily

            _geoip_reader = geoip2.database.Reader(path)
        except Exception:  # pragma: no cover - optional dependency / file
            _geoip_reader = None


def init_geoip(app) -> None:
    _init_reader(app)


def _is_private(ip: str) -> bool:
    try:
        return ipaddress.ip_address(ip).is_private or ipaddress.ip_address(ip).is_loopback
    except ValueError:
        return True


def get_client_ip(request) -> str:
    """Extract the real client IP, honoring common reverse-proxy headers."""
    forwarded = request.headers.get("X-Forwarded-For", "")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.headers.get("X-Real-IP") or request.remote_addr or "0.0.0.0"


def resolve_country(ip: str) -> str:
    """Resolve an IP to a country name, with Redis caching."""
    if not ip:
        return "Unknown"

    # Deterministic demo country for local / private addresses.
    if _is_private(ip):
        idx = sum(bytearray(ip.encode())) % len(_DEMO_COUNTRIES)
        return _DEMO_COUNTRIES[idx]

    cache = get_redis()
    cache_key = f"geoip:{ip}"
    try:
        cached = cache.get(cache_key)
        if cached:
            return cached
    except Exception:
        cache = None  # Redis down -> skip caching, still resolve.

    country = "Unknown"

    # 1) Local MaxMind DB
    if _geoip_reader is not None:
        try:
            country = _geoip_reader.country(ip).country.name or "Unknown"
        except Exception:
            country = "Unknown"

    # 2) HTTP fallback
    if country == "Unknown":
        try:
            resp = requests.get(
                f"http://ip-api.com/json/{ip}?fields=status,country",
                timeout=2,
            )
            data = resp.json()
            if data.get("status") == "success":
                country = data.get("country") or "Unknown"
        except Exception:
            country = "Unknown"

    if cache is not None and country != "Unknown":
        try:
            cache.setex(cache_key, _GEO_CACHE_TTL, country)
        except Exception:
            pass

    return country

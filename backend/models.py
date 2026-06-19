"""
SQLAlchemy models for the Gamified Referral & Virality SDK.

Three core entities:
  * Project        - a tenant / host app, owns API credentials + remote config.
  * User           - an end-user of a host app, holds the points balance.
  * ReferralEvent  - immutable event log (clicks, installs, attributions,
                     claims, blocked/fraud, errors) used to power the portal.
"""
import secrets
import uuid
from datetime import datetime, timezone

from flask_sqlalchemy import SQLAlchemy

db = SQLAlchemy()


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _gen_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:24]}"


class Project(db.Model):
    """A tenant (host application) with its own credentials and remote config."""

    __tablename__ = "projects"

    id = db.Column(db.Integer, primary_key=True)
    project_id = db.Column(db.String(64), unique=True, nullable=False, index=True)
    api_key = db.Column(db.String(128), unique=True, nullable=False, index=True)
    name = db.Column(db.String(120), nullable=False, default="Untitled Project")

    # --- Remote configuration (synced to the SDK / editable in portal) -----
    points_per_referral = db.Column(db.Integer, nullable=False, default=100)
    fraud_detection_enabled = db.Column(db.Boolean, nullable=False, default=True)
    rate_limit_per_minute = db.Column(db.Integer, nullable=False, default=5)
    welcome_bonus = db.Column(db.Integer, nullable=False, default=0)
    max_referrals_per_user = db.Column(db.Integer, nullable=False, default=0)  # 0 = unlimited

    created_at = db.Column(db.DateTime(timezone=True), default=_utcnow)
    updated_at = db.Column(
        db.DateTime(timezone=True), default=_utcnow, onupdate=_utcnow
    )

    users = db.relationship("User", backref="project", lazy="dynamic")
    events = db.relationship("ReferralEvent", backref="project", lazy="dynamic")

    @staticmethod
    def generate_credentials() -> tuple[str, str]:
        """Return a fresh (project_id, api_key) pair."""
        return _gen_id("proj"), secrets.token_urlsafe(32)

    def to_dict(self) -> dict:
        return {
            "project_id": self.project_id,
            "name": self.name,
            "points_per_referral": self.points_per_referral,
            "fraud_detection_enabled": self.fraud_detection_enabled,
            "rate_limit_per_minute": self.rate_limit_per_minute,
            "welcome_bonus": self.welcome_bonus,
            "max_referrals_per_user": self.max_referrals_per_user,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }


class User(db.Model):
    """End-user of a host app. Identified by (project_id, user_id)."""

    __tablename__ = "users"
    __table_args__ = (
        db.UniqueConstraint("project_pk", "user_id", name="uq_project_user"),
    )

    id = db.Column(db.Integer, primary_key=True)
    project_pk = db.Column(
        db.Integer, db.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False
    )
    user_id = db.Column(db.String(128), nullable=False, index=True)

    points_balance = db.Column(db.Integer, nullable=False, default=0)
    country = db.Column(db.String(64), nullable=True, index=True)

    # Referral graph
    invite_code = db.Column(db.String(32), unique=True, nullable=True, index=True)
    referred_by = db.Column(db.String(128), nullable=True)

    # Daily login bonus — server-enforced 24-hour cooldown
    last_daily_claim_at = db.Column(db.DateTime(timezone=True), nullable=True)

    created_at = db.Column(db.DateTime(timezone=True), default=_utcnow, index=True)
    updated_at = db.Column(
        db.DateTime(timezone=True), default=_utcnow, onupdate=_utcnow
    )

    def to_dict(self) -> dict:
        return {
            "user_id": self.user_id,
            "points_balance": self.points_balance,
            "country": self.country,
            "invite_code": self.invite_code,
            "referred_by": self.referred_by,
        }


class ReferralEvent(db.Model):
    """Immutable analytics event powering the developer portal dashboards."""

    __tablename__ = "referral_events"

    # Funnel / lifecycle stages
    EVENT_GENERATED = "generated"
    EVENT_CLICK = "click"
    EVENT_INSTALL = "install"
    EVENT_ATTRIBUTED = "attributed"  # successful referral
    EVENT_CLAIM = "claim"
    EVENT_DAILY_BONUS = "daily_bonus"  # daily login reward
    EVENT_BLOCKED = "blocked"  # anti-fraud rate-limit triggered
    EVENT_ERROR = "error"  # network timeout / server error

    id = db.Column(db.Integer, primary_key=True)
    project_pk = db.Column(
        db.Integer, db.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False
    )

    event_type = db.Column(db.String(32), nullable=False, index=True)
    invite_code = db.Column(db.String(32), nullable=True, index=True)
    user_id = db.Column(db.String(128), nullable=True, index=True)

    ip_address = db.Column(db.String(64), nullable=True)
    country = db.Column(db.String(64), nullable=True, index=True)

    points_delta = db.Column(db.Integer, nullable=False, default=0)
    meta = db.Column(db.Text, nullable=True)  # JSON string for extra detail

    created_at = db.Column(
        db.DateTime(timezone=True), default=_utcnow, index=True
    )

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "event_type": self.event_type,
            "invite_code": self.invite_code,
            "user_id": self.user_id,
            "country": self.country,
            "ip_address": self.ip_address,
            "points_delta": self.points_delta,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class ConfigChange(db.Model):
    """Immutable audit trail for every remote-config update via the portal."""

    __tablename__ = "config_changes"

    id = db.Column(db.Integer, primary_key=True)
    project_pk = db.Column(
        db.Integer, db.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False
    )
    field = db.Column(db.String(64), nullable=False)
    old_value = db.Column(db.String(256), nullable=True)
    new_value = db.Column(db.String(256), nullable=True)
    changed_at = db.Column(db.DateTime(timezone=True), default=_utcnow, index=True)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "field": self.field,
            "old_value": self.old_value,
            "new_value": self.new_value,
            "changed_at": self.changed_at.isoformat() if self.changed_at else None,
        }

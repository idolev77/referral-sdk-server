"""
Seed 14-day demo analytics for proj_demo_local.

Run from backend/:
    python seed_demo.py

Wipes all existing users, events, and config-changes for proj_demo_local,
then inserts ~130 users and ~500 events spread over the past 14 days.
"""
import json
import random
import sys
from datetime import datetime, timedelta, timezone

from app import create_app
from cache import invalidate_project_cache
from models import ConfigChange, Project, ReferralEvent, User, db

random.seed(42)

PROJECT_ID   = "proj_demo_local"
PTS_PER_REF  = 100
PTS_DAILY    = 2

NOW   = datetime.now(timezone.utc).replace(microsecond=0)
START = NOW - timedelta(days=14)


# ── Helpers ──────────────────────────────────────────────────────────────────

def ts(day_lo: float, day_hi: float) -> datetime:
    """Random tz-aware datetime in [START+day_lo … START+day_hi]."""
    dt = START + timedelta(days=random.uniform(day_lo, day_hi))
    return dt.replace(microsecond=0)


_used_codes: set[str] = set()

def fresh_code() -> str:
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    while True:
        c = "".join(random.choices(alphabet, k=8))
        if c not in _used_codes:
            _used_codes.add(c)
            return c


COUNTRY_POOL: list[str] = (
    ["Israel"]          * 36 +
    ["United States"]   * 24 +
    ["Germany"]         * 11 +
    ["United Kingdom"]  *  9 +
    ["France"]          *  7 +
    ["Brazil"]          *  5 +
    ["Canada"]          *  4 +
    ["India"]           *  4
)

def country() -> str:
    return random.choice(COUNTRY_POOL)


# ── Seed ─────────────────────────────────────────────────────────────────────

def seed() -> None:
    app = create_app()
    with app.app_context():
        project = Project.query.filter_by(project_id=PROJECT_ID).first()
        if project is None:
            sys.exit(f"Project {PROJECT_ID!r} not found.")

        # ── Wipe ──────────────────────────────────────────────────────────────
        ReferralEvent.query.filter_by(project_pk=project.id).delete()
        User.query.filter_by(project_pk=project.id).delete()
        ConfigChange.query.filter_by(project_pk=project.id).delete()
        db.session.commit()
        print("Wiped existing demo data.")

        new_users:  list[User]          = []
        new_events: list[ReferralEvent] = []

        def mk_user(uid, balance, c_str, invite_code, referred_by, created_at):
            new_users.append(User(
                project_pk    = project.id,
                user_id       = uid,
                points_balance= balance,
                country       = c_str,
                invite_code   = invite_code,
                referred_by   = referred_by,
                created_at    = created_at,
            ))

        def mk_event(event_type, **kwargs):
            new_events.append(ReferralEvent(
                project_pk=project.id,
                event_type=event_type,
                **kwargs,
            ))

        # ── Power referrers — 8 users, days 0-5 ─────────────────────────────
        # Heavier in week 1 so week-over-week growth looks good.
        power_specs = [
            # (uid,              n_refs, d_lo, d_hi)
            ("power_alex_k",    10,      0.1,  1.5),
            ("power_dana_m",     8,      0.5,  2.0),
            ("power_oren_b",     8,      1.0,  2.5),
            ("power_yael_r",     7,      1.5,  3.0),
            ("power_lior_s",     6,      2.0,  3.5),
            ("power_noa_t",      5,      2.5,  4.0),
            ("power_eli_f",      5,      3.0,  4.5),
            ("power_tal_v",      4,      3.5,  4.8),
        ]

        # uid → (invite_code, n_refs, d_hi) – used when building gen-1 referrals
        power_meta: dict[str, tuple] = {}

        for uid, n_refs, d_lo, d_hi in power_specs:
            c_at  = ts(d_lo, d_hi)
            inv   = fresh_code()
            c_str = country()
            mk_user(uid, n_refs * PTS_PER_REF, c_str, inv, None, c_at)
            mk_event(ReferralEvent.EVENT_GENERATED, invite_code=inv, user_id=uid,
                     country=c_str,
                     created_at=c_at + timedelta(minutes=random.randint(2, 15)))
            power_meta[uid] = (inv, n_refs, d_hi)

        # ── Gen-1 referred users ──────────────────────────────────────────────
        gen1_can_refer: list[tuple] = []  # (uid, invite_code, country, attr_ts)

        for p_uid, (inv, n_refs, p_d_hi) in power_meta.items():
            for i in range(n_refs):
                # 35 % of each power referrer's conversions land in week 1,
                # 65 % in week 2 → nice WoW growth delta.
                if random.random() < 0.35:
                    r_lo, r_hi = p_d_hi, min(7.0, p_d_hi + 3.0)
                else:
                    r_lo = max(7.0, p_d_hi)
                    r_hi = min(14.0, r_lo + 3.5)

                click_ts   = ts(r_lo, r_hi)
                install_ts = click_ts + timedelta(minutes=random.randint(5, 90))
                attr_ts    = install_ts + timedelta(minutes=random.randint(2, 30))

                g1_uid = f"g1_{p_uid}_{i+1:02d}"
                g1_c   = country()
                g1_inv = fresh_code() if random.random() < 0.55 else None
                mk_user(g1_uid, 0, g1_c, g1_inv, p_uid, attr_ts)
                mk_event(ReferralEvent.EVENT_CLICK,       invite_code=inv, user_id=g1_uid, country=g1_c, created_at=click_ts)
                mk_event(ReferralEvent.EVENT_INSTALL,     invite_code=inv, user_id=g1_uid, country=g1_c, created_at=install_ts)
                mk_event(ReferralEvent.EVENT_ATTRIBUTED,  invite_code=inv, user_id=g1_uid, country=g1_c, points_delta=PTS_PER_REF, created_at=attr_ts)

                if g1_inv and random.random() < 0.30:
                    gen1_can_refer.append((g1_uid, g1_inv, g1_c, attr_ts))

        # ── Gen-2 referrals (makes tree 3 levels deep) ───────────────────────
        for g1_uid, g1_inv, g1_c, g1_at in gen1_can_refer[:12]:
            mk_event(ReferralEvent.EVENT_GENERATED, invite_code=g1_inv, user_id=g1_uid,
                     country=g1_c,
                     created_at=g1_at + timedelta(minutes=random.randint(5, 60)))
            for j in range(random.randint(1, 2)):
                click_ts = g1_at + timedelta(days=random.uniform(1.0, 5.0))
                if click_ts >= NOW:
                    break
                attr_ts = click_ts + timedelta(minutes=random.randint(20, 120))
                g2_uid  = f"g2_{g1_uid}_{j+1}"
                g2_c    = country()
                mk_user(g2_uid, 0, g2_c, None, g1_uid, attr_ts)
                mk_event(ReferralEvent.EVENT_CLICK,      invite_code=g1_inv, user_id=g2_uid, country=g2_c, created_at=click_ts)
                mk_event(ReferralEvent.EVENT_ATTRIBUTED, invite_code=g1_inv, user_id=g2_uid, country=g2_c, points_delta=PTS_PER_REF, created_at=attr_ts)

        # ── Regular referrers — 22 users, weighted toward week 2 ─────────────
        for i in range(22):
            uid   = f"reg_{i+1:03d}"
            d_mid = random.triangular(2, 14, 9)  # triangle distribution, mode at day 9
            c_at  = ts(max(0.0, d_mid - 0.5), min(14.0, d_mid + 0.5))
            inv   = fresh_code()
            c_str = country()
            n_refs = random.choices([0, 1, 2], weights=[30, 45, 25])[0]
            mk_user(uid, n_refs * PTS_PER_REF, c_str, inv, None, c_at)
            mk_event(ReferralEvent.EVENT_GENERATED, invite_code=inv, user_id=uid,
                     country=c_str,
                     created_at=c_at + timedelta(minutes=random.randint(1, 20)))

            for j in range(n_refs):
                ref_day = d_mid + random.uniform(0.5, 4.0)
                if ref_day > 14.0:
                    break
                click_ts = ts(ref_day - 0.2, min(ref_day + 0.5, 14.0))
                attr_ts  = click_ts + timedelta(minutes=random.randint(30, 300))
                new_uid  = f"ref_{uid}_{j+1}"
                new_c    = country()
                mk_user(new_uid, 0, new_c, None, uid, attr_ts)
                if random.random() < 0.85:
                    mk_event(ReferralEvent.EVENT_CLICK,   invite_code=inv, user_id=new_uid, country=new_c, created_at=click_ts)
                    mk_event(ReferralEvent.EVENT_INSTALL, invite_code=inv, user_id=new_uid, country=new_c,
                             created_at=click_ts + timedelta(minutes=random.randint(5, 45)))
                mk_event(ReferralEvent.EVENT_ATTRIBUTED,  invite_code=inv, user_id=new_uid, country=new_c, points_delta=PTS_PER_REF, created_at=attr_ts)

        # ── Organic users ─────────────────────────────────────────────────────
        for i in range(22):
            uid  = f"org_{i+1:03d}"
            c_at = ts(0, 14)
            mk_user(uid, 0, country(), fresh_code() if random.random() < 0.35 else None, None, c_at)

        # ── Stray clicks — codes clicked but that didn't convert ──────────────
        all_codes = list(_used_codes)
        for _ in range(28):
            mk_event(ReferralEvent.EVENT_CLICK, invite_code=random.choice(all_codes),
                     country=country(), created_at=ts(0, 14))

        # ── Daily bonus events ────────────────────────────────────────────────
        active_uids = [u.user_id for u in new_users if (u.points_balance or 0) > 0]
        for uid in random.sample(active_uids, min(35, len(active_uids))):
            for _ in range(random.randint(3, 12)):
                mk_event(ReferralEvent.EVENT_DAILY_BONUS, user_id=uid,
                         points_delta=PTS_DAILY, created_at=ts(0, 14))

        # ── Reward claims (negative points_delta) ─────────────────────────────
        top_uids = [u.user_id for u in new_users if (u.points_balance or 0) >= 300]
        for uid in top_uids[:12]:
            for _ in range(random.randint(1, 3)):
                cost = random.choice([50, 75, 100, 150])
                mk_event(ReferralEvent.EVENT_CLAIM, user_id=uid,
                         points_delta=-cost, created_at=ts(5, 14))

        # ── Blocked / anti-fraud events ───────────────────────────────────────
        bad_ips   = ["91.234.56.78", "185.220.101.45", "104.21.77.90"]
        endpoints = ["generate", "track", "daily-bonus"]
        for _ in range(20):
            mk_event(ReferralEvent.EVENT_BLOCKED,
                     ip_address=random.choice(bad_ips),
                     country=random.choice(["Russia", "Netherlands", "Unknown"]),
                     meta=json.dumps({"reason": "rate_limit",
                                      "endpoint": random.choice(endpoints)}),
                     created_at=ts(0, 14))

        # ── Error events — rare to keep health score ~96 % ───────────────────
        for _ in range(9):
            mk_event(ReferralEvent.EVENT_ERROR,
                     meta=json.dumps({"msg": random.choice(
                         ["connection_timeout", "db_error", "parse_error"])}),
                     created_at=ts(0, 14))

        # ── Config audit trail ────────────────────────────────────────────────
        audit_trail = [
            ("points_per_referral",     "50",    "100",   3.2),
            ("fraud_detection_enabled", "False",  "True",  5.0),
            ("welcome_bonus",           "0",      "25",    7.5),
            ("rate_limit_per_minute",   "5",      "10",   10.8),
        ]
        for field, old_v, new_v, day in audit_trail:
            db.session.add(ConfigChange(
                project_pk=project.id,
                field=field, old_value=old_v, new_value=new_v,
                changed_at=ts(day - 0.1, day + 0.1),
            ))

        # ── Persist ───────────────────────────────────────────────────────────
        db.session.bulk_save_objects(new_users)
        db.session.flush()
        db.session.bulk_save_objects(new_events)
        db.session.commit()

        # Flush Redis so the portal sees fresh data immediately.
        try:
            invalidate_project_cache(PROJECT_ID)
        except Exception:
            pass  # Redis may not be running in all environments

        # ── Summary ───────────────────────────────────────────────────────────
        total_u = User.query.filter_by(project_pk=project.id).count()
        total_e = ReferralEvent.query.filter_by(project_pk=project.id).count()
        by_type = {
            et: ReferralEvent.query.filter_by(project_pk=project.id, event_type=et).count()
            for et in (
                ReferralEvent.EVENT_GENERATED, ReferralEvent.EVENT_CLICK,
                ReferralEvent.EVENT_INSTALL,   ReferralEvent.EVENT_ATTRIBUTED,
                ReferralEvent.EVENT_DAILY_BONUS, ReferralEvent.EVENT_CLAIM,
                ReferralEvent.EVENT_BLOCKED,    ReferralEvent.EVENT_ERROR,
            )
        }
        print(f"\nSeeded {total_u} users, {total_e} events")
        print(f"  generated={by_type['generated']}  click={by_type['click']}"
              f"  install={by_type['install']}  attributed={by_type['attributed']}")
        print(f"  daily_bonus={by_type['daily_bonus']}  claim={by_type['claim']}"
              f"  blocked={by_type['blocked']}  error={by_type['error']}")


if __name__ == "__main__":
    seed()

# Virality Referral SDK — Developer Integration Guide

This guide covers the **critical implementation details** for integrating the SDK into your app.

---

## 1. Initialization — Required Before Any Call

```python
sdk = ViralitySDK(
    api_key    = "demo_api_key_local_dev",   # x-api-key header
    project_id = "proj_demo_local",          # x-project-id header
    base_url   = "http://10.0.2.2:5000",     # emulator / your server
)
```

Every request **must** include both headers — the server returns `401` without them.

| Environment | `base_url` |
|-------------|-----------|
| Android emulator | `http://10.0.2.2:5000` |
| Physical device (local Wi-Fi) | `http://192.168.X.X:5000` |
| Production | `https://your-api-domain.com` |

---

## 2. The Four Core Functions

### `generate_invite(user_id)` — `POST /api/referral/generate`

Creates a unique invite code for an existing user. Safe to call multiple times — the same `user_id` always gets the same code.

```python
result = sdk.generate_invite("user_42")
# {
#   "invite_code": "AB3XKT9F",
#   "invite_link": "http://your-server.com/i/AB3XKT9F",
#   "deep_link":   "referralsdk://invite?code=AB3XKT9F"
# }
```

Share `invite_link` or `deep_link` with the user.

---

### `track_event(invite_code, new_user_id, stage)` — `POST /api/referral/track`

Call this when a **new user** opens the app via a referral link. Send the correct `stage` at each step:

| stage | When to call | Server action |
|-------|-------------|---------------|
| `"click"` | User taps the link | Logged as analytics only |
| `"install"` | App finishes installing | Logged as analytics only |
| `"attributed"` | New user completes registration | **Awards points to the referrer** ✅ |

```python
sdk.track_event("AB3XKT9F", "new_user_7", stage="attributed")
# { "status": "ok", "points_awarded": 100, "inviter_balance": 350 }
```

> **Critical:** `"attributed"` is honored only once per `new_user_id`. The server deduplicates automatically, but you should also guard against it on the SDK side.

---

### `get_balance(user_id)` — `GET /api/referral/balance?user_id=…`

Returns a user's current points. Redis-cached (15-second TTL) — safe to call on every screen load.

```python
balance = sdk.get_balance("user_42")
# { "points_balance": 250, "cached": true }
```

---

### `claim_reward(user_id, cost)` — `POST /api/referral/claim`

Deducts points for a reward redemption. Returns `402` if the user has insufficient points.

```python
sdk.claim_reward("user_42", cost=100)
# success → { "status": "ok", "points_balance": 150 }
# failure → 402 { "error": "Insufficient points", "balance": 50 }
```

> **Best practice:** call `get_balance` before showing the Claim button to avoid a `402` error.

---

## 3. The `user_id` Rule

```
user_id = your app's internal unique identifier for each user
          (Firebase UID, database primary key, etc.)
```

| ✅ Correct | ❌ Wrong |
|-----------|---------|
| `"uid_firebase_abc123"` | `"john@example.com"` |
| `"user_8821"` | `"John Smith"` |
| Stable, permanent ID | Anything that can change |

- Must **never change** between calls for the same user
- Must **never** be the same value for inviter and referee (server blocks this)
- Must **not** contain PII (email, phone, name) — stored as plain text in the DB

---

## 4. Error Handling — Critical Cases

| HTTP | Meaning | What to do |
|------|---------|-----------|
| `401` | Missing headers | Verify `api_key` and `project_id` are sent on every request |
| `402` | Insufficient points | Show the user their balance; do not retry |
| `404` | `invite_code` not found | Link expired or invalid — ask the user to generate a new one |
| `429` | Anti-fraud rate limit hit | Wait `retry_after_seconds` from the response body before retrying |
| `5xx` | Server error | Retry with exponential back-off (double delay, max 3 attempts) |

```python
response = sdk.track_event(invite_code, user_id, stage="attributed")

if response.status_code == 429:
    wait = response.json().get("retry_after_seconds", 60)
    time.sleep(wait)
    # retry once

elif response.status_code >= 500:
    # exponential back-off: 1s → 2s → 4s
    for delay in [1, 2, 4]:
        time.sleep(delay)
        response = sdk.track_event(invite_code, user_id, stage="attributed")
        if response.ok:
            break
```

---

## 5. Remote Config — Let the Portal Control Behavior

Call `/api/referral/config` once at startup. Use the values to drive your app's reward logic — **no redeploy needed** when the portal changes them.

```python
config = sdk.get_config()
# {
#   "points_per_referral":    100,   # points awarded on successful attribution
#   "welcome_bonus":           50,   # points for the newly referred user (0 = off)
#   "max_referrals_per_user":  10,   # reward cap per referrer (0 = unlimited)
#   "fraud_detection_enabled": true,
#   "rate_limit_per_minute":    5
# }

reward_pts    = config["points_per_referral"]
welcome_bonus = config["welcome_bonus"]
```

> All these values are configured in the **Campaign Manager** tab of the Developer Portal. Changes take effect on the SDK's next `get_config()` call.

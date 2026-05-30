# Daily Login Bonus — SDK Integration Prompt

> **Role:** You are a Staff Mobile SDK Engineer.  
> **Goal:** Integrate the new Daily Login Bonus endpoint into the client SDK so that host apps can call it with a single line of code.

---

## New Server Endpoint

### `POST /api/referral/daily-bonus`

**Required Headers** (same as all other SDK endpoints):

```
x-api-key:      <project_api_key>
x-project-id:   <project_id>
Content-Type:   application/json
```

**Request Body:**

```json
{ "user_id": "string" }
```

---

## Server Response Contracts

### ✅ Success — HTTP 200

The bonus was awarded.

```json
{
  "status": "ok",
  "user_id": "user_alice",
  "points_awarded": 2,
  "points_balance": 42,
  "next_claim_at": "2026-05-31T10:15:00.000000+00:00"
}
```

### ⏳ Cooldown Active — HTTP 429

The user already claimed today.  
`retry_after_seconds` is the **authoritative** remaining cooldown, calculated entirely on the server from UTC timestamps.  
The client clock is irrelevant and must **not** be used to gate the call.

```json
{
  "error": "Daily bonus already claimed",
  "retry_after_seconds": 82341
}
```

### ❌ Bad Request — HTTP 400

`user_id` was missing from the request body.

```json
{ "error": "user_id is required" }
```

### ❌ Unauthorized — HTTP 401 / 403

Invalid or missing `x-api-key` / `x-project-id` headers.

---

## What You Must Implement in the SDK

### 1. Public API Method

Expose a single async method on the SDK's main class.  
Example signature (adapt to the SDK's language and style):

```
sdk.claimDailyBonus(userId: String) -> DailyBonusResult
```

- Must call `POST /api/referral/daily-bonus` with the correct headers and body.
- Must **not** perform any local time-based gating before calling the server.  
  The server is the single source of truth for the cooldown.

---

### 2. Result / Response Model

Define a typed model for the success response:

| Field | Type | Description |
|---|---|---|
| `pointsAwarded` | `Int` | Points credited this claim (currently always `2`) |
| `pointsBalance` | `Int` | User's new total balance after the credit |
| `nextClaimAt` | ISO-8601 `DateTime` | When the next claim is allowed (UTC) |

---

### 3. Error Handling

Define a typed error / exception for the cooldown case that exposes:

| Field | Type | Description |
|---|---|---|
| `message` | `String` | Human-readable reason |
| `retryAfterSeconds` | `Int` | Seconds remaining until the next valid claim |

The host app must be able to **distinguish** a cooldown error (`429`) from a generic network or auth error so it can update its UI accordingly (e.g., render a countdown timer).

---

### 4. Local Cooldown Cache *(UX optimisation — optional but recommended)*

After a successful claim, persist `nextClaimAt` locally  
(e.g., `SharedPreferences` / `UserDefaults` / `AsyncStorage`).

Before making a network call, check if `now() < nextClaimAt`.  
If so, return a **synthetic** cooldown error immediately to avoid an unnecessary round-trip.

> ⚠️ **Important:** This cache is a UX hint only.  
> The server always re-validates. Never use the local cache to award points or mutate any state.

---

### 5. Points Balance Cache Invalidation

The server invalidates its Redis balance cache on every successful claim.  
The SDK must also:

1. Invalidate any local balance cache it maintains.
2. Update the cached balance from the `points_balance` field returned in the `200` response — without making an extra `/balance` request.

---

## Security Requirements

- **Never** allow the host app to pass a timestamp or clock value that could influence the cooldown. The only input is `user_id`.
- The endpoint is authenticated via `x-api-key`. Treat the key as a secret — do not log it or expose it in crash reports.
- Handle HTTP `429` gracefully — **do not retry automatically**. Surface `retry_after_seconds` to the caller.

---

## Integration Test Checklist

Verify the following scenarios in your integration tests:

- [ ] First-time claim for a new user → HTTP `200`, `points_awarded == 2`
- [ ] Immediate second claim for the same user → HTTP `429`, `retry_after_seconds > 0`
- [ ] After mocking server time past 24 h → HTTP `200` again, balance incremented
- [ ] Missing `user_id` in body → HTTP `400`
- [ ] Invalid API key → HTTP `401` / `403`
- [ ] Network timeout → SDK throws/returns a **generic network error**, not a cooldown error
- [ ] Local cache hit (optional) → no network call made, synthetic cooldown error returned instantly

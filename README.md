# Gamified Referral & Virality SDK

A production-ready, drop-in referral engine for mobile and web apps — with a full-featured developer portal. Integrate in hours, not weeks.

> **📱 Companion Android SDK** — the client-side Kotlin SDK and showcase demo app
> (*Portfolio Pulse*) live at **[github.com/idolev77/ReferralVirality](https://github.com/idolev77/ReferralVirality)**.
> This backend is the server the Android SDK talks to.

---

## Visuals

### Demo Video

<p align="center">
  <a href="docs/assets/demo.mp4">
    <img src="docs/assets/portal-dashboard.png" width="600" alt="Watch the demo video" />
  </a>
</p>

> ▶️ **[Watch the demo video](docs/assets/demo.mp4)** — full walkthrough of the SDK and developer portal.

### Developer Portal

<p align="center">
  <img src="docs/screenshot-overview.png" width="600" alt="Developer Portal — Overview dashboard" />
</p>

> Live developer portal — KPI cards, conversion funnel, referral trend and real-time activity feed.

---

## Features

- **Unique invite-code generation** — each user gets a collision-free 8-character code (e.g. `AB3XKT9F`) stored in `users.invite_code`; shareable via web link (`/i/<code>`) or native deep-link (`referralsdk://invite?code=…`)
- **Multi-stage referral funnel** — server tracks `generated → click → install → attributed` lifecycle; each stage fires an immutable `ReferralEvent` row for perfect audit trails
- **Web-open attribution** — the `/i/<code>/open` landing page credits the inviter the instant the referee taps "Open App", before the mobile app even launches
- **Points economy** — server-managed ledger in `users.points_balance`; configurable `points_per_referral`, `welcome_bonus`, and `max_referrals_per_user` per project
- **Daily login bonus** — 2 pts per user per 24 hours, enforced server-side via `users.last_daily_claim_at` (UTC) — immune to device-clock manipulation
- **Anti-fraud rate limiter** — Redis sliding-window counter per `(project · endpoint · IP)`, configurable `RATE_LIMIT_REQUESTS / RATE_LIMIT_WINDOW_SECONDS`; blocked events logged to `referral_events` for audit
- **Geo-IP resolution** — MaxMind GeoLite2 (local .mmdb) with `ip-api.com` HTTP fallback; result cached 24 h in Redis; powers the country-breakdown dashboard
- **Remote configuration** — reward rules (`points_per_referral`, fraud toggle, rate limits) stored in `projects` table; `GET /api/referral/config` lets the SDK hot-reload rules without a redeploy
- **Multi-tenant isolation** — every table has a `project_pk FK → projects.id CASCADE` so one server instance safely hosts unlimited independent apps
- **Immutable analytics log** — `referral_events` is append-only; all dashboards are read aggregates over it — no data is ever mutated or deleted
- **Full developer portal** — React + Vite SPA with 8 screens: KPI overview, growth insights, geo & stability, campaign manager, growth simulator, SDK playground, integration guide, and architecture diagrams

---

## IMPLEMENTATION

### Technology Stack

| Layer | Technology |
|-------|-----------|
| API server | Python 3.12 · Flask 3 · Flask-SQLAlchemy · Flask-CORS |
| Database | PostgreSQL 16 |
| Cache / rate-limit | Redis 7 (sliding-window counters + balance caching) |
| Geo-IP | MaxMind GeoLite2 · `geoip2` · `ip-api.com` HTTP fallback |
| Developer portal | React 18 · Vite 5 · Tailwind CSS 3 · Recharts · Mermaid.js |
| Container runtime | Docker Compose (Postgres + Redis + Flask in one command) |

### Architecture Overview

The backend is structured as a **Flask app factory** (`create_app()` in `app.py`) that wires three layers:

1. **Security gate** (`security.py`) — every request hitting `/api/*` passes through `@require_credentials`, which reads `x-api-key` and `x-project-id` headers, looks up the matching `Project` row, and attaches it to `flask.g`. Fraud-sensitive endpoints (`/referral/track`) additionally pass through `@rate_limit`, which atomically increments a Redis key and returns `429` if the window is exceeded.

2. **Blueprints** — `referral_bp` (`/api/referral/*`) serves the mobile/web SDK; `admin_bp` (`/api/admin/*`) serves the portal. Both are pure REST — JSON in, JSON out.

3. **Data layer** — SQLAlchemy ORM over PostgreSQL for persistent state; Redis for sub-millisecond caching of user balances (15 s TTL) and admin dashboard aggregates. Cache is invalidated by key (`balance:<pid>:<uid>` or `admin:<pid>:*`) on every write that changes the related data.

The portal is a standalone Vite SPA that uses a dev-proxy to forward `/api` calls to Flask — no build step needed during development.

### Project Structure

```
server_SDK/
├── backend/
│   ├── app.py              Flask app factory, invite pages, seeder
│   ├── config.py           Environment-based configuration
│   ├── models.py           SQLAlchemy models (Project · User · ReferralEvent · ConfigChange)
│   ├── security.py         @require_credentials + @rate_limit decorators
│   ├── extensions.py       Redis init & getter
│   ├── geoip_service.py    MaxMind + HTTP fallback Geo-IP resolver
│   ├── cache.py            Redis cache helpers + admin cache invalidation
│   ├── requirements.txt
│   ├── Dockerfile
│   └── blueprints/
│       ├── referral.py     SDK endpoints  (/api/referral/*)
│       └── admin.py        Portal/analytics endpoints (/api/admin/*)
└── portal/
    ├── vite.config.js      Dev proxy → Flask :5000
    └── src/
        ├── App.jsx          Sidebar nav + routing
        ├── api/api.js       Centralised Axios client
        └── components/
            ├── DashboardOverview.jsx
            ├── GrowthInsights.jsx
            ├── GeoAndStability.jsx
            ├── CampaignSettings.jsx
            ├── GrowthSimulator.jsx
            ├── SdkPlayground.jsx
            ├── IntegrationGuide.jsx
            ├── ArchitectureDiagrams.jsx
            └── MermaidDiagram.jsx
```

---

## DIAGRAMS

### 1 — Entity Relationship Diagram (ERD)

```mermaid
erDiagram
    PROJECTS ||--o{ USERS : owns
    PROJECTS ||--o{ REFERRAL_EVENTS : logs
    PROJECTS ||--o{ CONFIG_CHANGES : audits

    PROJECTS {
        int id PK
        string project_id UK
        string api_key UK
        string name
        int points_per_referral
        bool fraud_detection_enabled
        int rate_limit_per_minute
        int welcome_bonus
        int max_referrals_per_user
        datetime created_at
        datetime updated_at
    }
    USERS {
        int id PK
        int project_pk FK
        string user_id
        int points_balance
        string country
        string invite_code UK
        string referred_by
        datetime last_daily_claim_at
        datetime created_at
        datetime updated_at
    }
    REFERRAL_EVENTS {
        int id PK
        int project_pk FK
        string event_type
        string invite_code
        string user_id
        string ip_address
        string country
        int points_delta
        text meta
        datetime created_at
    }
    CONFIG_CHANGES {
        int id PK
        int project_pk FK
        string field
        string old_value
        string new_value
        datetime changed_at
    }
```

### 2 — Referral Lifecycle State Diagram

```mermaid
stateDiagram-v2
    direction LR
    [*] --> Generated : POST /referral/generate

    Generated --> Clicked : GET /i/{code}
    Clicked --> Installed : track stage=install
    Installed --> Attributed : track stage=attributed
    Generated --> Attributed : /i/{code}/open web attribution

    Attributed --> Rewarded : inviter += points_per_referral
    Rewarded --> Claimed : POST /referral/claim
    Claimed --> [*]

    Clicked --> Blocked : rate limit exceeded 429
    Installed --> Blocked : rate limit exceeded 429
    Blocked --> [*] : event logged

    note right of Rewarded
        Redis balance cache invalidated
        Admin dashboard caches refreshed
    end note
```

### 3 — System Architecture

```mermaid
graph TB
    subgraph Clients
        SDK["Client SDK (mobile / web)"]
        BROWSER["Referee Browser"]
        PORTAL["Developer Portal (React + Vite)"]
    end

    subgraph Flask["Flask App Factory"]
        SEC{"require_credentials\nx-api-key · x-project-id"}
        RL{"rate_limit\nanti-fraud"}
        RBP["/api/referral/*\nreferral_bp"]
        ABP["/api/admin/*\nadmin_bp"]
        INV["/i/{code} · /i/{code}/open\nInvite Pages"]
        GEO["Geo-IP Service\nMaxMind + HTTP fallback"]
    end

    subgraph DataLayer["Data Layer"]
        PG[("PostgreSQL\nprojects · users · events · config")]
        REDIS[("Redis\ncache + rate-limit counters")]
    end

    SDK -->|REST + API Key| SEC
    PORTAL -->|Admin API| SEC
    BROWSER -->|tap invite link| INV

    SEC --> RL
    RL --> RBP
    SEC --> ABP

    RBP --> PG
    ABP --> PG
    INV --> PG
    RBP --> GEO
    INV --> GEO

    RBP <--> REDIS
    RL --> REDIS
    ABP -.->|cached aggregates| REDIS
    ABP -.->|Remote Config| SDK
```

---

## USING

### Part 1 — Running the Server

#### Option A — Docker (recommended, one command)

```powershell
cd server_SDK
docker compose up --build -d
```

Starts PostgreSQL 16, Redis 7, and Flask in isolated containers. A demo project is seeded automatically on first boot.

| | |
|---|---|
| API base URL | `http://localhost:5000` |
| Demo `x-project-id` | `proj_demo_local` |
| Demo `x-api-key` | `demo_api_key_local_dev` |

#### Option B — Manual

```powershell
# Backend
cd backend
python -m venv .venv && .\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item .env.example .env      # set DATABASE_URL + REDIS_URL
python app.py                    # → http://localhost:5000

# Developer Portal (separate terminal)
cd portal
npm install && npm run dev       # → http://localhost:5173
```

---

### Part 2 — Integrating the SDK into Your App (Developer Guide)

The SDK is a thin HTTP wrapper — no library to install on your side. You send REST calls with two auth headers and the server handles everything else.

#### Step 0 — Authentication headers

Every SDK request must include:

```
x-api-key:     <your project api key>
x-project-id:  <your project id>
```

You can find both in the **Campaign Manager** tab of the developer portal, or use the demo credentials above for local testing.

---

#### Step 1 — Initialize (Python)

```python
import requests

class ViralitySDK:
    def __init__(self, api_key: str, project_id: str, base_url: str):
        self.base_url = base_url.rstrip("/")
        self.session  = requests.Session()
        self.session.headers.update({
            "x-api-key":    api_key,
            "x-project-id": project_id,
            "Content-Type": "application/json",
        })

# Create once at app startup — reuse the session for connection pooling
sdk = ViralitySDK(
    api_key    = "demo_api_key_local_dev",
    project_id = "proj_demo_local",
    base_url   = "http://localhost:5000",
)
```

#### Step 1 — Initialize (JavaScript / React Native)

```js
const SDK_HEADERS = {
  "x-api-key":    "demo_api_key_local_dev",
  "x-project-id": "proj_demo_local",
  "Content-Type": "application/json",
};
const BASE = "http://localhost:5000";

const sdk = {
  post: (path, body) =>
    fetch(`${BASE}${path}`, { method: "POST", headers: SDK_HEADERS, body: JSON.stringify(body) })
      .then(r => r.json()),
  get: (path) =>
    fetch(`${BASE}${path}`, { headers: SDK_HEADERS }).then(r => r.json()),
};
```

---

#### Step 2 — Generate an invite link for each user

Call this once per user when they first open the sharing screen. If the user already has a code the server returns the existing one (idempotent).

```python
def generate_invite(self, user_id: str) -> dict:
    r = self.session.post(f"{self.base_url}/api/referral/generate",
                          json={"user_id": user_id})
    r.raise_for_status()
    return r.json()

result = sdk.generate_invite("alice")
share_url = result["invite_link"]   # → "http://yourserver/i/AB3XKT9F"
deep_link  = result["deep_link"]    # → "referralsdk://invite?code=AB3XKT9F"
```

Show `invite_link` on the share sheet or send `deep_link` as a push notification.

---

#### Step 3 — Track the referral funnel

Fire this as the new user moves through the funnel. The server awards points automatically on `"attributed"`.

```python
def track(self, invite_code: str, new_user_id: str, stage: str) -> dict:
    # stage: "click" | "install" | "attributed"
    r = self.session.post(f"{self.base_url}/api/referral/track",
                          json={"invite_code": invite_code,
                                "new_user_id": new_user_id,
                                "stage": stage})
    r.raise_for_status()
    return r.json()

# When Bob installs via Alice's link:
result = sdk.track("AB3XKT9F", "bob", "attributed")
print(result["points_awarded"])   # 100 — Alice's new points
```

> If your app uses a deep-link scheme, the `/i/<code>/open` web page fires attribution automatically on tap — no extra SDK call needed.

---

#### Step 4 — Show the user their points balance

```python
def get_balance(self, user_id: str) -> int:
    r = self.session.get(f"{self.base_url}/api/referral/balance",
                         params={"user_id": user_id})
    r.raise_for_status()
    return r.json()["points_balance"]

print(sdk.get_balance("alice"))   # 100
```

Balance reads are Redis-cached (15 s) — safe to call on every screen open.

---

#### Step 5 — Claim a reward

```python
def claim_reward(self, user_id: str, cost: int) -> dict:
    r = self.session.post(f"{self.base_url}/api/referral/claim",
                          json={"user_id": user_id, "cost": cost})
    if r.status_code == 402:
        raise ValueError(f"Not enough points: {r.json()['balance']}")
    r.raise_for_status()
    return r.json()   # {"status": "ok", "points_balance": 0}

sdk.claim_reward("alice", cost=100)
```

---

#### Step 6 — Daily login bonus

```python
def daily_bonus(self, user_id: str) -> dict:
    r = self.session.post(f"{self.base_url}/api/referral/daily-bonus",
                          json={"user_id": user_id})
    if r.status_code == 429:
        data = r.json()
        print(f"Already claimed. Retry in {data['retry_after_seconds']}s")
        return data
    r.raise_for_status()
    return r.json()   # {"status": "ok", "points_awarded": 2, "points_balance": 102}
```

Call this on app open — the server enforces the 24-hour UTC cooldown server-side.

---

#### Step 7 — Hot-reload remote config (no redeploy needed)

```python
def get_config(self) -> dict:
    r = self.session.get(f"{self.base_url}/api/referral/config")
    r.raise_for_status()
    return r.json()

config = sdk.get_config()
reward_pts    = config["points_per_referral"]   # driven by Campaign Manager
welcome_bonus = config["welcome_bonus"]
fraud_enabled = config["fraud_detection_enabled"]
```

Change reward values in the portal's **Campaign Manager → Save & Sync**. The next `get_config()` call anywhere in the world picks up the new values instantly — no redeploy.

---

#### Error reference

| HTTP | When it happens | What to do |
|------|----------------|-----------|
| `400` | Missing `user_id`, `invite_code`, or `cost` | Fix the request payload |
| `401` | Wrong or missing `x-api-key` / `x-project-id` | Check your credentials |
| `402` | `claim_reward` called with insufficient balance | Show the user their balance first |
| `404` | `invite_code` not found | The code was never generated |
| `409` | `generate` called but user already has a code | Reuse the returned `invite_code` |
| `429` | Anti-fraud rate limit or daily-bonus cooldown | Back off; check `retry_after_seconds` |
| `500` | Server error | Retry with exponential back-off |

---

#### Quick Smoke-test (cURL)

```bash
# 1. Generate invite link
curl -s -X POST http://localhost:5000/api/referral/generate \
  -H "x-api-key: demo_api_key_local_dev" -H "x-project-id: proj_demo_local" \
  -H "Content-Type: application/json" -d '{"user_id": "alice"}'

# 2. Attribute referral (awards 100 pts to alice)
curl -s -X POST http://localhost:5000/api/referral/track \
  -H "x-api-key: demo_api_key_local_dev" -H "x-project-id: proj_demo_local" \
  -H "Content-Type: application/json" \
  -d '{"invite_code": "AB3XKT9F", "new_user_id": "bob", "stage": "attributed"}'

# 3. Check balance
curl -s "http://localhost:5000/api/referral/balance?user_id=alice" \
  -H "x-api-key: demo_api_key_local_dev" -H "x-project-id: proj_demo_local"
```

---

## URLs / Endpoints

All endpoints under `/api/*` require two request headers:

```
x-api-key:     <your project api key>
x-project-id:  <your project id>
```

### Public — SDK Endpoints (`/api/referral/*`)

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/referral/generate` | Create (or retrieve) an invite code for a user |
| `POST` | `/api/referral/track` | Track funnel stage: `click` / `install` / `attributed` |
| `GET`  | `/api/referral/balance` | Get user's points balance — `?user_id=…` |
| `POST` | `/api/referral/claim` | Redeem points for a reward |
| `POST` | `/api/referral/daily-bonus` | Claim the 2-pt daily login bonus (24 h cooldown) |
| `GET`  | `/api/referral/config` | Fetch live remote config for this project |

### Private — Admin / Analytics Endpoints (`/api/admin/*`)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/admin/overview` | KPI cards with period-over-period deltas + funnel counts |
| `GET` | `/api/admin/activity` | Time-series event stream |
| `GET` | `/api/admin/signups` | New-user signups over time (organic vs. referred) |
| `GET` | `/api/admin/demographics` | Country breakdown from Geo-IP |
| `GET` | `/api/admin/economy` | Points economy — issued vs. redeemed totals |
| `GET` | `/api/admin/conversion` | Funnel conversion rates between stages |
| `GET` | `/api/admin/referral-tree` | Multi-level referral graph (depth + downstream count) |
| `GET` | `/api/admin/leaderboard` | Top referrers ranked by attributed installs |
| `GET` | `/api/admin/stability` | SDK health score + error / blocked event timeline |
| `GET` | `/api/admin/fraud-logs` | Log of blocked / suspicious events |
| `GET` | `/api/admin/config` | Read current project configuration |
| `PUT` | `/api/admin/config` | Update project configuration live (hot-reload) |
| `GET` | `/api/admin/config-audit` | Change history for all config edits |

### Public — Invite Web Pages (no auth required)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/i/<code>` | Invite landing page — records `click` event, shows "Open App" button |
| `GET` | `/i/<code>/open` | Awards points to inviter, deep-links to `referralsdk://invite?code=…` |
| `GET` | `/health` | Health check — returns `{"status": "ok"}` |

---

## Public vs. Private Functions

### Public (consumed by the mobile / web SDK — no admin privileges)

| Endpoint | What it does |
|----------|-------------|
| `POST /referral/generate` | Creates a user account if new, assigns invite code, logs `generated` event |
| `POST /referral/track` | Records funnel stage; credits `points_per_referral` to inviter on `attributed` |
| `GET  /referral/balance` | Returns the user's `points_balance` (Redis-cached for 15 s) |
| `POST /referral/claim` | Deducts `cost` from balance; logs `claim` event; rejects with `402` if insufficient |
| `POST /referral/daily-bonus` | Awards 2 pts once per 24 h; enforced by `users.last_daily_claim_at` |
| `GET  /referral/config` | Returns the live project config so the SDK can adjust behaviour without redeploy |

All public endpoints are gated by `@require_credentials` (validates `x-api-key` + `x-project-id`).  
`/referral/track` is additionally gated by `@rate_limit` (Redis sliding-window, returns `429` when exceeded).

### Private (consumed only by the developer portal — analytics & administration)

The `/api/admin/*` endpoints share the same `@require_credentials` gate but are intended for **server-to-portal** calls only — never exposed to end users. They perform aggregate DB queries (GROUP BY, COUNT, SUM) over `referral_events` and return dashboard-ready JSON. Configuration changes (`PUT /admin/config`) are write-protected and logged to `config_changes` for full audit.

---

## JSON Snippets

### `POST /api/referral/generate` — create invite link

**Request**
```json
{ "user_id": "alice" }
```
**Response**
```json
{
  "invite_code": "AB3XKT9F",
  "invite_link": "http://localhost:5000/i/AB3XKT9F",
  "deep_link":   "referralsdk://invite?code=AB3XKT9F"
}
```

---

### `POST /api/referral/track` — attribute a referral

**Request**
```json
{
  "invite_code":  "AB3XKT9F",
  "new_user_id":  "bob",
  "stage":        "attributed"
}
```
**Response**
```json
{
  "status":          "ok",
  "stage":           "attributed",
  "points_awarded":  100,
  "inviter_balance": 350
}
```

---

### `GET /api/referral/balance` — check points

**Response**
```json
{ "user_id": "alice", "points_balance": 350, "cached": false }
```

---

### `POST /api/referral/claim` — redeem points

**Request**
```json
{ "user_id": "alice", "cost": 100 }
```
**Response**
```json
{ "status": "ok", "user_id": "alice", "points_balance": 250 }
```
**Error (insufficient funds)**
```json
{ "error": "Insufficient points", "balance": 50 }
```
HTTP `402`

---

### `PUT /api/admin/config` — update remote config

**Request**
```json
{
  "points_per_referral":      150,
  "fraud_detection_enabled":  true,
  "rate_limit_per_minute":    10,
  "welcome_bonus":            50
}
```
**Response**
```json
{ "status": "updated", "config": { "points_per_referral": 150, "fraud_detection_enabled": true } }
```

---

### Anti-fraud `429` response

```json
{
  "error": "Rate limit exceeded",
  "retry_after": 42
}
```

---

## DB Efficiency

### Schema Design

The schema is intentionally flat and append-only. `referral_events` is the system of record — it is never updated or deleted, only inserted. All dashboard metrics (conversion rates, K-factor, economy totals) are computed from read-only aggregates (`COUNT`, `SUM`, `GROUP BY`) over this table, which makes the write path simple and the read path independently scalable.

Every high-cardinality lookup column carries a B-tree index: `event_type`, `invite_code`, `user_id`, `country`, and `created_at` on `referral_events`; `user_id` and `invite_code` (UNIQUE) on `users`. The composite unique constraint `(project_pk, user_id)` on `users` enforces per-tenant identity at the database level.

### Caching Strategy

Two caches sit in front of the DB:

1. **User balance** — `balance:<project_id>:<user_id>` in Redis, 15-second TTL. The `/referral/balance` endpoint reads this first and only hits Postgres on a miss. The key is eagerly invalidated after `/track` (when points are awarded) and after `/claim` (when points are deducted), so the cache is always within 15 s of truth even at high write volume.

2. **Admin dashboard aggregates** — the `/api/admin/*` endpoints are expensive GROUP BY queries over potentially millions of events. Results are cached under a project-namespaced key (`admin:<project_id>:*`) and invalidated as a group whenever any write that affects the funnel occurs (generate, track, claim, config change). This means the portal always reflects the latest state within one cache generation.

### Query Patterns

Queries are scoped to `project_pk` first in every `WHERE` clause, matching the leading column of every index. For the time-series charts (activity, signups) the query also filters on `created_at`, which is indexed, keeping range scans efficient even with large event tables. The `max_referrals_per_user` cap is enforced at the application layer (Python count check) rather than via a CHECK constraint, to avoid row-level locking on the hot `users` table.

---

## Configuration

Environment variables (set in `backend/.env` or via Docker Compose):

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | `postgresql://postgres:postgres@localhost:5432/referral_sdk` | PostgreSQL connection string |
| `REDIS_URL` | `redis://localhost:6379/0` | Redis connection string |
| `SECRET_KEY` | `dev-secret-change-me` | Flask secret — **change in production** |
| `RATE_LIMIT_REQUESTS` | `5` | Max track requests per window per IP |
| `RATE_LIMIT_WINDOW_SECONDS` | `60` | Sliding-window duration in seconds |
| `GEOIP_DB_PATH` | _(empty)_ | Path to `GeoLite2-Country.mmdb`; falls back to HTTP if unset |
| `DEFAULT_POINTS_PER_REFERRAL` | `100` | Default reward value for new projects |
| `LOCAL_DEV_COUNTRY` | _(auto)_ | Country attributed to LAN / private-IP traffic |

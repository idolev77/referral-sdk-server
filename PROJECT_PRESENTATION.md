# Gamified Referral & Virality SDK — Full Project Presentation

> **Prepared for:** Pre-meeting technical brief  
> **Date:** May 2026  
> **Status:** Functional prototype — backend + developer portal complete

---

## Table of Contents

1. [Concept & Problem Statement](#1-concept--problem-statement)
2. [Feature List & Capabilities](#2-feature-list--capabilities)
3. [SDK Functions — Public vs. Internal](#3-sdk-functions--public-vs-internal)
4. [Developer Portal — Functions & Screens](#4-developer-portal--functions--screens)
5. [Server Functions & API Reference](#5-server-functions--api-reference)
6. [Data Architecture & Object Model](#6-data-architecture--object-model)
7. [Visual Schematics](#7-visual-schematics)
8. [Android Research — Analytics & Crash Reporting](#8-android-research--analytics--crash-reporting)
9. [System Architecture & Efficiency Decisions](#9-system-architecture--efficiency-decisions)

---

## 1. Concept & Problem Statement

### The Problem

Mobile and web developers who want to add a **referral / invite program** to their app face a surprisingly high-friction set of challenges:

| Challenge | Typical pain today |
|---|---|
| **Deep-link attribution** | Fragile URL schemes, no reliable click → install tracking across iOS/Android |
| **Anti-fraud** | Fake installs, self-referrals, and click farms eat up rewards budgets |
| **Reward economy** | Hand-rolling a points ledger in every app wastes weeks of engineering |
| **Engagement loops** | One-time referral bonuses are forgotten; no daily re-engagement mechanism |
| **Geo analytics** | "Where are my users coming from?" requires a separate analytics stack |
| **Remote tunability** | Changing reward values requires a full app release cycle |

### The Solution

A **drop-in, server-backed Virality SDK** that a developer integrates in hours, not weeks. It handles:

- Unique invite-code generation per user
- Shareable deep links (`referralsdk://invite?code=XXXXX`) and web landing pages
- Attribution tracking across the full install funnel (generated → clicked → installed → attributed)
- A server-enforced points economy (earn, balance query, redeem)
- Daily login bonus with server-side cooldown (device-clock-proof)
- IP-based Geo-IP resolution for demographics
- Redis-backed anti-fraud rate limiting
- A real-time Developer Portal for insights and live remote configuration

### Target Audience

- Independent mobile developers (Android / iOS) who want virality without building infrastructure
- SaaS companies adding referral programs to existing products
- Gaming studios implementing loyalty / daily bonus loops

---

## 2. Feature List & Capabilities

### Core Referral Engine
- [x] Per-user unique invite code generation (URL-safe, 8-char, globally unique)
- [x] Shareable invite links via web landing page (`/i/<code>`)
- [x] Custom deep-link scheme (`referralsdk://invite?code=…`) with auto-redirect attempt
- [x] Multi-stage funnel tracking: `generated → click → install → attributed`
- [x] Self-referral prevention (referees cannot credit themselves)
- [x] One-attribution-per-user (referral credit is idempotent)

### Points Economy
- [x] Server-managed points ledger per user
- [x] Configurable points per successful referral (default: 100)
- [x] Configurable welcome bonus for new users
- [x] Configurable max referrals per user (0 = unlimited)
- [x] Reward redemption with point deduction (`/claim`)
- [x] Redis-cached balance reads (15-second TTL) for low-latency responses

### Daily Login Bonus
- [x] 2 points awarded once every 24 hours
- [x] Server-side UTC timestamp enforcement (immune to device clock manipulation)
- [x] Returns `retry_after_seconds` on cooldown so the client can display a countdown
- [x] Logged as a `daily_bonus` event for analytics

### Anti-Fraud & Security
- [x] API key + project ID header authentication on every endpoint
- [x] Redis sliding-window rate limiter per `(project, endpoint, IP)`
- [x] Per-project configurable rate limit (requests per minute)
- [x] Per-project on/off toggle for fraud detection
- [x] All blocked attempts logged as `blocked` events (visible in portal)
- [x] `X-Forwarded-For` header parsing for reverse-proxy deployments

### Geo-IP & Demographics
- [x] Automatic IP-to-country resolution on every SDK call
- [x] MaxMind GeoLite2 local database (primary, fast, offline)
- [x] HTTP fallback via `ip-api.com` when no local DB is configured
- [x] 24-hour Redis cache for resolved IPs (avoids repeated lookups)
- [x] Graceful degradation on private/loopback IPs (returns a deterministic demo country in development)

### Remote Configuration
- [x] All reward rules stored in PostgreSQL and pushed to SDK instances without a redeploy
- [x] Full audit trail of every config change (who changed what, old vs. new value, timestamp)
- [x] Portal "Save & Sync" button persists changes and triggers live refresh

### Developer Portal
- [x] Real-time dashboard with KPI cards and conversion funnel chart
- [x] Top-referrer leaderboard
- [x] Country breakdown (bar chart)
- [x] SDK health score gauge + error/blocked timeline
- [x] Anti-fraud log table
- [x] Campaign Manager with live remote-config editor
- [x] Growth Simulator (pure client-side K-factor viral model)
- [x] SDK Playground (live API tester hitting real backend)
- [x] Integration Guide with copyable code samples (Python + JS)

### Infrastructure
- [x] Flask (Python) REST API backend
- [x] PostgreSQL for persistent, relational data
- [x] Redis for caching and rate limiting
- [x] Docker Compose for one-command local setup
- [x] CORS enabled for portal ↔ API communication
- [x] Multi-tenant: a single server instance supports multiple independent projects

---

## 3. SDK Functions — Public vs. Internal

### 3.1 Public API (Exposed to the Host App Developer)

These are the methods the developer calls in their application code:

| Method | Signature | Description |
|---|---|---|
| `generate_invite` | `(user_id: str) → dict` | Create (or retrieve) a unique invite code and shareable link for a user. Returns `{ invite_code, invite_link, deep_link }`. |
| `track_event` | `(invite_code: str, user_id: str, stage: str) → dict` | Report a funnel stage transition. `stage` ∈ `{click, install, attributed}`. Credits points on `attributed`. |
| `get_balance` | `(user_id: str) → dict` | Fetch a user's current points balance. Returns `{ user_id, points_balance, cached }`. |
| `claim_reward` | `(user_id: str, cost: int) → dict` | Deduct `cost` points to redeem a reward. Returns updated balance. Returns 402 if insufficient. |
| `claim_daily_bonus` | `(user_id: str) → DailyBonusResult` | Award the 24-hour login bonus. Returns 429 with `retry_after_seconds` when cooldown is active. |
| `get_config` | `() → dict` | Fetch live remote configuration (points per referral, welcome bonus, etc.) for dynamic UI rendering. |

**Example Python integration:**

```python
from virality_sdk import ViralitySDK

sdk = ViralitySDK(
    api_key="your_api_key",
    project_id="proj_xxx",
    base_url="https://your-server.com/api"
)

# 1 — Show the share dialog
link = sdk.generate_invite("user_42")
share_sheet.show(link["invite_link"])

# 2 — When a new user opens the app via invite
sdk.track_event(
    invite_code="ABC12345",
    user_id="new_user_7",
    stage="attributed"
)

# 3 — Display balance in UI
bal = sdk.get_balance("user_42")
ui.points_label.text = str(bal["points_balance"])

# 4 — Daily check-in button
try:
    result = sdk.claim_daily_bonus("user_42")
    ui.show_reward(result["points_awarded"])
except CooldownError as e:
    ui.show_timer(e.retry_after_seconds)
```

---

### 3.2 Internal SDK Functions (Not Exposed to Developers)

These are private helpers used inside the SDK implementation:

| Function | Location | Purpose |
|---|---|---|
| `_generate_invite_code()` | `referral.py` | Generates a URL-safe, 8-character uppercase invite code using `secrets.token_urlsafe`. Retries until globally unique. |
| `_get_or_create_user(project, user_id, country)` | `referral.py` | Atomically fetches an existing `User` row or inserts a new one. Updates country on first resolution. |
| `_log_blocked(project, ip, endpoint)` | `security.py` | Writes a `blocked` `ReferralEvent` to PostgreSQL when rate limiting triggers. |
| `_utcnow()` | `models.py` | Returns current UTC datetime with timezone info. Used as the default for all timestamp columns. |
| `_gen_id(prefix)` | `models.py` | Generates a `proj_<24 hex chars>` style ID for new projects. |
| `_is_private(ip)` | `geoip_service.py` | Detects loopback / RFC-1918 addresses to route to the dev-mode demo country. |
| `_init_reader(app)` | `geoip_service.py` | Lazily loads the MaxMind GeoLite2 `.mmdb` binary at app startup. |
| `require_credentials` decorator | `security.py` | Validates `x-api-key` + `x-project-id` headers and injects the resolved `Project` into `flask.g`. Applied to every protected endpoint. |
| `rate_limit` decorator | `security.py` | Sliding-window Redis rate limiter. Honors per-project settings. Logs `blocked` events. |

---

## 4. Developer Portal — Functions & Screens

The portal is a **React + Vite + Tailwind CSS** single-page application with six views accessible via a persistent sidebar. It communicates with the Flask backend through an Axios client (`api/api.js`) that attaches the API key and project ID on every request.

### Screen 1 — Overview (Dashboard)

**Purpose:** Real-time health check of the referral program at a glance.

**Functions:**
- `getOverview()` → calls `GET /api/admin/overview` → renders 4 KPI stat cards
- `getActivity(20)` → calls `GET /api/admin/activity` → renders live event feed table (auto-refreshes every 15 seconds)
- `getLeaderboard(10)` → calls `GET /api/admin/leaderboard` → renders top-10 referrers

**Displayed data:**
- **Total Referrals** — count of `attributed` events
- **Total Users** — all registered users in the project
- **Referred Users** — users with a non-null `referred_by` field
- **Viral K-Factor** — `(invites_generated / total_users) × (attributed / generated)`
- **Conversion Funnel bar chart** — four stages with end-to-end conversion % badge
- **Activity feed** — event type, user ID, country, timestamp, color-coded badge
- **Leaderboard** — rank, user ID, invite code, total points, referral count, country

---

### Screen 2 — Demographics & Stability

**Purpose:** Understand where users come from and track SDK health over time.

**Functions:**
- `getDemographics()` → calls `GET /api/admin/demographics` → horizontal bar chart by country
- `getStability()` → calls `GET /api/admin/stability` → health score gauge + 14-day error timeline
- `getFraudLogs(50)` → calls `GET /api/admin/fraud-logs` → anti-fraud log table

**Displayed data:**
- **Country Breakdown** — horizontal bar chart sorted by user count, multi-color cells
- **SDK Health Score** — circular SVG gauge (green ≥ 99%, amber 95-99%, red < 95%). Score = `100 − (failures / total_events × 100)`
- **Error & Blocked Timeline** — stacked area chart, 14-day window, `errors` vs `blocked` series
- **Anti-Fraud Log** — blocked IP, endpoint, country, timestamp

---

### Screen 3 — Campaign Manager (Remote Config)

**Purpose:** Tune reward rules live without touching code or redeploying.

**Functions:**
- `getConfig()` → calls `GET /api/admin/config` → populates draft form state
- `updateConfig(draft)` → calls `PUT /api/admin/config` → persists changes, refreshes form
- `getConfigAudit(30)` → calls `GET /api/admin/config-audit` → renders change history table

**Editable parameters:**

| Parameter | Type | Description |
|---|---|---|
| `fraud_detection_enabled` | Toggle | Enable/disable Redis rate limiting globally for this project |
| `points_per_referral` | Integer stepper | Points credited to the inviter on a successful attribution |
| `rate_limit_per_minute` | Slider | Maximum requests per IP per minute before blocking |
| `welcome_bonus` | Integer stepper | Points given to a brand-new user on first registration |
| `max_referrals_per_user` | Integer stepper | Cap on how many referrals a single user can earn (0 = unlimited) |

**Config Audit Log:** displays every historical change with old value → new value and UTC timestamp. Immutable append-only table in PostgreSQL.

---

### Screen 4 — Growth Simulator

**Purpose:** Model viral growth trajectories before committing to a reward strategy.

**Functions:** Entirely client-side — no backend calls.

**Math model:**

$$\text{Cumulative viral users} = N_0 \times \frac{K^{G+1} - 1}{K - 1} \quad (K \neq 1)$$

$$\text{Paid baseline} = N_0 + G \times (N_0 \times K)$$

**Controls:**
- **Seed Users (N₀):** 50 – 10,000 (slider)
- **Viral K-Factor:** 0.1 – 3.0 (slider, displays green/red label at K=1 threshold)
- **Generations:** 2 – 20 (slider)

**Output stat cards:**
- Final Viral Users
- Users Added by SDK (viral uplift above seed)
- Final Paid Acquisition baseline
- Multiplier (viral / paid ratio)

---

### Screen 5 — SDK Playground

**Purpose:** Test every SDK endpoint against the live backend without writing any code.

**Functions (each hits a real backend endpoint):**

| Panel | Function called | Endpoint |
|---|---|---|
| Generate Invite Code | `generateReferral(userId)` | `POST /api/referral/generate` |
| Track Attribution | `trackReferral({invite_code, new_user_id, stage})` | `POST /api/referral/track` |
| Check Balance | `getBalance(userId)` | `GET /api/referral/balance` |
| Claim Daily Bonus | `claimDailyBonus(userId)` | `POST /api/referral/daily-bonus` |

Each panel shows:
- Editable input fields
- Collapsible "View raw request" inspector (shows exact headers + body)
- JSON response display (green on success, red on error)
- For Daily Bonus: live countdown timer (`HH:MM:SS`) when a 429 cooldown is active

---

### Screen 6 — Integration Guide

**Purpose:** Self-service onboarding documentation with copyable code samples.

**Sections:**
- Architecture diagram (HTML, rendered inline)
- Quick Start (Python SDK init + 5 example calls)
- JavaScript/React Native example
- Full API endpoint reference table (method, path, description, auth requirement)
- Security considerations

---

## 5. Server Functions & API Reference

### Authentication

Every protected endpoint requires two HTTP headers:

```
x-api-key:     <project_api_key>
x-project-id:  <project_id>
```

Missing or invalid credentials return `401` or `403` respectively.

---

### Referral Endpoints (`/api/referral/`)

| Method | Path | Auth | Rate-limited | Description |
|---|---|---|---|---|
| `POST` | `/generate` | ✅ | ❌ | Generate or retrieve a user's invite code and links |
| `POST` | `/track` | ✅ | ✅ | Report a funnel event; credits points on `attributed` stage |
| `GET` | `/balance` | ✅ | ❌ | Fetch user's points balance (Redis-cached, 15s TTL) |
| `POST` | `/claim` | ✅ | ❌ | Deduct points for a reward redemption |
| `POST` | `/daily-bonus` | ✅ | ❌ | Award 2 points once per 24 hours (server-enforced cooldown) |

#### `POST /api/referral/generate`

```json
// Request body
{ "user_id": "string" }

// Response 200
{
  "invite_code": "ABC12345",
  "invite_link": "https://your-server.com/i/ABC12345",
  "deep_link": "referralsdk://invite?code=ABC12345"
}
```

#### `POST /api/referral/track`

```json
// Request body
{
  "invite_code": "ABC12345",
  "new_user_id": "string",
  "stage": "attributed"   // "click" | "install" | "attributed"
}

// Response 200
{
  "status": "ok",
  "stage": "attributed",
  "points_awarded": 100,
  "inviter_balance": 300
}
```

#### `POST /api/referral/daily-bonus`

```json
// Response 200 — bonus awarded
{
  "status": "ok",
  "user_id": "user_alice",
  "points_awarded": 2,
  "points_balance": 42,
  "next_claim_at": "2026-05-31T10:15:00.000000+00:00"
}

// Response 429 — cooldown active
{
  "error": "Daily bonus already claimed",
  "retry_after_seconds": 82341
}
```

---

### Admin / Portal Endpoints (`/api/admin/`)

| Method | Path | Description |
|---|---|---|
| `GET` | `/overview` | KPI stats + conversion funnel data |
| `GET` | `/activity` | Recent event feed (paginated by `limit`) |
| `GET` | `/demographics` | Country breakdown from Geo-IP data |
| `GET` | `/stability` | Health score + 14-day error/blocked timeline |
| `GET` | `/fraud-logs` | Blocked event log |
| `GET` | `/leaderboard` | Top referrers by attribution count |
| `GET` | `/config` | Current remote configuration |
| `PUT` | `/config` | Update remote configuration (triggers audit log entry) |
| `GET` | `/config-audit` | Immutable config change history |

---

### Public Landing Endpoint (No Auth)

| Method | Path | Description |
|---|---|---|
| `GET` | `/i/<code>` | Invite landing page — records a `click` event and serves an HTML page with deep-link button |
| `GET` | `/health` | Health check — returns `{ "status": "ok" }` |

---

## 6. Data Architecture & Object Model

### 6.1 Database Schema (PostgreSQL)

```
┌────────────────────────────────────────────────────────────┐
│  projects                                                   │
├────────────────────────────────────────────────────────────┤
│  id (PK)              INTEGER                               │
│  project_id           VARCHAR(64)  UNIQUE  INDEX           │
│  api_key              VARCHAR(128) UNIQUE  INDEX           │
│  name                 VARCHAR(120)                         │
│  points_per_referral  INTEGER  DEFAULT 100                 │
│  fraud_detection_enabled BOOLEAN DEFAULT TRUE              │
│  rate_limit_per_minute   INTEGER DEFAULT 5                 │
│  welcome_bonus        INTEGER  DEFAULT 0                   │
│  max_referrals_per_user  INTEGER  DEFAULT 0  (0=unlimited) │
│  created_at           TIMESTAMPTZ                          │
│  updated_at           TIMESTAMPTZ                          │
└────────────────────────────────────────────────────────────┘
         │ 1
         │
         │ ∞
┌────────────────────────────────────────────────────────────┐
│  users                                                      │
├────────────────────────────────────────────────────────────┤
│  id (PK)              INTEGER                               │
│  project_pk (FK)      INTEGER → projects.id  CASCADE       │
│  user_id              VARCHAR(128)  INDEX                   │
│  UNIQUE (project_pk, user_id)                              │
│  points_balance       INTEGER  DEFAULT 0                   │
│  country              VARCHAR(64)  INDEX                   │
│  invite_code          VARCHAR(32)  UNIQUE  INDEX           │
│  referred_by          VARCHAR(128)  (user_id of inviter)   │
│  last_daily_claim_at  TIMESTAMPTZ  (24h cooldown anchor)   │
│  created_at           TIMESTAMPTZ                          │
│  updated_at           TIMESTAMPTZ                          │
└────────────────────────────────────────────────────────────┘
         │ 1
         │
         │ ∞
┌────────────────────────────────────────────────────────────┐
│  referral_events                                            │
├────────────────────────────────────────────────────────────┤
│  id (PK)              INTEGER                               │
│  project_pk (FK)      INTEGER → projects.id  CASCADE       │
│  event_type           VARCHAR(32)  INDEX                   │
│  invite_code          VARCHAR(32)  INDEX                   │
│  user_id              VARCHAR(128) INDEX                   │
│  ip_address           VARCHAR(64)                          │
│  country              VARCHAR(64)  INDEX                   │
│  points_delta         INTEGER  DEFAULT 0                   │
│  meta                 TEXT  (JSON string for extra data)   │
│  created_at           TIMESTAMPTZ  INDEX                   │
└────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────┐
│  config_changes  (append-only audit log)                   │
├────────────────────────────────────────────────────────────┤
│  id (PK)              INTEGER                               │
│  project_pk (FK)      INTEGER → projects.id  CASCADE       │
│  field                VARCHAR(64)                          │
│  old_value            VARCHAR(256)                         │
│  new_value            VARCHAR(256)                         │
│  changed_at           TIMESTAMPTZ  INDEX                   │
└────────────────────────────────────────────────────────────┘
```

### 6.2 Event Types in `referral_events`

| `event_type` | When it's written | `points_delta` |
|---|---|---|
| `generated` | User calls `/generate` | 0 |
| `click` | Landing page `/i/<code>` is visited | 0 |
| `install` | Attributed referral credited (written alongside `attributed`) | `+points_per_referral` |
| `attributed` | `/track` called with `stage=attributed` | 0 |
| `claim` | User redeems points via `/claim` | `−cost` |
| `daily_bonus` | `/daily-bonus` succeeds | `+2` |
| `blocked` | Rate limiter triggered on `/track` | 0 |
| `error` | Network timeout / server exception | 0 |

The event log is **append-only and immutable** — no row is ever updated or deleted. This makes the table an accurate audit trail and allows any dashboard metric to be recomputed at any time from first principles.

### 6.3 Why This Architecture?

#### PostgreSQL for persistent data

- **Relational integrity:** Foreign keys with `ON DELETE CASCADE` ensure that deleting a project cleans up all associated users, events, and audit entries automatically.
- **ACID transactions:** Points credits and event writes happen in a single `db.session.commit()`, so it's impossible to credit points without a corresponding event row.
- **Indexes on hot query paths:**
  - `project_id`, `api_key` — every authenticated request hits these (covered by unique constraints which also create B-tree indexes).
  - `(project_pk, user_id)` composite unique — the most common user lookup, O(log n).
  - `invite_code` — the attribution path resolves an inviter by code on every `/track` call.
  - `event_type`, `created_at`, `country` — funnel aggregations, demographics queries, and timeline scans all filter on these columns.
- **`lazy="dynamic"` relationships:** SQLAlchemy relationships on `users` and `events` use lazy loading with `.query` interface so the ORM doesn't pull thousands of rows into memory on every project load.
- **Connection pool with `pool_pre_ping` + `pool_recycle=280`:** Prevents stale connections in long-running containers behind load balancers.

#### Redis for ephemeral data

| Key pattern | TTL | Purpose |
|---|---|---|
| `balance:{project_id}:{user_id}` | 15 seconds | Caches `/balance` responses. Invalidated immediately on `/claim` or `/daily-bonus`. |
| `geoip:{ip}` | 24 hours | Caches IP→country resolutions. Geo data almost never changes for an IP. |
| `ratelimit:{project_id}:{endpoint}:{ip}` | 60 seconds (sliding window) | Tracks request count per IP per minute for anti-fraud. Expires atomically via `INCR` + `EXPIRE`. |

**Why Redis instead of PostgreSQL for these?**
- A `/balance` query that hits Redis responds in < 1ms vs. ~5ms for a Postgres round-trip. At scale (thousands of SDK calls/second), this difference is critical.
- Rate-limit counters must be atomic increments (`INCR`) with automatic expiry — Redis's native data types are purpose-built for this. Simulating it in SQL requires row-level locking or optimistic concurrency, which is error-prone and slow.
- Geo-IP resolutions are idempotent and safe to cache aggressively. A 24-hour TTL effectively eliminates redundant HTTP calls to `ip-api.com`.

**Fault tolerance:** Every Redis operation is wrapped in a `try/except`. If Redis goes down, the API degrades gracefully — it falls back to direct PostgreSQL reads and stops rate-limiting. Live traffic is never blocked by an infrastructure failure.

---

## 7. Visual Schematics

### 7.1 Overall System Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    HOST APPLICATION                      │
│   (Android / iOS / Web)                                  │
│                                                          │
│   ┌────────────────────────────────────┐                │
│   │        Virality SDK (client lib)   │                │
│   │   generate() · track() · balance() │                │
│   │   claim()    · dailyBonus()        │                │
│   └──────────────┬─────────────────────┘                │
└──────────────────│──────────────────────────────────────┘
                   │  HTTPS + x-api-key / x-project-id
                   ▼
┌─────────────────────────────────────────────────────────┐
│                   FLASK REST API SERVER                  │
│                                                          │
│  ┌─────────────────┐    ┌─────────────────────────────┐ │
│  │ referral blueprint│  │     admin blueprint          │ │
│  │ /generate        │  │ /overview  /activity          │ │
│  │ /track           │  │ /demographics /stability      │ │
│  │ /balance         │  │ /leaderboard /config          │ │
│  │ /claim           │  │ /fraud-logs /config-audit     │ │
│  │ /daily-bonus     │  └─────────────────────────────┘ │
│  └─────────────────┘                                    │
│                                                          │
│  ┌─────────────────┐    ┌────────────────────────────┐  │
│  │ security.py     │    │ geoip_service.py            │  │
│  │ require_creds   │    │ MaxMind GeoLite2 (local)   │  │
│  │ rate_limit      │    │ ip-api.com (HTTP fallback) │  │
│  └─────────────────┘    └────────────────────────────┘  │
└──────────┬──────────────────────────────────────────────┘
           │
     ┌─────┴──────┐
     │            │
     ▼            ▼
┌─────────┐  ┌─────────┐
│PostgreSQL│  │  Redis  │
│ projects │  │ balance │
│ users    │  │  cache  │
│ events   │  │ geo     │
│ audit    │  │  cache  │
└─────────┘  │ ratelimit│
             └─────────┘

                   ▲
                   │  /api/admin/* (same API key auth)
                   │
┌─────────────────────────────────────────────────────────┐
│              DEVELOPER PORTAL (React SPA)                │
│                                                          │
│  ┌──────────────┐ ┌──────────────┐ ┌─────────────────┐ │
│  │  Overview    │ │Demographics  │ │Campaign Manager │ │
│  │  Dashboard   │ │& Stability   │ │(Remote Config)  │ │
│  └──────────────┘ └──────────────┘ └─────────────────┘ │
│  ┌──────────────┐ ┌──────────────┐ ┌─────────────────┐ │
│  │  Growth      │ │    SDK       │ │  Integration    │ │
│  │  Simulator   │ │  Playground  │ │    Guide        │ │
│  └──────────────┘ └──────────────┘ └─────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

---

### 7.2 Portal Layout Schematic

```
┌────────────────────────────────────────────────────────────┐
│  HEADER  [ Current View Label ]   [ ● API Connected ]  ☀  │
├───────────┬────────────────────────────────────────────────┤
│  SIDEBAR  │                   MAIN CONTENT AREA            │
│           │                                                │
│ 🚀 Logo  │  ┌──────────┐ ┌──────────┐ ┌──────────┐       │
│  Virality │  │ STAT     │ │ STAT     │ │ STAT     │       │
│  SDK      │  │ CARD     │ │ CARD     │ │ CARD     │       │
│           │  └──────────┘ └──────────┘ └──────────┘       │
│ ──────────│                                                │
│ ▶ Overview│  ┌──────────────────────┐  ┌──────────────┐  │
│   Demogr. │  │   CHART / TABLE      │  │  SECONDARY   │  │
│   Campaign│  │                      │  │  WIDGET      │  │
│   Simulat.│  │                      │  │              │  │
│   Playgrnd│  └──────────────────────┘  └──────────────┘  │
│   Guide   │                                                │
│           │  ┌────────────────────────────────────────┐   │
│ ──────────│  │   ACTIVITY FEED / LOG TABLE            │   │
│ Demo Proj │  └────────────────────────────────────────┘   │
│ proj_demo │                                                │
└───────────┴────────────────────────────────────────────────┘
```

---

### 7.3 Referral Attribution Flow

```
HOST APP (inviter)          SERVER              HOST APP (new user)
      │                        │                        │
      │  POST /generate        │                        │
      │  { user_id: "alice" }  │                        │
      │───────────────────────▶│                        │
      │                        │  INSERT referral_event │
      │                        │  type=generated        │
      │  ◀ { invite_code,       │                        │
      │      invite_link,       │                        │
      │      deep_link }        │                        │
      │                        │                        │
      │  [alice shares link]   │                        │
      │                        │                        │
      │                        │  GET /i/ABC12345        │
      │                        │◀────────────────────────│
      │                        │  INSERT event=click    │
      │                        │  Return HTML page      │
      │                        │──────────────────────▶ │
      │                        │                        │
      │                        │  POST /track           │
      │                        │  { invite_code,        │
      │                        │    new_user_id: "bob", │
      │                        │    stage: attributed } │
      │                        │◀────────────────────────│
      │                        │                        │
      │                        │  alice.points += 100   │
      │                        │  INSERT event=install  │
      │                        │  INSERT event=attributed│
      │                        │  COMMIT                │
      │                        │                        │
      │                        │  ◀ { points_awarded:100│
      │                        │      inviter_balance }  │
```

---

### 7.4 Daily Bonus Flow

```
CLIENT APP                    SERVER
     │                           │
     │  POST /daily-bonus        │
     │  { user_id: "alice" }     │
     │──────────────────────────▶│
     │                           │  Load user.last_daily_claim_at
     │                           │
     │                           │  If now - last_claim < 24h:
     │                           │    return 429 + retry_after_seconds
     │                           │
     │                           │  Else:
     │                           │    user.points += 2
     │                           │    user.last_daily_claim_at = now()
     │                           │    INSERT event=daily_bonus
     │                           │    Redis.delete(balance_cache_key)
     │                           │    COMMIT
     │                           │
     │  ◀ 200 { points_awarded:2 │
     │          points_balance,  │
     │          next_claim_at }  │
     │                           │
     │  [Display countdown timer │
     │   until next_claim_at]    │
```

---

### 7.5 SDK Visual Elements (Campaign Manager)

```
┌─ Campaign Manager ──────────────────────────────────────────────┐
│                                                                  │
│  ┌─ Fraud Detection ──────┐  ┌─ Points per Referral ──────────┐ │
│  │  🛡 Enabled            │  │  ✨ Reward on attribution       │ │
│  │  Redis rate-limiting   │  │                                 │ │
│  │             [  ●  ] ON │  │  [−]  [ 100 pts ]  [+]         │ │
│  └────────────────────────┘  └─────────────────────────────────┘ │
│                                                                  │
│  ┌─ Rate Limit / min ─────┐  ┌─ Welcome Bonus ─────────────────┐ │
│  │  ⏱ 5 req/min          │  │  🎁 New user bonus               │ │
│  │  ━━━━━●━━━━━━━━━━━━━━  │  │  [−]  [ 0 pts ]  [+]           │ │
│  └────────────────────────┘  └─────────────────────────────────┘ │
│                                                                  │
│  ┌─ Max Referrals ─────────────────────────────────────────────┐ │
│  │  👥 Per-user referral cap (0 = unlimited)                    │ │
│  │  [−]  [ 0 ]  [+]                                            │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                                                                  │
│           [ ↺ Reset ]          [ ✔ Save & Sync ]                │
│                                                                  │
│  ┌─ Config Audit Log ──────────────────────────────────────────┐ │
│  │  Field                 Old → New         Changed At         │ │
│  │  points_per_referral   50 → 100          2026-05-30 10:22   │ │
│  │  rate_limit_per_minute  3 → 5            2026-05-29 18:05   │ │
│  └─────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────┘
```

---

## 8. Android Research — Analytics & Crash Reporting

This section covers the data and capabilities available on Android that should inform future SDK development decisions.

### 8.1 Data Available from an Android Device

#### Device & Hardware
| Data Point | API / Method | SDK Relevance |
|---|---|---|
| Device manufacturer / model | `Build.MANUFACTURER`, `Build.MODEL` | Segment users by device tier for reward strategy |
| Android OS version | `Build.VERSION.SDK_INT` | Detect API gaps; target minimum SDK |
| Screen density / resolution | `DisplayMetrics` | Adapt share sheet UI |
| Total RAM / CPU cores | `ActivityManager.MemoryInfo`, `Runtime.availableProcessors()` | Detect low-end devices, adjust SDK polling frequency |
| Carrier / SIM country | `TelephonyManager.getNetworkCountryIso()` | Supplement Geo-IP with carrier-reported country |
| Network type | `ConnectivityManager` — WiFi / mobile / offline | Defer analytics flushes when offline; retry on WiFi |
| Battery level / charging state | `BatteryManager` | Avoid heavy background sync when < 10% battery |
| Device language / locale | `Locale.getDefault()` | Localize share messages and deep-link landing pages |
| Advertising ID (GAID) | `AdvertisingIdClient.getAdvertisingIdInfo()` | Cross-app attribution (requires user consent, Play policy) |
| App install source | `PackageManager.getInstallerPackageName()` | Know if user installed from Play Store vs. sideload |
| First install time | `PackageInfo.firstInstallTime` | Anti-fraud: reject attributions from accounts older than the referral click |
| App version / build | `BuildConfig.VERSION_NAME` | Correlate bugs and conversion rates to app versions |

#### User Behavior (available without extra permission)
| Data Point | Method |
|---|---|
| App foreground / background transitions | `Application.ActivityLifecycleCallbacks` |
| Session start / end time | `ProcessLifecycleOwner` (Jetpack) |
| Deep-link intent data | `Intent.getData()` on Activity resume |
| Clipboard content (invite code paste) | `ClipboardManager` |

#### Network & Reachability
- `ConnectivityManager.registerNetworkCallback()` — notified on network gain/loss in real time
- Use this to build a **local event queue**: all SDK calls enqueued offline are flushed atomically when connectivity resumes, preventing lost attribution events

---

### 8.2 Deep-Link Attribution on Android

Deep-link attribution is the most technically complex part of the referral flow on Android.

**Challenge:** There is no guaranteed way to pass data from a web browser click to a freshly installed app (the "last-mile attribution problem").

**Approaches (ranked by reliability):**

| Approach | Reliability | How it works |
|---|---|---|
| **App Links (Verified HTTPS)** | ⭐⭐⭐⭐⭐ | Host app registers `https://your-server.com/i/` as an Android App Link. On click, Android opens the app directly — no browser involved. The invite code is in the URL path. |
| **Custom URI Scheme** (`referralsdk://`) | ⭐⭐⭐ | Works only when app is already installed. Browser blocks automatic redirect; requires user tap (our current implementation). |
| **Deferred Deep Linking via fingerprint** | ⭐⭐⭐ | Record click fingerprint (IP + user-agent + timestamp) server-side. On first app open, match the install event against recent clicks by same IP within a ±10-minute window. |
| **Google Play Install Referrer API** | ⭐⭐⭐⭐ | When app is installed from the Play Store, `InstallReferrerClient` provides the referrer query string set in the Play Store link. Reliable for Play installs only. |

**Recommended architecture for full attribution:**
1. `/i/<code>` records a `click` event with IP + timestamp + user-agent
2. After install, the SDK reads the Play Install Referrer
3. If referrer contains a code, call `/track` with `stage=attributed` immediately
4. Fallback: fingerprint match if referrer is empty (user installed via browser)

---

### 8.3 Crash Reporting & Pre-Close Error Uploading

One of the hardest problems in mobile analytics is capturing errors that occur just before the process terminates.

#### Available Android Mechanisms

**1. `Thread.setDefaultUncaughtExceptionHandler`**
- Intercepts unhandled JVM exceptions before the process dies
- Can write a crash report to disk (within ~100ms budget)
- On next app launch, the SDK reads the persisted crash file and uploads it to the server

```kotlin
// Install at Application.onCreate()
val previousHandler = Thread.getDefaultUncaughtExceptionHandler()
Thread.setDefaultUncaughtExceptionHandler { thread, throwable ->
    // Write crash to disk
    saveCrashReport(throwable)
    // Chain to default handler (triggers ANR dialog)
    previousHandler?.uncaughtException(thread, throwable)
}
```

**2. `ApplicationExitInfo` API (Android 11+, API 30)**
- `ActivityManager.getHistoricalProcessExitReasons()` returns the last N exits with:
  - Exit reason: `REASON_CRASH`, `REASON_ANR`, `REASON_LOW_MEMORY`, `REASON_USER_REQUESTED`, etc.
  - Tombstone trace (for native crashes)
  - Process start/end timestamps
- **This is the most reliable method** — the OS records it regardless of whether the app had time to handle the crash
- Call this on every app launch and upload any unresolved exit reasons to the server as `error` events

**3. Native Crash Interception (NDK)**
- Install signal handlers (`SIGSEGV`, `SIGABRT`, etc.) via NDK
- Google's **Breakpad** or **Crashpad** library handles this for native code
- Generates a minidump file read on next launch

**4. WorkManager for Offline Flush**
- Use `WorkManager` with `NetworkType.CONNECTED` constraint
- Enqueue all failed SDK calls as persistent work items
- WorkManager guarantees at-least-once delivery even after process death or device reboot

**Recommended SDK error pipeline:**
```
Crash occurs
     │
     ▼
UncaughtExceptionHandler writes crash JSON to SharedPreferences / Room DB
     │
     ▼
App relaunches → SDK.init() checks for pending crash reports
     │
     ▼
POST /api/referral/track with event_type="error" + crash meta
     │
     ▼
Portal "Stability" screen shows error spike in timeline
```

---

### 8.4 Analytics Data We Can Collect (No Extra Permissions Required)

The following can be sent to our server without requiring any special Android permissions:

- Session start / end timestamps → **session length analytics**
- OS version + device model → **crash correlation by device**
- App version → **version-specific conversion rates**
- Network type at attribution time → **drop-off by connectivity**
- Deep-link intent data → **invite code passed through**
- Install source (Play vs. sideload) → **channel attribution**
- Time-to-first-referral-share → **virality latency metric**

**Requires READ_PHONE_STATE or user consent:**
- Advertising ID (GAID) — must follow Play policy
- Carrier name / country

**Never collect without explicit consent:**
- Contact lists, location, photos, device identifiers beyond GAID

---

## 9. System Architecture & Efficiency Decisions

### 9.1 Multi-Tenancy Design

Every resource in the system is scoped to a `Project`. A single server instance supports unlimited projects with complete data isolation:

- API authentication resolves a `Project` from headers — all subsequent queries filter by `project_pk`
- Cascade deletes: removing a project removes all its users, events, and audit entries
- Per-project configurable fraud settings (rate limit, detection toggle)
- No cross-project data leakage possible at the query level

### 9.2 Write Strategy — Append-Only Event Log

`referral_events` is never updated — only inserted. This is a deliberate architectural choice:

- **Auditability:** Every point credit, fraud block, and error has an immutable record with a timestamp
- **Simplicity:** Dashboard metrics are `COUNT(*)` queries with `WHERE event_type = '...'` — no joins or aggregations on mutable state
- **Replay:** The entire leaderboard, balance history, and funnel can be recomputed from the event log if needed
- **Scalability:** Inserts are faster than updates under high write load; no row-level locking on updates

### 9.3 Read Strategy — Caching Tiers

```
Request for user balance
        │
        ▼
  Redis cache hit?
  ┌─ YES ──▶  Return in < 1ms  (15-second TTL)
  │
  └─ NO  ──▶  PostgreSQL query (~5ms) ──▶ Write to Redis ──▶ Return
```

```
Request for Geo-IP country
        │
        ▼
  Private/loopback?  ──YES──▶  Return deterministic demo country
        │ NO
        ▼
  Redis cache hit?   ──YES──▶  Return in < 1ms  (24h TTL)
        │ NO
        ▼
  MaxMind local DB?  ──YES──▶  Resolve in ~0.1ms ──▶ Cache in Redis
        │ NO
        ▼
  HTTP ip-api.com    ──────▶  Resolve in ~200ms ──▶ Cache in Redis
```

### 9.4 Rate Limiting Implementation

The anti-fraud rate limiter uses Redis's atomic `INCR` + `EXPIRE` pattern:

```
On each /track request:
  key = "ratelimit:{project_id}:{endpoint}:{client_ip}"
  count = INCR key
  if count == 1:
    EXPIRE key 60    # start 60-second window on first request
  if count > rate_limit_per_minute:
    ttl = TTL key
    log blocked event to PostgreSQL
    return 429 { retry_after_seconds: ttl }
```

This is a **sliding-window counter** — not a fixed-window counter. The window resets 60 seconds after the *first* request in the burst, which is slightly more permissive than a pure sliding window but much simpler to implement correctly without a sorted set.

### 9.5 Technology Stack Summary

| Layer | Technology | Why |
|---|---|---|
| API Server | Flask (Python) | Lightweight, rapid iteration, rich ecosystem |
| ORM | SQLAlchemy | Declarative models, connection pooling, type safety |
| Database | PostgreSQL 16 | ACID, rich index types, JSON support in `meta` column |
| Cache / Rate-limit | Redis 7 | Sub-millisecond latency, atomic counters, native TTL |
| Geo-IP | MaxMind GeoLite2 + ip-api.com | Local-first (fast, offline) with HTTP fallback |
| Frontend | React 18 + Vite + Tailwind CSS | Fast builds, component model, utility-first styling |
| Charts | Recharts | Declarative SVG charts, good React integration |
| Containerization | Docker Compose | One-command local setup (`docker compose up`) |
| Auth | Custom header-based API key | Simple, stateless, no cookie/session complexity |

### 9.6 Scalability Path

The current architecture scales vertically for a long time and horizontally with minimal changes:

| Bottleneck | Solution |
|---|---|
| Single Flask process | Add Gunicorn workers; the app is stateless (state in Postgres + Redis) |
| PostgreSQL write throughput | Partition `referral_events` by `created_at` (monthly); archive old partitions |
| Redis single node | Upgrade to Redis Sentinel or Redis Cluster |
| Geo-IP HTTP fallback latency | Mandatory MaxMind DB in production; HTTP fallback is dev-only |
| Dashboard query speed | Add materialized views for funnel aggregates; refresh every 60 seconds |

---

*End of document. This presentation covers the full system as implemented in the current prototype.*

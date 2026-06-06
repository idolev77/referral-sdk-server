# Gamified Referral & Virality SDK

A production-ready, drop-in referral engine for mobile and web apps — with a full-featured developer portal. Integrate in hours, not weeks.

```
server_SDK/
├── backend/     Flask REST API  (Python · PostgreSQL · Redis)
└── portal/      Developer portal (React · Vite · Tailwind · Recharts)
```

---

## Features

- **Referral engine** — unique invite-code generation, shareable links (`/i/<code>`), custom deep-link scheme (`referralsdk://invite?code=…`), multi-stage funnel tracking (`generated → click → install → attributed`)
- **Points economy** — server-managed ledger, configurable rewards, welcome bonus, reward redemption
- **Daily login bonus** — 2 pts per 24 h, server-side UTC enforcement (immune to device-clock manipulation)
- **Anti-fraud** — Redis sliding-window rate limiter per `(project · endpoint · IP)`, per-project on/off toggle, full fraud event log
- **Geo-IP** — IP → country resolution via MaxMind GeoLite2 (local) with HTTP fallback; 24-hour Redis cache
- **Remote configuration** — all reward rules stored in PostgreSQL and hot-reloaded without a server restart
- **Multi-tenant** — one server instance supports unlimited independent projects

---

## Quick Start — Docker (recommended)

Starts PostgreSQL 16, Redis 7, and the Flask backend in one command.

```powershell
cd server_SDK
docker compose up --build -d
```

The API is now available at **http://localhost:5000**.  
A demo project is seeded automatically on first boot:

| Key | Value |
|-----|-------|
| `x-project-id` | `proj_demo_local` |
| `x-api-key` | `demo_api_key_local_dev` |

---

## Quick Start — Manual

### Backend

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item .env.example .env      # set DATABASE_URL and REDIS_URL
python app.py                    # http://localhost:5000
```

Requires a running **PostgreSQL** database named `referral_sdk` and a **Redis** instance. Both are provided by `docker compose up db redis`.

### Portal

```powershell
cd portal
npm install
npm run dev                      # http://localhost:5173
```

Vite proxies `/api` → Flask automatically.  
Set `VITE_USE_MOCK=true` in `portal/.env` to run the portal on the built-in high-fidelity mock dataset (no backend required).

---

## API Reference

All SDK endpoints require two headers:

```
x-api-key:     <your project api key>
x-project-id:  <your project id>
```

### Referral SDK endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/referral/generate` | Generate (or retrieve) an invite code for a user |
| `POST` | `/api/referral/track` | Track a funnel stage (`click` / `install` / `attributed`) |
| `GET`  | `/api/referral/balance` | Get a user's current point balance (`?user_id=…`) |
| `POST` | `/api/referral/claim` | Redeem points for a reward |
| `POST` | `/api/referral/daily-bonus` | Claim the daily login bonus |

#### Example — generate an invite link

```bash
curl -X POST http://localhost:5000/api/referral/generate \
  -H "Content-Type: application/json" \
  -H "x-api-key: demo_api_key_local_dev" \
  -H "x-project-id: proj_demo_local" \
  -d '{"user_id": "user_42"}'
```

```json
{
  "invite_code": "AB3XKT9F",
  "invite_link": "http://localhost:5000/i/AB3XKT9F",
  "deep_link":   "referralsdk://invite?code=AB3XKT9F"
}
```

#### Example — attribute a referral (awards points)

```bash
curl -X POST http://localhost:5000/api/referral/track \
  -H "Content-Type: application/json" \
  -H "x-api-key: demo_api_key_local_dev" \
  -H "x-project-id: proj_demo_local" \
  -d '{"invite_code": "AB3XKT9F", "new_user_id": "new_user_7", "stage": "attributed"}'
```

```json
{ "status": "ok", "points_awarded": 100, "inviter_balance": 350 }
```

### Admin / analytics endpoints (portal)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/admin/overview` | KPI cards, top referrers, funnel counts |
| `GET` | `/api/admin/activity` | Time-series event stream |
| `GET` | `/api/admin/demographics` | Country breakdown |
| `GET` | `/api/admin/stability` | SDK health score + error timeline |
| `GET` | `/api/admin/fraud-logs` | Blocked / suspicious event log |
| `GET` | `/api/admin/config` | Current project configuration |
| `PUT` | `/api/admin/config` | Update project configuration live |

---

## Configuration

Environment variables for the backend (set in `backend/.env` or via Docker Compose):

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | `postgresql://postgres:postgres@localhost:5432/referral_sdk` | PostgreSQL connection string |
| `REDIS_URL` | `redis://localhost:6379/0` | Redis connection string |
| `SECRET_KEY` | `dev-secret-change-me` | Flask secret key — **change in production** |
| `RATE_LIMIT_REQUESTS` | `5` | Max requests per window per IP |
| `RATE_LIMIT_WINDOW_SECONDS` | `60` | Sliding-window duration in seconds |
| `GEOIP_DB_PATH` | _(empty)_ | Path to a MaxMind `GeoLite2-Country.mmdb` file |
| `DEFAULT_POINTS_PER_REFERRAL` | `100` | Default referral reward value |

---

## Developer Portal

Start the portal (`npm run dev`) and open **http://localhost:5173**.

| Screen | What it shows |
|--------|---------------|
| **Dashboard** | KPI cards, conversion funnel, top-referrer leaderboard |
| **Geo & Stability** | Country breakdown chart, SDK health gauge, error/blocked timeline |
| **Campaign Settings** | Live remote-config editor — edit reward rules and hit Save & Sync |
| **Growth Simulator** | K-factor viral model — tweak inputs and project growth curves |
| **SDK Playground** | Live API tester that hits the real backend |
| **Integration Guide** | Copyable code samples (Python + JavaScript) |

---

## Project Structure

```
backend/
├── app.py              Entry point — Flask app factory
├── config.py           Environment-based configuration
├── models.py           SQLAlchemy models (Project, ReferralCode, Event, …)
├── extensions.py       Shared Flask extensions (db, CORS)
├── security.py         API key auth + rate-limiter middleware
├── geoip_service.py    MaxMind + HTTP fallback Geo-IP resolver
├── requirements.txt
├── Dockerfile
└── blueprints/
    ├── referral.py     SDK endpoints (/api/referral/*)
    └── admin.py        Portal/analytics endpoints (/api/admin/*)

portal/
├── vite.config.js      Dev proxy → Flask
├── tailwind.config.js
└── src/
    ├── App.jsx
    ├── api/api.js      Centralised HTTP client (real + mock)
    └── components/
        ├── DashboardOverview.jsx
        ├── GeoAndStability.jsx
        ├── CampaignSettings.jsx
        ├── GrowthSimulator.jsx
        ├── SdkPlayground.jsx
        └── IntegrationGuide.jsx
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| API server | Python 3.12 · Flask 3 · Flask-SQLAlchemy |
| Database | PostgreSQL 16 |
| Cache / rate-limit | Redis 7 |
| Geo-IP | MaxMind GeoLite2 · `geoip2` · `ip-api.com` fallback |
| Developer portal | React 18 · Vite · Tailwind CSS · Recharts |
| Container runtime | Docker Compose |

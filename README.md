# Gamified Referral & Virality SDK — Server + Developer Portal

Production-ready backend (Python/Flask + PostgreSQL + Redis) and a premium
React (Vite + Tailwind + Recharts) developer portal.

```
server_SDK/
├── backend/          Flask API (SDK + admin/analytics)
└── portal/           React developer portal
```

## Backend (Flask)

```powershell
cd backend
python -m venv .venv; .\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item .env.example .env      # adjust DATABASE_URL / REDIS_URL
python app.py                    # http://localhost:5000
```

Requires a running **PostgreSQL** (`referral_sdk` db) and **Redis**. Tables are
auto-created and a demo project is seeded on first boot:

- `project_id = proj_demo_local`
- `api_key   = demo_api_key_local_dev`

### SDK endpoints (require `x-api-key` + `x-project-id`)
| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/api/referral/generate` | Create invite code/link |
| POST | `/api/referral/track` | Deep-link click/install, credits points (rate-limited) |
| GET | `/api/referral/balance?user_id=…` | Current points |
| POST | `/api/referral/claim` | Deduct points for reward |

### Portal analytics endpoints
`/api/admin/overview`, `/activity`, `/demographics`, `/stability`,
`/fraud-logs`, `GET|PUT /config`.

## Portal (React)

```powershell
cd portal
npm install
Copy-Item .env.example .env
npm run dev                      # http://localhost:5173
```

Vite proxies `/api` to the Flask server. Set `VITE_USE_MOCK=true` to run the
portal entirely on the bundled high-fidelity mock dataset (no backend needed).

# CARB-PLANNER — PRODUCTION DEPLOYMENT GUIDE
## Supabase (PostgreSQL + PostGIS) + Render (FastAPI) + Vercel (React / Vite)

Confidence-Aware Rolling-Horizon Block Planner (CARB-Planner) for Indian Railways.

---

## 1. Production Architecture Overview

The system runs as an end-to-end cloud deployment across three specialized tiers:

```
                    ┌─────────────────────────┐
                    │      WEB BROWSER        │
                    │   (Section Controller)  │
                    └────────────┬────────────┘
                                 │
                                 ▼ HTTPS
                    ┌─────────────────────────┐
                    │         VERCEL          │
                    │   React 19 / Vite SPA   │
                    │   (Tailwind, Leaflet)   │
                    └────────────┬────────────┘
                                 │
                                 │ HTTPS REST API Calls
                                 │ (VITE_API_BASE_URL)
                                 ▼
                    ┌─────────────────────────┐
                    │         RENDER          │
                    │     FastAPI Backend     │
                    │  Gunicorn / ASGI Worker │
                    │                         │
                    │   - CP-SAT Optimizer    │
                    │   - LNS Metaheuristics  │
                    │   - Disruption Engine   │
                    │   - Multi-Horizon Model │
                    └────────────┬────────────┘
                                 │
                                 │ PostgreSQL Protocol (Port 6543 / 5432)
                                 │ (DATABASE_URL with SSL & pool_pre_ping)
                                 ▼
                    ┌─────────────────────────┐
                    │        SUPABASE         │
                    │  Managed PostgreSQL 15+ │
                    │    PostGIS Extension    │
                    │                         │
                    │   - 15 Relational Tables│
                    │   - Spatial Indexes     │
                    │   - Immutable Audit Log │
                    │   - Multi-Horizon Plans │
                    └─────────────────────────┘
```

> [!IMPORTANT]
> **Strict Security Isolation:** The Vercel frontend **NEVER** connects directly to the Supabase PostgreSQL database. The frontend communicates exclusively with the Render FastAPI backend via HTTPS. FastAPI authenticates, validates, runs optimization, and manages the database transactions.

---

## 2. Environment Variables Specification

### A. Render (Backend)
Configure these in **Render Dashboard $\rightarrow$ Environment Variables**:

| Variable | Description | Example / Default | Required |
| :--- | :--- | :--- | :--- |
| `DATABASE_URL` | Supabase connection string (pooler port 6543 or direct 5432) | `postgresql://postgres.[ref]:[pass]@aws-0-[region].pooler.supabase.com:6543/postgres?sslmode=require` | **Yes** |
| `ENVIRONMENT` | Running environment mode | `production` | **Yes** |
| `PORT` | Listening HTTP port on Render | `10000` | **Yes** |
| `PYTHON_VERSION` | Python runtime version | `3.11.8` | **Yes** |
| `CORS_ORIGINS` | Comma-separated list of allowed frontend origins | `https://carb-planner.vercel.app,http://localhost:5173` | **Yes** |
| `SECRET_KEY` | Application cryptographic secret | `[generate-random-64-character-string]` | **Yes** |
| `DB_POOL_SIZE` | SQLAlchemy connection pool size | `5` | Optional (default: 5) |
| `DB_MAX_OVERFLOW` | SQLAlchemy pool max overflow | `10` | Optional (default: 10) |
| `DB_POOL_RECYCLE` | Stale connection recycling timeout (seconds) | `1800` | Optional (default: 1800) |
| `GOOGLE_MAPS_API_KEY`| Server-side Maps API key (if required) | `AIzaSy...` | Optional |

### B. Vercel (Frontend)
Configure these in **Vercel Dashboard $\rightarrow$ Project Settings $\rightarrow$ Environment Variables**:

| Variable | Description | Example | Required |
| :--- | :--- | :--- | :--- |
| `VITE_API_BASE_URL` | Full URL to the deployed Render FastAPI backend | `https://carb-planner-backend.onrender.com` | **Yes** |
| `VITE_GOOGLE_MAPS_API_KEY` | Client-side Google Maps key (restricted to domain) | `AIzaSy...` | Optional |

---

## 3. Tier 1: Supabase Database Setup

### Step 1: Create Supabase Project
1. Log in to [Supabase](https://supabase.com) and click **New Project**.
2. Select your Organization, name the project (e.g., `carb-planner-production`), and set a strong database password.
3. Choose the region closest to your Render service (e.g., `Frankfurt (eu-central-1)` or `Oregon (us-west-1)`).

### Step 2: Enable PostGIS Extension
1. Open the **SQL Editor** in your Supabase project dashboard.
2. Run the following command:
```sql
CREATE EXTENSION IF NOT EXISTS postgis;
```
3. Verify PostGIS is active:
```sql
SELECT PostGIS_Version();
```

### Step 3: Copy Connection String
1. Go to **Project Settings $\rightarrow$ Database $\rightarrow$ Connection parameters**.
2. Choose **Connection pooling** (Port `6543`, Transaction mode) for serverless scalability.
3. Copy the URI string:
```
postgresql://postgres.[YOUR-PROJECT-REF]:[YOUR-PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres
```

---

## 4. Tier 2: Render Backend Deployment

The backend uses Gunicorn with `UvicornWorker` ASGI workers for high throughput and CP-SAT execution stability.

### Option A: Deploy via Blueprint (`render.yaml`) — Recommended
1. Log in to [Render](https://dashboard.render.com).
2. Click **New + $\rightarrow$ Blueprint**.
3. Connect your GitHub repository: `https://github.com/nav-in27/CARB-PLANNER.git`.
4. Render automatically parses `render.yaml`.
5. Enter the `DATABASE_URL` and `CORS_ORIGINS` when prompted.
6. Click **Apply**.

### Option B: Deploy Manually as a Web Service
1. Click **New + $\rightarrow$ Web Service**.
2. Connect the repository: `nav-in27/CARB-PLANNER`.
3. Configure the following fields:
   - **Name:** `carb-planner-backend`
   - **Runtime:** `Python`
   - **Build Command:** `pip install --upgrade pip && pip install -r requirements.txt`
   - **Start Command:** `gunicorn backend.main:app -w 2 -k uvicorn.workers.UvicornWorker --bind 0.0.0.0:$PORT --timeout 120`
   - **Health Check Path:** `/health`
4. Add the Environment Variables:
   - `DATABASE_URL` = [Your Supabase connection URI]
   - `ENVIRONMENT` = `production`
   - `PORT` = `10000`
   - `CORS_ORIGINS` = `https://carb-planner.vercel.app` (or your Vercel URL)
5. Click **Create Web Service**.

### Automated Schema Migration & Seeding on Boot
On boot, FastAPI executes `startup_event()`:
1. Detects `DATABASE_URL`.
2. Verifies / enables PostGIS.
3. Automatically creates all 15 relational tables if they do not exist:
   - `corridors`, `stations`, `sections`, `tracks`, `loops`, `sidings`, `yards`, `assets`
   - `train_services`, `maintenance_tasks`, `scenarios`
   - `operational_plans`, `monthly_plans`, `weekly_plans`, `audit_logs`
4. Seeds canonical Tamil Nadu Grand South Trunk corridor data idempotently (zero duplicate rows).

---

## 5. Tier 3: Vercel Frontend Deployment

The React 19 / Vite single-page application is configured with SPA rewrites to ensure routes like `/dashboard`, `/block-planner`, `/maintenance`, `/disruptions`, and `/horizons` load seamlessly.

### Deployment Steps
1. Log in to [Vercel](https://vercel.com).
2. Click **Add New... $\rightarrow$ Project**.
3. Import the repository: `nav-in27/CARB-PLANNER`.
4. Configure Build & Development Settings:
   - **Framework Preset:** `Vite`
   - **Root Directory:** `./` (or `frontend` if deploying subfolder)
   - **Build Command:** `npm --prefix frontend run build` (or `npm run build` if root is `frontend`)
   - **Output Directory:** `frontend/dist` (or `dist` if root is `frontend`)
5. In **Environment Variables**, add:
   - `VITE_API_BASE_URL` = `https://carb-planner-backend.onrender.com`
6. Click **Deploy**.

---

## 6. End-to-End Verification & Smoke Testing

### Running the Automated Smoke Test
The project includes a 12-point automated verification script:

```bash
# Test against your live deployed environment
python verify_production_deployment.py --base-url https://carb-planner-backend.onrender.com
```

The smoke test verifies all 12 gates:
1. **[Step 1/12]** `/health` endpoint responds with `"status": "ok"` and live database connection.
2. **[Step 2/12]** System diagnostics across all 8 subsystems (FastAPI, Topology, Timetable, CP-SAT, LNS, Disruption, ML Models, Repository).
3. **[Step 3/12]** Grand South Trunk corridor configuration (`SR_GST_01`, 742 km).
4. **[Step 4/12]** Geographic topology (14 stations, 26 tracks, 12 loops with WGS84 coordinates).
5. **[Step 5/12]** Rolling stock timetable (23 train services including Vande Bharat 20627).
6. **[Step 6/12]** Maintenance queue with P90 duration buffers.
7. **[Step 7/12]** Multi-horizon planning linkages (Monthly $\rightarrow$ Weekly $\rightarrow$ Daily).
8. **[Step 8/12]** Google OR-Tools CP-SAT discrete solver execution.
9. **[Step 9/12]** Large Neighborhood Search (LNS) metaheuristic repair engine.
10. **[Step 10/12]** Non-mutating disruption impact preview simulation.
11. **[Step 11/12]** Disruption application and localized rolling replan with atomic version commit.
12. **[Step 12/12]** Immutable audit log and version snapshot repository.

---

## 7. Operational Troubleshooting

| Symptom | Cause | Solution |
| :--- | :--- | :--- |
| `/health` reports `"database": "disconnected"` | Supabase connection issue or incorrect password | Check `DATABASE_URL` in Render. Ensure port is `6543` (connection pooler) and query has `?sslmode=require`. |
| Browser shows `CORS error` on API requests | Frontend origin not present in backend CORS whitelist | Add your Vercel deployment URL to `CORS_ORIGINS` in Render environment variables. Note that `https://*.vercel.app` preview URLs are automatically matched. |
| Page refresh on `/block-planner` returns 404 | Missing SPA fallback | `vercel.json` already contains `rewrites: [{ "source": "/(.*)", "destination": "/index.html" }]`. Ensure `dist/index.html` is the output directory. |
| CP-SAT / LNS takes $>30$ seconds | Solver timeout on low-memory tier | Render Web Service is configured with `--timeout 120`. `time_limit_sec` in solver requests defaults to 10.0–30.0s for sub-second responses. |

---

## 8. Summary of Created Production Files

- `backend/database/db.py`: Database engine, connection pooling (`pool_pre_ping=True`), and health checker.
- `backend/database/models.py`: 15 SQLAlchemy relational models with PostGIS spatial indexes and JSON storage.
- `backend/database/init_db.py`: Idempotent database table creation and PostGIS extension initializer.
- `backend/database/seed_db.py`: Idempotent canonical railway network and timetable seeder.
- `backend/database/scenario_repo.py`: Hybrid in-memory & PostgreSQL transaction repository.
- `render.yaml`: Render Blueprint infrastructure-as-code configuration.
- `vercel.json` & `frontend/vercel.json`: Single-Page Application routing rewrites and HTTP security headers.
- `requirements.txt`: Declared production dependencies (`gunicorn`, `sqlalchemy`, `psycopg2-binary`, `shapely`).
- `.env.example` & `frontend/.env.example`: Secure environment variable templates.
- `verify_production_deployment.py`: 12-gate automated smoke test runner.

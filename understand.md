# Architectural Review & Delta Analysis: Teammate Push vs. Local Work

**Document Generated:** November 17, 2026  
**Target Repository:** `API-Security-Analytics-Dashboard`  
**Divergence Analysis:** `final-dashboard-updates` (Local) vs `origin/main` (Remote Force-Pushed)  

---

## Executive Summary

Your teammate (`Ayush-choudhary2005`) has executed a massive, enterprise-level overhaul of the repository on `origin/main` (116 files changed, +32,070 lines / -1,998 lines). 

### The Good News
The project has been transformed from a prototype into a production-grade **B2B SaaS Security Platform**:
- Complete migration from vanilla HTML/JS to a **React 18 + Vite SPA** (`frontend/dashboard/`).
- **MITRE ATT&CK Kill Chain Engine** (`backend/attack_correlator.py`).
- **Red Team Attack Simulation Engine** (`backend/simulator.py`).
- **Multi-Tenant RBAC & Governance** (Organizations, Projects, API Keys, Sessions, CSRF).
- **Dual-Persistence Database Engine** (`backend/database.py` with automatic PostgreSQL and SQLite support).
- **Full Python SDK** (`sdk/mlo11y`) supporting Flask, FastAPI, and Django.
- **Automated PDF Incident Dossiers** generated via ReportLab.
- **Slack & Discord Webhook Integrations**.

### The Critical Missing Pieces (What Was Disrupted / Lost)
Because your teammate branched off before your latest commits and force-pushed, **several of your key AI and ML features were not included in `origin/main`**:
1. ❌ **Autonomous Background Self-Learning Loop**: The background daemon thread that automatically retrained the Isolation Forest model on recent traffic is missing.
2. ❌ **Self-Learning API Endpoints**: `/api/retrain` and `/api/training_status` were dropped from `server.py`.
3. ❌ **UI Self-Learning Controls**: The React frontend lacks the "Initiate Self-Learning" button and the "Last Training: [Timestamp]" indicator.
4. ❌ **7-Model Gemini Fallback Cascade**: Reduced to only 3 models (`gemini-2.0-flash`, `gemini-1.5-flash`, `gemini-1.5-pro`), omitting lightweight models like `gemini-1.5-flash-8b` that bypass 503 quota spikes.
5. ❌ **Two-Tier Investigation UX**: The instant raw DB telemetry modal was replaced with a single blocking API call to the LLM.
6. ❌ **Legacy Single-File Dashboard**: `dashboard/index.html` was completely deleted in favor of the React build.

---

## 1. Step-by-Step Architecture Breakdown of `origin/main`

### 1.1. Frontend Architecture (`frontend/dashboard/`)
The entire frontend is now a modern Single Page Application built with **React 18**, **Vite**, and **Tailwind CSS**:
* **Entry Point**: `src/main.jsx` and `src/App.jsx`.
* **State Management**:
  * `AuthContext.jsx`: Handles user login, signup, session verification, logout, and password recovery.
  * `ProjectContext.jsx`: Tracks active organization, active project, and API keys.
* **Layouts**:
  * `PublicLayout.jsx`: Landing page and marketing shell.
  * `AuthLayout.jsx`: Centered auth card shell for sign-in/sign-up.
  * `AppLayout.jsx`: Main dashboard sidebar, top navigation, notification bell, project switcher.
* **Core Pages**:
  * `OverviewPage.jsx`: Real-time KPI counters, timeline charts, geographic Threat Map, recent activity.
  * `LiveMonitoringPage.jsx`: Real-time 1-FPS EKG oscilloscope canvas showing request pulses and live WebSocket event streams.
  * `ThreatsPage.jsx`: High-severity security incidents, attack signature filtering, manual IP blocking/unblocking modal.
  * `InvestigationsPage.jsx`: Forensic threat analysis, AI prompt generation, heuristic fallback display, and PDF report downloading.
  * `KillChainPage.jsx`: Multi-stage attack progression tracker mapped to MITRE ATT&CK stages.
  * `AnalyticsPage.jsx`: Historical aggregates, status code distribution, latency percentiles.
  * `ProjectsPage.jsx`: Multi-tenant workspace governance, project provisioning, API key management with prefix hashing (`sk_live_...`).
  * `SdkOnboardingPage.jsx`: Interactive code generation and setup guide for Flask, FastAPI, and Django.
  * `IntegrationsPage.jsx`: Configuration UI for Slack and Discord webhooks with a test dispatch trigger.
  * `SettingsPage.jsx`: Account profile, password change, and Gemini integration status.
  * `RedTeamPanel.jsx`: Embedded attack simulator UI.

---

### 1.2. Backend Services Architecture (`backend/`)
The backend has been modularized into dedicated domain services:

| File | Purpose & Responsibilities |
| :--- | :--- |
| `server.py` | Core Flask application (~2,500 lines). Exposes REST endpoints, WebSocket emitters, session authentication, and static SPA serving. |
| `database.py` | Database abstraction layer. Automatically detects `DATABASE_URL` for PostgreSQL (with connection pooling) or falls back to local SQLite (`events.db`). Normalizes SQL parameters (`?` vs `%s`). |
| `db.py` | Data Access Object (DAO) layer (~2,100 lines). Handles organizations, projects, users, API keys, events, alerts, and schema migrations. |
| `detection.py` | Production ML detection pipeline with baseline tracking, risk scoring (0-100), confidence scoring, and 60-second alert cooldown deduplication. |
| `attack_correlator.py` | MITRE ATT&CK correlation engine. Links sequential alerts from an IP into an attack chain (Reconnaissance → Credential Access → Discovery → Impact). Includes a 5-minute background auto-resolver. |
| `simulator.py` | Red Team attack simulation engine. Injects simulated attacks (brute force, scan, burst) directly into the internal ingestion pipeline with `simulated: True` tags. |
| `investigator.py` | GenAI threat analysis service. Calls Google Gemini models and includes a deterministic heuristic fallback engine. |
| `integrations/` | Extensible notification system with dedicated Slack (`slack.py`) and Discord (`discord.py`) webhook handlers. |
| `auth.py` | Password hashing (Werkzeug), token generation, and `@login_required` decorator. |
| `google_auth.py` | Google OAuth 2.0 / OpenID Connect integration via Authlib. |
| `rate_limiter.py` | Dual-key token bucket rate limiting (per IP and per API key). |
| `email_service.py` | Password reset and verification emails with local console fallback. |

---

### 1.3. SDK Architecture (`sdk/`)
A modular Python SDK is located in `sdk/mlo11y/` and `sdk/middleware.py`:
* **Framework Support**: Pre-built middlewares for **Flask**, **FastAPI**, and **Django**.
* **Transport**: Async, non-blocking HTTP event sender (`transport.py`) with batching to ensure zero latency overhead on client applications.
* **Security**: Enforces API keys and supports dynamic client credential injection.

---

## 2. Detailed Audit: What Backend & AI Features Are Missing in `origin/main`

Here is the exact comparison of the features you built vs. what is currently on `origin/main`:

### ❌ Feature 1: Autonomous Background Self-Learning Loop
* **What you had**: In `backend/server.py`, a background `threading.Thread` daemon periodically checked traffic volumes and triggered `train_model.py` to retrain the Isolation Forest model on recent production traffic automatically.
* **What `origin/main` has**: There is **no background retraining thread**. `origin/main` only runs a baseline model synthesis on server startup (`_init_isolation_forest()`), but it never retrains or updates the model dynamically as new traffic arrives.
* **Impact**: The model cannot autonomously adapt to changing API usage patterns or learn from newly ingested normal traffic.

---

### ❌ Feature 2: Manual Retrain API & Training Status API
* **What you had**: 
  * `POST /api/retrain`: Spawned a subprocess to execute `train_model.py` in the background and reloaded the model.
  * `GET /api/training_status`: Returned `last_trained` timestamp using `os.path.getmtime(model_path)`.
* **What `origin/main` has**: Neither endpoint exists in `backend/server.py`.
* **Impact**: The frontend cannot query when the model was last trained, nor can an administrator trigger a re-train.

---

### ❌ Feature 3: Frontend Self-Learning UI Controls
* **What you had**: In the Settings tab, a dedicated "Initiate Self-Learning" button with an active status spinner and a live "Last Training: [Date/Time]" label.
* **What `origin/main` has**: In `frontend/dashboard/src/pages/dashboard/SettingsPage.jsx`, there are only account settings, password updates, and Gemini status. There are **zero ML training controls or timestamps**.
* **Impact**: You cannot visually demonstrate the model's adaptive learning capabilities to judges or users in the new React UI.

---

### ❌ Feature 4: Gemini Fallback Cascade (7 Models vs. 3 Models)
* **What you had**: `backend/investigator.py` had a cascade of 7 Gemini models (`gemini-2.0-flash`, `gemini-1.5-flash`, `gemini-1.5-flash-8b`, `gemini-1.5-pro`, `gemini-1.0-pro`, `gemini-2.0-flash-lite`, `gemini-2.5-pro`) to ensure high availability during Google AI Studio 503 capacity outages.
* **What `origin/main` has**: `investigator.py` only defines 3 models: `['gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-1.5-pro']`. If these three experience quota or 503 limits, it aborts live GenAI generation and displays the static heuristic report.
* **Impact**: Higher chance of dropping to the offline fallback report during peak Google Cloud hours.

---

### ❌ Feature 5: Two-Tier Investigation Latency Split
* **What you had**: Clicking an alert immediately loaded raw database telemetry (IP, ML score, latency, endpoints) in <50ms, with a distinct button to trigger the heavy GenAI analysis.
* **What `origin/main` has**: `InvestigationsPage.jsx` immediately calls `/api/investigate/<alert_id>`, which waits synchronously for the full Gemini response (or timeout). 
* **Impact**: The UI displays a loading spinner for 10–25 seconds before showing any incident details.

---

## 3. How the Build & Run Workflow Has Changed

In the old workflow, you could run `python backend/server.py` and open `http://localhost:5001` to view `dashboard/index.html`.

In the new architecture on `origin/main`:
1. **Frontend must be built**:
   ```bash
   cd frontend/dashboard
   npm install
   npm run build
   ```
   This generates the production bundle in `frontend/dashboard/dist/`.
2. **Backend serves the built frontend**:
   `backend/server.py` checks `frontend/dashboard/dist`. If present, it serves the React SPA at `/`.
3. **Development Mode**:
   - Backend runs on `http://127.0.0.1:5001`.
   - Frontend runs on Vite dev server: `npm run dev` at `http://localhost:5173` (Vite proxies API calls to port 5001).

---

## 4. Recommended Non-Destructive Next Steps

Since your teammate has pushed a comprehensive foundation, the goal is **not** to revert their work, but rather to **re-integrate your unique AI features into their new architecture**:

1. **Keep Your Current Branch Safe**:
   Do not run destructive git commands on `final-dashboard-updates`. Your work is safely recorded in your commit history.
2. **Create a Clean Integration Branch**:
   Check out `origin/main` into a separate branch (e.g., `git checkout -b integrate-ai-features origin/main`).
3. **Re-Inject Your Missing Features**:
   - Port the background retraining daemon into `backend/server.py`.
   - Add `/api/retrain` and `/api/training_status` to `backend/server.py`.
   - Expand `GEMINI_MODELS` in `backend/investigator.py` to include the 7-model fallback array.
   - Add the "Initiate Self-Learning" button and "Last Training" timestamp card to `frontend/dashboard/src/pages/dashboard/SettingsPage.jsx`.
   - Build the frontend (`npm run build`) and verify end-to-end functionality.

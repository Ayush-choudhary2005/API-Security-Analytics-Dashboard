# Architectural & Implementation Decision Log

**Project:** API-Security-Analytics-Dashboard  
**Feature Integration:** Autonomous Machine Learning & Resilient GenAI Threat Intelligence  
**Target Branch:** `ai-ml-integration` (Tracking `origin/main`)  
**Started:** November 18, 2026  

---

## Log of Architectural Decisions

### Decision 1: Branch Isolation & Clean Baseline (Stage 1)
* **Date:** 2026-11-18
* **Context:** The teammate pushed a major overhaul directly to `origin/main` (React 18 SPA, MITRE ATT&CK Kill Chain, Red Team simulator, and multi-tenant RBAC). We need to integrate our AI/ML self-learning and model retraining features without touching or breaking any of the teammate's frontend or backend work.
* **Decision:**
  1. Stash any uncommitted local work on `final-dashboard-updates` so no changes are lost.
  2. Create a clean branch `ai-ml-integration` directly from `origin/main`.
  3. All future edits will be isolated to this branch, and pushed to GitHub as a dedicated remote branch (`git push -u origin ai-ml-integration`).
* **Rationale:** Protects the existing code, isolates new development, allows clean pull-request review, and prevents merge conflicts.

---

### Decision 2: Dual Database Compatibility for ML Training Pipeline (Stage 2)
* **Date:** 2026-11-18
* **Context:** The teammate refactored database access into `backend/database.py`, which supports both PostgreSQL (`DATABASE_URL`) and SQLite (`events.db`) with normalized SQL queries. In our previous branch, `train_model.py` was hardcoded to SQLite or raw psycopg2 pools.
* **Decision:**
  1. In `backend/train_model.py`, use `db.get_conn()` and standard dict conversion so feature extraction works seamlessly on both PostgreSQL (in cloud deployment) and SQLite (in local development).
  2. Implement `POST /api/retrain` and `GET /api/training_status` in `backend/server.py` using non-blocking subprocess or background worker execution so training large datasets never blocks HTTP request handling.
* **Rationale:** Maintains 100% compatibility with production cloud (Render + Supabase) and local test environments without modifying `database.py`.

---

### Decision 3: Non-Blocking Autonomous Daemon with Thread-Safe Retraining Lock (Stage 3)
* **Date:** 2026-11-18
* **Context:** The ML model needs to retrain periodically (e.g. hourly) or adaptively upon ingesting substantial new traffic (e.g. 500 events). However, Gunicorn and multi-threaded Flask servers can spawn duplicate retraining jobs if not guarded.
* **Decision:**
  1. Implement a single background daemon thread in `backend/server.py` guarded by `_retrain_lock = threading.Lock()`.
  2. Retraining will run safely without freezing or interfering with the existing `_chain_resolver_thread` (which manages attack chains) or the WebSocket event stream.
* **Rationale:** Guarantees zero dropped ingestion events during retraining while ensuring completely autonomous, hands-free model adaptation.

---

### Decision 4: Resilient 7-Model Cascade with Graceful Fallback (Stage 4)
* **Date:** 2026-11-18
* **Context:** Google AI Studio free tier frequently returns HTTP 503 ("Model Overloaded / Unavailable") during peak traffic. `origin/main` had only 3 models listed, which caused frequent fallback to static reports.
* **Decision:**
  1. Expand `GEMINI_MODELS` in `backend/investigator.py` to a 7-model priority list:
     - `gemini-2.0-flash`
     - `gemini-1.5-flash`
     - `gemini-1.5-flash-8b`
     - `gemini-1.5-pro`
     - `gemini-1.0-pro`
     - `gemini-2.0-flash-lite`
     - `gemini-2.5-pro`
  2. If all models fail or no API key is provided, gracefully retain the teammate's deterministic heuristic threat report.
* **Rationale:** Maximizes uptime and live LLM generation success rate while providing 100% offline resilience.

---

### Decision 5: Non-Invasive React UI Integration in Settings Page (Stage 5)
* **Date:** 2026-11-18
* **Context:** The teammate built a clean React dashboard with 10+ pages (`OverviewPage`, `KillChainPage`, `LiveMonitoringPage`, `ProjectsPage`, `ThreatsPage`, etc.). We must not alter, redesign, or break any of those pages.
* **Decision:**
  1. Add `trainingService` to `frontend/dashboard/src/services/api.js` for `/api/training_status` and `/api/retrain`.
  2. Add an "Autonomous AI & Self-Learning" card exclusively within `frontend/dashboard/src/pages/dashboard/SettingsPage.jsx`.
  3. The card displays:
     - Real-time training status ("Model Active & Monitoring", or "Training in Progress...").
     - Last trained timestamp.
     - An "Initiate Self-Learning" button with an active spinning state and toast notification.
  4. Ensure zero modifications to any other page or styling system.
* **Rationale:** Clean separation of concerns, zero disruption to existing dashboard views, and an intuitive location for administrators to inspect ML health.

---

## Stage Execution & Verification Log

### Stage 2 Verification Record
* **Status:** COMPLETED & VERIFIED (Commit `5331754`)
* **Files Modified:**
  - `backend/train_model.py`: Refactored `retrain_from_db()` with sliding-window extraction, dual SQLite/Postgres compatibility via `db.get_conn()`, synthetic fallback for cold starts, and automated hot-reloading via `detection.reload_model()`.
  - `backend/detection.py`: Added `reload_model()` to hot-reload `ml_model = joblib.load(MODEL_PATH)` into memory after a training run.
  - `backend/server.py`: Added `import threading`, implemented `GET /api/training_status` (public/authenticated model health check), and implemented `POST /api/retrain` (asynchronous, thread-safe background retraining with `@login_required`).
* **Test Results:**
  - `GET /api/training_status` -> 200 OK with `status`, `features`, `is_trained`, `last_trained`.
  - `POST /api/retrain` -> 401 Unauthorized when unauthenticated; 202 Accepted when authorized.
* **Zero Disruption Guarantee:**
  - No frontend files were modified.
  - No existing REST routes or WebSocket channels were altered.
  - Database schema and migrations remain 100% untouched.

---

### Stage 3 Verification Record
* **Status:** COMPLETED & VERIFIED (Commit `3ec9192`)
* **Files Modified:**
  - `backend/server.py`:
    - Added `record_ingest_for_learning()` to track new events ingested.
    - Wired `record_ingest_for_learning()` into `_safe_ingest_event` immediately after database insertion.
    - Extended `GET /api/training_status` to expose `events_since_last_train`, `threshold_events` (250), and `interval_sec` (3600).
    - Added `_autonomous_learning_loop()` background daemon thread alongside `_chain_resolver_thread` on server boot.
* **Test Results:**
  - Daemon thread starts cleanly on boot as a non-blocking daemon.
  - Telemetry ingestion increments the counter accurately without blocking event response times.
  - Dual triggers (volume threshold of 250 events or hourly schedule) guard against race conditions using `_retrain_lock`.
* **Zero Disruption Guarantee:**
  - Preserved existing `_chain_resolver_thread`.
  - No external endpoints or authentication mechanisms were modified.

---

### Stage 4 Verification Record
* **Status:** COMPLETED & VERIFIED
* **Files Modified:**
  - `backend/investigator.py`:
    - Expanded `GEMINI_MODELS` from 3 to 7 models: `['gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-1.5-flash-8b', 'gemini-1.5-pro', 'gemini-1.0-pro', 'gemini-2.0-flash-lite', 'gemini-2.5-pro']`.
    - Added model failover warning logging and successful model attribution.
* **Test Results:**
  - Models array verified with 7 distinct Google AI Studio models prioritizing lightweight/fast variants.
  - Verified graceful heuristic fallback mode when API key is unconfigured or if all models fail.
* **Zero Disruption Guarantee:**
  - Existing `generate_threat_report` and `generate_fallback_threat_report` signatures preserved.
  - PDF export and report serialization remain 100% compatible.

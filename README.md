# 🛡️ API Security Analytics & Active Defense Platform

An end-to-end, zero-latency API observability, multi-tenant security, and autonomous active defense platform. This project detects zero-day API abuse, behavioral anomalies, and automated attacks using an unsupervised Machine Learning model (**Isolation Forest**). It actively defends servers via auto-blocking and webhooks, provides full multi-tenant project isolation with dedicated SDK credentials, and investigates threats autonomously using **Generative AI (Google Gemini)**.

---

## 🏗️ Architecture

```
Organization / Workspace (e.g., Acme Corporation)
 │
 ├── 1. Users / Team Members (Owners, Admins, Members, Viewers)
 │    │
 │    └── Unified Authentication (Email/Password & Google OAuth OpenID Connect)
 │
 └── 2. Projects (e.g., Production API, Payment Gateway, Staging API)
      │
      ├── 3. SDK Credentials (ask_<project_id>_<secret>)
      │    │
      │    └── Application (Flask / FastAPI / Express / Go)
      │         │
      │         └── SDK Middleware (Async Zero-Latency Telemetry)
      │              │
      │              └── 4. Telemetry Ingestion Collector (/ingest)
      │                   │
      │                   ├── 5. ML Threat Detection (Isolation Forest + Feature Fusion)
      │                   │    │
      │                   │    └── 6. Alerting & Active Defense (Rate Limiter / Auto-Block)
      │                   │         │
      │                   │         └── Tenant-Scoped Webhook (Slack / Discord)
      │                   │
      │                   └── 7. Real-Time WebSockets (Isolated Project Rooms)
      │                        │
      │                        └── 8. Project Dashboard (Live EKG, Maps, AI Investigations)
```

### Complete Multi-Tenant Pipeline Flow
```mermaid
flowchart TD
    Org["🏢 Organization / Workspace"] --> Member["👥 Organization Members (Roles)"]
    Member --> User["👤 Authenticated User"]
    Org --> Project["📁 Projects"]
    Project --> SDKKey["🔑 Project SDK Key (ask_...)"]
    SDKKey --> App["💻 Instrumented API"]
    App --> SDK["⚡ Zero-Latency SDK Middleware"]
    SDK --> Collector["🛡️ Telemetry Ingestion (/ingest)"]
    Collector --> ML["🧠 Feature Extraction & Isolation Forest"]
    ML --> Alerts["🚨 Security Alerts & Rate Limiter"]
    Alerts --> Webhook["🔔 Tenant Webhook (Slack/Discord)"]
    Collector --> WS["📡 WebSocket (Project Room)"]
    WS --> Dashboard["📊 Dashboard Console UI"]
    Alerts --> Gemini["✨ GenAI Threat Investigator"]
    Gemini --> PDF["📄 Threat Intelligence PDF"]
```

---

## 🔐 Authentication & Session Security

The platform includes a complete, enterprise-grade authentication system designed to isolate user workspaces and enforce least privilege.

* **User Registration & Email Verification (`/api/auth/register`, `/api/auth/verify-email`, `/api/auth/resend-verification`):**
  * Validates RFC 5322 email syntax and prevents duplicate account registration (`HTTP 409 Conflict`).
  * Enforces minimum password strength requirements (≥ 8 characters) and password confirmation matching (`HTTP 400 Bad Request`).
  * Automatically provisions a default project workspace and initial SDK credentials upon registration.
  * Generates cryptographically secure, single-use email verification tokens (24-hour expiration) stored as SHA-256 hashes at rest.
  * Dispatches transactional verification emails via SMTP or dev mailbox fallback.
  * Google OAuth signups are automatically verified as email authenticity is verified by Google.
* **Secure Login (`/api/auth/login`):**
  * Verifies credentials against salted cryptographic hashes.
  * Prevents email enumeration attacks by returning uniform, generic error messages (`"Invalid email or password"`) for both non-existent accounts and invalid passwords.
  * Implements in-memory sliding-window brute force protection: 10 failed login attempts within 300 seconds trigger `HTTP 429 Too Many Requests`.
  * Records `last_login_at` timestamps upon successful authentication.
* **Forgot Password & Password Reset (`/api/auth/forgot-password`, `/api/auth/reset-password`):**
  * Initiates self-service password reset with uniform generic responses to defend against account enumeration.
  * Generates single-use, cryptographically random tokens valid for 1 hour, stored as SHA-256 hashes in the database.
  * Atomically validates token, updates password hash, marks token consumed, and touches `password_changed_at`.
  * Immediately invalidates all existing active sessions across all devices upon password reset.
* **Authenticated Password Change (`/api/auth/change-password`):**
  * Allows authenticated users to change their account password after validating their existing password.
  * Google-only accounts without an initial password can set an initial password without entering a current password.
  * Refreshes the active session's `auth_time` while immediately invalidating all other concurrent sessions.
* **Account Profile Management (`/api/auth/profile`):**
  * Retrieves unified account profile details: user ID, email, name, verification status, linked authentication identities (Password, Google), last login time.
  * Supports updating display name via `PUT /api/auth/profile`.
* **Session Management & Invalidation:**
  * Establishes server-side authenticated sessions stored in signed cookies.
  * Hardened with `HttpOnly` (mitigating XSS extraction), `SameSite=Lax` (mitigating CSRF), and a 7-day persistent lifespan.
  * Active sessions enforce session invalidation checks against `password_changed_at`. Any session created before the most recent password update is terminated with `401 Unauthorized`.
* **Google OAuth 2.0 / OpenID Connect (`/auth/google` & `/auth/google/callback`):**
  * One internal user architecture: Google OAuth resolves to the same internal user identity as email/password accounts.
  * Uses Google's stable OpenID subject identifier (`sub`) as `provider_user_id` in `auth_identities`, never the mutable email address.
  * Safe account linking: If a user with an existing email/password account clicks "Continue with Google" using that same email, the system safely requires password verification before linking the Google identity, preventing account takeover.
  * Once linked, the user can log in seamlessly using either method into the exact same workspace.
  * New Google users automatically receive an internal user ID, initial default project, and primary SDK credentials.
* **Logout (`/api/auth/logout`):**
  * Destroys session state immediately on the server and clears client session cookies.
* **Password Security:**
  * Passwords are securely hashed using Scrypt / PBKDF2 with unique salts via `werkzeug.security`.
  * Plaintext passwords and cryptographic hashes are never stored in plain text, logged, or exposed in API responses.
  * Google OAuth accounts created without a password store an unmatchable marker (`!oauth_provider`) ensuring password authentication cannot be forged or bypassed.

---

## 🏢 Multi-Tenant SaaS Organizations & Workspaces

The platform implements a production-grade multi-tenant SaaS architecture supporting multiple independent companies and teams on the same deployment:

```
Acme Corporation (Organization / Workspace)
 ├── Members: alice@acme.com (Owner), bob@acme.com (Admin), dev@acme.com (Member)
 ├── Project 1: Production API   ──> SDK Key A ──> Isolated Telemetry, ML Alerts, Webhooks
 ├── Project 2: Staging API      ──> SDK Key B ──> Isolated Telemetry, ML Alerts, Webhooks
 └── Project 3: Payment Gateway  ──> SDK Key C ──> Isolated Telemetry, ML Alerts, Webhooks

Cyberdyne Systems (Organization / Workspace)
 ├── Members: john@cyberdyne.com (Owner)
 └── Project 1: Defense Network  ──> SDK Key D ──> Strictly Isolated Data Boundary
```

### Hierarchy & Security Model:
```
Organization / Workspace
       ↓
Users / Organization Members
       ↓
    Projects
       ↓
 SDK Credentials
       ↓
Telemetry (Events / Alerts / Webhooks / Rooms)
```

### Key Multi-Tenant Capabilities:
* **Organization Workspaces (`/api/organizations`):** Users can create multiple organizations or belong to multiple organizations as team members. Each organization has its own isolated workspace, unique slug, and team directory.
* **Role-Based Membership Foundation (`/api/organizations/<org_id>/members`):**
  * `Owner`: Full management of organization, projects, credentials, and member lifecycle.
  * `Admin`: Can invite members, create/manage projects, and configure integrations.
  * `Member` / `Viewer`: Access to view organization projects and security telemetry.
  * Last owner protection: The system strictly prevents deleting or leaving the last owner of an organization.
* **Server-Side Tenant Isolation Boundary:**
  * **Zero Frontend Trust:** The backend NEVER trusts `organization_id` or `project_id` supplied by client queries or request bodies.
  * **Strict Authorization Pipeline:** Every resource is authorized through: `authenticated user` → `organization membership` → `project ownership/membership` → `target resource`.
  * **Cross-Tenant Attack Resistance:** Attempting to view, tamper with, or query another organization's projects, API keys, webhook configs, telemetry events, alerts, blocked IPs, or AI threat investigations returns `HTTP 403 Forbidden`.
* **Workspace & Project Switching:**
  * The dashboard HUD features synchronized **Org** and **Project** selectors.
  * Switching organizations automatically updates accessible projects.
  * Switching projects rebinds live WebSocket rooms, event streams, attack charts, threat maps, blocked IPs, and SDK credentials without reloading the page.

---

## 🔑 SDK Credentials & Security

Every project has its own dedicated SDK credentials used to authenticate telemetry.

### The Golden Rule:
> [!IMPORTANT]
> **The SDK credential is NOT the user's dashboard login token.**
> It contains zero user credentials, passwords, or dashboard session data. It is an isolated, scoped API key whose sole capability is authorizing background telemetry ingestion for that specific project.

* **Credential Format:** Recognizable, high-entropy tokens:
  ```text
  ask_<project_identifier>_<32_character_hex_secret>
  Example: ask_ecomm_a1b2c3d4e5f67890123456789abcdef0
  ```
* **Cryptographic Storage:** Only the `SHA-256` hash of the credential and its public prefix are stored in the database. Raw keys are shown only once upon generation.
* **Tenant Pinning:** When the ingestion collector receives telemetry with an SDK key, the server pins the `project_id` to the authenticated key owner. Even if a malicious payload submits a falsified `{"project_id": "other_project"}` in the request body, the server overrides it with the verified project identity.
* **Key Lifecycle Management:**
  * **Regenerate Key:** Issues a new credential and immediately revokes previous keys.
  * **Revoke Key:** Instantly invalidates the key. Ingestion requests using revoked keys immediately fail with `HTTP 401 Unauthorized`.
  * **Audit Timestamps:** Tracks `last_used_at` to monitor active data pipelines.

---

## 🚀 Guided Developer Onboarding Experience

The platform provides a guided, zero-prior-knowledge onboarding wizard (`🚀 Quickstart`) designed to take developers from creating a project to verified live telemetry in minutes.

The onboarding wizard automatically opens upon creating any new project and can be relaunched anytime via the **🚀 Quickstart** button in the dashboard topbar:

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                    DEVELOPER ONBOARDING & QUICKSTART WIZARD                     │
├──────────────────────┬──────────────────────────────────────────────────────────┤
│ 1. Choose Framework  │ Select web framework: [🌶️ Flask] [⚡ FastAPI]            │
│ 2. Install SDK       │ pip install mlo11y                        [📋 Copy]      │
│ 3. Configure API Key │ export SECURITY_SDK_API_KEY="ask_..."     [📋 Copy]      │
│ 4. Integration Code  │ SecurityMiddleware(app)                   [📋 Copy]      │
│ 5. Start Application │ python app.py                             [📋 Copy]      │
│ 6. Send Test Request │ curl http://127.0.0.1:5000/               [📋 Copy]      │
│                      │ [⚡ Send Live Test Event Now]                            │
│ 7. Verify Connection │ ✓ SDK connected                                          │
│                      │ ✓ Telemetry received                                     │
│                      │ ✓ Project configured                                     │
│                      │ [🚀 Open Live Dashboard]                                 │
└──────────────────────┴──────────────────────────────────────────────────────────┘
```

### 7-Step Guided Workflow:

* **STEP 1: Choose Your Framework**
  * **Flask** *(Active / Supported)*: Zero-overhead WSGI middleware.
  * **FastAPI** *(Preview / Architecture Ready)*: Asynchronous Starlette / ASGI pipeline.
  * **Django** *(Architecture Ready)*: Settings middleware integration.
  * **Node.js / Express** *(Architecture Ready)*: Express request handler integration.
* **STEP 2: Install SDK**
  * Displays the exact command (`pip install mlo11y` or `pip install ./sdk`) with a one-click copy button.
* **STEP 3: Configure API Key**
  * Displays environment variable `SECURITY_SDK_API_KEY`.
  * Shows masked credential with a copy button and ready-to-run terminal snippets for Linux/macOS (`export`), Windows PowerShell (`$env:`), and `.env` files.
  * Clearly reminds developers to treat SDK keys like secrets and never commit them to git.
* **STEP 4: Add Integration Code**
  * Provides a complete, copy-paste-ready application example demonstrating that only **two lines of code** are required to observe and protect any API.
* **STEP 5: Start Application**
  * Displays the startup command (`python app.py`) and explains the asynchronous background worker operation.
* **STEP 6: Send Test Request**
  * Provides copyable curl commands for sending sample traffic.
  * Includes an interactive **"⚡ Send Live Test Event"** button that immediately fires a synthetic test event into the project's ingestion pipeline.
* **STEP 7: Verify Connection**
  * Automatically detects incoming telemetry in real time via WebSockets and periodic polling.
  * When verified, displays:
    * `✓ SDK connected`
    * `✓ Telemetry received`
    * `✓ Project configured`
    * Details of the received sample event (endpoint, latency, HTTP status code).
  * If telemetry is pending, displays an active radar listening indicator alongside comprehensive **Troubleshooting Guidance** (checking port reachability, environment variables, HTTP 401 resolution).

### Server-Side Onboarding State Persistence & Isolation:
* **Per-Project State:** Each project tracks its onboarding progress (`project_onboarding` table: `current_step`, `completed_steps`, `framework`, `status`, `first_telemetry_at`).
* **Multi-Tenant Security:** Every onboarding API endpoint (`/api/projects/<id>/onboarding`) strictly verifies project authorization server-side. Users from Organization A can never inspect, alter, or emit test events into Organization B's projects.

---

## 📦 SDK Integration Guide

Instrumenting any Python Flask API takes less than two minutes:

### Step 1: Install the SDK Package
```bash
pip install ./sdk
```
*(Or install in editable mode for local development: `pip install -e ./sdk`)*

---

### Step 2: Add the SDK to Your Application

In your existing Flask application entrypoint:

```python
from flask import Flask
from security_sdk import SecurityMiddleware

app = Flask(__name__)

# Method A: Direct initialization with your project credential
SecurityMiddleware(
    app,
    collector_url="http://127.0.0.1:5001",
    api_key="ask_your_project_sdk_key_here"
)

# Method B: Zero-hardcoding via environment variables:
# export SECURITY_SDK_API_KEY="ask_..."
# SecurityMiddleware(app)

@app.route("/api/checkout", methods=["POST"])
def checkout():
    return {"status": "success"}, 200

if __name__ == "__main__":
    app.run(port=5000)
```

*(You can also import via `from mlo11y import SecurityMiddleware` or `from middleware import SecurityMiddleware`)*

---

### Step 3: Production Safety & Resilience Guarantees

* **Zero Added Request Latency:** Request threads only push events to a sub-millisecond in-memory queue (`queue.put_nowait`). No network I/O ever blocks host application responses.
* **Fail-Safe Operation:** If the ML-O11Y collector is offline or experiencing downtime, the **host API continues operating normally**. Telemetry events are buffered or dropped safely without throwing exceptions or crashing the API.
* **Downtime Backoff:** The background worker backs off automatically during collector outages to prevent CPU thrashing.
* **Credential Masking:** Raw SDK keys are never logged, printed, or exposed in exceptions.
* **Bounded Buffer:** Memory queue is strictly bounded (`max_queue_size=10000`) to guarantee immunity to Out-Of-Memory (OOM) issues during prolonged collector downtime.
* **Proxy & CDN Awareness:** Automatically resolves authentic client IP addresses across `X-Forwarded-For`, `CF-Connecting-IP`, and `X-Real-IP`.

---

### Full Configuration Reference

| Option | Environment Variable | Default | Description |
|---|---|---|---|
| `api_key` | `SECURITY_SDK_API_KEY` | `""` | Project SDK credential (`ask_...`) |
| `collector_url` | `SECURITY_SDK_COLLECTOR_URL` | `http://localhost:5001` | URL of the ML-O11Y security ingestion collector |
| `enabled` | `SECURITY_SDK_ENABLED` | `true` | Set to `false` to disable telemetry capture (e.g. during local tests) |
| `timeout` | `SECURITY_SDK_TIMEOUT` | `2.0` | Timeout in seconds for background telemetry delivery |
| `max_queue_size` | `SECURITY_SDK_MAX_QUEUE_SIZE` | `10000` | In-memory buffer size before dropping telemetry |
| `app_name` | `SECURITY_SDK_APP_NAME` | `flask-app` | Descriptive application name |
| `user_id_callback` | — | `None` | Optional hook `callback(request)` returning authenticated user ID |
| `debug` | `SECURITY_SDK_DEBUG` | `false` | Enable verbose worker debug output |
```

### Step 5: Verify Live Telemetry
Make requests to your API. Telemetry immediately begins streaming into your project dashboard via WebSockets.

---

## ⚡ Production Telemetry Ingestion Pipeline (`POST /ingest`)

The platform's ingestion pipeline is architected for enterprise production workloads, supporting high throughput, microburst absorption, data loss prevention (DLP), and multi-tenant isolation.

### 1. Telemetry Event Schema (`POST /ingest`)
The ingestion endpoint accepts JSON payloads adhering to the canonical schema:

```json
{
  "event_id": "evt_4a89b02ef1",
  "endpoint": "/api/v1/checkout",
  "method": "POST",
  "status_code": 200,
  "latency_ms": 24.5,
  "ip": "203.0.113.195",
  "user_id": "usr_9918",
  "user_agent": "Mozilla/5.0 ...",
  "payload_size": 1024,
  "event_type": "http_request",
  "metadata": {
    "handler": "checkout_controller",
    "cluster": "prod-useast1"
  }
}
```

* **Server-Pinned Fields:** `project_id`, `tenant_id`, and `ingested_at` are **strictly generated/overridden by the server** based on the authenticated Bearer API key. Even if a client submits an arbitrary `{"project_id": "victim_project"}`, it is safely ignored.
* **Payload Size Ceiling:** Requests larger than **64 KB** are immediately rejected with `HTTP 413 Payload Too Large`.

### 2. HTTP Response Behavior for SDK Clients

| Status Code | Reason | Description |
|---|---|---|
| **`201 Created`** | Success | Event was successfully validated, scored by ML models, and persisted. |
| **`202 Accepted`** | Duplicate Ignored | Event has already been processed within the sliding de-duplication window (5 mins). Retried safely without corrupting analytics. |
| **`400 Bad Request`** | Malformed Event | Invalid JSON, missing required fields (`endpoint`, `method`, `status_code`), invalid method, or out-of-range status code. |
| **`401 Unauthorized`** | Authentication Failure | Missing, invalid, or revoked SDK API token. |
| **`413 Payload Too Large`** | Size Exceeded | Telemetry payload exceeds 64KB limit. |
| **`429 Too Many Requests`** | Rate Limit Exceeded | Project token bucket exhausted. Response includes a `Retry-After: <seconds>` header. |
| **`500 Internal Error`** | Server Failure | Generic sanitized error without leaking internal stack traces or database errors. |
| **`503 Service Unavailable`** | Dependency Outage | The collector database is currently unreachable. |

### 3. Data Loss Prevention (DLP) & Secret Redaction
If an application inadvertently captures sensitive data, the pipeline automatically scrubs it before it reaches detection or storage:
* **Key Scrubber:** Any metadata key containing `password`, `secret`, `token`, `auth`, `cookie`, `key`, `credential`, `session`, `jwt`, `card` is replaced with `"[REDACTED]"`.
* **Value Regex Engine:** Scans strings for Bearer tokens (`Bearer ...`), JSON Web Tokens (`eyJ...`), API keys (`ask_...`, `sec_live_...`, `sk-...`, `AKIA...`), and payment card numbers.
* **Query Parameter Scrubber:** URLs such as `/auth/callback?token=secret123` are automatically sanitized to `/auth/callback?token=[REDACTED]`.

### 4. Health Probes for Monitoring & Orchestration

The platform provides dedicated liveness and readiness endpoints conforming to Kubernetes, Docker, and cloud orchestrator standards:

* **Liveness Probe (`GET /health` or `GET /healthz`)**:
  * Verifies that the HTTP server process is running and accepting connections.
  * Response (`200 OK`):
    ```json
    {
      "status": "alive",
      "service": "ml-o11y-telemetry-collector",
      "uptime_seconds": 1845.2,
      "timestamp": 1728261000.0
    }
    ```
* **Readiness Probe (`GET /ready` or `GET /readyz`)**:
  * Deep dependency verification: tests SQLite database read/write connectivity, ML anomaly detector status, and rate limiters.
  * Healthy Response (`200 OK`):
    ```json
    {
      "status": "ready",
      "checks": {
        "database": "healthy",
        "detection_engine": "ready",
        "rate_limiter": "active",
        "dedup_cache": "active"
      },
      "timestamp": 1728261000.0
    }
    ```
  * Unhealthy Response (`503 Service Unavailable`): Returned if database or critical dependencies fail, signaling orchestrators to route traffic away from the instance.

---

## 🧠 Machine Learning Detection & Active Defense Pipeline

The platform features an advanced, multi-tenant active defense pipeline fusing unsupervised machine learning with deterministic threat rule engines.

### 1. Architectural Decision: Isolation Forest Baseline Architecture

When designing anomaly detection for a multi-tenant observability platform, the baseline architecture dictates operational accuracy and cross-tenant isolation:

```
┌────────────────────────────────────────────────────────────────────────┐
│                        BASELINE EVALUATION MATRIX                      │
├─────────────────────────┬──────────────────────────────────────────────┤
│ Option A: Shared Only   │ ❌ Cross-project distortion (e.g. 1200ms batch│
│                         │    APIs contaminate 15ms microservices).     │
├─────────────────────────┼──────────────────────────────────────────────┤
│ Option B: Project-Only  │ ❌ Severe cold-start starvation (new projects│
│                         │    have 0 events and cannot train models).   │
├─────────────────────────┼──────────────────────────────────────────────┤
│ Option C: Hybrid Model  │ ✅ SELECTED: Universal structural prior for  │
│    (Prior + Adaptive)   │    cold starts blended with rolling project  │
│                         │    baselines for zero cross-tenant leakage.  │
└─────────────────────────┴──────────────────────────────────────────────┘
```

#### Why Option C (Hybrid Approach) Was Chosen:
1. **Universal Structural Prior:** An initial pre-trained Isolation Forest (`isolation_forest_model.joblib`) captures multidimensional anomaly topology across request volumes, error counts, endpoint spreads, and latency deviations from the very first request ($N < 50$).
2. **Project-Specific Adaptive Normalizer (`ProjectBaselineTracker`):** A lightweight rolling online statistics tracker maintains per-project latency means, standard deviations, and throughput baselines.
3. **Dynamic Calibration:** As a project accumulates history, project-calibrated z-scores modulate the anomaly score:
   $$\text{Anomaly Score} = (1 - \alpha) \cdot \text{Score}_{\text{global}} + \alpha \cdot \max(\text{Score}_{\text{global}}, Z_{\text{project}})$$
   where $\alpha = \min(0.6, N_{\text{project}} / 200)$. This guarantees that a slow batch export API running at 600ms is **not** falsely flagged as anomalous, while a sudden 600ms latency spike in a 10ms microservice is immediately caught.
4. **Zero Cross-Tenant Contamination:** Telemetry from Organization A never enters or distorts the baseline calculations of Organization B.

---

### 2. Threat Taxonomy & Detection Capabilities

The engine continuously evaluates telemetry streams across four threat vectors:

| Attack Type | Mechanism | Window | Threshold | Severity |
|---|---|---|---|---|
| **Brute Force Login** | Failed authentication status codes (`401`, `403`) | 60s | $> 5$ failures | `MEDIUM` / `HIGH` |
| **Endpoint Scanning** | High unique endpoint cardinality from single IP | 60s | $> 15$ unique paths | `MEDIUM` / `HIGH` |
| **Request Burst** | Rapid volumetric traffic spikes | 10s | $> 30$ requests | `MEDIUM` / `HIGH` |
| **Composite Attack** | Multi-vector exploitation (e.g. scanning + brute force) | 60s | $\ge 2$ rules triggered | `HIGH` |
| **Statistical Anomaly** | Unsupervised Isolation Forest outlier detection | Dynamic | Anomaly Score $> 2.5$ | `MEDIUM` / `HIGH` |
| **Normal Traffic** | Standard API transactions conforming to baseline | Rolling | Within normal distribution | `LOW` |

---

### 3. Continuous Risk & Confidence Scoring

Rather than outputting opaque binary classifications, the pipeline outputs calibrated continuous metrics for every event:

* **Severity Levels:** Categorized as `low`, `medium`, or `high`.
* **Continuous Risk Score (`0.0` – `100.0`):** Combines rule-based severity weights with ML anomaly scores.
  * Baseline Normal: `0.0` – `25.0`
  * Suspicious / Warning: `35.0` – `69.0`
  * Critical Attack: `70.0` – `100.0`
* **Confidence Metric (`0.10` – `0.98`):**
  * Deterministic multi-rule hits: `0.95`
  * Single deterministic rule: `0.88`
  * Statistical ML anomaly: `0.65` – `0.85` (scaled with deviation depth)
  * Baseline normal: `0.92` (acknowledges real-world probabilistic traffic variations)

---

### 4. Alert Deduplication & Cooldown Manager

During ongoing volumetric attacks (e.g., 200 failed logins in 60 seconds), notifying on every individual request creates catastrophic alert storms across Slack and webhook channels.

* **Suppression Strategy:** The thread-safe `AlertCooldownManager` tracks keys of `(project_id, attack_type, source_ip)`.
* **Behavior:**
  * **Event #1:** Alert is dispatched immediately (`alert_suppressed=False`). Webhooks and high-priority WebSocket alerts fire.
  * **Subsequent Events (within 60s cooldown):** Events are fully ingested, scored, persisted to the database, and emitted to the live telemetry stream, but `alert_suppressed=True` (`suppression_reason="cooldown_active"`), preventing notification floods.
  * **Cooldown Expiry:** If the attack persists after 60 seconds, a fresh alert notification is emitted.

---

### 5. Multi-Tenant Project Isolation & Data Retention

Every detection and telemetry event retains canonical, server-verified tenant metadata:

```json
{
  "event_id": "evt_9c1f83b2a",
  "project_id": "proj_a10f82",
  "organization_id": "org_c47e91",
  "detection_timestamp": 1728261450.2,
  "affected_project": "proj_a10f82",
  "affected_endpoint": "/api/v1/auth/login",
  "source_ip": "198.51.100.44",
  "severity": "high",
  "attack_type": "brute_force",
  "risk_score": 82.5,
  "confidence": 0.88,
  "rule_flags": ["brute_force"],
  "anomaly_score": 4.15,
  "alert_suppressed": false
}
```

* **Project-Scoped Auto-Blocking:** The active rate limiter tracks request counts strictly per `(project_id, ip)`. An abusive IP blocked in Project A is **never** blocked in Project B.
* **External Service Fault Tolerance:** Ingestion and detection execution are fully decoupled from third-party services. Disconnected WebSockets, slow Slack webhooks, or unavailable Gemini AI endpoints will **never** block or fail telemetry ingestion (`HTTP 201 Created` is guaranteed).

---

## 🔌 Production Integrations & Notification Service

The platform implements an extensible, decoupled notification architecture designed to dispatch real-time security alerts to developer communication platforms without tightly coupling providers into the detection pipeline.

### Notification Architecture Pattern

```
Alert Triggered (Ingestion / ML Detection Pipeline)
      │
      ▼
NotificationService (backend/integrations/service.py)
      │
      ├── Project Isolation & Active Configuration Resolver
      │
      ├── Asynchronous Non-Blocking Worker Dispatcher (Daemon Thread)
      │
      └── Provider Adapter (backend/integrations/base.py)
            ├── SlackProvider (backend/integrations/slack.py)
            ├── DiscordProvider (backend/integrations/discord.py)
            └── Extensible: PagerDuty / Opsgenie / Generic Webhooks
```

### Supported Integration Providers

1. **Slack Integration (`SlackProvider`)**
   * **Payload Format:** Rich Block Kit formatting featuring color-coded threat level indicators, project badges, offending IP address, target endpoint, anomaly score, and rule trigger tags.
   * **URL Validation:** Validates `https://hooks.slack.com/services/...` endpoint structures.
   * **Connection Verification:** Provides interactive testing before saving or enabling live alerts.
2. **Discord Integration (`DiscordProvider`)**
   * **Payload Format:** Discord Webhook Embeds with hex color mapping (Red for `HIGH`, Orange for `MEDIUM`, Blue for `LOW`), structured field tables, and markdown code formatting.
   * **URL Validation:** Validates `https://discord.com/api/webhooks/...` endpoint structures.
   * **Coexistence:** Can run alongside Slack on the same project; both providers receive incident dispatches concurrently without collisions.
3. **Google Gemini GenAI Threat Analyst**
   * **Server-Side API Key Security:** `GEMINI_API_KEY` is loaded exclusively server-side from environment variables. The API key is **never** sent to the client, embedded in HTML, or logged.
   * **Project-Scoped Authorization:** Calls to `/api/investigate/<alert_id>` strictly verify project ownership or membership (`HTTP 403 Forbidden` if unauthorized). Only traffic history belonging to the target project is submitted to the LLM.
   * **Heuristic Offline Fallback Mode:** When `GEMINI_API_KEY` is unset, rate-limited (HTTP 429), or the network is offline, the platform automatically synthesizes an automated, structured heuristic threat report and remediation playbook without erroring.
4. **Integration Health & Status Indicators HUD**
   * Real-time HUD pill in the dashboard header displaying live health statuses:
     * `💬 Slack: Connected ✓` / `Not Configured` / `Disabled`
     * `🎮 Discord: Connected ✓` / `Not Configured` / `Disabled`
     * `✨ Gemini: Configured ✓` / `Missing Key (Fallback Mode)`
     * `📦 SDK: Connected ✓ (X events)` / `Waiting for Telemetry`
   * Dedicated `/api/projects/<project_id>/integrations/status` endpoint exposes sanitized status badges without leaking secret tokens.

### Security & Fault-Tolerance Guarantees

* **Zero Secret Leakage:** Webhook URLs are cryptographically protected at rest and masked across all GET requests, logs, and frontend payloads:
  ```text
  Slack:   https://hooks.slack.com/services/****/****/****
  Discord: https://discord.com/api/webhooks/1234****/********
  ```
* **Strict Cross-Tenant IDOR Defense:** Users cannot read, test, modify, or delete another tenant's integrations (`HTTP 403 Forbidden`).
* **Non-Blocking Telemetry Ingestion:** Webhook alerts are dispatched asynchronously in daemon threads with network timeouts (5s). If an external provider is slow, down, or returning 500 errors, telemetry ingestion and ML detection are **never blocked or slowed down** (`HTTP 201 Created` is guaranteed).

---

## 🌟 Core Platform Features

### 1. Zero-Latency SDK (Telemetry)
* **Asynchronous Capture:** A lightweight Flask middleware (`sdk/middleware.py`) that hooks into any API. It extracts traffic data (IP, latency, endpoints, status codes) and forwards it to the collector via a background worker thread with internal queue buffering, ensuring **zero host API latency**.

### 2. Unsupervised Machine Learning (Detection)
* **Isolation Forest Model:** Dynamically detects behavioral anomalies without relying solely on static signatures.
* **Real-time Feature Extraction:** Analyzes rolling windows of failed authentications, endpoint entropy (scanning patterns), and request burst rates, outputting an Anomaly Risk Score from 0.0 to 10.0.

### 3. Active Defense & Alerting (Response)
* **Auto-Blocking / Rate Limiting:** Abusive IPs exceeding the rate threshold (>50 requests/min) are automatically intercepted and blocked (`429 Too Many Requests`) at the ingestion layer for 5 minutes.
* **Proactive UI Warnings:** Warns security operators via a glowing banner when an IP hits 30% of the threshold, enabling preemptive one-click manual blocking before the attack peaks.
* **Automated Webhooks:** `HIGH` severity incidents instantly notify Slack or Discord channels.

### 4. GenAI Threat Analyst (Google Gemini)
* **Autonomous Investigation:** Clicking "Investigate" on any alert feeds the exact 30 chronological events surrounding the attack into `gemini-3.6-flash`.
* **Actionable Intelligence:** Generates structured Threat Intelligence, ML Interpretations, and Remediation Strategies.
* **One-Click PDF Export:** Instantly exports the AI Threat Report to an executive-ready, formatted PDF document.

### 5. "Movie Hacker" Real-Time Dashboard (Observability)
* **WebSockets Integration:** Built with `Flask-SocketIO` to push live events and alerts to authenticated project rooms (`project_<id>`).
* **Smooth 1-FPS EKG Chart:** Batches real-time traffic updates into a fluid, animated Bezier curve with glowing plasma styling.
* **Interactive Time Windows:** Seamlessly switch between 30s, 1m, and 5m live telemetry views.
* **Live Threat Map:** Plots attacking IP geolocation dynamically on a dark-themed Leaflet.js world map.
* **Attack Distribution Chart:** Real-time Chart.js doughnut chart visualizing active threat proportions (Brute Force, Scan, Burst, ML Anomaly).
* **Historical Analytics Tab:** Inspect historical traffic distributions, top accessed endpoints, and top attacker IPs over selectable time ranges.

---

## 🛠️ Project Structure

```text
API-Security-Analytics-Dashboard/
├── backend/
│   ├── auth.py                 # User authentication, registration, hashing & decorators
│   ├── config.py               # Environment profiles (development, staging, production)
│   ├── database.py             # PostgreSQL & SQLite persistence engine & connection pool
│   ├── db.py                   # Multi-tenant data layer & business queries
│   ├── detection.py            # ML scoring & Isolation Forest dynamic thresholding
│   ├── investigator.py         # Google Gemini GenAI threat investigation & heuristic fallbacks
│   ├── logging_config.py       # Structured logging & automatic secret scrubbing
│   ├── migrations.py           # Schema migrations & production indexing engine
│   ├── rate_limiter.py         # Ingestion rate limiter & login brute-force defense
│   ├── google_auth.py          # Google OAuth 2.0 / OpenID Connect client integration
│   ├── server.py               # Main Flask & SocketIO application server
│   ├── webhook.py              # Backward-compatible webhook dispatcher facade
│   ├── integrations/           # Extensible Notification Service & Provider Adapters
│   │   ├── base.py             # Abstract BaseNotificationProvider interface
│   │   ├── slack.py            # Slack Block Kit notification adapter
│   │   ├── discord.py          # Discord Embed notification adapter
│   │   └── service.py          # NotificationService router & async dispatcher
│   ├── train_model.py          # Isolation Forest model training script
│   ├── test_production_tenant_isolation_suite.py # 11-test Tenant Isolation & IDOR suite
│   ├── test_integrations_production_suite.py     # 10-test Notification Service suite
│   ├── test_ml_detection_pipeline_suite.py       # 11-test ML detection pipeline suite
│   ├── test_telemetry_ingestion_suite.py         # 11-test Ingestion & rate-limiting suite
│   ├── test_security_audit.py  # 86-test security audit verification suite
│   └── test_google_oauth_suite.py # 14-scenario Google OAuth verification suite
├── sdk/
│   └── middleware.py           # Zero-Latency asynchronous Python SDK
├── frontend/
│   └── dashboard/              # Production React + Vite SaaS Frontend Application
├── demo/
│   ├── sample_app.py           # Instrumented mock E-Commerce API (Port 5002)
│   └── generators.py           # Realistic attack & normal traffic simulation suite
├── Dockerfile                  # Hardened production container image
├── docker-compose.yml          # Multi-container orchestration (Platform + PostgreSQL)
├── gunicorn_config.py          # Production WSGI server configuration
├── .env.example                # Example environment configuration template
└── requirements.txt            # Python dependencies
```

---

## ⚙️ Environment Variables & Configuration

Configure the following variables in your environment or `.env` file (see `.env.example`):

| Variable | Required | Default | Description |
| :--- | :---: | :---: | :--- |
| `ENVIRONMENT` | Recommended | `development` | Environment profile (`development`, `staging`, `production`). |
| `DATABASE_URL` | **Yes** (in Prod) | `sqlite:///backend/events.db` | Database connection string. Use `postgresql://user:pass@host:5432/dbname` in production; SQLite in development. |
| `SECRET_KEY` | **Yes** (in Prod) | `api-security-dashboard-secret-321` | Cryptographic secret for signing Flask session cookies (32-byte hex random string). |
| `SESSION_COOKIE_SECURE` | **Yes** (in Prod) | `false` (dev) / `true` (prod) | Strictly enforce `Secure` cookies over HTTPS. Set to `true` in production and staging. |
| `PORT` | Optional | `5001` | Port on which the central backend and dashboard listen. |
| `CORS_ALLOWED_ORIGINS` | Recommended | `*` (dev) | Permitted origins for HTTP and WebSockets (e.g. `https://dashboard.company.com`). |
| `MAX_CONTENT_LENGTH` | Optional | `5242880` (5 MB) | Maximum allowable request body size to prevent volumetric resource starvation. |
| `COLLECTOR_MAX_PAYLOAD_BYTES` | Optional | `65536` (64 KB) | Maximum allowable size per telemetry ingestion event. |
| `RATE_LIMIT_PER_MINUTE` | Optional | `50` | Token bucket ingestion rate limit per project. |
| `RATE_LIMIT_BURST` | Optional | `30` | Maximum token bucket burst capacity per project. |
| `GEMINI_API_KEY` | Recommended | None | Google AI Studio API key used for autonomous GenAI Threat Investigations (runs in heuristic fallback if omitted). |
| `GOOGLE_CLIENT_ID` | Optional* | None | Google Cloud OAuth 2.0 Web Client ID (*required for Google sign-in). |
| `GOOGLE_CLIENT_SECRET` | Optional* | None | Google Cloud OAuth 2.0 Web Client Secret (*required for Google sign-in). |
| `GOOGLE_REDIRECT_URI` | Optional | `http://127.0.0.1:5001/auth/google/callback` | Authorized redirect URI for Google OAuth callback. |
| `SLACK_WEBHOOK_URL` | Optional | None | Optional global fallback webhook (projects configure their own webhooks in the UI). |
| `APP_BASE_URL` | Optional | `http://localhost:5001` | Base URL used to format email verification and password reset links. |

> [!IMPORTANT]
> Never commit real secrets to source control. In production environments, set `SESSION_COOKIE_SECURE=true`, supply a unique `SECRET_KEY`, and provide a production PostgreSQL `DATABASE_URL`.

---

## 🌐 Google Cloud OAuth 2.0 Configuration

To enable "Continue with Google" sign-in:

### 1. Create a Google Cloud Project & Configure Consent Screen
1. Navigate to the [Google Cloud Console](https://console.cloud.google.com/).
2. Create a new project (e.g. `ml-o11y-security-platform`) or select an existing one.
3. Go to **APIs & Services > OAuth consent screen**.
4. Choose **External** user type and click **Create**.
5. Fill in the required fields:
   * **App name:** `API Security Analytics Platform`
   * **User support email:** Your email address
   * **Developer contact information:** Your email address
6. In **Scopes**, click **Add or Remove Scopes** and select:
   * `.../auth/userinfo.email`
   * `.../auth/userinfo.profile`
   * `openid`
7. Complete the consent screen configuration.

### 2. Create OAuth 2.0 Credentials
1. Go to **APIs & Services > Credentials**.
2. Click **+ Create Credentials** and select **OAuth client ID**.
3. Set **Application type** to **Web application**.
4. Name: `ML-O11Y Web Client`.
5. Under **Authorized redirect URIs**, add:
   * **Local Development:** `http://127.0.0.1:5001/auth/google/callback`
   * **Production:** `https://your-production-domain.com/auth/google/callback`
6. Click **Create**. A modal will display your **Client ID** and **Client Secret**.

### 3. Configure the Application
Add the credentials to your environment or `.env` file:
```bash
export GOOGLE_CLIENT_ID="your-client-id.apps.googleusercontent.com"
export GOOGLE_CLIENT_SECRET="your-client-secret"
export GOOGLE_REDIRECT_URI="http://127.0.0.1:5001/auth/google/callback"
```

---

## 🚀 Setup & Installation

### 1. Clone & Set Up Python Environment

**Windows (PowerShell):**
```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

**macOS / Linux (Bash):**
```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

### 2. Configure Environment Variables

**Windows (PowerShell):**
```powershell
$env:GEMINI_API_KEY = "your_google_ai_studio_api_key_here"
$env:SECRET_KEY = "your_secure_random_session_secret"
```

**macOS / Linux (Bash):**
```bash
export GEMINI_API_KEY="your_google_ai_studio_api_key_here"
export SECRET_KEY="your_secure_random_session_secret"
```

---

## 🎥 Running the Live Platform Demo

To run the complete interactive platform demonstration, open **3 terminal windows** (with your virtual environment activated in all three):

### Terminal 1 — The Security Brain & Dashboard
Runs the telemetry collector, ML engine, SQLite database, and real-time dashboard server:
```bash
python backend/server.py
```
* **Dashboard URL:** Open your browser to `http://127.0.0.1:5001`.
* **Login:** Sign up for a new account, or use the pre-seeded demo account:
  * **Email:** `demo@mlo11y.local`
  * **Password:** `demo123456`

### Terminal 2 — The Victim Application
Runs a sample e-commerce API (listening on port **5002**), instrumented with the SDK:
```bash
python demo/sample_app.py
```

### Terminal 3 — The Attack & Traffic Simulator
Simulates normal web visitors alongside automated hackers executing Brute Force logins, Endpoint Scans, and Request Bursts:
```bash
python demo/generators.py continuous
```

> **Watch the Live Defense:** Look at the dashboard on `http://127.0.0.1:5001`. Normal requests render as a smooth blue line. As soon as attack spikes occur, the ML engine raises alerts, the attacking IP is plotted on the world map, auto-blocking triggers (`429`), and you can click **"Investigate"** to receive a full Gemini AI threat analysis and PDF report!

---

## 🧪 Running Automated Test Suites

### Complete Production Tenant-Isolation & IDOR Attack Suite (11 Scenarios)
```bash
python -m unittest backend/test_production_tenant_isolation_suite.py
```

### Production Integrations & Notification Service Suite (10 Scenarios)
```bash
python -m unittest backend/test_integrations_production_suite.py
```

### Production ML Detection & Active Defense Suite (11 Scenarios)
```bash
python -m unittest backend/test_ml_detection_pipeline_suite.py
```

### Production Telemetry Ingestion Pipeline Suite (11 Scenarios)
```bash
python -m unittest backend/test_telemetry_ingestion_suite.py
```

### Guided Developer Onboarding Wizard Suite (5 Scenarios)
```bash
python -m unittest backend/test_onboarding_wizard_suite.py
```

### Production Developer SDK Integration Suite (8 Scenarios)
```bash
python -m unittest backend/test_production_sdk_suite.py
```

### Multi-Tenant Organization & Workspace Suite (7 Scenarios)
```bash
python -m unittest backend/test_multitenant_org_suite.py
```

### Production SaaS Authentication Suite (12 Scenarios)
```bash
python backend/test_saas_auth_suite.py
```

### Google OAuth 2.0 / OpenID Connect Suite (14 Scenarios)
```bash
python backend/test_google_oauth_suite.py
```

### Multi-Tenancy Regression Suite (260 Tests)
```bash
python backend/test_auth_suite.py
```

### Complete Security Audit Suite (86 Checks)
```bash
python backend/test_security_audit.py
```

All suites execute cleanly with zero external mock services required.

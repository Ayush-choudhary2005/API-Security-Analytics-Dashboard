# 🛡️ API Security Analytics & Active Defense SaaS Platform

An enterprise-grade, Multi-Tenant **B2B SaaS** API observability and security platform. This platform detects zero-day API abuse, behavioral anomalies, and automated attacks using an unsupervised Machine Learning model (**Isolation Forest**). It actively defends client servers via auto-blocking and custom webhooks, and investigates threats autonomously using **Generative AI (Google Gemini)**.

---

## 🌟 Key Features

### 1. Multi-Tenant SaaS Architecture (PostgreSQL + OAuth)
* **Google OAuth Authentication:** Fully integrated with Supabase Auth for seamless, passwordless Google Sign-In.
* **Tenant Isolation:** A robust, strictly-typed **PostgreSQL** cloud database (Supabase) ensures every client's telemetry, historical analytics, and webhook configurations are completely isolated via unique `tenant_id` UUIDs.
* **Stateless Backend:** Built to be instantly deployed to Render or Fly.io as an infinitely scalable microservice.

### 2. Zero-Latency SDK (Telemetry)
* **Asynchronous Capture:** A tiny Python middleware (`sdk/middleware.py`) that hooks into any client API. It extracts traffic data (IP, latency, endpoints) and forwards it to the cloud collector using fire-and-forget background threads so the client API experiences absolutely **zero latency**.

### 3. Unsupervised Machine Learning (Self-Learning AI)
* **Isolation Forest Model:** Instead of relying on static rate-limit rules, an `IsolationForest` dynamically learns the "shape" of normal API traffic. 
* **Real-time Feature Extraction:** Tracks failed authentications, endpoint entropy, and burst rates in real-time. (Automatically casts `NumPy` datatypes to ensure native Postgres compatibility).
* **On-Demand Self Learning:** Clients can trigger a background model re-training via the dashboard to adapt to new "normal" traffic patterns.

### 4. Active Defense & Alerting (Response)
* **Auto-Blocking / Rate Limiting:** Abusive IPs (>50 requests/min) are automatically intercepted and blocked (`429 Too Many Requests`) at the ingestion layer for 5 minutes.
* **Proactive UI Warnings:** Warns the security operator via a yellow banner when an IP hits a danger threshold, allowing for a preemptive 1-click manual block.
* **Dynamic Webhooks:** Any attack scoring a `HIGH` severity instantly triggers a background webhook to alert the specific tenant's **Slack** channel configured in their Client Settings.

### 5. GenAI Threat Analyst (Investigation)
* **Autonomous Investigation:** Clicking "Investigate" on any alert feeds the exact 30 most recent chronological events of the attack from the Postgres DB into `gemini-3.6-flash`.
* **Actionable Intelligence:** Generates a human-readable Threat Analysis, ML Interpretation, and Remediation Plan directly in a dashboard modal.
* **One-Click PDF Export:** Instantly exports the AI Threat Report to a highly formatted PDF for executive review.

### 6. "Movie Hacker" Real-Time Dashboard
* **WebSockets Integration:** Replaced passive polling with `Flask-SocketIO`. New events and alerts stream into the dashboard instantly.
* **Live Threat Map:** Plots attacking IPs dynamically on a dark-themed Leaflet.js world map.
* **Historical Analytics Tab:** Stores and graphs historical data across multiple tenants/environments.
* **Animated Architecture Tab:** Includes an interactive, dark-mode `mermaid.js` sequence diagram to explain the traffic flow directly inside the app.

---

## 🛠️ Project Structure
```text
API-Security-Analytics-Dashboard/
├── backend/
│   ├── db.py                 # Postgres Connection Pooler & Schema
│   ├── detection.py          # ML scoring & dynamic thresholding
│   ├── investigator.py       # Gemini GenAI integration
│   ├── server.py             # Flask/SocketIO REST API & Web Server
│   ├── webhook.py            # Automated Slack alerting system
│   └── train_model.py        # ML training script for Isolation Forest
├── sdk/
│   └── middleware.py         # Zero-Latency App SDK
├── dashboard/
│   └── index.html            # Real-time HTML/JS/CSS frontend UI
├── demo/
│   ├── sample_app.py         # Mock vulnerable E-Commerce API
│   └── generators.py         # Infinite traffic simulators (Attacks + Normal)
└── requirements.txt
```

---

## 🚀 Setup & Cloud Deployment (Render)

This platform is ready for production. 

### Local Testing Requirements:
1. Python 3.9+
2. Your Supabase PostgreSQL `DATABASE_URL` (using the Session Pooler)
3. Your `GEMINI_API_KEY`

```bash
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
export GEMINI_API_KEY="your_google_api_key_here"
# Note: DATABASE_URL is hardcoded in backend/db.py for the capstone demo.
python backend/server.py
```

### Production Deployment (Render):
1. Push this repository to GitHub.
2. Create a New Web Service on **Render.com**.
3. Set the Start Command to: `gunicorn -w 1 -k eventlet -b 0.0.0.0:$PORT backend.server:app`
4. Add your `DATABASE_URL` and `GEMINI_API_KEY` to Render's Environment Variables.
5. Clients can now visit your public Render URL, login with Google, and monitor their APIs globally.

---

## 🎥 Running the Live Presentation Demo

To demonstrate the platform to judges, you will need **3 terminal windows**. Ensure your virtual environment is activated (`source venv/bin/activate`) in ALL three terminals!

### Terminal 1 — The SaaS Cloud Server
This runs the central collector, the Machine Learning engine, the Postgres connection pool, and the WebSockets.
```bash
export GEMINI_API_KEY="your_google_api_key"
python backend/server.py
```
> **Action:** Open your browser to `http://127.0.0.1:5001`. Click "Sign in with Google". Go to the **Client Settings** tab to set your Slack webhook. Finally, **copy your SDK Token** from the top right corner.

### Terminal 2 — The Client's Victim Application
This simulates an external company's API. Pass your copied SDK Token into the environment so the SDK knows which dashboard to stream the telemetry to.
```bash
export TENANT_TOKEN="paste_your_copied_sdk_token_here"
python demo/sample_app.py
```

### Terminal 3 — The Hacker
This script mimics real-world internet threats. It fires Brute Force logins, Endpoint Scans, and Request Bursts directly at the victim application in Terminal 2.
```bash
python demo/generators.py burst
```
*(Or use `continuous` for infinite background traffic).*

> **Watch the Magic:** Sit back and look at your browser. You will see the blue line chart spike, triggering an ML anomaly. The IP will be auto-blocked, plotted on the world map, and your Slack channel will ping with the High-Severity alert! Click **Investigate** to generate the AI report!

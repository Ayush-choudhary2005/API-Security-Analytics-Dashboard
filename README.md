# 🛡️ API Security Analytics & Active Defense Platform

An end-to-end, zero-latency API observability and security platform. This project detects zero-day API abuse, behavioral anomalies, and automated attacks using an unsupervised Machine Learning model (**Isolation Forest**). It actively defends servers via auto-blocking and webhooks, and investigates threats autonomously using **Generative AI (Google Gemini)**.

---

## 🌟 Key Features

### 1. Zero-Latency SDK (Telemetry)
* **Asynchronous Capture:** A tiny Flask middleware (`sdk/middleware.py`) that hooks into any API. It extracts traffic data (IP, latency, endpoints) and forwards it to the security collector using background threads so the host API experiences absolutely **zero latency**.

### 2. Unsupervised Machine Learning (Detection)
* **Isolation Forest Model:** Instead of relying on static rate-limit rules, an `IsolationForest` dynamically learns the "shape" of normal API traffic. 
* **Real-time Feature Extraction:** Tracks failed authentications, endpoint entropy (scanning), and burst rates in real-time, outputting an Anomaly Risk Score from 0.0 to 10.0.

### 3. Active Defense & Alerting (Response)
* **Auto-Blocking / Rate Limiting:** Abusive IPs (>50 requests/min) are automatically intercepted and blocked (`429 Too Many Requests`) at the ingestion layer for 5 minutes.
* **Proactive UI Warnings:** Warns the security operator in the dashboard via a yellow banner when an IP hits 30% of the threshold, allowing for a preemptive 1-click manual block.
* **Automated Webhooks:** Any attack scoring a `HIGH` severity instantly triggers a background webhook to alert **Slack or Discord** security channels.

### 4. GenAI Threat Analyst (Investigation)
* **Autonomous Investigation:** Clicking "Investigate" on any alert feeds the exact 30 most recent chronological events of the attack into `gemini-3.6-flash`.
* **Actionable Intelligence:** Generates a human-readable Threat Analysis, ML Interpretation, and Remediation Plan directly in a dashboard modal.
* **One-Click PDF Export:** Instantly exports the AI Threat Report to a highly formatted PDF for executive review.
### Dashboard Upgrades (New)
* **Live IP Geolocation Map:** Uses Leaflet.js and OpenStreetMap to plot attacking IPs on a dark-themed world map in real-time. Automatically falls back to IP-API for real-world public IP geolocation.
* **Attack Distribution Pie Chart:** Dynamic Chart.js doughnut chart showing the distribution of the last 200 attacks (Brute Force, Scan, Burst, ML Anomaly) to visualize active threat trends.
* **True Database Telemetry:** Dashboard displays the actual total event count across the SQLite database and gracefully handles missing data without crashing.
* **Optimized ML Pipeline:** Pandas DataFrame integration silences scikit-learn warnings during real-time feature extraction.
* **PDF Export for Threat Reports:** Includes one-click PDF generation of GenAI threat investigations directly from the modal, formatted perfectly for executive reporting.
* **Real-Time WebSocket Feed:** Replaced passive polling with a `Flask-SocketIO` WebSocket connection. New events and alerts are pushed instantly to the dashboard with smooth fade-in animations.
* **IP Rate Limiting & Auto-Block:** In-memory sliding window rate limiter that intercepts requests at the `/ingest` layer. Abusive IPs (>50 requests/min) are automatically blocked (`429 Too Many Requests`) for 5 minutes.
* **Proactive Threat Suggestions:** Warns the operator in the dashboard via a yellow banner when an IP hits 30% of the threshold, allowing for preemptive one-click manual blocking before the attack peaks.

### 5. "Movie Hacker" Real-Time Dashboard (Observability)
* **WebSockets Integration:** Replaced passive polling with `Flask-SocketIO`. New events and alerts stream into the dashboard instantly.
* **Smooth 1-FPS Charting:** The Attack Distribution Line Chart batches 1-second WebSockets updates into a fluid Bezier curve that slides continuously (like a hospital EKG), complete with a glowing plasma gradient.
* **Interactive Time Windows:** Toggle between 30s, 1m, and 5m live chart views in real-time.
* **Live Threat Map:** Plots attacking IPs dynamically on a dark-themed Leaflet.js world map.
* **Historical Analytics Tab:** Stores historical data across multiple tenants/environments, complete with stacked bar charts and Top Attacker tables.
* **Animated Architecture Tab:** Includes an interactive, dark-mode `mermaid.js` sequence diagram to explain the traffic flow directly inside the app.

---

## 🛠️ Project Structure
```text
API-Security-Analytics-Dashboard/
├── backend/
│   ├── db.py                 # SQLite schema (Multi-Tenant)
│   ├── detection.py          # ML scoring & dynamic thresholding
│   ├── investigator.py       # Gemini GenAI integration
│   ├── server.py             # Main Flask/SocketIO API & Dashboard server
│   ├── webhook.py            # Automated Slack/Discord integrations
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

## 🚀 Setup & Installation

**1. Clone & Activate Virtual Environment**
```bash
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

**2. Add your Slack Webhook (Optional but Recommended)**
To receive live alerts on your phone, create a free Slack Incoming Webhook and set it in your environment:
```bash
export SLACK_WEBHOOK_URL="https://hooks.slack.com/services/..."
```

**3. Add your Gemini API Key**
You need a free Google AI Studio key for the GenAI Threat Investigation feature to work.
```bash
export GEMINI_API_KEY="your_google_api_key_here"
```

---

## 🎥 Running the Live Presentation Demo

To demonstrate the platform, you will need **3 terminal windows**. Ensure your virtual environment is activated (`source venv/bin/activate`) in ALL three terminals!

### Terminal 1 — The Security Brain & Dashboard
This runs the central collector, the Machine Learning engine, the SQLite database, and the WebSockets dashboard.
```bash
export SLACK_WEBHOOK_URL="your_slack_url"
export GEMINI_API_KEY="your_google_api_key"
python backend/server.py
```
> **Action:** Open your browser to `http://127.0.0.1:5001` to view the Live Dashboard.

### Terminal 2 — The Victim Application
This runs the mock e-commerce backend (the target). It has the SDK injected into it to silently forward traffic to Terminal 1.
```bash
python demo/sample_app.py
```

### Terminal 3 — The Infinite Simulator
This script mimics a real-world internet. It spawns 50 normal humans browsing safely, while randomly injecting hackers to perform Brute Force logins, Endpoint Scans, and Request Bursts from randomized IPs every 5 to 15 seconds.
```bash
python demo/generators.py continuous
```

> **Watch the Magic:** Sit back and look at your browser at `http://127.0.0.1:5001`. You will see the blue line chart gliding smoothly with normal traffic, until a red spike triggers an ML anomaly, automatically blocking the IP, mapping the threat, and pinging your Slack channel!

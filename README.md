# API Security Analytics Dashboard — Final Project (Phases 1-3)

An end-to-end ML-driven API observability and security platform. This project detects zero-day API abuse, behavioral anomalies, and automated attacks using an unsupervised Machine Learning model (Isolation Forest) and investigates them automatically using Generative AI (Google Gemini 3.6-Flash).

## What's Included

This capstone project was completed in 3 distinct phases, moving from basic observability to autonomous AI investigation:

### Phase 1: The Telemetry Foundation
- **SDK**: A 3-line Flask middleware (`sdk/middleware.py`) that asynchronously captures API traffic (IP, latency, status codes, endpoints) without blocking the client response.
- **Collector**: A backend server (`backend/server.py`) that ingests telemetry via REST and stores it in SQLite.
- **Traffic Simulation**: Scripts (`demo/generators.py`) to simulate normal human traffic, brute-force logins, endpoint scanning (IDOR/reconnaissance), and burst scraping.
- **Live Dashboard**: A sleek, dark-themed UI (`dashboard/index.html`) polling every 3 seconds to show live streaming traffic.

### Phase 2: Unsupervised Machine Learning
- **Isolation Forest Model**: Replaced static, hard-coded rules (e.g., "block if requests > 50") with a Scikit-Learn `IsolationForest` model.
- **Behavioral Detection**: The model dynamically learns the "shape" of normal API traffic and flags behavioral deviations (high endpoint entropy, rapid bursts, unusual latency).
- **Dynamic Thresholds**: Calculates an anomaly score (0-10+). Scores > 5.0 are instantly flagged as `HIGH` severity alerts.

### Phase 3: Automated GenAI Threat Investigations
* **Gemini AI Integration:** Calls `gemini-3.6-flash` (with automated fallbacks to 3.7 and 3.5 during high demand) to generate human-readable threat intel.
* **Contextual Prompts:** Feeds the exact 30 most recent chronological events of an attack into the LLM prompt.
* **Actionable Reports:** Outputs Threat Analysis, ML Interpretation, and Remediation Plans directly in a dashboard modal.

### Dashboard Upgrades (New)
* **Live IP Geolocation Map:** Uses Leaflet.js and OpenStreetMap to plot attacking IPs on a dark-themed world map in real-time. Automatically falls back to IP-API for real-world public IP geolocation.
* **Attack Distribution Pie Chart:** Dynamic Chart.js doughnut chart showing the distribution of the last 200 attacks (Brute Force, Scan, Burst, ML Anomaly) to visualize active threat trends.
* **True Database Telemetry:** Dashboard displays the actual total event count across the SQLite database and gracefully handles missing data without crashing.
* **Optimized ML Pipeline:** Pandas DataFrame integration silences scikit-learn warnings during real-time feature extraction.

## Architecture Diagram

```mermaid
flowchart TD

    A[API Application]

    B[SDK Middleware<br/>Telemetry Capture<br/>PII Masking]

    C[Collector API<br/>Authentication<br/>Validation]

    D[Processing Layer<br/><br/>Feature Engineering<br/>Behavior Analytics]

    E[ML Inference Engine<br/><br/>Isolation Forest<br/>Risk Scoring]

    F[Alert Engine]

    G[(Telemetry Storage)]

    H[Presentation Layer<br/><br/>Live Dashboard<br/>Risk Analytics<br/>Threat Monitoring]

    A --> B
    B --> C
    C --> D
    D --> E

    E --> F
    E --> G

    F --> H
    G --> H
```

## Project Structure
```text
API-Security-Analytics-Dashboard/
├── backend/
│   ├── db.py                 # SQLite schema + storage layer
│   ├── detection.py          # ML scoring, feature extraction, alert fusion
│   ├── investigator.py       # Gemini GenAI Threat Analyst 
│   ├── train_model.py        # ML training script to fit Isolation Forest
│   ├── isolation_forest_model.joblib # Saved ML model
│   └── server.py             # Flask API backend (ingestion & dashboard API)
├── sdk/
│   └── middleware.py         # App instrumentation SDK
├── dashboard/
│   └── index.html            # Real-time frontend UI
├── demo/
│   ├── sample_app.py         # Mock vulnerable API service
│   └── generators.py         # Attack simulators
└── requirements.txt
```

## Setup & Installation

1. **Clone & Virtual Environment**
   ```bash
   python3 -m venv venv
   source venv/bin/activate
   pip install -r requirements.txt
   ```

2. **Set your API Key**
   You need a free Google AI Studio key for Phase 3 to work.
   ```bash
   export GEMINI_API_KEY="your_api_key_here"
   ```

## Running the Live Demo

You will need 3 terminal windows. Make sure your virtual environment is activated and your API key is exported in the first terminal!

**Terminal 1 — API Server (Collector & GenAI)**
```bash
source venv/bin/activate
export GEMINI_API_KEY="your_api_key_here"
python backend/server.py
```
> Open your browser to http://127.0.0.1:5001 to view the Live Dashboard.

**Terminal 2 — Sample Application (The Target)**
```bash
source venv/bin/activate
python demo/sample_app.py
```
> Note: Check if the sample app successfully started on port 5000 or 5002.

**Terminal 3 — Run Attacks**
```bash
source venv/bin/activate
python demo/generators.py all 
```

Watch the dashboard! The attacks will trigger the Machine Learning threshold, populating the Alerts panel. Click **Investigate** on any alert to generate an AI Threat Report.

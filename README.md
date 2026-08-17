# ML-O11Y — Phase 1 (Working Demo)

A minimal but fully working slice of the full ML-O11Y architecture:
**SDK → Collector → Detection (rules + statistical score) → Storage → Dashboard**,
all running end-to-end. This has been tested and confirmed working:
brute-force, endpoint-scan, and request-burst attacks all correctly
produce alerts, and normal traffic produces 0 false positives.

## What's real vs. stubbed in Phase 1

| Piece | Phase 1 (this build) | Phase 2 (planned) |
|---|---|---|
| ML model | Statistical z-score/ratio blend | Isolation Forest with rolling retraining |
| Storage | Single SQLite table | Postgres, Hot/Metadata/Historical stores |
| Real-time | 3s HTTP polling | WebSocket/SSE gateway |
| Auth | Static bearer token | Per-tenant auth, tenant isolation |
| Correlation | Groupby query on one table | Dedicated Correlation Engine |
| Attack types | 3 (brute-force, scan, burst) | +4th (payload anomaly) and more |


## Project structure

```
ml-o11y/
├── backend/
│   ├── db.py          # SQLite schema + helpers (single 'events' table)
│   ├── detection.py   # feature computation, 3 rules, z-score, fusion logic
│   └── server.py       # Flask collector: /ingest, /events/recent, /alerts/recent, serves dashboard
├── sdk/
│   └── middleware.py   # observe(app, ...) - the installable SDK, <=5 lines to integrate
├── dashboard/
│   └── index.html      # live polling dashboard (feed, alerts, score chart)
├── demo/
│   ├── sample_app.py   # sample API instrumented with the SDK
│   └── generators.py   # normal traffic + 3 attack simulators
└── requirements.txt
```

## Setup

```bash
cd ml-o11y
python3 -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

## Running the full demo (3 terminals)

**Terminal 1 — Collector backend**
```bash
cd backend
python3 server.py
```
Runs on http://localhost:5001. Open that URL in a browser — this is your dashboard.

**Terminal 2 — Sample app (the "developer's API" being monitored)**
```bash
cd demo
python3 sample_app.py
```
Runs on http://localhost:5000.

**Terminal 3 — Generate demo traffic**
```bash
cd demo
python3 generators.py all        # normal traffic, then all 3 attacks in sequence
```

Other options:
```bash
python3 generators.py normal        # just background traffic
python3 generators.py brute_force   # just the brute-force attack
python3 generators.py scan          # just the endpoint-scan attack
python3 generators.py burst         # just the request-burst attack
```

Watch the dashboard (Terminal 1's URL) update live as Terminal 3 runs.

## SDK integration (what a "developer" actually writes)

```python
from middleware import observe
app = Flask(__name__)
observe(app, collector_url="http://localhost:5001", token="phase1-demo-token")
```

Everything else (capturing endpoint/method/status/latency/IP/user,
sending to collector, not blocking the response) happens automatically via
Flask's before/after_request hooks.

## Attack taxonomy (Phase 1)

| Attack | Feature | Rule threshold |
|---|---|---|
| Brute-force login | failed-auth (401/403) count per IP / 60s | > 5 |
| Endpoint enumeration | unique endpoints per IP / 60s | > 15 |
| Request burst | requests per IP / 10s | > 30 |

## Fusion logic

```
2+ rules fired      -> severity = high
1 rule fired         -> severity = medium
no rules, but
  anomaly_score > 2.5 -> severity = medium
otherwise            -> severity = low (not shown as an alert)
```

The statistical score returns 0.0 until an IP has at least 5 prior events
in its rolling window — before that, detection relies on rules only. This
is the Phase 1 answer to the cold-start gap; Phase 2 swaps in a real
Isolation Forest with the same fallback pattern.

## Success metrics (validated during this build)

- Telemetry appears in `/events/recent` within ~1s of the request (well under 3s target)
- All 3 attack types produced a correctly-labeled alert during testing
- 0 false positives across 60 normal-traffic events (target: <5%)
- SDK integration: 3 lines (target: <=5)
- Dashboard polls every 3s, no manual reload

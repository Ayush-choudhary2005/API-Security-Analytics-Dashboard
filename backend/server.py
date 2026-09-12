"""
server.py — Collector backend with Real-Time WebSocket support.

Endpoints:
  POST /ingest          -> SDK sends telemetry here (bearer token required)
  GET  /events/recent   -> dashboard polls this for the live feed
  GET  /alerts/recent   -> dashboard polls this for the alert panel
  GET  /alerts/stats    -> attack distribution statistics
  GET  /health          -> quick liveness check
  WS   /socket.io       -> real-time push channel for dashboard

Run with:  python3 server.py
"""

import time
import os
from flask import Flask, request, jsonify, send_from_directory
from flask_socketio import SocketIO

import db
import detection

DASHBOARD_DIR = os.path.join(os.path.dirname(__file__), "..", "dashboard")

app = Flask(__name__)
app.config['SECRET_KEY'] = 'api-security-dashboard-secret'

# Initialize SocketIO with CORS allowed for local dev
socketio = SocketIO(app, cors_allowed_origins="*")

# Static bearer token for Phase 1 (no real auth/tenant isolation yet —
# that's Phase 2, see architectures.md Security Architecture section).
API_TOKEN = "phase1-demo-token"

REQUIRED_FIELDS = ["endpoint", "method", "status_code", "latency_ms", "ip"]


def _check_auth():
    auth_header = request.headers.get("Authorization", "")
    return auth_header == f"Bearer {API_TOKEN}"


@app.route("/", methods=["GET"])
def dashboard():
    return send_from_directory(DASHBOARD_DIR, "index.html")


@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok", "event_count": db.get_all_events_count()})


@app.route("/ingest", methods=["POST"])
def ingest():
    if not _check_auth():
        return jsonify({"error": "unauthorized"}), 401

    payload = request.get_json(silent=True)
    if not payload:
        return jsonify({"error": "invalid or missing JSON body"}), 400

    missing = [f for f in REQUIRED_FIELDS if f not in payload]
    if missing:
        return jsonify({"error": f"missing required fields: {missing}"}), 400

    event = {
        "timestamp": payload.get("timestamp", time.time()),
        "endpoint": payload["endpoint"],
        "method": payload["method"],
        "status_code": int(payload["status_code"]),
        "latency_ms": float(payload["latency_ms"]),
        "ip": payload["ip"],
        "user_id": payload.get("user_id"),
        "payload_size": payload.get("payload_size", 0),
    }

    # Run detection inline (feature computation + rules + score + fusion)
    scored_event = detection.score_event(event)

    event_id = db.insert_event(scored_event)
    scored_event["id"] = event_id

    # Push the event to all connected dashboard clients via WebSocket
    socketio.emit('new_event', scored_event)

    # If it's an alert (medium or high), push that too
    if scored_event.get("severity") in ("medium", "high"):
        socketio.emit('new_alert', scored_event)

    return jsonify(scored_event), 201


@app.route("/events/recent", methods=["GET"])
def events_recent():
    limit = int(request.args.get("limit", 50))
    return jsonify(db.get_recent_events(limit))


@app.route("/alerts/recent", methods=["GET"])
def alerts_recent():
    limit = int(request.args.get("limit", 50))
    return jsonify(db.get_recent_alerts(limit))


@app.route("/alerts/stats", methods=["GET"])
def alerts_stats():
    return jsonify(db.get_alert_stats())


@app.route("/api/investigate/<int:alert_id>", methods=["GET"])
def investigate(alert_id):
    import investigator
    report = investigator.generate_threat_report(alert_id)
    return jsonify({"report": report})


if __name__ == "__main__":
    db.init_db()
    print(f"Collector starting. Token: {API_TOKEN}")
    socketio.run(app, host="0.0.0.0", port=5001, debug=False)

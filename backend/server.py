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
import webhook
import detection
import rate_limiter

DASHBOARD_DIR = os.path.join(os.path.dirname(__file__), "..", "dashboard")

app = Flask(__name__)
app.config['SECRET_KEY'] = 'api-security-dashboard-secret'

# Initialize SocketIO with CORS allowed for local dev
socketio = SocketIO(app, cors_allowed_origins="*")

# Static bearer token for Phase 1 (no real auth/tenant isolation yet —
# that's Phase 2, see architectures.md Security Architecture section).
API_TOKEN = "phase1-demo-token"

REQUIRED_FIELDS = ["endpoint", "method", "status_code", "latency_ms", "ip"]


def _get_tenant_from_auth():
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        token = auth_header[7:]
        # In a real system, you'd validate the token here. For this capstone, 
        # we treat the API token string itself as the tenant_id.
        return token if token else "default"
    return None


@app.route("/", methods=["GET"])
def dashboard():
    return send_from_directory(DASHBOARD_DIR, "index.html")


@app.route("/health", methods=["GET"])
def health():
    tenant_id = request.args.get("tenant_id", "default")
    return jsonify({"status": "ok", "event_count": db.get_all_events_count(tenant_id)})


@app.route("/ingest", methods=["POST"])
def ingest():
    tenant_id = _get_tenant_from_auth()
    if not tenant_id:
        return jsonify({"error": "unauthorized, missing Bearer token"}), 401

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
        "tenant_id": tenant_id,
    }

    # Check rate limiter — block abusive IPs
    ip = event["ip"]
    # Rate limiter could be tenant-aware, but keeping global per-IP is fine for capstone
    rate_status = rate_limiter.record_request(ip)
    if rate_status.get("blocked"):
        if rate_status.get("auto_blocked"):
            # Notify dashboard that an IP was auto-blocked for this tenant
            socketio.emit(f'ip_blocked_{tenant_id}', {
                "ip": ip,
                "reason": rate_status["reason"]
            })
        return jsonify({"error": "rate limited", "detail": rate_status}), 429

    # Warn dashboard if IP is approaching the limit
    if rate_status.get("warning"):
        socketio.emit(f'ip_warning_{tenant_id}', {
            "ip": ip,
            "count": rate_status["count"],
            "limit": rate_status["limit"]
        })

    # Run detection inline (feature computation + rules + score + fusion)
    scored_event = detection.score_event(event)

    event_id = db.insert_event(scored_event)
    scored_event["id"] = event_id

    # Push the event to all connected dashboard clients via WebSocket (namespaced by tenant)
    socketio.emit(f'new_event_{tenant_id}', scored_event)

        # If it's an alert (medium or high), push that too
    if scored_event.get("severity") in ("medium", "high"):
        socketio.emit(f'new_alert_{tenant_id}', scored_event)
        
        # Fire automated webhook for HIGH severity attacks
        if scored_event.get("severity") == "high":
            webhook.send_alert(scored_event)

    return jsonify(scored_event), 201



@app.route("/api/webhook_test", methods=["POST"])
def webhook_test():
    payload = request.get_json(silent=True)
    print(f"\n[WEBHOOK RECEIVED] => {payload}\n")
    return jsonify({"status": "received"})

@app.route("/events/recent", methods=["GET"])
def events_recent():
    tenant_id = request.args.get("tenant_id", "default")
    limit = int(request.args.get("limit", 50))
    return jsonify(db.get_recent_events(limit, tenant_id))


@app.route("/alerts/recent", methods=["GET"])
def alerts_recent():
    tenant_id = request.args.get("tenant_id", "default")
    limit = int(request.args.get("limit", 50))
    return jsonify(db.get_recent_alerts(limit, tenant_id))


@app.route("/alerts/stats", methods=["GET"])
def alerts_stats():
    tenant_id = request.args.get("tenant_id", "default")
    return jsonify(db.get_alert_stats(tenant_id))


@app.route("/blocked-ips", methods=["GET"])
def blocked_ips():
    # In a full system, you'd filter this by tenant too
    return jsonify(rate_limiter.get_blocked_ips())


@app.route("/block-ip", methods=["POST"])
def block_ip():
    data = request.get_json(silent=True)
    if not data or "ip" not in data:
        return jsonify({"error": "ip required"}), 400
    tenant_id = request.args.get("tenant_id", "default")
    duration = data.get("duration", 300)
    reason = data.get("reason", "Manually blocked from dashboard")
    ok = rate_limiter.block_ip(data["ip"], duration, reason)
    if ok:
        socketio.emit(f'ip_blocked_{tenant_id}', {"ip": data["ip"], "reason": reason})
    return jsonify({"success": ok})


@app.route("/unblock-ip", methods=["POST"])
def unblock_ip():
    data = request.get_json(silent=True)
    if not data or "ip" not in data:
        return jsonify({"error": "ip required"}), 400
    ok = rate_limiter.unblock_ip(data["ip"])
    return jsonify({"success": ok})


@app.route("/history", methods=["GET"])
def history():
    tenant_id = request.args.get("tenant_id", "default")
    return jsonify(db.get_historical_stats(tenant_id))


@app.route("/api/investigate/<int:alert_id>", methods=["GET"])
def investigate(alert_id):
    import investigator
    report = investigator.generate_threat_report(alert_id)
    return jsonify({"report": report})


if __name__ == "__main__":
    db.init_db()
    print(f"Collector starting. Token: {API_TOKEN}")
    socketio.run(app, host="0.0.0.0", port=5001, debug=False)

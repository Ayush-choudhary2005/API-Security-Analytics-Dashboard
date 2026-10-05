"""
server.py — Collector backend with Multi-Tenant Authentication & Real-Time WebSocket support.

Endpoints:
  POST /api/auth/register    -> User signup
  POST /api/auth/login       -> User login
  POST /api/auth/logout      -> User logout
  GET  /api/auth/me          -> Active user info
  GET  /api/projects         -> List user projects
  POST /api/projects         -> Create new project
  GET  /api/projects/<id>    -> Project details & keys
  POST /ingest               -> SDK sends telemetry here (Bearer token required)
  GET  /events/recent        -> Recent live feed (scoped & protected)
  GET  /alerts/recent        -> Recent alerts (scoped & protected)
  GET  /alerts/stats         -> Attack distribution stats (scoped & protected)
  GET  /history              -> Historical stats (scoped & protected)
  GET  /health               -> Quick liveness check
  WS   /socket.io            -> Real-time push channel

Run with:  python3 server.py
"""

import time
import os
import io
import zipfile
from flask import Flask, request, jsonify, send_from_directory, send_file, session, g
from flask_socketio import SocketIO, join_room, leave_room, emit

import db
import webhook
import detection
import rate_limiter
import auth
from auth import login_required

DASHBOARD_DIR = os.path.join(os.path.dirname(__file__), "..", "dashboard")

app = Flask(__name__)
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'api-security-dashboard-secret-321')
app.config['SESSION_COOKIE_HTTPONLY'] = True
app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'
app.config['PERMANENT_SESSION_LIFETIME'] = 86400 * 7  # 7 days session persistence

# Initialize SocketIO with CORS allowed for dev
socketio = SocketIO(app, cors_allowed_origins="*")

API_TOKEN = "phase1-demo-token"
REQUIRED_FIELDS = ["endpoint", "method", "status_code", "latency_ms", "ip"]


def _get_project_from_auth():
    """Resolve incoming Bearer or X-API-Key SDK token to an active project in the database."""
    token = None
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        token = auth_header[7:].strip()
    elif "X-API-Key" in request.headers:
        token = request.headers.get("X-API-Key", "").strip()

    if token:
        project = db.get_project_by_api_key(token)
        if project:
            return project
        if token == API_TOKEN:
            return db.get_project_by_id("proj_demo_default")
    return None


def _resolve_and_verify_project(user_id):
    """
    Helper to extract target project_id from query/params and verify ownership.
    Returns (project_id, None) on success or (None, error_response) on failure.
    """
    project_id = request.args.get("project_id") or request.args.get("tenant_id")
    if not project_id:
        user_projects = db.get_projects_by_user(user_id)
        if user_projects:
            project_id = user_projects[0]["id"]
        else:
            project_id = "default"

    if not db.user_owns_project(user_id, project_id):
        return None, (jsonify({"error": "Forbidden: access denied to this project"}), 403)

    return project_id, None


# ---------------------------------------------------------
# WebSocket Room Authorization & Management
# ---------------------------------------------------------

@socketio.on('join_project')
def handle_join_project(data):
    """
    Authorize and join the client to a project-specific WebSocket room.
    Ensures User A NEVER receives User B's live telemetry or alerts.
    """
    data = data or {}
    project_id = data.get('project_id')
    user_id = session.get('user_id')

    if not project_id:
        emit('error', {'message': 'project_id required'})
        return {'status': 'error', 'message': 'project_id required'}

    # Demo project fallback for unauthenticated demo scripts
    if not user_id:
        if project_id in ('proj_demo_default', 'phase1-demo-token', 'default'):
            room_name = f"project_{project_id}"
            join_room(room_name)
            emit('project_joined', {'project_id': project_id, 'room': room_name})
            return {'status': 'joined', 'room': room_name}
        emit('error', {'message': 'Unauthenticated WebSocket connection'})
        return {'status': 'error', 'message': 'Unauthenticated'}

    # Strict server-side authorization check: verify user owns this project
    if not db.user_owns_project(user_id, project_id):
        emit('error', {'message': 'Forbidden: you do not own this project'})
        return {'status': 'error', 'message': 'Forbidden'}

    old_room = session.get('current_socket_room')
    if old_room:
        leave_room(old_room)

    room_name = f"project_{project_id}"
    join_room(room_name)
    session['current_socket_room'] = room_name
    emit('project_joined', {'project_id': project_id, 'room': room_name})
    return {'status': 'joined', 'room': room_name}


@socketio.on('leave_project')
def handle_leave_project(data):
    data = data or {}
    project_id = data.get('project_id')
    if project_id:
        leave_room(f"project_{project_id}")
    return {'status': 'left'}


# ---------------------------------------------------------
# Static / Health Routes
# ---------------------------------------------------------

@app.route("/", methods=["GET"])
def dashboard():
    return send_from_directory(DASHBOARD_DIR, "index.html")


@app.route("/health", methods=["GET"])
def health():
    tenant_id = request.args.get("tenant_id") or request.args.get("project_id", "default")
    return jsonify({"status": "ok", "event_count": db.get_all_events_count(tenant_id)})


# ---------------------------------------------------------
# Authentication Routes
# ---------------------------------------------------------

@app.route("/api/auth/register", methods=["POST"])
def auth_register():
    data = request.get_json(silent=True) or {}
    email = data.get("email", "").strip()
    password = data.get("password", "")
    confirm_password = data.get("confirm_password") or data.get("password_confirm", "")

    # Input validation
    if not email or not auth.validate_email(email):
        return jsonify({"error": "Invalid email address format"}), 400

    is_valid, err_msg = auth.validate_password(password)
    if not is_valid:
        return jsonify({"error": err_msg}), 400

    if password != confirm_password:
        return jsonify({"error": "Passwords do not match"}), 400

    # Duplicate check
    if db.get_user_by_email(email):
        return jsonify({"error": "An account with this email already exists"}), 409

    # Create user & initial project
    pw_hash = auth.hash_password(password)
    user = db.create_user(email, pw_hash)
    default_proj = db.create_project(user["id"], name="Default Project", description="Primary security project")
    key_info = db.create_api_key(default_proj["id"], name="Primary SDK Key")

    # Establish persistent session
    session.permanent = True
    session["user_id"] = user["id"]

    return jsonify({
        "user": user,
        "default_project": default_proj,
        "api_key": key_info["raw_key"],
        "message": "Account created successfully"
    }), 201


@app.route("/api/auth/login", methods=["POST"])
def auth_login():
    data = request.get_json(silent=True) or {}
    email = data.get("email", "").strip()
    password = data.get("password", "")

    if not email or not password:
        return jsonify({"error": "Email and password are required"}), 400

    user = db.get_user_by_email(email)
    # Generic error message to prevent user enumeration
    if not user or not auth.verify_password(user["password_hash"], password):
        return jsonify({"error": "Invalid email or password"}), 401

    session.permanent = True
    session["user_id"] = user["id"]
    return jsonify({
        "user": {"id": user["id"], "email": user["email"], "created_at": user["created_at"]},
        "message": "Login successful"
    }), 200


@app.route("/api/auth/logout", methods=["POST"])
def auth_logout():
    session.clear()
    return jsonify({"message": "Logged out successfully"}), 200


@app.route("/api/auth/me", methods=["GET"])
@login_required
def auth_me():
    return jsonify({"user": g.current_user}), 200


# ---------------------------------------------------------
# Project Management Routes
# ---------------------------------------------------------

@app.route("/api/projects", methods=["GET"])
@login_required
def list_projects():
    projects = db.get_projects_by_user(g.current_user["id"])
    return jsonify({"projects": projects}), 200


@app.route("/api/projects", methods=["POST"])
@login_required
def create_project_route():
    data = request.get_json(silent=True) or {}
    name = data.get("name", "").strip()
    if not name:
        return jsonify({"error": "Project name is required"}), 400

    description = data.get("description", "").strip()
    proj = db.create_project(g.current_user["id"], name=name, description=description)
    key_info = db.create_api_key(proj["id"], name="Default SDK Key")

    return jsonify({"project": proj, "api_key": key_info["raw_key"]}), 201


@app.route("/api/projects/<project_id>", methods=["GET"])
@login_required
def get_project_route(project_id):
    if not db.user_owns_project(g.current_user["id"], project_id):
        return jsonify({"error": "Forbidden: access denied"}), 403

    proj = db.get_project_by_id(project_id)
    keys = db.list_api_keys_for_project(project_id)
    webhook_cfg = db.get_webhook_config(project_id)
    event_count = db.get_all_events_count(project_id)
    return jsonify({
        "project": proj,
        "keys": keys,
        "webhook": webhook_cfg,
        "event_count": event_count
    }), 200


@app.route("/api/projects/<project_id>", methods=["DELETE"])
@login_required
def delete_project_route(project_id):
    if not db.user_owns_project(g.current_user["id"], project_id):
        return jsonify({"error": "Forbidden: you do not have access to this project"}), 403

    ok, msg = db.delete_project(g.current_user["id"], project_id)
    if not ok:
        return jsonify({"error": msg}), 400

    return jsonify({"message": msg, "deleted_project_id": project_id}), 200



@app.route("/api/projects/<project_id>/keys", methods=["GET"])
@login_required
def get_project_keys(project_id):
    if not db.user_owns_project(g.current_user["id"], project_id):
        return jsonify({"error": "Forbidden: access denied"}), 403
    return jsonify({"keys": db.list_api_keys_for_project(project_id)}), 200


@app.route("/api/projects/<project_id>/keys", methods=["POST"])
@login_required
def create_project_key(project_id):
    if not db.user_owns_project(g.current_user["id"], project_id):
        return jsonify({"error": "Forbidden: access denied"}), 403
    data = request.get_json(silent=True) or {}
    name = data.get("name", "New SDK Key").strip() or "New SDK Key"
    key_info = db.create_api_key(project_id, name=name)
    return jsonify({"key": key_info}), 201


@app.route("/api/projects/<project_id>/keys/<int:key_id>/revoke", methods=["POST"])
@login_required
def revoke_project_key(project_id, key_id):
    if not db.user_owns_project(g.current_user["id"], project_id):
        return jsonify({"error": "Forbidden: access denied"}), 403
    ok = db.revoke_api_key(key_id, project_id)
    return jsonify({"success": ok}), 200


@app.route("/api/projects/<project_id>/keys/regenerate", methods=["POST"])
@login_required
def regenerate_project_key(project_id):
    if not db.user_owns_project(g.current_user["id"], project_id):
        return jsonify({"error": "Forbidden: access denied"}), 403
    data = request.get_json(silent=True) or {}
    name = data.get("name", "Regenerated SDK Key").strip() or "Regenerated SDK Key"
    key_info = db.regenerate_api_key(project_id, name=name)
    return jsonify({"key": key_info, "message": "API key regenerated successfully"}), 201


@app.route("/api/projects/<project_id>/download-sdk", methods=["GET"])
@login_required
def download_sdk(project_id):
    if not db.user_owns_project(g.current_user["id"], project_id):
        return jsonify({"error": "Forbidden: access denied"}), 403

    proj = db.get_project_by_id(project_id)
    if not proj:
        return jsonify({"error": "Project not found"}), 404

    # Use active key or provision a dedicated preconfigured key
    raw_key = request.args.get("api_key")
    if raw_key:
        validated_proj_id = db.verify_api_key(raw_key)
        if validated_proj_id != project_id:
            raw_key = None  # Key invalid, revoked, or belongs to another tenant; provision fresh key below

    if not raw_key:
        # Check if project has active keys or generate one
        active_keys = [k for k in db.list_api_keys_for_project(project_id) if not k.get("revoked_at")]
        if not active_keys:
            key_info = db.create_api_key(project_id, name="SDK Preconfigured Key")
            raw_key = key_info["raw_key"]
        else:
            # Generate a new dedicated key so download is immediately usable
            key_info = db.create_api_key(project_id, name="SDK Download Key")
            raw_key = key_info["raw_key"]

    sdk_file_path = os.path.join(os.path.dirname(__file__), "..", "sdk", "middleware.py")
    with open(sdk_file_path, "r", encoding="utf-8") as f:
        middleware_code = f.read()

    collector_url = request.host_url.rstrip("/")

    config_code = f"""# ML-O11Y Security SDK Configuration
# Auto-generated configuration for project: {proj['name']}
COLLECTOR_URL = "{collector_url}"
PROJECT_ID = "{proj['id']}"
SDK_KEY = "{raw_key}"
"""

    example_code = f"""\"\"\"
Sample integration of ML-O11Y Security SDK into your Flask application.
\"\"\"
from flask import Flask, jsonify
from middleware import SecurityMiddleware, observe
import config

app = Flask(__name__)

# Attach zero-latency security observability middleware:
SecurityMiddleware(
    app,
    collector_url=config.COLLECTOR_URL,
    api_key=config.SDK_KEY
)

@app.route("/")
def index():
    return jsonify({{"status": "online", "message": "API is protected by ML-O11Y!"}})

@app.route("/api/data", methods=["GET"])
def get_data():
    return jsonify({{"data": [1, 2, 3]}})

if __name__ == "__main__":
    print(f"Server starting. Telemetry forwarding to {{config.COLLECTOR_URL}}...")
    app.run(port=5002)
"""

    readme_code = f"""# 🛡️ ML-O11Y Security SDK

Preconfigured SDK for project: **{proj['name']}** (`{proj['id']}`)

## Quickstart

1. Place `middleware.py` and `config.py` in your Flask project directory.
2. Install dependencies:
   ```bash
   pip install requests
   ```
3. Attach the middleware in your Flask entrypoint:
   ```python
   from flask import Flask
   from middleware import SecurityMiddleware
   import config

   app = Flask(__name__)
   SecurityMiddleware(app, collector_url=config.COLLECTOR_URL, api_key=config.SDK_KEY)
   ```

Your application telemetry is now observed asynchronously with zero added response latency!
"""

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("middleware.py", middleware_code)
        z.writestr("config.py", config_code)
        z.writestr("sample_app.py", example_code)
        z.writestr("README.md", readme_code)
    buf.seek(0)

    zip_filename = f"mlo11y-sdk-{proj['id']}.zip"
    return send_file(
        buf,
        mimetype="application/zip",
        as_attachment=True,
        download_name=zip_filename
    )



@app.route("/api/projects/<project_id>/webhooks", methods=["GET", "POST", "DELETE"])
@login_required
def project_webhooks(project_id):
    if not db.user_owns_project(g.current_user["id"], project_id):
        return jsonify({"error": "Forbidden: access denied"}), 403

    if request.method == "DELETE":
        ok = db.delete_webhook_config(project_id)
        return jsonify({"success": ok, "message": "Webhook removed successfully"}), 200

    if request.method == "POST":
        data = request.get_json(silent=True) or {}
        webhook_url = data.get("webhook_url", "").strip()
        provider = data.get("provider", "slack").strip().lower()
        enabled = data.get("enabled", True)

        if webhook_url and not (webhook_url.startswith("http://") or webhook_url.startswith("https://")):
            return jsonify({"error": "Invalid webhook URL format. Must start with http:// or https://"}), 400

        cfg = db.set_webhook_config(project_id, webhook_url=webhook_url, provider=provider, enabled=enabled)
        return jsonify({"webhook": cfg, "message": "Webhook configuration saved successfully"}), 200

    # GET returns masked config — never leaks raw secret
    return jsonify({"webhook": db.get_webhook_config(project_id, raw=False)}), 200


@app.route("/api/projects/<project_id>/webhooks/toggle", methods=["POST"])
@login_required
def toggle_project_webhook(project_id):
    if not db.user_owns_project(g.current_user["id"], project_id):
        return jsonify({"error": "Forbidden: access denied"}), 403

    data = request.get_json(silent=True) or {}
    enabled = bool(data.get("enabled", True))
    cfg = db.toggle_webhook_enabled(project_id, enabled)
    return jsonify({"webhook": cfg, "message": f"Webhook {'enabled' if enabled else 'disabled'}"}), 200


@app.route("/api/projects/<project_id>/webhooks/test", methods=["POST"])
@login_required
def test_project_webhook(project_id):
    if not db.user_owns_project(g.current_user["id"], project_id):
        return jsonify({"error": "Forbidden: access denied"}), 403

    proj = db.get_project_by_id(project_id)
    raw_cfg = db.get_webhook_config(project_id, raw=True)
    if not raw_cfg or not raw_cfg.get("webhook_url"):
        return jsonify({"error": "No webhook configured for this project"}), 400

    success, msg = webhook.test_webhook(raw_cfg["webhook_url"], project_name=proj.get("name", "Project"))
    if success:
        return jsonify({"success": True, "message": msg}), 200
    else:
        return jsonify({"success": False, "error": msg}), 400


# ---------------------------------------------------------
# Telemetry Ingestion (Called by SDK via Bearer API Key)
# ---------------------------------------------------------

@app.route("/ingest", methods=["POST"])
def ingest():
    project = _get_project_from_auth()
    if not project:
        return jsonify({"error": "unauthorized, missing or invalid Bearer API token"}), 401

    project_id = project["id"]
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
        "project_id": project_id,
        "tenant_id": project_id,
    }

    # Check rate limiter — block abusive IPs for this project
    ip = event["ip"]
    rate_status = rate_limiter.record_request(ip, project_id=project_id)
    room_name = f"project_{project_id}"

    if rate_status.get("blocked"):
        if rate_status.get("auto_blocked"):
            socketio.emit(f'ip_blocked_{project_id}', {
                "ip": ip,
                "reason": rate_status["reason"],
                "project_id": project_id
            }, room=room_name)
            socketio.emit('ip_blocked', {
                "ip": ip,
                "reason": rate_status["reason"],
                "project_id": project_id
            }, room=room_name)
        return jsonify({"error": "rate limited", "detail": rate_status}), 429

    # Warn dashboard if IP is approaching the limit
    if rate_status.get("warning"):
        socketio.emit(f'ip_warning_{project_id}', {
            "ip": ip,
            "count": rate_status["count"],
            "limit": rate_status["limit"],
            "project_id": project_id
        }, room=room_name)
        socketio.emit('ip_warning', {
            "ip": ip,
            "count": rate_status["count"],
            "limit": rate_status["limit"],
            "project_id": project_id
        }, room=room_name)

    # Run detection inline (feature computation + rules + score + fusion)
    scored_event = detection.score_event(event)

    event_id = db.insert_event(scored_event)
    scored_event["id"] = event_id

    # Push to dashboard via WebSocket (strictly scoped to project room)
    socketio.emit(f'new_event_{project_id}', scored_event, room=room_name)
    socketio.emit('new_event', scored_event, room=room_name)

    # If it's an alert (medium or high), push that too
    if scored_event.get("severity") in ("medium", "high"):
        socketio.emit(f'new_alert_{project_id}', scored_event, room=room_name)
        socketio.emit('new_alert', scored_event, room=room_name)

        # Fire automated webhook for alerts strictly using this project's active configuration
        webhook_cfg = db.get_webhook_config(project_id, raw=True, active_only=True)
        if webhook_cfg and webhook_cfg.get("webhook_url"):
            webhook.send_alert(scored_event, webhook_url=webhook_cfg["webhook_url"])
        elif project_id in ('proj_demo_default', 'phase1-demo-token', 'default'):
            # Backward-compatible environment fallback for default demo project only
            env_slack = os.environ.get("SLACK_WEBHOOK_URL", "")
            if env_slack:
                webhook.send_alert(scored_event, webhook_url=env_slack)

    return jsonify(scored_event), 201


@app.route("/api/webhook_test", methods=["POST"])
def webhook_test():
    payload = request.get_json(silent=True)
    print(f"\n[WEBHOOK RECEIVED] => {payload}\n")
    return jsonify({"status": "received"})


# ---------------------------------------------------------
# Protected Dashboard Telemetry & Alert Routes
# ---------------------------------------------------------

@app.route("/events/recent", methods=["GET"])
@login_required
def events_recent():
    project_id, err = _resolve_and_verify_project(g.current_user["id"])
    if err:
        return err
    limit = int(request.args.get("limit", 50))
    return jsonify(db.get_recent_events(limit, project_id))


@app.route("/alerts/recent", methods=["GET"])
@login_required
def alerts_recent():
    project_id, err = _resolve_and_verify_project(g.current_user["id"])
    if err:
        return err
    limit = int(request.args.get("limit", 50))
    return jsonify(db.get_recent_alerts(limit, project_id))


@app.route("/alerts/stats", methods=["GET"])
@login_required
def alerts_stats():
    project_id, err = _resolve_and_verify_project(g.current_user["id"])
    if err:
        return err
    return jsonify(db.get_alert_stats(project_id))


@app.route("/history", methods=["GET"])
@login_required
def history():
    project_id, err = _resolve_and_verify_project(g.current_user["id"])
    if err:
        return err
    return jsonify(db.get_historical_stats(project_id))


@app.route("/blocked-ips", methods=["GET"])
@login_required
def blocked_ips():
    project_id, err = _resolve_and_verify_project(g.current_user["id"])
    if err:
        return err
    return jsonify(rate_limiter.get_blocked_ips(project_id=project_id))


@app.route("/block-ip", methods=["POST"])
@login_required
def block_ip():
    data = request.get_json(silent=True)
    if not data or "ip" not in data:
        return jsonify({"error": "ip required"}), 400

    project_id, err = _resolve_and_verify_project(g.current_user["id"])
    if err:
        return err

    duration = data.get("duration", 300)
    reason = data.get("reason", "Manually blocked from dashboard")
    ok = rate_limiter.block_ip(data["ip"], duration, reason, project_id=project_id)
    if ok:
        room_name = f"project_{project_id}"
        socketio.emit(f'ip_blocked_{project_id}', {"ip": data["ip"], "reason": reason, "project_id": project_id}, room=room_name)
        socketio.emit('ip_blocked', {"ip": data["ip"], "reason": reason, "project_id": project_id}, room=room_name)
    return jsonify({"success": ok})


@app.route("/unblock-ip", methods=["POST"])
@login_required
def unblock_ip():
    data = request.get_json(silent=True)
    if not data or "ip" not in data:
        return jsonify({"error": "ip required"}), 400
    project_id, err = _resolve_and_verify_project(g.current_user["id"])
    if err:
        return err
    ok = rate_limiter.unblock_ip(data["ip"], project_id=project_id)
    return jsonify({"success": ok})


@app.route("/api/investigate/<int:alert_id>", methods=["GET"])
@login_required
def investigate(alert_id):
    event = db.get_event_by_id(alert_id)
    if not event:
        return jsonify({"error": "Alert not found"}), 404

    event_proj = event.get("project_id") or event.get("tenant_id")
    if not db.user_owns_project(g.current_user["id"], event_proj):
        return jsonify({"error": "Forbidden: access denied to this alert"}), 403

    import investigator
    report = investigator.generate_threat_report(alert_id)
    return jsonify({"report": report})


if __name__ == "__main__":
    db.init_db()
    print(f"Collector starting. Token: {API_TOKEN}")
    socketio.run(app, host="0.0.0.0", port=5001, debug=False)

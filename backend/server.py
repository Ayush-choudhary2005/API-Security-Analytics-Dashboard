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
import uuid
import zipfile
from flask import Flask, request, jsonify, send_from_directory, send_file, session, g, redirect, url_for
from flask_socketio import SocketIO, join_room, leave_room, emit

import db
import webhook
import detection
import rate_limiter
import auth
from auth import login_required
import google_auth
import email_service
import ingestion
from integrations.service import notification_service
from config import get_config
import logging_config

DASHBOARD_DIR = os.path.join(os.path.dirname(__file__), "..", "frontend", "dashboard", "dist")

# Initialize app from environment profile
app_cfg = get_config()
app = Flask(__name__)
app.config.from_object(app_cfg)

# Support reverse proxy headers (e.g. Render, Cloudflare, AWS ALB)
from werkzeug.middleware.proxy_fix import ProxyFix
app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1, x_prefix=1)

# Initialize structured logging with secret redaction filters
logger = logging_config.configure_logging(app, env=app_cfg.ENV)

# Initialize database schema and migrations
db.init_db()

# Initialize Google OAuth OpenID Connect client
google_auth.init_google_oauth(app)

# Initialize SocketIO with configurable CORS
socketio = SocketIO(
    app,
    cors_allowed_origins=app_cfg.CORS_ALLOWED_ORIGINS if (app_cfg.ENV != "production" or app_cfg.CORS_ALLOWED_ORIGINS != "*") else "*",
    max_http_buffer_size=app_cfg.MAX_CONTENT_LENGTH
)

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
    Helper to extract target project_id from query/params or JSON body and verify ownership.
    Returns (project_id, None) on success or (None, error_response) on failure.
    """
    body_data = request.get_json(silent=True) or {} if request.is_json else {}
    project_id = (
        request.args.get("project_id") or
        request.args.get("tenant_id") or
        body_data.get("project_id") or
        body_data.get("tenant_id")
    )
    if not project_id:
        user_projects = db.get_projects_by_user(user_id)
        if user_projects:
            project_id = user_projects[0]["id"]
        else:
            return None, (jsonify({"error": "No projects found", "code": "NO_PROJECTS"}), 404)

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

@app.route("/assets/<path:path>", methods=["GET"])
def static_assets(path):
    assets_dir = os.path.join(DASHBOARD_DIR, "assets")
    if os.path.exists(assets_dir):
        return send_from_directory(assets_dir, path)
    return jsonify({"error": "Asset not found"}), 404


@app.route("/dashboard", methods=["GET"])
@app.route("/login", methods=["GET"])
@app.route("/signup", methods=["GET"])
@app.route("/forgot-password", methods=["GET"])
@app.route("/reset-password", methods=["GET"])
@app.route("/verify-email", methods=["GET"])
@app.route("/account", methods=["GET"])
@app.route("/app", methods=["GET"])
@app.route("/app/<path:path>", methods=["GET"])
@app.route("/", methods=["GET"])
def dashboard(path=None):
    index_file = os.path.join(DASHBOARD_DIR, "index.html")
    if os.path.exists(index_file):
        return send_from_directory(DASHBOARD_DIR, "index.html")
    return """<!doctype html>
<html>
<head><title>API-Security-Analytics-Dashboard: Build Required</title></head>
<body style="font-family: monospace; background: #0A0B0D; color: #E6E8EB; padding: 40px; text-align: center;">
  <h2 style="color: #C792EA;">Frontend Production Build Required</h2>
  <p style="color: #9BA1AC;">The dashboard application assets have not been built yet.</p>
  <p>Please run <code style="background:#16181D;padding:4px 8px;border-radius:4px;border:1px solid #1E2127;">npm run build</code> in <code>frontend/dashboard</code> to generate the SPA distribution.</p>
</body>
</html>""", 200, {"Content-Type": "text/html"}


@app.route("/health", methods=["GET"])
@app.route("/healthz", methods=["GET"])
def health():
    """Liveness probe: verifies process is alive and responsive."""
    data = ingestion.check_liveness()
    tenant_id = request.args.get("tenant_id") or request.args.get("project_id")
    if tenant_id:
        data["event_count"] = db.get_all_events_count(tenant_id)
    return jsonify(data), 200


@app.route("/ready", methods=["GET"])
@app.route("/readyz", methods=["GET"])
def ready():
    """Readiness probe: validates database and detection engine dependencies."""
    is_ready, details = ingestion.check_readiness(db, detection)
    status_code = 200 if is_ready else 503
    return jsonify(details), status_code


# ---------------------------------------------------------
# Security Hardening: Headers & Error Handlers
# ---------------------------------------------------------

@app.before_request
def handle_cors_preflight():
    """Handle CORS preflight OPTIONS requests for configured origins."""
    if request.method == "OPTIONS":
        origin = request.headers.get("Origin")
        cors_cfg = app.config.get("CORS_ALLOWED_ORIGINS", "*")
        allowed_origins = [o.strip() for o in cors_cfg.split(",") if o.strip()]
        if origin and ("*" in allowed_origins or origin in allowed_origins):
            from flask import Response
            resp = Response(status=204)
            resp.headers["Access-Control-Allow-Origin"] = origin
            resp.headers["Access-Control-Allow-Credentials"] = "true"
            resp.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS"
            resp.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization, X-API-Key"
            return resp


@app.after_request
def apply_security_headers(response):
    """Enforce defense-in-depth secure HTTP headers across all responses."""
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "SAMEORIGIN"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"

    # Configure CORS headers for allowed origins
    origin = request.headers.get("Origin")
    cors_cfg = app.config.get("CORS_ALLOWED_ORIGINS", "*")
    allowed_origins = [o.strip() for o in cors_cfg.split(",") if o.strip()]
    if origin and ("*" in allowed_origins or origin in allowed_origins):
        response.headers["Access-Control-Allow-Origin"] = origin
        response.headers["Access-Control-Allow-Credentials"] = "true"
        response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS"
        response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization, X-API-Key"

    if app.config.get("SESSION_COOKIE_SECURE"):
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"

    # CSP protecting against untrusted script injection while allowing local assets & CDNs
    if "Content-Security-Policy" not in response.headers and not response.mimetype.startswith("image/"):
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; "
            "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com; "
            "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdnjs.cloudflare.com; "
            "font-src 'self' https://fonts.gstatic.com data:; "
            "img-src 'self' data: https:; "
            "connect-src 'self' ws: wss: https:;"
        )
    return response


@app.errorhandler(400)
def handle_bad_request(e):
    msg = getattr(e, "description", "Bad Request")
    return jsonify({"error": "Bad Request", "message": msg}), 400


@app.errorhandler(401)
def handle_unauthorized(e):
    return jsonify({"error": "Unauthorized", "message": "Authentication required"}), 401


@app.errorhandler(403)
def handle_forbidden(e):
    msg = getattr(e, "description", "Forbidden: access denied")
    return jsonify({"error": "Forbidden", "message": msg}), 403


@app.errorhandler(404)
def handle_not_found(e):
    if request.path.startswith("/api/") or request.path in ("/ingest", "/events/recent", "/alerts/recent", "/alerts/stats", "/history"):
        return jsonify({"error": "Not Found", "message": "The requested endpoint does not exist"}), 404
    # For HTML browser navigation, serve the SPA shell so React Router handles the route
    if request.method == "GET" and ("text/html" in request.headers.get("Accept", "") or "." not in request.path.split("/")[-1]):
        index_file = os.path.join(DASHBOARD_DIR, "index.html")
        if os.path.exists(index_file):
            return send_from_directory(DASHBOARD_DIR, "index.html")
    return e


@app.errorhandler(405)
def handle_method_not_allowed(e):
    return jsonify({"error": "Method Not Allowed", "message": "HTTP method not allowed for this route"}), 405


@app.errorhandler(413)
def handle_payload_too_large(e):
    return jsonify({"error": "Payload Too Large", "message": "Request payload exceeds size limit (5MB)"}), 413


@app.errorhandler(429)
def handle_too_many_requests(e):
    msg = getattr(e, "description", "Too Many Requests")
    return jsonify({"error": "Too Many Requests", "message": msg}), 429


@app.errorhandler(500)
def handle_internal_server_error(e):
    logger.error(f"Internal server error: {e}", exc_info=True)
    return jsonify({
        "error": "Internal Server Error",
        "message": "An unexpected error occurred. Incident has been recorded."
    }), 500


# ---------------------------------------------------------
# Authentication Routes
# ---------------------------------------------------------

@app.route("/api/auth/register", methods=["POST"])
def auth_register():
    data = request.get_json(silent=True) or {}
    email = data.get("email", "").strip()
    name = data.get("name", "").strip()
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

    # Create user only - clean slate with zero predefined workspaces/projects/keys
    pw_hash = auth.hash_password(password)
    user = db.create_user(email, pw_hash, name=name, email_verified=0)

    # Generate verification token & dispatch transactional email
    v_token = db.create_email_verification_token(user["id"])
    email_service.send_verification_email(email, v_token)

    # Establish persistent session
    now = time.time()
    session.permanent = True
    session["user_id"] = user["id"]
    session["auth_time"] = now

    return jsonify({
        "user": user,
        "message": "Account created successfully. A verification email has been sent."
    }), 201


@app.route("/api/auth/login", methods=["POST"])
def auth_login():
    client_ip = request.headers.get("X-Forwarded-For", "").split(",")[0].strip() or request.remote_addr or "unknown"
    if rate_limiter.is_login_rate_limited(client_ip):
        return jsonify({"error": "Too many failed login attempts. Please try again later."}), 429

    data = request.get_json(silent=True) or {}
    email = data.get("email", "").strip()
    password = data.get("password", "")

    if not email or not password:
        return jsonify({"error": "Email and password are required"}), 400

    user = db.get_user_by_email(email)
    # Generic error message to prevent user enumeration
    if not user or not auth.verify_password(user["password_hash"], password):
        rate_limiter.record_failed_login(client_ip)
        return jsonify({"error": "Invalid email or password"}), 401

    rate_limiter.clear_failed_logins(client_ip)
    db.record_user_login(user["id"])
    now = time.time()
    session.permanent = True
    session["user_id"] = user["id"]
    session["auth_time"] = now

    # Safe account linking: if user had an unlinked Google OAuth attempt with matching email
    linked_google = False
    pending = session.pop("pending_google_link", None)
    if pending and pending.get("email") == user["email"]:
        try:
            db.link_identity(user["id"], pending.get("provider", "google"), pending["sub"], pending["email"])
            linked_google = True
        except Exception:
            pass

    full_user = db.get_user_by_id(user["id"])
    return jsonify({
        "user": full_user,
        "message": "Login successful and Google account linked" if linked_google else "Login successful",
        "linked_google": linked_google
    }), 200


@app.route("/api/auth/pending-link", methods=["GET"])
def auth_pending_link():
    """Check if there is a pending Google OAuth link in the current session."""
    pending = session.get("pending_google_link")
    if not pending:
        return jsonify({"has_pending": False}), 200
    return jsonify({
        "has_pending": True,
        "email": pending.get("email"),
        "provider": pending.get("provider", "google")
    }), 200


@app.route("/api/auth/link-google", methods=["POST"])
def auth_link_google():
    """Explicitly link Google identity to existing account after verifying password."""
    data = request.get_json(silent=True) or {}
    password = data.get("password", "")
    pending = session.get("pending_google_link")

    if not pending:
        return jsonify({"error": "No pending Google account link found"}), 400

    email = pending.get("email")
    user = db.get_user_by_email(email)
    if not user or not auth.verify_password(user["password_hash"], password):
        return jsonify({"error": "Invalid password"}), 401

    try:
        ident = db.link_identity(user["id"], pending.get("provider", "google"), pending["sub"], pending["email"])
    except ValueError as ve:
        return jsonify({"error": str(ve)}), 400

    now = time.time()
    session.pop("pending_google_link", None)
    session.permanent = True
    session["user_id"] = user["id"]
    session["auth_time"] = now
    db.record_user_login(user["id"])
    return jsonify({
        "success": True,
        "user": db.get_user_by_id(user["id"]),
        "message": "Google account successfully linked"
    }), 200


@app.route("/auth/google", methods=["GET"])
@app.route("/api/auth/google", methods=["GET"])
def auth_google():
    """Initiate standard Google OAuth 2.0 / OpenID Connect authorization flow."""
    if not google_auth.is_google_oauth_configured():
        return redirect(url_for("dashboard", error="google_oauth_not_configured"))

    redirect_uri = google_auth.get_redirect_uri(request)
    return google_auth.oauth.google.authorize_redirect(redirect_uri)


@app.route("/auth/google/callback", methods=["GET"])
@app.route("/api/auth/google/callback", methods=["GET"])
def auth_google_callback():
    """
    Handle Google OAuth callback:
    - Validates state & authorization code.
    - Extracts Google subject ID (sub) and verified email.
    - Resolves or creates internal user identity without parallel accounts.
    - Safely enforces password verification before linking to existing accounts.
    """
    # Handle user cancellation / error from Google
    oauth_err = request.args.get("error")
    if oauth_err:
        return redirect(url_for("dashboard", error="google_cancelled"))

    if not google_auth.is_google_oauth_configured():
        return redirect(url_for("dashboard", error="google_oauth_not_configured"))

    code = request.args.get("code")
    if not code:
        return redirect(url_for("dashboard", error="google_invalid_code"))

    try:
        # Token exchange and CSRF state validation handled by Authlib
        token = google_auth.oauth.google.authorize_access_token()
    except Exception:
        return redirect(url_for("dashboard", error="invalid_oauth_state"))

    if not token:
        return redirect(url_for("dashboard", error="google_auth_failed"))

    # Extract user profile information
    userinfo = token.get("userinfo")
    if not userinfo:
        try:
            userinfo = google_auth.oauth.google.userinfo(token=token)
        except Exception:
            userinfo = {}

    sub = str(userinfo.get("sub", "")).strip()
    email = str(userinfo.get("email", "")).strip().lower()

    if not sub or not email:
        return redirect(url_for("dashboard", error="google_missing_profile"))

    # Case 1: Check if this Google identity (sub) is ALREADY linked to an internal user
    existing_ident = db.get_identity_by_provider("google", sub)
    if existing_ident:
        user = db.get_user_by_id(existing_ident["user_id"])
        if user:
            now = time.time()
            session.permanent = True
            session["user_id"] = user["id"]
            session["auth_time"] = now
            session.pop("pending_google_link", None)
            db.record_user_login(user["id"])
            return redirect(url_for("dashboard"))
        return redirect(url_for("dashboard", error="user_not_found"))

    # Case 2: If an existing account with the same email exists -> Require password verification before linking
    existing_user = db.get_user_by_email(email)
    if existing_user:
        # Store pending link in session
        session["pending_google_link"] = {
            "sub": sub,
            "email": email,
            "provider": "google",
            "created_at": time.time()
        }
        return redirect(url_for("dashboard", link_required="1", email=email))

    # Case 3: Brand new user via Google
    new_user = db.create_user_with_identity(
        email=email,
        provider="google",
        provider_user_id=sub,
        provider_email=email
    )
    # Google verifies emails, so mark verified — use db abstraction for PostgreSQL compatibility
    db.update_user_email_verified(new_user["id"])

    now = time.time()
    session.permanent = True
    session["user_id"] = new_user["id"]
    session["auth_time"] = now
    session.pop("pending_google_link", None)
    db.record_user_login(new_user["id"])
    return redirect(url_for("dashboard"))


@app.route("/api/auth/google/status", methods=["GET"])
def auth_google_status():
    """Return status of Google OAuth configuration for UI consumption."""
    return jsonify({
        "configured": google_auth.is_google_oauth_configured(),
        "redirect_uri": google_auth.get_redirect_uri()
    }), 200


@app.route("/api/auth/logout", methods=["POST"])
def auth_logout():
    session.clear()
    return jsonify({"message": "Logged out successfully"}), 200


@app.route("/api/auth/me", methods=["GET"])
@login_required
def auth_me():
    return jsonify({"user": g.current_user}), 200


@app.route("/api/auth/profile", methods=["GET", "PUT", "POST"])
@login_required
def auth_profile():
    """Get or update current user profile."""
    if request.method in ("PUT", "POST"):
        data = request.get_json(silent=True) or {}
        name = data.get("name")
        if name is not None:
            updated = db.update_user_profile(g.current_user["id"], name=name)
            return jsonify({
                "user": updated,
                "message": "Profile updated successfully"
            }), 200

    return jsonify({"user": g.current_user}), 200


@app.route("/api/auth/verify-email", methods=["POST"])
def auth_verify_email():
    """Verify email address with a single-use cryptographically random token."""
    data = request.get_json(silent=True) or {}
    token = data.get("token") or request.args.get("token")
    if not token:
        return jsonify({"error": "Verification token is required"}), 400

    success, msg, user = db.verify_email_token(token)
    if not success:
        return jsonify({"error": msg}), 400

    return jsonify({
        "message": msg,
        "user": user
    }), 200


@app.route("/api/auth/resend-verification", methods=["POST"])
def auth_resend_verification():
    """Resend email verification token for authenticated user or specified email."""
    data = request.get_json(silent=True) or {}
    email = data.get("email", "").strip()

    user = None
    if session.get("user_id"):
        user = db.get_user_by_id(session["user_id"])
    elif email:
        user = db.get_user_by_email(email)

    if not user:
        return jsonify({"error": "User account not found or email required"}), 404

    if user.get("email_verified"):
        return jsonify({"message": "Email is already verified", "already_verified": True}), 200

    raw_token = db.create_email_verification_token(user["id"])
    email_service.send_verification_email(user["email"], raw_token)

    return jsonify({
        "message": "Verification email has been sent. Please check your inbox."
    }), 200


@app.route("/api/auth/forgot-password", methods=["POST"])
def auth_forgot_password():
    """
    Initiate password reset flow.
    Sends single-use token valid for 1 hour. Never reveals whether email exists.
    """
    data = request.get_json(silent=True) or {}
    email = data.get("email", "").strip()

    if not email or not auth.validate_email(email):
        return jsonify({"error": "Valid email address is required"}), 400

    user = db.get_user_by_email(email)
    if user:
        raw_token = db.create_password_reset_token(user["id"])
        email_service.send_password_reset_email(user["email"], raw_token)

    # Generic response to prevent user enumeration
    return jsonify({
        "message": "If an account with that email exists, password reset instructions have been sent."
    }), 200


@app.route("/api/auth/reset-password", methods=["POST"])
def auth_reset_password():
    """Apply password reset using single-use token. Invalidates all active sessions."""
    data = request.get_json(silent=True) or {}
    token = data.get("token") or request.args.get("token")
    password = data.get("password", "")
    confirm_password = data.get("confirm_password") or data.get("password_confirm", "")

    if not token:
        return jsonify({"error": "Reset token is required"}), 400

    is_valid, err_msg = auth.validate_password(password)
    if not is_valid:
        return jsonify({"error": err_msg}), 400

    if password != confirm_password:
        return jsonify({"error": "Passwords do not match"}), 400

    # Verify token before hashing
    is_valid_token, token_err, token_row = db.verify_password_reset_token(token)
    if not is_valid_token:
        return jsonify({"error": token_err}), 400

    new_hash = auth.hash_password(password)
    success, msg = db.apply_password_reset(token, new_hash)
    if not success:
        return jsonify({"error": msg}), 400

    return jsonify({
        "message": "Password has been reset successfully. Please log in with your new password."
    }), 200


@app.route("/api/auth/change-password", methods=["POST"])
@login_required
def auth_change_password():
    """
    Change password for authenticated user.
    Updates password_changed_at and refreshes current session auth_time.
    """
    data = request.get_json(silent=True) or {}
    current_password = data.get("current_password", "")
    new_password = data.get("new_password", "")
    confirm_password = data.get("confirm_password") or data.get("password_confirm", "")

    user_id = g.current_user["id"]
    raw_user = db.get_user_by_email(g.current_user["email"])
    stored_hash = raw_user.get("password_hash", "") if raw_user else ""
    has_existing_pw = bool(stored_hash and not stored_hash.startswith("!oauth_"))

    if has_existing_pw:
        if not current_password or not auth.verify_password(stored_hash, current_password):
            return jsonify({"error": "Current password is incorrect"}), 401

    is_valid, err_msg = auth.validate_password(new_password)
    if not is_valid:
        return jsonify({"error": err_msg}), 400

    if new_password != confirm_password:
        return jsonify({"error": "New passwords do not match"}), 400

    new_hash = auth.hash_password(new_password)
    db.update_user_password(user_id, new_hash)

    # Refresh current session auth_time so the current user stays logged in,
    # while all other active sessions for this user are invalidated!
    now = time.time()
    session["auth_time"] = now

    return jsonify({
        "message": "Password changed successfully"
    }), 200


@app.route("/api/auth/account", methods=["DELETE"])
@login_required
def auth_delete_account():
    """
    Permanently delete the authenticated user's account and associated data.
    Enforces password verification if the user has a password,
    or confirmation string (confirmation='DELETE' or confirmation=email) for OAuth-only users.
    """
    data = request.get_json(silent=True) or {}
    password = data.get("password", "")
    confirmation = (data.get("confirmation") or "").strip().upper()

    user_id = g.current_user["id"]
    email = g.current_user["email"]
    raw_user = db.get_user_by_email(email)
    stored_hash = raw_user.get("password_hash", "") if raw_user else ""
    has_existing_pw = bool(stored_hash and not stored_hash.startswith("!oauth_"))

    if has_existing_pw:
        if not password or not auth.verify_password(stored_hash, password):
            return jsonify({"error": "Incorrect password. Account deletion aborted."}), 401
    else:
        # For OAuth-only users, require explicit confirmation
        if confirmation not in ("DELETE", email.upper()):
            return jsonify({"error": "Please type 'DELETE' to confirm permanent account deletion."}), 400

    success, msg = db.delete_user(user_id)
    if not success:
        return jsonify({"error": msg}), 400

    session.clear()
    return jsonify({
        "success": True,
        "message": "Your account and all associated telemetry, keys, and projects have been permanently deleted."
    }), 200


# ---------------------------------------------------------
# Organization / Workspace Management Routes
# ---------------------------------------------------------

@app.route("/api/organizations", methods=["GET"])
@login_required
def list_organizations():
    """List all organizations/workspaces the authenticated user belongs to."""
    orgs = db.get_organizations_by_user(g.current_user["id"])
    return jsonify({"organizations": orgs}), 200


@app.route("/api/organizations", methods=["POST"])
@login_required
def create_organization_route():
    """Create a new organization workspace and set current user as owner."""
    data = request.get_json(silent=True) or {}
    name = data.get("name", "").strip()
    slug = data.get("slug", "").strip() or None
    if not name:
        return jsonify({"error": "Organization name is required"}), 400

    try:
        org = db.create_organization(g.current_user["id"], name=name, slug=slug)
    except Exception as e:
        return jsonify({"error": str(e)}), 400

    return jsonify({
        "organization": org
    }), 201


@app.route("/api/organizations/<org_id>", methods=["GET"])
@login_required
def get_organization_route(org_id):
    """Fetch details, members, and projects of an organization."""
    if not db.user_in_organization(g.current_user["id"], org_id):
        return jsonify({"error": "Forbidden: access denied to this organization"}), 403

    org = db.get_organization_by_id(org_id)
    if not org:
        return jsonify({"error": "Organization not found"}), 404

    members = db.get_organization_members(org_id)
    projects = db.get_projects_by_user(g.current_user["id"], organization_id=org_id)
    caller_role = db.get_user_role_in_organization(g.current_user["id"], org_id)

    return jsonify({
        "organization": org,
        "members": members,
        "projects": projects,
        "current_user_role": caller_role
    }), 200


@app.route("/api/organizations/<org_id>/members", methods=["GET"])
@login_required
def list_organization_members(org_id):
    if not db.user_in_organization(g.current_user["id"], org_id):
        return jsonify({"error": "Forbidden: access denied to this organization"}), 403

    members = db.get_organization_members(org_id)
    return jsonify({"members": members}), 200


@app.route("/api/organizations/<org_id>/members", methods=["POST"])
@login_required
def add_organization_member_route(org_id):
    """Add a member to the organization by email or user ID. Requires owner or admin role."""
    caller_role = db.get_user_role_in_organization(g.current_user["id"], org_id)
    if caller_role not in ("owner", "admin"):
        return jsonify({"error": "Forbidden: only organization owners and admins can invite members"}), 403

    data = request.get_json(silent=True) or {}
    email = data.get("email", "").strip()
    user_id = data.get("user_id", "").strip()
    role = data.get("role", "member").strip().lower()

    if role not in ("owner", "admin", "member", "viewer"):
        role = "member"

    target_user = None
    if user_id:
        target_user = db.get_user_by_id(user_id)
    elif email:
        target_user = db.get_user_by_email(email)

    if not target_user:
        return jsonify({"error": "User with specified email or user_id not found"}), 404

    member = db.add_organization_member(org_id, target_user["id"], role=role)
    return jsonify({
        "message": f"User {target_user['email']} added to organization as {role}",
        "member": {
            **member,
            "email": target_user["email"],
            "name": target_user.get("name")
        }
    }), 201


@app.route("/api/organizations/<org_id>/members/<member_user_id>", methods=["DELETE"])
@login_required
def remove_organization_member_route(org_id, member_user_id):
    """Remove a member from the organization."""
    caller_role = db.get_user_role_in_organization(g.current_user["id"], org_id)
    is_self = (g.current_user["id"] == member_user_id)

    if not is_self and caller_role not in ("owner", "admin"):
        return jsonify({"error": "Forbidden: insufficient permissions to remove member"}), 403

    target_role = db.get_user_role_in_organization(member_user_id, org_id)
    if not target_role:
        return jsonify({"error": "Member not found in organization"}), 404

    # Prevent removing the last owner
    if target_role == "owner":
        members = db.get_organization_members(org_id)
        owners = [m for m in members if m["role"] == "owner"]
        if len(owners) <= 1:
            return jsonify({"error": "Cannot remove the only owner of this organization"}), 400

    ok = db.remove_organization_member(org_id, member_user_id)
    return jsonify({"success": ok, "message": "Member removed from organization"}), 200


# ---------------------------------------------------------
# Project Management Routes
# ---------------------------------------------------------

@app.route("/api/projects", methods=["GET"])
@login_required
def list_projects():
    org_id = request.args.get("organization_id")
    if org_id and not db.user_in_organization(g.current_user["id"], org_id):
        return jsonify({"error": "Forbidden: access denied to this organization"}), 403
    projects = db.get_projects_by_user(g.current_user["id"], organization_id=org_id)
    return jsonify({"projects": projects}), 200


@app.route("/api/projects", methods=["POST"])
@login_required
def create_project_route():
    data = request.get_json(silent=True) or {}
    name = data.get("name", "").strip()
    if not name:
        return jsonify({"error": "Project name is required"}), 400

    description = data.get("description", "").strip()
    organization_id = data.get("organization_id")
    try:
        proj = db.create_project(
            g.current_user["id"],
            name=name,
            description=description,
            organization_id=organization_id
        )
    except PermissionError as pe:
        return jsonify({"error": str(pe)}), 403
    except ValueError as ve:
        return jsonify({"error": str(ve)}), 400

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
@app.route("/api/projects/<project_id>/credentials", methods=["GET"])
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


@app.route("/api/projects/<project_id>/keys/<int:key_id>", methods=["DELETE"])
@app.route("/api/projects/<project_id>/keys/<int:key_id>/revoke", methods=["POST"])
@login_required
def revoke_project_key(project_id, key_id):
    if not db.user_owns_project(g.current_user["id"], project_id):
        return jsonify({"error": "Forbidden: access denied"}), 403
    ok = db.revoke_api_key(key_id, project_id)
    return jsonify({"success": ok}), 200


@app.route("/api/projects/<project_id>/keys/<int:key_id>/rotate", methods=["POST"])
@login_required
def rotate_individual_project_key(project_id, key_id):
    if not db.user_owns_project(g.current_user["id"], project_id):
        return jsonify({"error": "Forbidden: access denied"}), 403
    data = request.get_json(silent=True) or {}
    name = data.get("name")
    key_info = db.rotate_single_api_key(key_id, project_id, new_name=name)
    if not key_info:
        return jsonify({"error": "Key not found"}), 404
    return jsonify({"key": key_info, "message": "API key rotated successfully"}), 201


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
@app.route("/api/projects/<project_id>/sdk/download", methods=["GET"])
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

    sdk_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "sdk"))
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
try:
    from security_sdk import SecurityMiddleware
except ImportError:
    from middleware import SecurityMiddleware
import config

app = Flask(__name__)

# Attach zero-latency security observability middleware:
SecurityMiddleware(
    app,
    collector_url=config.COLLECTOR_URL,
    api_key=config.SDK_KEY,
    app_name="{proj['name']}"
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

    fastapi_example_code = f"""\"\"\"
Sample integration of ML-O11Y Security SDK into your FastAPI application.
\"\"\"
from fastapi import FastAPI
from security_sdk.fastapi import SecurityMiddleware
import config

app = FastAPI(title="{proj['name']}")

# Attach zero-latency ASGI security observability middleware:
app.add_middleware(
    SecurityMiddleware,
    collector_url=config.COLLECTOR_URL,
    api_key=config.SDK_KEY,
    app_name="{proj['name']}"
)

@app.get("/")
def index():
    return {{"status": "online", "message": "FastAPI is protected by ML-O11Y!"}}

@app.get("/api/data")
def get_data():
    return {{"data": [1, 2, 3]}}

if __name__ == "__main__":
    import uvicorn
    print(f"Server starting. Telemetry forwarding to {{config.COLLECTOR_URL}}...")
    uvicorn.run(app, port=5002)
"""

    readme_code = f"""# 🛡️ ML-O11Y Security SDK

Preconfigured SDK for project: **{proj['name']}** (`{proj['id']}`)

## Quickstart

### Option A: Install Package via pip (Recommended)
```bash
pip install .
```
Then in your application:

**Flask:**
```python
from flask import Flask
from security_sdk import SecurityMiddleware
import config

app = Flask(__name__)
SecurityMiddleware(app, collector_url=config.COLLECTOR_URL, api_key=config.SDK_KEY)
```

**FastAPI:**
```python
from fastapi import FastAPI
from security_sdk.fastapi import SecurityMiddleware
import config

app = FastAPI()
app.add_middleware(SecurityMiddleware, collector_url=config.COLLECTOR_URL, api_key=config.SDK_KEY)
```

### Option B: Zero-Hardcoding via Environment Variables
```bash
export SECURITY_SDK_API_KEY="{raw_key}"
export SECURITY_SDK_COLLECTOR_URL="{collector_url}"
```
Then simply:
```python
from security_sdk import SecurityMiddleware

app = Flask(__name__)
SecurityMiddleware(app)
```
"""

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        if os.path.exists(sdk_dir):
            for root, dirs, files in os.walk(sdk_dir):
                if any(x in root for x in ("__pycache__", ".egg-info", "build", "dist")):
                    continue
                for f in files:
                    full_p = os.path.join(root, f)
                    rel_p = os.path.relpath(full_p, sdk_dir)
                    if f not in ("sample_app.py", "sample_fastapi.py", "config.py", "README.md"):
                        z.write(full_p, arcname=rel_p)

        z.writestr("config.py", config_code)
        z.writestr("sample_app.py", example_code)
        z.writestr("sample_fastapi.py", fastapi_example_code)
        z.writestr("README.md", readme_code)
    buf.seek(0)

    zip_filename = f"mlo11y-sdk-{proj['id']}.zip"
    return send_file(
        buf,
        mimetype="application/zip",
        as_attachment=True,
        download_name=zip_filename
    )


# ---------------------------------------------------------
# Guided Developer Onboarding Routes
# ---------------------------------------------------------

@app.route("/api/projects/<project_id>/onboarding", methods=["GET"])
@login_required
def get_project_onboarding(project_id):
    """Fetch current onboarding state, active credentials summary, and telemetry status."""
    if not db.user_owns_project(g.current_user["id"], project_id):
        return jsonify({"error": "Forbidden: access denied"}), 403

    proj = db.get_project_by_id(project_id)
    if not proj:
        return jsonify({"error": "Project not found"}), 404

    onboarding = db.get_or_create_onboarding(project_id)
    event_count = db.get_all_events_count(project_id)

    # Auto-complete step 7 if telemetry already exists
    if event_count > 0 and not onboarding.get("first_telemetry_at"):
        db.record_first_telemetry_onboarding(project_id)
        onboarding = db.get_or_create_onboarding(project_id)

    # Fetch active key prefix
    keys = db.list_api_keys_for_project(project_id)
    active_key_prefix = keys[0]["key_prefix"] if keys else None

    # Host collector URL
    collector_url = request.host_url.rstrip("/") + "/ingest"

    return jsonify({
        "project": {
            "id": proj["id"],
            "name": proj["name"],
        },
        "onboarding": onboarding,
        "event_count": event_count,
        "telemetry_received": (event_count > 0) or (onboarding.get("first_telemetry_at") is not None),
        "first_telemetry_at": onboarding.get("first_telemetry_at"),
        "key_prefix": active_key_prefix,
        "collector_url": collector_url,
    }), 200


@app.route("/api/projects/<project_id>/onboarding", methods=["POST"])
@login_required
def update_project_onboarding(project_id):
    """Update onboarding step, framework, or completion status."""
    if not db.user_owns_project(g.current_user["id"], project_id):
        return jsonify({"error": "Forbidden: access denied"}), 403

    data = request.get_json(silent=True) or {}
    current_step = data.get("current_step")
    completed_step = data.get("completed_step")
    framework = data.get("framework")
    status = data.get("status")

    updated = db.update_onboarding_progress(
        project_id,
        current_step=current_step,
        completed_step=completed_step,
        framework=framework,
        status=status
    )
    return jsonify({"onboarding": updated}), 200


@app.route("/api/projects/<project_id>/onboarding/test-event", methods=["POST"])
@login_required
def send_onboarding_test_event(project_id):
    """
    Emits a synthetic live verification event for the onboarding wizard,
    immediately proving that the telemetry ingestion and socket pipeline works.
    """
    if not db.user_owns_project(g.current_user["id"], project_id):
        return jsonify({"error": "Forbidden: access denied"}), 403

    proj = db.get_project_by_id(project_id)
    if not proj:
        return jsonify({"error": "Project not found"}), 404

    test_event = {
        "timestamp": time.time(),
        "endpoint": "/api/v1/health",
        "method": "GET",
        "status_code": 200,
        "latency_ms": 14.5,
        "ip": request.remote_addr or "127.0.0.1",
        "user_id": f"dev_test_{uuid.uuid4().hex[:6]}",
        "payload_size": 128,
        "project_id": project_id,
        "tenant_id": project_id,
    }

    scored_event = detection.score_event(test_event)
    event_id = db.insert_event(scored_event)
    scored_event["id"] = event_id

    # Record first telemetry in onboarding
    db.record_first_telemetry_onboarding(project_id)

    # Broadcast via WebSocket
    room_name = f"project_{project_id}"
    socketio.emit(f"new_event_{project_id}", scored_event, room=room_name)
    socketio.emit("new_event", scored_event, room=room_name)
    socketio.emit(f"onboarding_telemetry_{project_id}", {
        "status": "received",
        "project_id": project_id,
        "event": scored_event
    }, room=room_name)

    return jsonify({
        "success": True,
        "message": "Live test telemetry event processed successfully",
        "event": scored_event
    }), 201


@app.route("/api/projects/<project_id>/webhooks", methods=["GET", "POST", "DELETE"])
@login_required
def project_webhooks(project_id):
    if not db.user_owns_project(g.current_user["id"], project_id):
        return jsonify({"error": "Forbidden: access denied"}), 403

    provider = request.args.get("provider")

    if request.method == "DELETE":
        ok = db.delete_webhook_config(project_id, provider=provider)
        return jsonify({"success": ok, "message": "Webhook removed successfully"}), 200

    if request.method == "POST":
        data = request.get_json(silent=True) or {}
        webhook_url = data.get("webhook_url", "").strip()
        prov = (data.get("provider") or provider or "slack").strip().lower()
        enabled = data.get("enabled", True)

        adapter = notification_service.get_provider(prov)
        is_valid, err_msg = adapter.validate_url(webhook_url)
        if not is_valid:
            return jsonify({"error": err_msg or "Invalid webhook URL format. Must start with http:// or https://"}), 400

        cfg = db.set_webhook_config(project_id, webhook_url=webhook_url, provider=adapter.provider_id, enabled=enabled)
        return jsonify({"webhook": cfg, "message": f"{adapter.display_name} configuration saved successfully"}), 200

    # GET returns masked config — never leaks raw secret
    single_cfg = db.get_webhook_config(project_id, provider=provider, raw=False)
    all_cfgs = db.list_webhook_configs(project_id, raw=False)
    return jsonify({
        "webhook": single_cfg,
        "webhooks": all_cfgs
    }), 200


@app.route("/api/projects/<project_id>/webhooks/<provider>", methods=["DELETE"])
@login_required
def delete_project_webhook_by_provider(project_id, provider):
    if not db.user_owns_project(g.current_user["id"], project_id):
        return jsonify({"error": "Forbidden: access denied"}), 403

    ok = db.delete_webhook_config(project_id, provider=provider)
    return jsonify({"success": ok, "message": f"{provider.capitalize()} webhook removed successfully"}), 200


@app.route("/api/projects/<project_id>/webhooks/toggle", methods=["POST"])
@login_required
def toggle_project_webhook(project_id):
    if not db.user_owns_project(g.current_user["id"], project_id):
        return jsonify({"error": "Forbidden: access denied"}), 403

    data = request.get_json(silent=True) or {}
    enabled = bool(data.get("enabled", True))
    provider = data.get("provider") or request.args.get("provider")
    cfg = db.toggle_webhook_enabled(project_id, enabled, provider=provider)
    return jsonify({"webhook": cfg, "message": f"Webhook {'enabled' if enabled else 'disabled'}"}), 200


@app.route("/api/projects/<project_id>/webhooks/test", methods=["POST"])
@login_required
def test_project_webhook(project_id):
    if not db.user_owns_project(g.current_user["id"], project_id):
        return jsonify({"error": "Forbidden: access denied"}), 403

    proj = db.get_project_by_id(project_id)
    project_name = proj.get("name", "Project") if proj else "Project"
    data = request.get_json(silent=True) or {}
    provider = data.get("provider") or request.args.get("provider")
    url_to_test = data.get("webhook_url", "").strip()

    if not url_to_test:
        raw_cfg = db.get_webhook_config(project_id, provider=provider, raw=True)
        if not raw_cfg or not raw_cfg.get("webhook_url"):
            return jsonify({"error": "No webhook configured for this project"}), 400
        url_to_test = raw_cfg["webhook_url"]
        provider = raw_cfg.get("provider", provider or "slack")

    success, msg = notification_service.test_connection(url_to_test, project_name=project_name, provider_id=provider)
    if success:
        return jsonify({"success": True, "message": msg}), 200
    else:
        return jsonify({"success": False, "error": msg}), 400


# ---------------------------------------------------------
# Integration Service & Status Endpoints
# ---------------------------------------------------------

@app.route("/api/projects/<project_id>/integrations/status", methods=["GET"])
@login_required
def get_project_integrations_status(project_id):
    """Return health/status indicators for Slack, Discord, Gemini, and SDK without leaking secrets."""
    if not db.user_owns_project(g.current_user["id"], project_id):
        return jsonify({"error": "Forbidden: access denied"}), 403

    status = notification_service.get_project_integration_status(project_id)
    return jsonify(status), 200


@app.route("/api/projects/<project_id>/integrations", methods=["GET"])
@login_required
def list_project_integrations(project_id):
    """List all configured integrations for a project with masked URLs."""
    if not db.user_owns_project(g.current_user["id"], project_id):
        return jsonify({"error": "Forbidden: access denied"}), 403

    configs = db.list_webhook_configs(project_id, raw=False)
    return jsonify({"integrations": configs}), 200


@app.route("/api/projects/<project_id>/integrations/<provider>", methods=["POST"])
@login_required
def configure_provider_integration(project_id, provider):
    """Connect or update integration configuration for a specific provider."""
    if not db.user_owns_project(g.current_user["id"], project_id):
        return jsonify({"error": "Forbidden: access denied"}), 403

    data = request.get_json(silent=True) or {}
    webhook_url = data.get("webhook_url", "").strip()
    enabled = data.get("enabled", True)

    adapter = notification_service.get_provider(provider)
    is_valid, err_msg = adapter.validate_url(webhook_url)
    if not is_valid:
        return jsonify({"error": err_msg or "Invalid webhook URL format"}), 400

    cfg = db.set_webhook_config(project_id, webhook_url=webhook_url, provider=adapter.provider_id, enabled=enabled)
    return jsonify({
        "integration": cfg,
        "message": f"{adapter.display_name} integration connected successfully"
    }), 200


@app.route("/api/projects/<project_id>/integrations/<provider>/test", methods=["POST"])
@login_required
def test_provider_integration_route(project_id, provider):
    """Send test notification payload to verify connection."""
    if not db.user_owns_project(g.current_user["id"], project_id):
        return jsonify({"error": "Forbidden: access denied"}), 403

    proj = db.get_project_by_id(project_id)
    data = request.get_json(silent=True) or {}
    url_to_test = data.get("webhook_url", "").strip()

    if not url_to_test:
        raw_cfg = db.get_webhook_config(project_id, provider=provider, raw=True)
        if not raw_cfg or not raw_cfg.get("webhook_url"):
            return jsonify({"error": f"No {provider} webhook configured for this project"}), 400
        url_to_test = raw_cfg["webhook_url"]

    success, msg = notification_service.test_connection(url_to_test, project_name=proj.get("name", "Project"), provider_id=provider)
    if success:
        return jsonify({"success": True, "message": msg}), 200
    return jsonify({"success": False, "error": msg}), 400


@app.route("/api/projects/<project_id>/integrations/<provider>/toggle", methods=["POST"])
@login_required
def toggle_provider_integration_route(project_id, provider):
    """Toggle enabled/disabled status for an integration."""
    if not db.user_owns_project(g.current_user["id"], project_id):
        return jsonify({"error": "Forbidden: access denied"}), 403

    data = request.get_json(silent=True) or {}
    enabled = bool(data.get("enabled", True))
    cfg = db.toggle_webhook_enabled(project_id, enabled, provider=provider)
    return jsonify({
        "integration": cfg,
        "message": f"{provider.capitalize()} notifications {'enabled' if enabled else 'disabled'}"
    }), 200


@app.route("/api/projects/<project_id>/integrations/<provider>", methods=["DELETE"])
@login_required
def delete_provider_integration_route(project_id, provider):
    """Disconnect and delete integration configuration for a provider."""
    if not db.user_owns_project(g.current_user["id"], project_id):
        return jsonify({"error": "Forbidden: access denied"}), 403

    ok = db.delete_webhook_config(project_id, provider=provider)
    return jsonify({"success": ok, "message": f"{provider.capitalize()} integration removed successfully"}), 200


# ---------------------------------------------------------
# Telemetry Ingestion (Called by SDK via Bearer API Key)
# ---------------------------------------------------------

@app.route("/ingest", methods=["POST"])
def ingest():
    # 1. Prevent oversized payloads (64KB max)
    content_len = request.content_length
    if content_len and content_len > ingestion.MAX_PAYLOAD_BYTES:
        return jsonify({
            "error": "Payload Too Large",
            "message": f"Telemetry request size ({content_len} bytes) exceeds maximum limit of {ingestion.MAX_PAYLOAD_BYTES} bytes"
        }), 413

    # 2. Authenticate SDK credentials & resolve project_id
    project = _get_project_from_auth()
    if not project:
        return jsonify({"error": "Unauthorized", "message": "Missing, invalid, or revoked Bearer API token"}), 401

    project_id = project["id"]

    # 3. Rate-limit SDK clients & absorb bursts (Token Bucket)
    allowed, retry_after = ingestion.ingestion_rate_limiter.check_limit(project_id)
    if not allowed:
        resp = jsonify({
            "error": "Too Many Requests",
            "message": f"Telemetry ingestion rate limit exceeded for project {project_id}",
            "retry_after": retry_after
        })
        resp.status_code = 429
        resp.headers["Retry-After"] = str(retry_after)
        return resp

    # 4. Parse JSON payload
    try:
        raw_payload = request.get_json(silent=True)
    except Exception:
        raw_payload = None

    if raw_payload is None or not isinstance(raw_payload, dict):
        return jsonify({"error": "Bad Request", "message": "Invalid or missing JSON object in request body"}), 400

    # 5. Schema Validation & Data Loss Prevention (Redaction & Field Whitelisting)
    remote_ip = request.headers.get("X-Forwarded-For", request.remote_addr)
    if remote_ip and "," in remote_ip:
        remote_ip = remote_ip.split(",")[0].strip()

    is_valid, err_msg, event = ingestion.validate_and_sanitize_event(
        raw_payload,
        project_id=project_id,
        remote_addr=remote_ip
    )
    if not is_valid:
        return jsonify({"error": "Bad Request", "message": err_msg}), 400

    # 6. Replay & Duplicate Event Detection (Sliding Window LRU + TTL)
    dedup_fingerprint = f"{project_id}:{event['event_id']}"
    if ingestion.dedup_cache.is_duplicate(dedup_fingerprint):
        return jsonify({
            "status": "duplicate_ignored",
            "message": "Telemetry event already processed",
            "event_id": event["event_id"]
        }), 202

    # 7. Safe Execution Pipeline — Never Expose Internal Server Errors
    try:
        # Check rate limiter — block abusive end-user IPs for this project
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
        try:
            socketio.emit(f'new_event_{project_id}', scored_event, room=room_name)
            socketio.emit('new_event', scored_event, room=room_name)
            socketio.emit(f'onboarding_telemetry_{project_id}', {
                "status": "received",
                "project_id": project_id,
                "event": scored_event
            }, room=room_name)
        except Exception as ws_err:
            # WebSocket failure must never fail ingestion
            pass

        # If it's an alert (medium or high) and NOT suppressed by cooldown, dispatch alert notifications
        if scored_event.get("severity") in ("medium", "high") and not scored_event.get("alert_suppressed"):
            try:
                socketio.emit(f'new_alert_{project_id}', scored_event, room=room_name)
                socketio.emit('new_alert', scored_event, room=room_name)
            except Exception as ws_alert_err:
                pass

            # Dispatch automated alerts across all active project integrations via NotificationService
            try:
                notification_service.dispatch_project_alerts(scored_event, project_id=project_id, sender_fn=webhook.send_alert)
            except Exception as hook_err:
                # External notification failures must never impede detection
                pass

        return jsonify(scored_event), 201

    except Exception:
        # Never expose internal errors or tracebacks
        return jsonify({"error": "Internal server error"}), 500


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
    try:
        return jsonify(db.get_historical_stats(project_id))
    except Exception as e:
        logger.error(f"Error handling /history for project {project_id}: {e}", exc_info=True)
        return jsonify({"top_endpoints": [], "top_ips": [], "timeline": []})


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
    report = investigator.generate_threat_report(alert_id, user_id=g.current_user["id"])
    return jsonify({"report": report})


@app.route("/api/alerts/<int:alert_id>/report", methods=["GET"])
@app.route("/api/alerts/<int:alert_id>/report.pdf", methods=["GET"])
@login_required
def get_alert_report(alert_id):
    """
    Dedicated endpoint to fetch executive threat reports (markdown / pdf payload).
    Strictly verifies project authorization to prevent cross-tenant IDOR attacks.
    """
    event = db.get_event_by_id(alert_id)
    if not event:
        return jsonify({"error": "Alert not found"}), 404

    event_proj = event.get("project_id") or event.get("tenant_id")
    if not db.user_has_project_access(g.current_user["id"], event_proj):
        return jsonify({"error": "Forbidden: access denied to this report"}), 403

    import investigator
    report = investigator.generate_threat_report(alert_id, user_id=g.current_user["id"])

    # If requested for download or with Accept: application/pdf, compile and serve as real application/pdf binary
    if request.args.get("download") == "1" or request.headers.get("Accept") == "application/pdf":
        try:
            from reportlab.lib.pagesizes import letter
            from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, HRFlowable
            from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
            from reportlab.lib import colors

            buf = io.BytesIO()
            doc = SimpleDocTemplate(buf, pagesize=letter, rightMargin=54, leftMargin=54, topMargin=54, bottomMargin=54)
            styles = getSampleStyleSheet()

            title_style = ParagraphStyle(
                'ReportTitle',
                parent=styles['Heading1'],
                fontSize=18,
                leading=22,
                textColor=colors.HexColor('#0f172a'),
                spaceAfter=10
            )
            meta_style = ParagraphStyle(
                'ReportMeta',
                parent=styles['Normal'],
                fontSize=9,
                leading=13,
                textColor=colors.HexColor('#475569')
            )
            body_style = ParagraphStyle(
                'ReportBody',
                parent=styles['Normal'],
                fontSize=10,
                leading=14,
                textColor=colors.HexColor('#1e293b')
            )
            heading_style = ParagraphStyle(
                'ReportH2',
                parent=styles['Heading2'],
                fontSize=12,
                leading=16,
                textColor=colors.HexColor('#0284c7'),
                spaceBefore=12,
                spaceAfter=5
            )

            story = []
            story.append(Paragraph("API-Security-Analytics-Dashboard — Threat Intelligence Report", title_style))
            story.append(Paragraph(f"<b>Alert ID:</b> #{alert_id} &nbsp;|&nbsp; <b>Project:</b> {event_proj} &nbsp;|&nbsp; <b>Generated:</b> {time.strftime('%Y-%m-%d %H:%M:%S UTC', time.gmtime())}", meta_style))
            story.append(Spacer(1, 8))
            story.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor('#cbd5e1'), spaceAfter=12))

            for line in report.split('\n'):
                clean = line.strip()
                if not clean or clean.startswith('# '):
                    continue
                if clean.startswith('### ') or clean.startswith('## '):
                    hdr = clean.lstrip('#').strip()
                    story.append(Paragraph(f"<b>{hdr}</b>", heading_style))
                elif clean.startswith('---'):
                    story.append(HRFlowable(width="100%", thickness=0.5, color=colors.HexColor('#e2e8f0'), spaceAfter=6, spaceBefore=6))
                else:
                    # Sanitize HTML tags for ReportLab Paragraph
                    formatted = clean.replace('&', '&amp;')
                    story.append(Paragraph(formatted, body_style))
                    story.append(Spacer(1, 3))

            doc.build(story)
            buf.seek(0)
            return send_file(
                buf,
                mimetype='application/pdf',
                as_attachment=True,
                download_name=f"threat-report-alert-{alert_id}.pdf"
            )
        except Exception as pdf_err:
            logger.warning(f"PDF generation error: {pdf_err}")

    return jsonify({
        "alert_id": alert_id,
        "project_id": event_proj,
        "report": report,
        "pdf_url": f"/api/alerts/{alert_id}/report.pdf?download=1"
    }), 200


if __name__ == "__main__":
    db.init_db()
    print(f"Collector starting. Token: {API_TOKEN}")
    socketio.run(app, host="0.0.0.0", port=5001, debug=False)

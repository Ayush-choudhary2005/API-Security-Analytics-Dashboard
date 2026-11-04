"""
gunicorn_config.py — Production WSGI Configuration for Flask & Flask-SocketIO.
"""

import os
import sys
import multiprocessing

# Working directory and path resolution: ensure backend modules resolve
# regardless of whether gunicorn is launched from repository root or backend/
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
BACKEND_DIR = os.path.join(BASE_DIR, "backend") if os.path.exists(os.path.join(BASE_DIR, "backend")) else BASE_DIR

if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

chdir = BACKEND_DIR
pythonpath = BACKEND_DIR

# Network binding
bind = f"0.0.0.0:{os.environ.get('PORT', '5001')}"

# Worker processes & threading
# Flask-SocketIO with simple-websocket uses standard gthread worker.
# workers is kept at 1 to preserve WebSocket room state without Redis.
workers = 1
worker_class = os.environ.get("GUNICORN_WORKER_CLASS", "gthread")
threads = int(os.environ.get("GUNICORN_THREADS", 8))
worker_connections = 1000

# Timeouts & Request Lifetime
timeout = int(os.environ.get("GUNICORN_TIMEOUT", 120))
keepalive = 5
max_requests = 10000
max_requests_jitter = 500

# Security: Limit maximum request line & header sizes
limit_request_line = 4094
limit_request_fields = 100
limit_request_field_size = 8190

# Logging
accesslog = "-"
errorlog = "-"
loglevel = os.environ.get("LOG_LEVEL", "info").lower()
capture_output = True


# ── Server Lifecycle Hooks ───────────────────────────────────────────
def on_starting(server):
    """
    Execute database migrations on Gunicorn master startup
    before worker threads begin accepting traffic.
    Guarantees all tables, columns, and indexes exist.
    """
    try:
        import db
        db.init_db()
        server.log.info("[Boot] Database schema verified and migrations applied successfully.")
    except Exception as e:
        server.log.error(f"[Boot] Error running database migrations on startup: {e}")

"""
gunicorn_config.py — Production WSGI Configuration for Flask & Flask-SocketIO.
"""

import os
import multiprocessing

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

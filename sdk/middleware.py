"""
middleware.py — ML-O11Y Security SDK

Zero-latency API observability middleware for Flask applications.
Hooks into Flask request lifecycle, captures telemetry metrics, and forwards
them asynchronously in background threads to the security collector.

Usage 1 (Class-based):
    from middleware import SecurityMiddleware
    app = Flask(__name__)
    SecurityMiddleware(app, collector_url="http://localhost:5001", api_key="ask_...")

Usage 2 (Functional):
    from middleware import observe
    app = Flask(__name__)
    observe(app, collector_url="http://localhost:5001", token="ask_...")
"""

import time
import threading
import requests

from flask import request, g


def observe(app, collector_url: str, token: str = None, api_key: str = None, app_name: str = "app", timeout: float = 1.0):
    """
    Attach observability middleware to a Flask app.

    app            - the Flask app instance
    collector_url  - base URL of the collector, e.g. http://localhost:5001
    token/api_key  - project-specific SDK credential configured on the collector
    app_name       - optional label for this app
    timeout        - HTTP timeout (seconds) for the fire-and-forget send
    """
    credential = api_key or token
    if not credential:
        raise ValueError("ML-O11Y SDK requires an api_key or token.")

    ingest_url = collector_url.rstrip("/") + "/ingest"
    headers = {
        "Authorization": f"Bearer {credential}",
        "X-API-Key": credential,
        "Content-Type": "application/json",
    }

    @app.before_request
    def _start_timer():
        g._o11y_start = time.time()

    @app.after_request
    def _capture_and_send(response):
        try:
            start = getattr(g, "_o11y_start", time.time())
            latency_ms = (time.time() - start) * 1000

            # Prefer X-Forwarded-For proxy header, falling back to direct connection IP
            client_ip = request.headers.get("X-Forwarded-For", "").split(",")[0].strip()
            client_ip = client_ip or request.remote_addr or "unknown"

            event = {
                "timestamp": time.time(),
                "endpoint": request.path,
                "method": request.method,
                "status_code": response.status_code,
                "latency_ms": round(latency_ms, 2),
                "ip": client_ip,
                "user_id": request.headers.get("X-User-Id"),
                "payload_size": request.content_length or 0,
            }

            # Fire-and-forget in a background daemon thread so telemetry capture
            # never adds latency to the host application response.
            threading.Thread(
                target=_send, args=(ingest_url, headers, event, timeout), daemon=True
            ).start()
        except Exception:
            # Telemetry capture must never interrupt or break the host app
            pass
        return response

    return app


class SecurityMiddleware:
    """
    Class-based interface for attaching ML-O11Y observability to a Flask app.

    Usage:
        SecurityMiddleware(app, collector_url="http://localhost:5001", api_key="ask_...")
    """
    def __init__(self, app=None, collector_url: str = "http://localhost:5001", api_key: str = None, token: str = None, app_name: str = "app", timeout: float = 1.0):
        self.collector_url = collector_url
        self.api_key = api_key or token
        self.app_name = app_name
        self.timeout = timeout
        if app is not None:
            self.init_app(app)

    def init_app(self, app):
        return observe(
            app,
            collector_url=self.collector_url,
            token=self.api_key,
            app_name=self.app_name,
            timeout=self.timeout
        )


def _send(url, headers, event, timeout):
    try:
        requests.post(url, json=event, headers=headers, timeout=timeout)
    except requests.RequestException:
        # Collector unreachable - drop event silently to protect host app
        pass

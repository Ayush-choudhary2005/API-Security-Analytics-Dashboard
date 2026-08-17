"""
middleware.py — ML-O11Y SDK (Phase 1)

This is the piece a developer installs inside their own Flask app.
Integration is meant to take <=5 lines:

    from ml_o11y_sdk import observe
    app = Flask(__name__)
    observe(app, collector_url="http://localhost:5001", token="phase1-demo-token")

It hooks into Flask's before_request/after_request lifecycle, captures
telemetry for every request, and POSTs it to the collector's /ingest
endpoint. Sending is fire-and-forget (best-effort) so a slow or down
collector never breaks the host app.
"""

import time
import threading
import requests

from flask import request, g


def observe(app, collector_url: str, token: str, app_name: str = "app", timeout: float = 1.0):
    """
    Attach observability middleware to a Flask app.

    app            - the Flask app instance
    collector_url  - base URL of the collector, e.g. http://localhost:5001
    token          - bearer token configured on the collector
    app_name       - optional label for this app (not yet used server-side
                      in Phase 1 - reserved for Phase 2 tenant isolation)
    timeout        - HTTP timeout (seconds) for the fire-and-forget send
    """
    ingest_url = collector_url.rstrip("/") + "/ingest"
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

    @app.before_request
    def _start_timer():
        g._o11y_start = time.time()

    @app.after_request
    def _capture_and_send(response):
        try:
            start = getattr(g, "_o11y_start", time.time())
            latency_ms = (time.time() - start) * 1000

            # Prefer X-Forwarded-For (real-world proxy header, and also how
            # our demo generators simulate distinct attacker IPs locally)
            # and fall back to the direct connection IP.
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

            # Fire-and-forget in a background thread so telemetry capture
            # never adds latency to the actual API response.
            threading.Thread(
                target=_send, args=(ingest_url, headers, event, timeout), daemon=True
            ).start()
        except Exception:
            # Telemetry must never break the host app.
            pass
        return response

    return app


def _send(url, headers, event, timeout):
    try:
        requests.post(url, json=event, headers=headers, timeout=timeout)
    except requests.RequestException:
        # Collector down/unreachable - drop the event silently for Phase 1.
        # (A local retry buffer is a reasonable Phase 2 addition.)
        pass

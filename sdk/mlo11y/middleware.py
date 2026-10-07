"""
middleware.py — Zero-latency Flask Security Middleware for ML-O11Y.

Hooks into Flask request lifecycle:
- High-precision latency measurement (time.perf_counter)
- Client IP resolution (proxies, Cloudflare, load balancers)
- Response status code & auth failure tracking (401/403)
- User identity tracking
- Non-blocking background telemetry forwarding
- Complete failure isolation (never crashes the host app)
"""

import time
from typing import Optional, Any

from flask import request, g, Flask, Response

from .config import SecurityConfig
from .transport import TelemetryTransport


def _extract_client_ip(req) -> str:
    """
    Safely extract real client IP behind reverse proxies, CDNs, or load balancers.
    """
    try:
        # 1. Standard proxy header (X-Forwarded-For: client, proxy1, proxy2)
        xff = req.headers.get("X-Forwarded-For")
        if xff:
            first_ip = xff.split(",")[0].strip()
            if first_ip:
                return first_ip

        # 2. Cloudflare Connecting IP
        cf_ip = req.headers.get("CF-Connecting-IP")
        if cf_ip and cf_ip.strip():
            return cf_ip.strip()

        # 3. Nginx / reverse proxy X-Real-IP
        x_real = req.headers.get("X-Real-IP")
        if x_real and x_real.strip():
            return x_real.strip()

        # 4. Direct socket address fallback
        if req.remote_addr:
            return req.remote_addr.strip()
    except Exception:
        pass

    return "127.0.0.1"


def _extract_user_id(req, config: SecurityConfig) -> Optional[str]:
    """
    Extract user identity if available (headers, Flask g context, or custom callback).
    """
    try:
        if config.user_id_callback:
            uid = config.user_id_callback(req)
            if uid:
                return str(uid)

        # Common headers
        uid_header = req.headers.get("X-User-Id") or req.headers.get("X-User-ID")
        if uid_header:
            return str(uid_header).strip()

        # Flask global context conventions
        g_uid = getattr(g, "user_id", None)
        if g_uid:
            return str(g_uid)

        curr_user = getattr(g, "current_user", None)
        if curr_user:
            if hasattr(curr_user, "get_id"):
                return str(curr_user.get_id())
            if hasattr(curr_user, "id"):
                return str(curr_user.id)
            if isinstance(curr_user, dict) and "id" in curr_user:
                return str(curr_user["id"])
    except Exception:
        pass

    return None


class SecurityMiddleware:
    """
    Zero-latency API Security Observability Middleware for Flask.

    Usage:
        from security_sdk import SecurityMiddleware
        app = Flask(__name__)
        SecurityMiddleware(app, api_key="ask_...")
    """

    def __init__(self, app: Optional[Flask] = None, **kwargs):
        self.config = SecurityConfig(**kwargs)
        self.transport = TelemetryTransport(self.config)
        if app is not None:
            self.init_app(app)

    def init_app(self, app: Flask):
        """Register hooks on a Flask application instance."""
        if not self.config.enabled:
            return app

        @app.before_request
        def _mlo11y_before_request():
            try:
                g._mlo11y_start = time.perf_counter()
            except Exception:
                pass

        @app.after_request
        def _mlo11y_after_request(response: Response):
            try:
                # Calculate high precision latency
                start_time = getattr(g, "_mlo11y_start", None)
                if start_time is not None:
                    latency_ms = (time.perf_counter() - start_time) * 1000.0
                else:
                    latency_ms = 0.0

                # Extract request metadata
                client_ip = _extract_client_ip(request)
                user_id = _extract_user_id(request, self.config)

                payload_size = 0
                try:
                    payload_size = request.content_length or 0
                except Exception:
                    pass

                # Build security event payload
                event = {
                    "timestamp": time.time(),
                    "endpoint": request.path,
                    "method": request.method,
                    "status_code": response.status_code,
                    "latency_ms": round(latency_ms, 2),
                    "ip": client_ip,
                    "user_id": user_id,
                    "payload_size": payload_size,
                }

                # Push to asynchronous queue (sub-millisecond, never blocks response)
                self.transport.enqueue(event)
            except Exception:
                # Security telemetry must NEVER crash or alter host application response
                pass

            return response

        return app


def observe(app: Flask, **kwargs) -> Flask:
    """
    Functional convenience wrapper to attach observability to a Flask app in one line.

    Example:
        app = Flask(__name__)
        observe(app, api_key="ask_...")
    """
    SecurityMiddleware(app, **kwargs)
    return app

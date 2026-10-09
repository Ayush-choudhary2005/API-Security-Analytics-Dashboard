"""
django.py — Zero-latency Django WSGI Security Middleware for ML-O11Y.
"""

import time
from .config import SecurityConfig
from .transport import TelemetryTransport


class SecurityMiddleware:
    """
    Django middleware for ML-O11Y telemetry forwarding.

    Usage in settings.py:
        MIDDLEWARE = [
            'security_sdk.django.SecurityMiddleware',
            ...
        ]
        SECURITY_SDK_API_KEY = "ask_..."
        SECURITY_SDK_COLLECTOR_URL = "https://..."
    """

    def __init__(self, get_response):
        self.get_response = get_response
        self.config = SecurityConfig()
        self.transport = TelemetryTransport(self.config)

    def __call__(self, request):
        start_time = time.perf_counter()
        response = self.get_response(request)
        latency_ms = (time.perf_counter() - start_time) * 1000.0

        try:
            status_code = getattr(response, "status_code", 200)
            endpoint = getattr(request, "path", "/")
            method = getattr(request, "method", "GET")

            client_ip = "127.0.0.1"
            meta = getattr(request, "META", {})
            xff = meta.get("HTTP_X_FORWARDED_FOR")
            if xff:
                client_ip = xff.split(",")[0].strip()
            elif meta.get("HTTP_CF_CONNECTING_IP"):
                client_ip = meta.get("HTTP_CF_CONNECTING_IP").strip()
            elif meta.get("HTTP_X_REAL_IP"):
                client_ip = meta.get("HTTP_X_REAL_IP").strip()
            elif meta.get("REMOTE_ADDR"):
                client_ip = meta.get("REMOTE_ADDR").strip()

            self.transport.send(
                endpoint=endpoint,
                method=method,
                status_code=status_code,
                latency_ms=round(latency_ms, 2),
                ip=client_ip
            )
        except Exception:
            pass

        return response

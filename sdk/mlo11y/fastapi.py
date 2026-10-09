"""
fastapi.py — Zero-latency FastAPI & Starlette ASGI Security Middleware for ML-O11Y.
"""

import time
from typing import Optional, Any
from .config import SecurityConfig
from .transport import TelemetryTransport


class SecurityMiddleware:
    """
    FastAPI / Starlette ASGI middleware for ML-O11Y.

    Usage:
        from fastapi import FastAPI
        from security_sdk.fastapi import SecurityMiddleware

        app = FastAPI()
        app.add_middleware(SecurityMiddleware, api_key="ask_...", collector_url="https://...")
    """

    def __init__(self, app, **kwargs):
        self.app = app
        self.config = SecurityConfig(**kwargs)
        self.transport = TelemetryTransport(self.config)

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        start_time = time.perf_counter()
        status_code = 500

        async def send_wrapper(message):
            nonlocal status_code
            if message["type"] == "http.response.start":
                status_code = message.get("status", 200)
            await send(message)

        try:
            await self.app(scope, receive, send_wrapper)
        finally:
            try:
                latency_ms = (time.perf_counter() - start_time) * 1000.0
                endpoint = scope.get("path", "/")
                method = scope.get("method", "GET")

                client_ip = "127.0.0.1"
                client = scope.get("client")
                if client and len(client) > 0:
                    client_ip = client[0]

                headers = dict(scope.get("headers", []))
                for key, val in headers.items():
                    k_str = key.decode("latin1").lower() if isinstance(key, bytes) else str(key).lower()
                    if k_str == "x-forwarded-for":
                        v_str = val.decode("latin1") if isinstance(val, bytes) else str(val)
                        client_ip = v_str.split(",")[0].strip()
                        break
                    elif k_str in ("cf-connecting-ip", "x-real-ip"):
                        v_str = val.decode("latin1") if isinstance(val, bytes) else str(val)
                        client_ip = v_str.strip()
                        break

                self.transport.send(
                    endpoint=endpoint,
                    method=method,
                    status_code=status_code,
                    latency_ms=round(latency_ms, 2),
                    ip=client_ip
                )
            except Exception:
                pass

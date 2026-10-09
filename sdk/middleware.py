"""
middleware.py — ML-O11Y Security & Observability SDK (Standalone & Module Shim)

Supports both:
1. Package installation: re-exports from mlo11y package.
2. Single-file drop-in: provides complete standalone zero-latency observability.
"""

try:
    from mlo11y.config import SecurityConfig, mask_credential
    from mlo11y.transport import TelemetryTransport
    from mlo11y.middleware import SecurityMiddleware, observe
    from mlo11y import __version__
except ImportError:
    import atexit
    import logging
    import os
    import queue
    import threading
    import time
    from typing import Optional, Callable, Dict, Any

    import requests
    from requests.adapters import HTTPAdapter
    from flask import request, g, Flask, Response

    __version__ = "1.0.0"

    def mask_credential(key: Optional[str]) -> str:
        if not key:
            return "[NOT SET]"
        key_str = str(key).strip()
        if len(key_str) <= 8:
            return "****"
        return f"{key_str[:6]}...{key_str[-4:]}"

    class SecurityConfig:
        def __init__(
            self,
            api_key: Optional[str] = None,
            token: Optional[str] = None,
            collector_url: Optional[str] = None,
            enabled: Optional[bool] = None,
            timeout: Optional[float] = None,
            max_queue_size: Optional[int] = None,
            flush_interval: Optional[float] = None,
            app_name: Optional[str] = None,
            user_id_callback: Optional[Callable[[Any], Optional[str]]] = None,
            debug: Optional[bool] = None,
        ):
            resolved_key = (
                api_key
                or token
                or os.environ.get("SECURITY_SDK_API_KEY")
                or os.environ.get("SECURITY_API_KEY")
                or os.environ.get("MLO11Y_API_KEY")
                or os.environ.get("API_SECURITY_KEY")
                or ""
            )
            self.api_key: str = resolved_key.strip()

            resolved_url = (
                collector_url
                or os.environ.get("SECURITY_SDK_COLLECTOR_URL")
                or os.environ.get("MLO11Y_COLLECTOR_URL")
                or os.environ.get("COLLECTOR_URL")
                or "http://localhost:5001"
            )
            clean_url = str(resolved_url).strip()
            if clean_url.endswith("/ingest"):
                clean_url = clean_url[:-7]
            clean_url = clean_url.rstrip("/")
            if not clean_url.startswith(("http://", "https://")):
                if "localhost" in clean_url or "127.0.0.1" in clean_url:
                    clean_url = f"http://{clean_url}"
                elif clean_url.startswith("/"):
                    clean_url = "http://localhost:5001"
                else:
                    clean_url = f"https://{clean_url}"

            self.collector_url: str = clean_url
            self.ingest_url: str = f"{self.collector_url}/ingest"

            if enabled is not None:
                self.enabled: bool = bool(enabled)
            else:
                env_en = os.environ.get("SECURITY_SDK_ENABLED", os.environ.get("MLO11Y_ENABLED", "true")).strip().lower()
                self.enabled = env_en not in ("0", "false", "no", "off", "disabled")

            self.timeout: float = float(timeout or os.environ.get("SECURITY_SDK_TIMEOUT", 2.0))
            self.max_queue_size: int = int(max_queue_size or os.environ.get("SECURITY_SDK_MAX_QUEUE_SIZE", 10000))
            self.flush_interval: float = float(flush_interval or 0.5)
            self.app_name: str = (app_name or os.environ.get("SECURITY_SDK_APP_NAME", "flask-app")).strip()
            self.user_id_callback = user_id_callback
            self.debug: bool = bool(debug or os.environ.get("SECURITY_SDK_DEBUG", "0") in ("1", "true", "yes"))

        def is_configured(self) -> bool:
            return bool(self.api_key)

    class TelemetryTransport:
        def __init__(self, config: SecurityConfig):
            self.config = config
            self.queue = queue.Queue(maxsize=max(1, config.max_queue_size))
            self._stop_event = threading.Event()
            self._worker_thread = None
            self._session = None
            self._lock = threading.Lock()

            if self.config.enabled and self.config.is_configured():
                self._start_worker()
                atexit.register(self.shutdown)

        def _get_session(self):
            if self._session is None:
                s = requests.Session()
                adapter = HTTPAdapter(pool_connections=10, pool_maxsize=20, max_retries=1)
                s.mount("http://", adapter)
                s.mount("https://", adapter)
                self._session = s
            return self._session

        def _start_worker(self):
            with self._lock:
                if self._worker_thread is None or not self._worker_thread.is_alive():
                    self._stop_event.clear()
                    self._worker_thread = threading.Thread(
                        target=self._worker_loop,
                        name="mlo11y-worker",
                        daemon=True,
                    )
                    self._worker_thread.start()

        def enqueue(self, event: Dict[str, Any]) -> bool:
            if not self.config.enabled or not self.config.is_configured():
                return False
            if self._worker_thread is None or not self._worker_thread.is_alive():
                self._start_worker()
            try:
                self.queue.put_nowait(event)
                return True
            except queue.Full:
                return False
            except Exception:
                return False

        def _worker_loop(self):
            headers = {
                "Authorization": f"Bearer {self.config.api_key}",
                "X-API-Key": self.config.api_key,
                "Content-Type": "application/json",
            }
            backoff = 0.0
            failures = 0
            while not self._stop_event.is_set():
                try:
                    if backoff > 0:
                        time.sleep(backoff)
                        backoff = 0.0

                    try:
                        event = self.queue.get(timeout=self.config.flush_interval)
                    except queue.Empty:
                        continue

                    try:
                        session = self._get_session()
                        resp = session.post(
                            self.config.ingest_url,
                            json=event,
                            headers=headers,
                            timeout=self.config.timeout,
                        )
                        if resp.status_code in (200, 201):
                            failures = 0
                        else:
                            failures += 1
                            if failures >= 3:
                                backoff = min(2.0, 0.5 * (failures - 2))
                    except Exception:
                        failures += 1
                        if failures >= 3:
                            backoff = min(2.0, 0.5 * (failures - 2))

                    self.queue.task_done()
                except Exception:
                    time.sleep(0.1)

        def shutdown(self, timeout: float = 1.0):
            self._stop_event.set()
            if self._session:
                try:
                    self._session.close()
                except Exception:
                    pass

    class SecurityMiddleware:
        def __init__(self, app=None, **kwargs):
            self.config = SecurityConfig(**kwargs)
            self.transport = TelemetryTransport(self.config)
            if app is not None:
                self.init_app(app)

        def init_app(self, app):
            if not self.config.enabled:
                return app

            @app.before_request
            def _start_time():
                try:
                    g._mlo11y_start = time.perf_counter()
                except Exception:
                    pass

            @app.after_request
            def _record_telemetry(response):
                try:
                    start_time = getattr(g, "_mlo11y_start", None)
                    latency_ms = (time.perf_counter() - start_time) * 1000.0 if start_time else 0.0

                    # IP extraction
                    client_ip = "127.0.0.1"
                    xff = request.headers.get("X-Forwarded-For")
                    if xff and xff.split(",")[0].strip():
                        client_ip = xff.split(",")[0].strip()
                    elif request.headers.get("CF-Connecting-IP"):
                        client_ip = request.headers.get("CF-Connecting-IP").strip()
                    elif request.headers.get("X-Real-IP"):
                        client_ip = request.headers.get("X-Real-IP").strip()
                    elif request.remote_addr:
                        client_ip = request.remote_addr.strip()

                    # User ID
                    user_id = None
                    if self.config.user_id_callback:
                        user_id = self.config.user_id_callback(request)
                    if not user_id:
                        user_id = request.headers.get("X-User-Id") or getattr(g, "user_id", None)
                    if user_id:
                        user_id = str(user_id)

                    event = {
                        "timestamp": time.time(),
                        "endpoint": request.path,
                        "method": request.method,
                        "status_code": response.status_code,
                        "latency_ms": round(latency_ms, 2),
                        "ip": client_ip,
                        "user_id": user_id,
                        "payload_size": request.content_length or 0,
                    }
                    self.transport.enqueue(event)
                except Exception:
                    pass
                return response

            return app

    def observe(app, **kwargs):
        SecurityMiddleware(app, **kwargs)
        return app

__all__ = ["SecurityMiddleware", "SecurityConfig", "observe", "mask_credential", "__version__"]

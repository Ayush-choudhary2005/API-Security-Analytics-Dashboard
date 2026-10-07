"""
transport.py — Non-blocking, asynchronous telemetry transport for ML-O11Y Security SDK.

Design Principles:
1. Zero Latency: Request threads only do a sub-millisecond in-memory queue push.
2. Resilience: If collector goes down, worker backs off without crashing host app.
3. Memory Bounds: Queue is bounded; drops excess events safely during prolonged outages.
4. Clean Exit: Registers atexit hook to drain pending events cleanly.
5. Security: Never logs raw credentials.
"""

import atexit
import logging
import queue
import threading
import time
from typing import Dict, Any, Optional

import requests
from requests.adapters import HTTPAdapter

from .config import SecurityConfig, mask_credential

logger = logging.getLogger("mlo11y.transport")


class TelemetryTransport:
    """
    Background worker and queue manager for forwarding telemetry asynchronously.
    """

    def __init__(self, config: SecurityConfig):
        self.config = config
        self.queue: queue.Queue = queue.Queue(maxsize=max(1, config.max_queue_size))
        self._dropped_count: int = 0
        self._sent_count: int = 0
        self._stop_event = threading.Event()
        self._worker_thread: Optional[threading.Thread] = None
        self._session: Optional[requests.Session] = None
        self._lock = threading.Lock()

        if self.config.debug:
            logger.setLevel(logging.DEBUG)
            if not logger.handlers:
                handler = logging.StreamHandler()
                handler.setFormatter(logging.Formatter("[ML-O11Y] %(levelname)s: %(message)s"))
                logger.addHandler(handler)

        if self.config.enabled and self.config.is_configured():
            self._start_worker()
            atexit.register(self.shutdown)

    def _get_session(self) -> requests.Session:
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
                    name="mlo11y-telemetry-worker",
                    daemon=True,
                )
                self._worker_thread.start()
                if self.config.debug:
                    logger.debug(f"Telemetry worker started for {self.config.collector_url} (Key: {mask_credential(self.config.api_key)})")

    def enqueue(self, event: Dict[str, Any]) -> bool:
        """
        Enqueue telemetry event from request thread.
        NON-BLOCKING: Returns immediately. If queue is full, drops event.
        """
        if not self.config.enabled or not self.config.is_configured():
            return False

        # Ensure worker is alive
        if self._worker_thread is None or not self._worker_thread.is_alive():
            self._start_worker()

        try:
            self.queue.put_nowait(event)
            return True
        except queue.Full:
            self._dropped_count += 1
            if self.config.debug and self._dropped_count % 100 == 1:
                logger.debug(f"Telemetry buffer full (total dropped: {self._dropped_count}). Dropping event to protect host app.")
            return False
        except Exception:
            return False

    def _worker_loop(self):
        headers = {
            "Authorization": f"Bearer {self.config.api_key}",
            "X-API-Key": self.config.api_key,
            "Content-Type": "application/json",
            "User-Agent": f"mlo11y-python-sdk/1.0.0 ({self.config.app_name})",
        }

        consecutive_failures = 0
        backoff_sleep = 0.0

        while not self._stop_event.is_set():
            try:
                # If in backoff state, sleep briefly before trying to send again
                if backoff_sleep > 0:
                    time.sleep(backoff_sleep)
                    backoff_sleep = 0.0

                try:
                    event = self.queue.get(timeout=self.config.flush_interval)
                except queue.Empty:
                    continue

                success = self._send_event(event, headers)
                self.queue.task_done()

                if success:
                    self._sent_count += 1
                    consecutive_failures = 0
                else:
                    consecutive_failures += 1
                    # Graceful downtime handling: pause worker if collector is down
                    if consecutive_failures >= 3:
                        backoff_sleep = min(2.0, 0.5 * (consecutive_failures - 2))

            except Exception as e:
                if self.config.debug:
                    logger.debug(f"Unexpected worker exception: {e}")
                time.sleep(0.1)

    def _send_event(self, event: Dict[str, Any], headers: Dict[str, str]) -> bool:
        try:
            session = self._get_session()
            resp = session.post(
                self.config.ingest_url,
                json=event,
                headers=headers,
                timeout=self.config.timeout,
            )
            if resp.status_code in (200, 201, 202):
                return True
            elif resp.status_code == 429:
                if self.config.debug:
                    retry_after = resp.headers.get("Retry-After", "5")
                    logger.debug(f"Telemetry rate limited by collector. Retry-After: {retry_after}s")
                return False
            else:
                if self.config.debug:
                    logger.debug(f"Collector responded with status {resp.status_code}")
                return False
        except requests.RequestException as re:
            # Collector is unreachable or timed out — fail silently to never crash host app
            if self.config.debug:
                logger.debug(f"Collector unavailable ({type(re).__name__}). Dropping telemetry safely.")
            return False
        except Exception:
            return False

    def shutdown(self, timeout: float = 1.0):
        """
        Gracefully signal worker thread to terminate and drain pending queue items.
        """
        self._stop_event.set()
        if self._worker_thread and self._worker_thread.is_alive():
            # Quick drain of remaining items up to timeout
            start_drain = time.time()
            headers = {
                "Authorization": f"Bearer {self.config.api_key}",
                "X-API-Key": self.config.api_key,
                "Content-Type": "application/json",
            }
            while not self.queue.empty() and (time.time() - start_drain < timeout):
                try:
                    event = self.queue.get_nowait()
                    self._send_event(event, headers)
                    self.queue.task_done()
                except Exception:
                    break

            self._worker_thread.join(timeout=max(0.1, timeout - (time.time() - start_drain)))

        if self._session:
            try:
                self._session.close()
            except Exception:
                pass

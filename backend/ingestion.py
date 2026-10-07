"""
backend/ingestion.py — High-Performance, Secure Telemetry Ingestion Pipeline
Implements:
1. Strict schema validation & type coercion
2. Data Loss Prevention (DLP): automatic scrubbing of passwords, authorization headers,
   cookies, JWTs, API keys, and sensitive query parameters
3. Project & tenant isolation boundary enforcement
4. Request size limiting (64KB payload bounds)
5. Project-scoped token bucket rate limiting with burst absorption & Retry-After headers
6. Replay & duplicate event detection cache (LRU + TTL)
7. Dual timestamping (event occurrence timestamp + server ingested_at)
8. Health monitoring probes (separate liveness & readiness)
"""

import re
import time
import uuid
import ipaddress
import threading
from typing import Dict, Any, Tuple, Optional, Set

# ---------------------------------------------------------
# Ingestion Limits & Schema Constants
# ---------------------------------------------------------
MAX_PAYLOAD_BYTES: int = 64 * 1024  # 64 KB per telemetry request
MAX_METADATA_KEYS: int = 50
MAX_METADATA_STR_LEN: int = 1024
MAX_ENDPOINT_LEN: int = 1024
MAX_USER_AGENT_LEN: int = 512
MAX_USER_ID_LEN: int = 128

ALLOWED_HTTP_METHODS: Set[str] = {
    "GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"
}

VALID_STATUS_MIN: int = 100
VALID_STATUS_MAX: int = 599
VALID_LATENCY_MIN: float = 0.0
VALID_LATENCY_MAX: float = 600000.0  # Max 10 minutes (600,000 ms)

# Max allowed clock drift: events older than 7 days or more than 24 hours in future
MAX_PAST_DRIFT_SECONDS: float = 7 * 86400
MAX_FUTURE_DRIFT_SECONDS: float = 24 * 3600

# ---------------------------------------------------------
# Data Loss Prevention (DLP) & Secret Redaction Patterns
# ---------------------------------------------------------
SENSITIVE_KEY_REGEX = re.compile(
    r'(password|passwd|secret|token|auth|cookie|key|apikey|api_key|credential|session|private|bearer|jwt|ssn|credit_card|cvv|card_number)',
    re.IGNORECASE
)

BEARER_REGEX = re.compile(r'Bearer\s+[A-Za-z0-9\-._~+/]+=*', re.IGNORECASE)
JWT_REGEX = re.compile(r'eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}')
API_KEY_REGEX = re.compile(r'\b(ask_[a-zA-Z0-9_]{16,}|sec_live_[a-zA-Z0-9_]{16,}|sk-[a-zA-Z0-9]{20,}|AKIA[0-9A-Z]{16})\b')
CREDIT_CARD_REGEX = re.compile(r'\b(?:\d{4}[ -]?){3}\d{4}\b')

# Redacts secret query parameters in URLs e.g. /checkout?token=secret123 -> /checkout?token=[REDACTED]
QUERY_SECRET_REGEX = re.compile(
    r'([?&](?:token|key|api_key|password|passwd|secret|auth|access_token|session|credential)=)[^&#\s]*',
    re.IGNORECASE
)


def redact_string(value: str) -> str:
    """Scrub sensitive credentials, tokens, and payment cards from arbitrary text."""
    if not isinstance(value, str):
        return value
    val = BEARER_REGEX.sub('Bearer [REDACTED]', value)
    val = JWT_REGEX.sub('[REDACTED_JWT]', val)
    val = API_KEY_REGEX.sub('[REDACTED_API_KEY]', val)
    val = CREDIT_CARD_REGEX.sub('[REDACTED_CARD]', val)
    return val


def sanitize_endpoint(endpoint: str) -> str:
    """Ensure endpoint has no plain secrets in query parameters, truncate length."""
    if not isinstance(endpoint, str):
        return "/"
    ep = endpoint.strip()
    if not ep:
        return "/"
    ep = QUERY_SECRET_REGEX.sub(r'\1[REDACTED]', ep)
    ep = redact_string(ep)
    if len(ep) > MAX_ENDPOINT_LEN:
        ep = ep[:MAX_ENDPOINT_LEN]
    return ep


def sanitize_metadata(meta: Any, depth: int = 0) -> Dict[str, Any]:
    """
    Recursively sanitize metadata dictionary.
    Drops keys containing password/secret/token, redacts sensitive strings,
    and enforces maximum depth (2) and maximum key count (50).
    """
    if not isinstance(meta, dict) or depth > 2:
        return {}

    cleaned: Dict[str, Any] = {}
    for i, (k, v) in enumerate(meta.items()):
        if i >= MAX_METADATA_KEYS:
            break
        key_str = str(k)[:64]

        # Key name check for secrets
        if SENSITIVE_KEY_REGEX.search(key_str):
            cleaned[key_str] = "[REDACTED]"
            continue

        if isinstance(v, (int, float, bool)) or v is None:
            cleaned[key_str] = v
        elif isinstance(v, str):
            val_str = v[:MAX_METADATA_STR_LEN]
            cleaned[key_str] = redact_string(val_str)
        elif isinstance(v, dict):
            cleaned[key_str] = sanitize_metadata(v, depth=depth + 1)
        elif isinstance(v, (list, tuple)):
            cleaned[key_str] = [
                redact_string(str(item)[:MAX_METADATA_STR_LEN]) if isinstance(item, str)
                else (item if isinstance(item, (int, float, bool)) else str(item)[:128])
                for item in v[:20]
            ]
        else:
            cleaned[key_str] = str(v)[:MAX_METADATA_STR_LEN]

    return cleaned


def sanitize_ip(ip_str: Optional[str], fallback: str = "127.0.0.1") -> str:
    """Validate and clean IP address string."""
    if not ip_str or not isinstance(ip_str, str):
        return fallback
    clean = ip_str.strip()
    try:
        ipaddress.ip_address(clean)
        return clean
    except ValueError:
        return fallback


# ---------------------------------------------------------
# De-duplication & Replay Cache
# ---------------------------------------------------------
class DeDupCache:
    """
    Thread-safe in-memory sliding window cache for detecting duplicate telemetry events.
    Protects against duplicate delivery from SDK retries and network race conditions.
    """
    def __init__(self, max_entries: int = 20000, ttl_seconds: float = 300.0):
        self._max = max_entries
        self._ttl = ttl_seconds
        self._cache: Dict[str, float] = {}
        self._lock = threading.Lock()

    def is_duplicate(self, fingerprint: str, now: Optional[float] = None) -> bool:
        """Check if fingerprint has been seen within TTL. Records it if new."""
        t = now or time.time()
        with self._lock:
            # Check existing entry
            prev_time = self._cache.get(fingerprint)
            if prev_time is not None and (t - prev_time) <= self._ttl:
                return True

            # Clean expired items if capacity is reaching ceiling
            if len(self._cache) >= self._max:
                cutoff = t - self._ttl
                expired_keys = [k for k, v in self._cache.items() if v < cutoff]
                for k in expired_keys:
                    self._cache.pop(k, None)
                # If still at ceiling after eviction, pop oldest
                if len(self._cache) >= self._max:
                    first_k = next(iter(self._cache))
                    self._cache.pop(first_k, None)

            self._cache[fingerprint] = t
            return False

    def clear(self):
        with self._lock:
            self._cache.clear()


# Global De-duplication instance
dedup_cache = DeDupCache()


# ---------------------------------------------------------
# Ingestion Rate Limiter & Burst Protection (Token Bucket)
# ---------------------------------------------------------
class IngestionRateLimiter:
    """
    Per-project token bucket rate limiter for the /ingest telemetry endpoint.
    Absorbs sudden microbursts safely while throttling runaway SDK clients.
    """
    def __init__(self, capacity: float = 600.0, refill_rate: float = 300.0):
        self.capacity = capacity
        self.refill_rate = refill_rate  # tokens per second
        self._buckets: Dict[str, Tuple[float, float]] = {}  # project_id -> (tokens, last_refill_ts)
        self._lock = threading.Lock()

    def check_limit(self, project_id: str, cost: float = 1.0) -> Tuple[bool, int]:
        """
        Check and deduct token bucket for project.
        Returns: (allowed: bool, retry_after_seconds: int)
        """
        now = time.time()
        with self._lock:
            tokens, last_ts = self._buckets.get(project_id, (self.capacity, now))
            # Refill tokens according to elapsed time
            elapsed = max(0.0, now - last_ts)
            tokens = min(self.capacity, tokens + (elapsed * self.refill_rate))

            if tokens >= cost:
                tokens -= cost
                self._buckets[project_id] = (tokens, now)
                return True, 0
            else:
                self._buckets[project_id] = (tokens, now)
                needed = cost - tokens
                retry_after = max(1, int(needed / self.refill_rate) + 1)
                return False, retry_after

    def reset(self, project_id: Optional[str] = None):
        with self._lock:
            if project_id:
                self._buckets.pop(project_id, None)
            else:
                self._buckets.clear()


# Global Rate Limiter instance: 600 burst capacity, 300 requests/sec refill
ingestion_rate_limiter = IngestionRateLimiter(capacity=600.0, refill_rate=300.0)


# ---------------------------------------------------------
# Telemetry Validation & Sanitization Engine
# ---------------------------------------------------------
def validate_and_sanitize_event(
    raw_payload: Any,
    project_id: str,
    remote_addr: Optional[str] = None,
) -> Tuple[bool, str, Optional[Dict[str, Any]]]:
    """
    Validates the event against the schema, scrubs secrets, and applies
    strict tenant isolation by overriding project_id.

    Returns:
        (is_valid: bool, error_message: str, cleaned_event: dict or None)
    """
    if not isinstance(raw_payload, dict):
        return False, "Payload must be a JSON object", None

    # 1. Validate required fields presence
    for field in ("endpoint", "method", "status_code"):
        if field not in raw_payload:
            return False, f"Missing required telemetry field: '{field}'", None

    # 2. Validate & sanitize 'endpoint'
    endpoint_raw = raw_payload.get("endpoint")
    if not isinstance(endpoint_raw, str) or not endpoint_raw.strip():
        return False, "Field 'endpoint' must be a non-empty string", None
    endpoint = sanitize_endpoint(endpoint_raw)

    # 3. Validate 'method'
    method_raw = raw_payload.get("method")
    if not isinstance(method_raw, str):
        return False, "Field 'method' must be a valid HTTP verb string", None
    method = method_raw.strip().upper()
    if method not in ALLOWED_HTTP_METHODS:
        return False, f"Invalid HTTP method '{method}'. Allowed: {sorted(list(ALLOWED_HTTP_METHODS))}", None

    # 4. Validate 'status_code'
    status_raw = raw_payload.get("status_code")
    try:
        status_code = int(status_raw)
        if status_code < VALID_STATUS_MIN or status_code > VALID_STATUS_MAX:
            return False, f"Status code {status_code} out of valid HTTP range (100-599)", None
    except (ValueError, TypeError):
        return False, f"Invalid status_code '{status_raw}'. Must be an integer between 100 and 599", None

    # 5. Validate 'latency' or 'latency_ms'
    latency_raw = raw_payload.get("latency_ms", raw_payload.get("latency", 0.0))
    try:
        latency_ms = float(latency_raw)
        if latency_ms < VALID_LATENCY_MIN or latency_ms > VALID_LATENCY_MAX:
            return False, f"Latency {latency_ms}ms out of valid range (0 to 600,000ms)", None
    except (ValueError, TypeError):
        return False, f"Invalid latency value '{latency_raw}'. Must be a positive number", None

    # 6. Validate & sanitize 'ip' / 'source_ip' / 'client_ip'
    ip_raw = raw_payload.get("ip") or raw_payload.get("source_ip") or raw_payload.get("client_ip") or remote_addr or "127.0.0.1"
    ip = sanitize_ip(ip_raw, fallback=remote_addr or "127.0.0.1")

    # 7. Validate & normalize 'timestamp' and add server 'ingested_at'
    now = time.time()
    ts_raw = raw_payload.get("timestamp")
    if ts_raw is not None:
        try:
            ts = float(ts_raw)
            # Drift check: clamp if too far in past or future
            if (ts < now - MAX_PAST_DRIFT_SECONDS) or (ts > now + MAX_FUTURE_DRIFT_SECONDS):
                ts = now
        except (ValueError, TypeError):
            ts = now
    else:
        ts = now

    ingested_at = now

    # 8. Sanitize optional 'user_id'
    user_id_raw = raw_payload.get("user_id")
    user_id = str(user_id_raw)[:MAX_USER_ID_LEN].strip() if user_id_raw else None
    if user_id:
        user_id = redact_string(user_id)

    # 9. Sanitize optional 'user_agent'
    ua_raw = raw_payload.get("user_agent")
    user_agent = str(ua_raw)[:MAX_USER_AGENT_LEN].strip() if ua_raw else None
    if user_agent:
        user_agent = redact_string(user_agent)

    # 10. Sanitize optional 'payload_size'
    ps_raw = raw_payload.get("payload_size", 0)
    try:
        payload_size = max(0, int(ps_raw))
    except (ValueError, TypeError):
        payload_size = 0

    # 11. Event ID resolution
    client_event_id = raw_payload.get("event_id")
    if client_event_id and isinstance(client_event_id, str):
        clean_event_id = re.sub(r'[^a-zA-Z0-9_\-]', '', client_event_id)[:64]
    else:
        clean_event_id = f"evt_{uuid.uuid4().hex[:16]}"

    # 12. Event Type
    event_type = str(raw_payload.get("event_type", "http_request"))[:64]

    # 13. Metadata DLP Scrubbing
    meta_raw = raw_payload.get("metadata", {})
    metadata = sanitize_metadata(meta_raw)

    # Whitelist and construct the clean canonical event object.
    # CRITICAL: strictly overrides project_id and tenant_id with the authenticated project.
    cleaned_event = {
        "event_id": clean_event_id,
        "project_id": project_id,
        "tenant_id": project_id,
        "timestamp": ts,
        "ingested_at": ingested_at,
        "endpoint": endpoint,
        "method": method,
        "status_code": status_code,
        "latency_ms": latency_ms,
        "ip": ip,
        "user_id": user_id,
        "user_agent": user_agent,
        "payload_size": payload_size,
        "event_type": event_type,
        "metadata": metadata,
    }

    return True, "", cleaned_event


# ---------------------------------------------------------
# Health Probes: Liveness & Readiness Checks
# ---------------------------------------------------------
_START_TIME = time.time()

def check_liveness() -> Dict[str, Any]:
    """Lightweight probe verifying the ingestion service process is running."""
    return {
        "status": "alive",
        "service": "ml-o11y-telemetry-collector",
        "uptime_seconds": round(time.time() - _START_TIME, 2),
        "timestamp": time.time(),
    }


def check_readiness(db_module, detection_module) -> Tuple[bool, Dict[str, Any]]:
    """
    Deep readiness probe verifying critical runtime dependencies:
    - Database connection health
    - Detection model operational state
    """
    checks = {}
    is_ready = True

    # 1. Database Connectivity
    try:
        conn = db_module.get_conn()
        row = conn.execute("SELECT 1 as ping").fetchone()
        conn.close()
        if row and row["ping"] == 1:
            checks["database"] = "healthy"
        else:
            checks["database"] = "unresponsive"
            is_ready = False
    except Exception as db_err:
        checks["database"] = f"unhealthy: {type(db_err).__name__}"
        is_ready = False

    # 2. Detection Engine State
    try:
        if hasattr(detection_module, "score_event"):
            checks["detection_engine"] = "ready"
        else:
            checks["detection_engine"] = "missing_score_fn"
            is_ready = False
    except Exception as det_err:
        checks["detection_engine"] = f"error: {type(det_err).__name__}"
        is_ready = False

    # 3. Ingestion Cache & Rate Limiter
    checks["rate_limiter"] = "active"
    checks["dedup_cache"] = "active"

    res = {
        "status": "ready" if is_ready else "not_ready",
        "checks": checks,
        "timestamp": time.time(),
    }
    return is_ready, res

"""
rate_limiter.py — In-memory IP rate limiter with auto-block.

Tracks request counts per IP using a sliding window.
Auto-blocks IPs that exceed configurable thresholds.
Provides an API for the dashboard to view and manage blocked IPs.
"""

import time
import threading
from collections import defaultdict

# ---- Configuration ----
WINDOW_SEC = 60          # Sliding window size in seconds
MAX_REQUESTS = 50        # Max requests per IP in the window before auto-block
WARNING_THRESHOLD = 15   # Warn the operator early (30% of limit) so they have time to act
BLOCK_DURATION_SEC = 300  # How long an auto-blocked IP stays blocked (5 min)

# ---- State ----
_lock = threading.Lock()

# { ip: [timestamp1, timestamp2, ...] }
_request_log = defaultdict(list)

# { ip: { "blocked_at": float, "expires_at": float, "reason": str, "request_count": int } }
_blocked_ips = {}

# IPs that have already triggered a warning (avoid spamming)
_warned_ips = set()

# Manually whitelisted IPs that should never be blocked
_whitelist = {"127.0.0.1"}


def _cleanup_window(ip: str, now: float):
    """Remove timestamps older than the sliding window."""
    cutoff = now - WINDOW_SEC
    _request_log[ip] = [t for t in _request_log[ip] if t > cutoff]


def is_blocked(ip: str) -> bool:
    """Check if an IP is currently blocked."""
    if ip in _whitelist:
        return False
        
    with _lock:
        if ip in _blocked_ips:
            info = _blocked_ips[ip]
            if time.time() < info["expires_at"]:
                return True
            else:
                # Block expired, remove it
                del _blocked_ips[ip]
                return False
    return False


def record_request(ip: str) -> dict:
    """
    Record a request from an IP. Returns status dict.
    If the IP exceeds the threshold, it gets auto-blocked.
    Includes a 'warning' flag when the IP crosses the warning threshold.
    """
    if ip in _whitelist:
        return {"blocked": False, "count": 0}
    
    now = time.time()
    
    with _lock:
        # Check if already blocked
        if ip in _blocked_ips:
            info = _blocked_ips[ip]
            if now < info["expires_at"]:
                remaining = int(info["expires_at"] - now)
                return {"blocked": True, "reason": info["reason"], "remaining_sec": remaining}
            else:
                del _blocked_ips[ip]
        
        # Record and count
        _request_log[ip].append(now)
        _cleanup_window(ip, now)
        count = len(_request_log[ip])
        
        # Auto-block if threshold exceeded
        if count > MAX_REQUESTS:
            _warned_ips.discard(ip)
            _blocked_ips[ip] = {
                "blocked_at": now,
                "expires_at": now + BLOCK_DURATION_SEC,
                "reason": f"Rate limit exceeded: {count} requests in {WINDOW_SEC}s (limit: {MAX_REQUESTS})",
                "request_count": count,
                "block_type": "auto",
            }
            return {"blocked": True, "reason": _blocked_ips[ip]["reason"], "auto_blocked": True}
        
        # Warning if approaching threshold
        if count >= WARNING_THRESHOLD and ip not in _warned_ips:
            _warned_ips.add(ip)
            return {"blocked": False, "count": count, "limit": MAX_REQUESTS, "warning": True, "ip": ip}
        
        return {"blocked": False, "count": count, "limit": MAX_REQUESTS}


def get_blocked_ips() -> list:
    """Return all currently blocked IPs with metadata."""
    now = time.time()
    result = []
    
    with _lock:
        expired = []
        for ip, info in _blocked_ips.items():
            if now < info["expires_at"]:
                result.append({
                    "ip": ip,
                    "blocked_at": info["blocked_at"],
                    "expires_at": info["expires_at"],
                    "remaining_sec": int(info["expires_at"] - now),
                    "reason": info["reason"],
                    "request_count": info.get("request_count", 0),
                    "block_type": info.get("block_type", "auto"),
                })
            else:
                expired.append(ip)
        
        for ip in expired:
            del _blocked_ips[ip]
    
    return result


def unblock_ip(ip: str) -> bool:
    """Manually unblock an IP. Returns True if it was blocked."""
    with _lock:
        if ip in _blocked_ips:
            del _blocked_ips[ip]
            return True
    return False


def block_ip(ip: str, duration_sec: int = None, reason: str = "Manually blocked") -> bool:
    """Manually block an IP."""
    if ip in _whitelist:
        return False
    
    now = time.time()
    dur = duration_sec or BLOCK_DURATION_SEC
    
    with _lock:
        _blocked_ips[ip] = {
            "blocked_at": now,
            "expires_at": now + dur,
            "reason": reason,
            "request_count": 0,
            "block_type": "manual",
        }
    return True

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

# { (project_id, ip): [timestamp1, timestamp2, ...] }
_request_log = defaultdict(list)

# { (project_id, ip): { "blocked_at": float, "expires_at": float, "reason": str, "request_count": int, "project_id": str } }
_blocked_ips = {}

# Set of (project_id, ip)
_warned_ips = set()

# Manually whitelisted IPs (default empty to prevent unauthenticated bypass)
_whitelist = set()


def _cleanup_window(key: tuple, now: float):
    """Remove timestamps older than the sliding window for a given (project_id, ip)."""
    cutoff = now - WINDOW_SEC
    _request_log[key] = [t for t in _request_log[key] if t > cutoff]


def is_blocked(ip: str, project_id: str = "default") -> bool:
    """Check if an IP is currently blocked for a given project."""
    if ip in _whitelist:
        return False
        
    key = (project_id, ip)
    with _lock:
        if key in _blocked_ips:
            info = _blocked_ips[key]
            if time.time() < info["expires_at"]:
                return True
            else:
                del _blocked_ips[key]
                return False
    return False


def record_request(ip: str, project_id: str = "default") -> dict:
    """
    Record a request from an IP for a specific project. Returns status dict.
    If the IP exceeds the threshold in this project, it gets auto-blocked for this project.
    Includes a 'warning' flag when the IP crosses the warning threshold.
    """
    if ip in _whitelist:
        return {"blocked": False, "count": 0, "project_id": project_id}
    
    now = time.time()
    key = (project_id, ip)
    
    with _lock:
        # Check if already blocked
        if key in _blocked_ips:
            info = _blocked_ips[key]
            if now < info["expires_at"]:
                remaining = int(info["expires_at"] - now)
                return {"blocked": True, "reason": info["reason"], "remaining_sec": remaining, "project_id": project_id}
            else:
                del _blocked_ips[key]
        
        # Record and count
        _request_log[key].append(now)
        _cleanup_window(key, now)
        count = len(_request_log[key])
        
        # Auto-block if threshold exceeded
        if count > MAX_REQUESTS:
            _warned_ips.discard(key)
            _blocked_ips[key] = {
                "blocked_at": now,
                "expires_at": now + BLOCK_DURATION_SEC,
                "reason": f"Rate limit exceeded: {count} requests in {WINDOW_SEC}s (limit: {MAX_REQUESTS})",
                "request_count": count,
                "block_type": "auto",
                "project_id": project_id,
            }
            return {"blocked": True, "reason": _blocked_ips[key]["reason"], "auto_blocked": True, "project_id": project_id}
        
        # Warning if approaching threshold
        if count >= WARNING_THRESHOLD and key not in _warned_ips:
            _warned_ips.add(key)
            return {"blocked": False, "count": count, "limit": MAX_REQUESTS, "warning": True, "ip": ip, "project_id": project_id}
        
        return {"blocked": False, "count": count, "limit": MAX_REQUESTS, "project_id": project_id}


def get_blocked_ips(project_id: str = None) -> list:
    """Return all currently blocked IPs, optionally filtered by project_id."""
    now = time.time()
    result = []
    
    with _lock:
        expired = []
        for key, info in _blocked_ips.items():
            proj, ip = key
            if now < info["expires_at"]:
                if project_id is None or proj == project_id or (proj in ("proj_demo_default", "default") and project_id in ("proj_demo_default", "default", "phase1-demo-token")):
                    result.append({
                        "ip": ip,
                        "project_id": proj,
                        "blocked_at": info["blocked_at"],
                        "expires_at": info["expires_at"],
                        "remaining_sec": int(info["expires_at"] - now),
                        "reason": info["reason"],
                        "request_count": info.get("request_count", 0),
                        "block_type": info.get("block_type", "auto"),
                    })
            else:
                expired.append(key)
        
        for key in expired:
            del _blocked_ips[key]
    
    return result


def unblock_ip(ip: str, project_id: str = "default") -> bool:
    """Manually unblock an IP for a specific project. Returns True if it was blocked."""
    key = (project_id, ip)
    with _lock:
        if key in _blocked_ips:
            del _blocked_ips[key]
            return True
        if project_id in ("proj_demo_default", "default"):
            for alt_proj in ("proj_demo_default", "default"):
                alt_key = (alt_proj, ip)
                if alt_key in _blocked_ips:
                    del _blocked_ips[alt_key]
                    return True
    return False


def block_ip(ip: str, duration_sec: int = None, reason: str = "Manually blocked", project_id: str = "default") -> bool:
    """Manually block an IP for a specific project."""
    if ip in _whitelist:
        return False
    
    now = time.time()
    dur = duration_sec or BLOCK_DURATION_SEC
    key = (project_id, ip)
    
    with _lock:
        _blocked_ips[key] = {
            "blocked_at": now,
            "expires_at": now + dur,
            "reason": reason,
            "request_count": 0,
            "block_type": "manual",
            "project_id": project_id,
        }
    return True


_login_failed_log_ip = defaultdict(list)
_login_failed_log_account = defaultdict(list)
_ip_to_accounts = defaultdict(set)

LOGIN_MAX_FAILED_IP = 10
LOGIN_MAX_FAILED_ACCOUNT = 5
LOGIN_LOCKOUT_SEC = 300  # 5 minutes


def record_failed_login(ip: str, email: str = None) -> bool:
    """
    Record a failed login attempt under dual keys (IP and Account).
    Returns True if either threshold is reached.
    """
    now = time.time()
    cutoff = now - LOGIN_LOCKOUT_SEC
    with _lock:
        # 1. IP Bucket
        _login_failed_log_ip[ip] = [t for t in _login_failed_log_ip[ip] if t > cutoff]
        _login_failed_log_ip[ip].append(now)
        ip_limited = len(_login_failed_log_ip[ip]) >= LOGIN_MAX_FAILED_IP

        # 2. Account Bucket
        account_limited = False
        if email:
            norm_email = email.lower().strip()
            _login_failed_log_account[norm_email] = [t for t in _login_failed_log_account[norm_email] if t > cutoff]
            _login_failed_log_account[norm_email].append(now)
            _ip_to_accounts[ip].add(norm_email)
            account_limited = len(_login_failed_log_account[norm_email]) >= LOGIN_MAX_FAILED_ACCOUNT

        return ip_limited or account_limited


def is_login_rate_limited(ip: str, email: str = None) -> bool:
    """
    Check if either the IP or the specific target account has exceeded the failed login threshold.
    """
    now = time.time()
    cutoff = now - LOGIN_LOCKOUT_SEC
    with _lock:
        _login_failed_log_ip[ip] = [t for t in _login_failed_log_ip[ip] if t > cutoff]
        if len(_login_failed_log_ip[ip]) >= LOGIN_MAX_FAILED_IP:
            return True

        if email:
            norm_email = email.lower().strip()
            _login_failed_log_account[norm_email] = [t for t in _login_failed_log_account[norm_email] if t > cutoff]
            if len(_login_failed_log_account[norm_email]) >= LOGIN_MAX_FAILED_ACCOUNT:
                return True

        return False


def get_login_delay(ip: str, email: str = None) -> float:
    """
    Calculate progressive delay (in seconds) based on failed attempt count.
    Exponentially reduces brute-force velocity on repeated failures.
    """
    now = time.time()
    cutoff = now - LOGIN_LOCKOUT_SEC
    with _lock:
        ip_attempts = len([t for t in _login_failed_log_ip.get(ip, []) if t > cutoff])
        acc_attempts = 0
        if email:
            norm_email = email.lower().strip()
            acc_attempts = len([t for t in _login_failed_log_account.get(norm_email, []) if t > cutoff])

        max_attempts = max(ip_attempts, acc_attempts)
        if max_attempts < 3:
            return 0.0
        elif max_attempts == 3:
            return 0.5
        elif max_attempts == 4:
            return 1.0
        elif max_attempts == 5:
            return 1.5
        else:
            return 2.0


def clear_failed_logins(ip: str, email: str = None):
    """
    Clear failed login count for an IP and associated accounts upon successful authentication or admin reset.
    """
    with _lock:
        if ip in _login_failed_log_ip:
            del _login_failed_log_ip[ip]
        if email:
            norm_email = email.lower().strip()
            if norm_email in _login_failed_log_account:
                del _login_failed_log_account[norm_email]
        if ip in _ip_to_accounts:
            for acc in _ip_to_accounts[ip]:
                if acc in _login_failed_log_account:
                    del _login_failed_log_account[acc]
            del _ip_to_accounts[ip]


def reset_state():
    """Clear all rate limiter state (useful for test suites)."""
    with _lock:
        _request_log.clear()
        _blocked_ips.clear()
        _warned_ips.clear()
        _login_failed_log_ip.clear()
        _login_failed_log_account.clear()
        _ip_to_accounts.clear()


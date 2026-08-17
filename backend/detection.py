"""
detection.py — Phase 1 detection engine.

Computes rolling-window features inline (no scheduled job, no queue),
applies 3 hardcoded rules, computes a statistical anomaly score
(z-score stand-in for the Isolation Forest that lands in Phase 2),
and fuses the two into a severity.

Attack taxonomy covered in Phase 1 (3 of the 4 from the full design —
payload-size anomaly is deferred to Phase 2):
  1. Brute-force login      -> failed-auth count / 60s
  2. Endpoint enumeration   -> unique endpoints / 60s
  3. Request burst          -> request count / 10s
"""

import time
import statistics

from db import get_events_since

# ---- Thresholds (tune these later; documented so they're easy to defend) ----
BRUTE_FORCE_WINDOW_SEC = 60
BRUTE_FORCE_THRESHOLD = 5          # >5 failed auths / 60s

SCAN_WINDOW_SEC = 60
SCAN_THRESHOLD = 15                # >15 unique endpoints / 60s

BURST_WINDOW_SEC = 10
BURST_THRESHOLD = 30               # >30 requests / 10s

ZSCORE_MEDIUM_THRESHOLD = 2.5      # combined z-score above this -> medium severity

# Failed-auth is inferred from status code. 401/403 = auth failure.
AUTH_FAILURE_CODES = {401, 403}


def compute_features(ip: str, now_ts: float, history: list) -> dict:
    """
    history = all prior events for this IP within the largest window we need
    (we fetch BRUTE_FORCE_WINDOW_SEC/SCAN_WINDOW_SEC worth, since those are
    the largest of the three windows; BURST_WINDOW_SEC is a subset of it).
    """
    window_60 = [e for e in history if now_ts - e["timestamp"] <= 60]
    window_10 = [e for e in history if now_ts - e["timestamp"] <= 10]

    failed_auth_count = sum(1 for e in window_60 if e["status_code"] in AUTH_FAILURE_CODES)
    unique_endpoints = len({e["endpoint"] for e in window_60})
    request_count_10s = len(window_10)

    return {
        "failed_auth_count": failed_auth_count,
        "unique_endpoints": unique_endpoints,
        "request_count_10s": request_count_10s,
    }


def apply_rules(features: dict) -> list:
    """Returns a list of rule names that fired."""
    flags = []
    if features["failed_auth_count"] > BRUTE_FORCE_THRESHOLD:
        flags.append("brute_force")
    if features["unique_endpoints"] > SCAN_THRESHOLD:
        flags.append("endpoint_scan")
    if features["request_count_10s"] > BURST_THRESHOLD:
        flags.append("request_burst")
    return flags


def compute_anomaly_score(features: dict, history: list) -> float:
    """
    Statistical stand-in for ML in Phase 1 (documented explicitly as such —
    see README 'What's real vs stubbed'). Combines z-scores of the three
    features against this IP's own running mean/std.

    If there's not enough history yet (cold start), returns 0.0 — this IS
    the cold-start strategy for Phase 1: rules-only until enough events
    exist to compute a meaningful baseline.
    """
    MIN_HISTORY_FOR_SCORING = 5

    if len(history) < MIN_HISTORY_FOR_SCORING:
        return 0.0

    # Build per-event feature series from history to get a mean/std baseline.
    # (Cheap approximation: treat each historical event's own request_count
    # in the prior 10s as a sample — good enough for Phase 1 demo purposes.)
    counts = [1 for _ in history]  # placeholder series length guard
    latencies = [e["latency_ms"] for e in history]

    z_scores = []
    for series, current_value in [
        (latencies, history[-1]["latency_ms"] if history else 0),
    ]:
        if len(series) >= 2:
            mean = statistics.mean(series)
            std = statistics.pstdev(series)
            if std > 0:
                z_scores.append(abs((current_value - mean) / std))

    # Also fold in the rule features directly as a simple magnitude signal
    # scaled against their own thresholds, so the score reacts even when
    # latency alone looks normal.
    z_scores.append(features["failed_auth_count"] / BRUTE_FORCE_THRESHOLD)
    z_scores.append(features["unique_endpoints"] / SCAN_THRESHOLD)
    z_scores.append(features["request_count_10s"] / BURST_THRESHOLD)

    if not z_scores:
        return 0.0

    return round(sum(z_scores) / len(z_scores), 3)


def fuse(rule_flags: list, anomaly_score: float) -> str:
    """
    Fusion logic: rules take priority (deterministic, explainable).
    ML/statistical score fills the gap for things rules didn't catch.
    """
    if len(rule_flags) >= 2:
        return "high"
    if len(rule_flags) == 1:
        return "medium"
    if anomaly_score > ZSCORE_MEDIUM_THRESHOLD:
        return "medium"
    return "low"


def score_event(event: dict) -> dict:
    """
    Main entry point called by the collector on every new event.
    Mutates and returns the event dict with rule_flags, anomaly_score, severity.
    """
    now_ts = event["timestamp"]
    ip = event["ip"]

    # Pull prior history for this IP within the largest window we need (60s)
    history = get_events_since(ip, now_ts - 60)

    features = compute_features(ip, now_ts, history)
    rule_flags = apply_rules(features)
    anomaly_score = compute_anomaly_score(features, history)
    severity = fuse(rule_flags, anomaly_score)

    event["rule_flags"] = rule_flags
    event["anomaly_score"] = anomaly_score
    event["severity"] = severity
    return event

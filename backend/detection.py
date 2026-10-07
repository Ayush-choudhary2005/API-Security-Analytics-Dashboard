"""
detection.py — Production ML Detection & Active Defense Pipeline.

Architecture:
Option C: Hybrid Approach
- Global Isolation Forest prior: captures universal cross-metric structural anomalies
  without requiring a cold-start warm-up.
- Project-Specific Adaptive Normalizer (ProjectBaselineTracker): continuously tracks
  rolling distributions per project so batch projects vs low-latency APIs are evaluated
  against their own baseline, completely avoiding cross-tenant interference.
- Deterministic Rule Engine: detects brute-force authentication, endpoint enumeration,
  and high-rate request bursts with high confidence.
- Continuous Risk & Confidence Scoring: provides calibrated continuous risk scores (0-100)
  and confidence levels (0.0-1.0).
- Alert Cooldown & Deduplication: suppresses notification storms during sustained attacks
  without dropping telemetry ingestion.
"""

import time
import statistics
import os
import threading
import uuid
from collections import defaultdict, deque
import joblib

from db import get_events_since, get_organization_id_for_project

MODEL_PATH = os.path.join(os.path.dirname(__file__), "isolation_forest_model.joblib")


def _init_isolation_forest():
    """Load pre-trained model or generate a robust baseline Isolation Forest model."""
    if os.path.exists(MODEL_PATH):
        try:
            m = joblib.load(MODEL_PATH)
            print("SUCCESS: Isolation Forest ML model loaded!")
            return m
        except Exception as e:
            print(f"WARNING: Error loading ML model from {MODEL_PATH}: {e}. Re-training baseline...")

    try:
        import numpy as np
        import pandas as pd
        from sklearn.ensemble import IsolationForest

        np.random.seed(42)
        n_samples = 400
        # Baseline normal traffic distribution
        latencies = np.clip(np.random.normal(loc=35.0, scale=15.0, size=n_samples), 4.0, 150.0)
        failed_auth = np.random.choice([0, 1], size=n_samples, p=[0.97, 0.03])
        unique_endpoints = np.random.randint(1, 4, size=n_samples)
        request_count_10s = np.random.randint(1, 8, size=n_samples)

        df = pd.DataFrame({
            "latency_ms": latencies,
            "failed_auth_count": failed_auth,
            "unique_endpoints": unique_endpoints,
            "request_count_10s": request_count_10s,
        })
        model = IsolationForest(n_estimators=100, contamination=0.03, random_state=42)
        model.fit(df)
        joblib.dump(model, MODEL_PATH)
        print("SUCCESS: Baseline Isolation Forest model synthesized and saved.")
        return model
    except Exception as e:
        print(f"WARNING: Could not synthesize ML model: {e}. Falling back to statistical scores.")
        return None


ml_model = _init_isolation_forest()

# ---- Thresholds ----
BRUTE_FORCE_WINDOW_SEC = 60
BRUTE_FORCE_THRESHOLD = 5          # >5 failed auths / 60s

SCAN_WINDOW_SEC = 60
SCAN_THRESHOLD = 15                # >15 unique endpoints / 60s

BURST_WINDOW_SEC = 10
BURST_THRESHOLD = 30               # >30 requests / 10s

ZSCORE_MEDIUM_THRESHOLD = 2.5      # combined anomaly score above this -> medium severity
AUTH_FAILURE_CODES = {401, 403}

DEFAULT_ALERT_COOLDOWN_SEC = 60.0  # 60s cooldown per (project, attack_type, ip)


# =====================================================================
# Project-Specific Adaptive Baseline Tracker (Option C Hybrid Component)
# =====================================================================

class ProjectBaselineTracker:
    """
    Per-project rolling statistical baseline tracker.
    Provides project-scoped latency and rate normalizers to eliminate cross-project interference.
    """
    def __init__(self, max_samples: int = 300):
        self.max_samples = max_samples
        self._lock = threading.Lock()
        self._project_latencies = defaultdict(lambda: deque(maxlen=self.max_samples))
        self._project_counts = defaultdict(int)

    def record_event(self, project_id: str, latency_ms: float):
        """Record an event into the project's statistical distribution."""
        with self._lock:
            self._project_latencies[project_id].append(float(latency_ms))
            self._project_counts[project_id] += 1

    def get_project_stats(self, project_id: str) -> dict:
        """Fetch rolling summary statistics for a specific project."""
        with self._lock:
            samples = list(self._project_latencies[project_id])
            count = self._project_counts[project_id]

        if len(samples) < 5:
            return {
                "count": count,
                "mean_latency": 35.0,
                "std_latency": 20.0,
                "is_cold": True,
            }

        mean = statistics.mean(samples)
        std = statistics.pstdev(samples) if len(samples) >= 2 else 15.0
        return {
            "count": count,
            "mean_latency": mean,
            "std_latency": max(std, 10.0),
            "is_cold": count < 50,
        }

    def compute_project_z_score(self, project_id: str, latency_ms: float) -> float:
        """Compute project-relative latency z-score."""
        stats = self.get_project_stats(project_id)
        return abs(latency_ms - stats["mean_latency"]) / stats["std_latency"]

    def reset(self):
        """Reset all in-memory baseline state (used by test suites)."""
        with self._lock:
            self._project_latencies.clear()
            self._project_counts.clear()


baseline_tracker = ProjectBaselineTracker()


# =====================================================================
# Alert Deduplication & Cooldown Manager
# =====================================================================

class AlertCooldownManager:
    """
    Thread-safe alert deduplication and cooldown manager.
    Prevents alert storms (e.g. 100 webhook alerts per minute) during sustained attacks,
    while still allowing every telemetry event to be recorded and displayed.
    """
    def __init__(self, cooldown_sec: float = DEFAULT_ALERT_COOLDOWN_SEC):
        self.cooldown_sec = cooldown_sec
        self._lock = threading.Lock()
        # (project_id, attack_type, ip) -> last_alert_timestamp
        self._last_alert_times = {}

    def check_alert(self, project_id: str, attack_type: str, ip: str, severity: str, now_ts: float = None) -> tuple:
        """
        Returns (alert_suppressed: bool, suppression_reason: str | None).
        """
        if severity == "low" or attack_type == "normal":
            return False, "not_an_alert"

        now_ts = now_ts or time.time()
        key = (project_id, attack_type, ip)

        with self._lock:
            last_ts = self._last_alert_times.get(key)
            if last_ts is not None and (now_ts - last_ts) < self.cooldown_sec:
                return True, "cooldown_active"

            # Record new alert dispatch timestamp
            self._last_alert_times[key] = now_ts
            return False, None

    def reset(self):
        """Reset cooldown records (used by test suites)."""
        with self._lock:
            self._last_alert_times.clear()


alert_cooldown_mgr = AlertCooldownManager()


# =====================================================================
# Feature Extraction & Rules
# =====================================================================

def compute_features(ip: str, now_ts: float, history: list) -> dict:
    """
    history = prior events for this IP within the largest window (60s)
    scoped strictly to the same project.
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
    """Returns a list of deterministic security rule names that fired."""
    flags = []
    if features["failed_auth_count"] > BRUTE_FORCE_THRESHOLD:
        flags.append("brute_force")
    if features["unique_endpoints"] > SCAN_THRESHOLD:
        flags.append("endpoint_scan")
    if features["request_count_10s"] > BURST_THRESHOLD:
        flags.append("request_burst")
    return flags


# =====================================================================
# Hybrid Anomaly Scoring (Option C)
# =====================================================================

def compute_anomaly_score(features: dict, history: list, project_id: str = "default") -> float:
    """
    Option C: Hybrid Isolation Forest + Project-Specific Baseline Scoring.
    1. Uses global Isolation Forest as structural cold-start prior.
    2. Blends with project-calibrated rolling statistical baseline.
    """
    global_score = 0.0
    if ml_model is not None:
        try:
            import pandas as pd
            X_live = pd.DataFrame([{
                "latency_ms": features.get("latency_ms", 0),
                "failed_auth_count": features.get("failed_auth_count", 0),
                "unique_endpoints": features.get("unique_endpoints", 0),
                "request_count_10s": features.get("request_count_10s", 0)
            }])
            raw_score = ml_model.score_samples(X_live)[0]
            # Normal traffic around -0.4. Attacks around -0.7 to -0.8.
            global_score = max(0.0, (-raw_score - 0.42) * 20.0)
        except Exception:
            global_score = 0.0

    # Project-specific baseline calibration
    latency = features.get("latency_ms", 0)
    proj_stats = baseline_tracker.get_project_stats(project_id)
    proj_z_score = baseline_tracker.compute_project_z_score(project_id, latency)

    # IP history-based statistical scores (rolling fallback)
    ip_z_scores = []
    if len(history) >= 2:
        latencies = [e["latency_ms"] for e in history]
        mean_l = statistics.mean(latencies)
        std_l = statistics.pstdev(latencies)
        if std_l > 0:
            ip_z_scores.append(abs((latency - mean_l) / std_l))

    ip_z_scores.append(features["failed_auth_count"] / BRUTE_FORCE_THRESHOLD)
    ip_z_scores.append(features["unique_endpoints"] / SCAN_THRESHOLD)
    ip_z_scores.append(features["request_count_10s"] / BURST_THRESHOLD)
    stat_score = sum(ip_z_scores) / len(ip_z_scores) if ip_z_scores else 0.0

    # Hybrid Combination
    if ml_model is not None:
        if proj_stats["is_cold"]:
            combined = global_score
        else:
            # Mature project: project-calibrated deviation adjusts global score
            alpha = min(0.6, proj_stats["count"] / 200.0)
            combined = (1.0 - alpha) * global_score + alpha * max(global_score * 0.7, proj_z_score)
        return round(float(combined), 3)
    else:
        # Fallback to statistical score
        return round(float(max(stat_score, proj_z_score)), 3)


def fuse(rule_flags: list, anomaly_score: float) -> str:
    """
    Fusion logic:
    Rules take priority (deterministic, explainable).
    Anomaly score catches statistical drift not covered by discrete rules.
    """
    if len(rule_flags) >= 2 or anomaly_score > 5.0:
        return "high"
    if len(rule_flags) == 1 or anomaly_score > ZSCORE_MEDIUM_THRESHOLD:
        return "medium"
    return "low"


# =====================================================================
# Attack Taxonomy & Continuous Risk/Confidence Scoring
# =====================================================================

def classify_attack(rule_flags: list, anomaly_score: float) -> str:
    """Classifies attack type deterministically and statistically."""
    if len(rule_flags) >= 2:
        return "composite_attack"
    if "brute_force" in rule_flags:
        return "brute_force"
    if "endpoint_scan" in rule_flags:
        return "endpoint_scan"
    if "request_burst" in rule_flags:
        return "request_burst"
    if anomaly_score > ZSCORE_MEDIUM_THRESHOLD:
        return "statistical_anomaly"
    return "normal"


def compute_risk_and_confidence(rule_flags: list, anomaly_score: float, attack_type: str, features: dict) -> tuple:
    """
    Computes:
    - risk_score: continuous 0.0 to 100.0
    - confidence: continuous 0.10 to 0.98
    """
    if attack_type == "normal":
        latency = features.get("latency_ms", 30)
        risk = min(25.0, max(2.0, (latency / 120.0) * 8.0 + anomaly_score * 3.0))
        # High confidence in baseline conformity, acknowledging real traffic uncertainty
        confidence = 0.92
        return round(risk, 1), confidence

    # Suspicious or attack traffic
    base_risk = min(anomaly_score * 10.0, 40.0)
    rule_risk = 0.0

    if "brute_force" in rule_flags:
        rule_risk += 45.0 + min(features.get("failed_auth_count", 0) * 3.0, 30.0)
    if "endpoint_scan" in rule_flags:
        rule_risk += 40.0 + min(features.get("unique_endpoints", 0) * 2.0, 30.0)
    if "request_burst" in rule_flags:
        rule_risk += 35.0 + min(features.get("request_count_10s", 0) * 1.5, 30.0)

    total_risk = min(100.0, max(base_risk + rule_risk, 35.0))

    if len(rule_flags) >= 2:
        confidence = 0.95
    elif len(rule_flags) == 1:
        confidence = 0.88
    else:
        confidence = round(min(0.85, 0.65 + (anomaly_score / 25.0)), 2)

    return round(total_risk, 1), confidence


# =====================================================================
# Main Scoring Pipeline
# =====================================================================

def score_event(event: dict) -> dict:
    """
    Main entry point called by the collector on every new telemetry event.
    Guarantees retention of:
    - organization_id
    - project_id
    - event_id
    - detection_timestamp
    - affected_project
    - affected_endpoint
    - source_ip
    - severity
    - risk_score
    - confidence
    - attack_type
    - alert_suppressed
    - suppression_reason
    """
    now_ts = float(event.get("timestamp", time.time()))
    ip = event.get("ip") or event.get("source_ip", "127.0.0.1")
    project_id = event.get("project_id") or event.get("tenant_id") or "default"
    latency_ms = float(event.get("latency_ms", 0.0))

    # Update project baseline tracker
    baseline_tracker.record_event(project_id, latency_ms)

    # Pull prior history for this IP strictly within this project
    history = get_events_since(ip, now_ts - 60, tenant_id=project_id)

    features = compute_features(ip, now_ts, history)
    features["latency_ms"] = latency_ms

    rule_flags = apply_rules(features)
    anomaly_score = compute_anomaly_score(features, history, project_id=project_id)
    severity = fuse(rule_flags, anomaly_score)
    attack_type = classify_attack(rule_flags, anomaly_score)
    risk_score, confidence = compute_risk_and_confidence(rule_flags, anomaly_score, attack_type, features)

    # Alert cooldown & deduplication check
    alert_suppressed, suppression_reason = alert_cooldown_mgr.check_alert(
        project_id, attack_type, ip, severity, now_ts
    )

    # Resolve organization_id if not present
    org_id = event.get("organization_id")
    if not org_id:
        org_id = get_organization_id_for_project(project_id)

    event_id = event.get("event_id") or f"evt_{uuid.uuid4().hex[:12]}"

    # Populate retention & detection metadata
    event["rule_flags"] = rule_flags
    event["anomaly_score"] = anomaly_score
    event["severity"] = severity
    event["risk_score"] = risk_score
    event["confidence"] = confidence
    event["attack_type"] = attack_type
    event["alert_suppressed"] = alert_suppressed
    event["suppression_reason"] = suppression_reason

    # Canonical identification & isolation fields
    event["project_id"] = project_id
    event["tenant_id"] = project_id
    event["organization_id"] = org_id
    event["event_id"] = event_id
    event["detection_timestamp"] = now_ts
    event["affected_project"] = project_id
    event["affected_endpoint"] = event.get("endpoint", "/")
    event["source_ip"] = ip
    event["ip"] = ip

    return event


def reset_detection_state():
    """Reset all detection state including baselines and cooldowns (for test suites)."""
    baseline_tracker.reset()
    alert_cooldown_mgr.reset()

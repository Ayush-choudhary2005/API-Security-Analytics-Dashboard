"""
attack_correlator.py — Multi-Alert Kill Chain Stitching Engine.
Correlates sequential alerts from the same IP within a project into
an ordered Attack Chain with MITRE ATT&CK stage labels.
Called by server.py after every medium/high severity alert.
Thread-safe. Never raises — errors are silently swallowed so the
ingest pipeline is never blocked.
"""
import uuid
import time
import json
import threading

# ── MITRE ATT&CK Stage Mapping ─────────────────────────────────────────────
MITRE_MAP = {
    "endpoint_scan":       {"stage": "Reconnaissance",    "icon": "🔍", "order": 1},
    "brute_force":         {"stage": "Credential Access", "icon": "🔑", "order": 2},
    "request_burst":       {"stage": "Impact",            "icon": "💥", "order": 3},
    "anomaly":             {"stage": "Discovery",         "icon": "🔎", "order": 2},
    "statistical_anomaly": {"stage": "Discovery",         "icon": "🔎", "order": 2},
    "composite_attack":    {"stage": "Multi-Stage Attack", "icon": "⚡", "order": 3},
    "normal":              {"stage": "Initial Access",    "icon": "✅", "order": 4},
}

# Chain stays open if last alert was within this window
CHAIN_WINDOW_SEC  = 600   # 10 minutes
# Chain auto-resolves after this silence
CHAIN_RESOLVE_SEC = 1800  # 30 minutes

_lock = threading.Lock()


def _get_mitre(attack_type: str) -> dict:
    return MITRE_MAP.get(attack_type, {"stage": "Unknown", "icon": "⚠️", "order": 99})


def _build_stage(event: dict) -> dict:
    """Convert a scored_event into a single chain stage dict."""
    attack_type = event.get("attack_type", "normal")
    mitre = _get_mitre(attack_type)
    return {
        "ts":          float(event.get("timestamp", time.time())),
        "attack_type": attack_type,
        "stage":       mitre["stage"],
        "icon":        mitre["icon"],
        "order":       mitre["order"],
        "endpoint":    event.get("endpoint", "/"),
        "method":      event.get("method", "GET"),
        "status_code": event.get("status_code", 0),
        "risk_score":  float(event.get("risk_score", 0.0)),
        "severity":    event.get("severity", "low"),
        "event_id":    str(event.get("event_id", "")),
    }


def correlate(event: dict, db_module) -> dict | None:
    """
    Main entry point. Call this from server.py after every medium/high alert.

    Parameters
    ----------
    event     : fully scored event dict from detection.score_event()
    db_module : the db module (passed in to avoid circular imports)

    Returns
    -------
    The upserted chain dict, or None on any error.
    """
    try:
        project_id = event.get("project_id") or event.get("tenant_id") or "default"
        ip         = event.get("ip") or event.get("source_ip", "unknown")
        severity   = event.get("severity", "low")
        risk_score = float(event.get("risk_score", 0.0))
        now        = float(event.get("timestamp", time.time()))

        # Only correlate real alerts
        if severity not in ("medium", "high"):
            return None

        new_stage = _build_stage(event)

        with _lock:
            existing = db_module.get_open_chain(project_id, ip, CHAIN_WINDOW_SEC)
            if existing:
                stages = json.loads(existing.get("stages", "[]"))
                stages.append(new_stage)
                stages.sort(key=lambda s: s["ts"])
                new_max_risk = max(float(existing.get("max_risk", 0.0)), risk_score)
                return db_module.update_chain(
                    chain_id   = existing["id"],
                    stages     = stages,
                    max_risk   = new_max_risk,
                    updated_at = now,
                )
            else:
                chain_id = f"chain_{uuid.uuid4().hex[:16]}"
                return db_module.create_chain(
                    chain_id   = chain_id,
                    project_id = project_id,
                    ip         = ip,
                    started_at = now,
                    updated_at = now,
                    stages     = [new_stage],
                    max_risk   = risk_score,
                )
    except Exception:
        return None


def resolve_stale_chains(db_module):
    """
    Mark chains as 'resolved' if no new alerts from that IP for CHAIN_RESOLVE_SEC.
    Called by a background thread in server.py every 5 minutes.
    """
    try:
        cutoff = time.time() - CHAIN_RESOLVE_SEC
        db_module.resolve_chains_before(cutoff)
    except Exception:
        pass

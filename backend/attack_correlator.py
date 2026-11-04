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
_active_chain_ips = set()


def _get_mitre(attack_type: str) -> dict:
    return MITRE_MAP.get(attack_type, {"stage": "Unknown", "icon": "⚠️", "order": 99})


def _build_stage(event: dict, stage_severity: str = None, stage_risk: float = None, is_initial_access: bool = False) -> dict:
    """Convert a scored_event into a single chain stage dict."""
    if is_initial_access:
        mitre = MITRE_MAP["normal"]  # {"stage": "Initial Access", "icon": "✅", "order": 4}
        attack_type = "initial_access"
    else:
        attack_type = event.get("attack_type", "normal")
        mitre = _get_mitre(attack_type)

    severity = stage_severity or event.get("severity", "low")
    risk = stage_risk if stage_risk is not None else float(event.get("risk_score", 0.0))
    event_identifier = str(event.get("id") or event.get("event_id", ""))
    return {
        "ts":          float(event.get("timestamp", time.time())),
        "attack_type": attack_type,
        "stage":       mitre["stage"],
        "icon":        mitre["icon"],
        "order":       mitre["order"],
        "endpoint":    event.get("endpoint", "/"),
        "method":      event.get("method", "GET"),
        "status_code": int(event.get("status_code", 0)),
        "risk_score":  risk,
        "severity":    severity,
        "event_id":    event_identifier,
        "count":       1,
    }


def correlate(event: dict, db_module) -> dict | None:
    """
    Main entry point. Call this from server.py after every alert
    or when an attacking IP achieves successful access (Initial Access).

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
        status_code = int(event.get("status_code", 0))

        # Eligibility check:
        # A) Standard alerts (medium or high severity)
        # B) Successful access response (200, 201, 204, 302) that may represent Initial Access
        is_alert = severity in ("medium", "high")
        is_success = status_code in (200, 201, 204, 302)

        if not is_alert and not is_success:
            return None

        with _lock:
            # Fast filter for normal requests: if IP is not in memory and DB has no open chain, return early
            if not is_alert and (project_id, ip) not in _active_chain_ips:
                existing = db_module.get_open_chain(project_id, ip, CHAIN_WINDOW_SEC)
                if not existing:
                    return None
                _active_chain_ips.add((project_id, ip))
            else:
                existing = db_module.get_open_chain(project_id, ip, CHAIN_WINDOW_SEC)

            # Normal requests NEVER create a new chain from scratch
            if not is_alert and not existing:
                _active_chain_ips.discard((project_id, ip))
                return None

            if existing:
                stages = json.loads(existing.get("stages", "[]"))
                already_has_initial_access = any(s.get("stage") == "Initial Access" for s in stages)

                # If the request was successful and Initial Access is not yet recorded for this chain:
                if is_success and not already_has_initial_access:
                    is_initial_access = True
                    stage_severity = "high"
                    stage_risk = max(risk_score, 90.0)
                    new_max_risk = max(float(existing.get("max_risk", 0.0)), 95.0)
                    new_stage = _build_stage(
                        event,
                        stage_severity=stage_severity,
                        stage_risk=stage_risk,
                        is_initial_access=True
                    )
                    stages.append(new_stage)
                else:
                    # If this is not an alert and Initial Access was already captured or not applicable, stop
                    if not is_alert:
                        return None
                    stage_severity = severity
                    stage_risk = risk_score
                    new_max_risk = max(float(existing.get("max_risk", 0.0)), risk_score)

                    # Stage Consolidation: If the incoming alert matches the latest stage's
                    # MITRE stage (e.g. repeated probe in an endpoint scan or repeated attempt in brute force)
                    # and occurred within a recent window (180s), consolidate into that stage
                    last_stage = stages[-1] if stages else None
                    candidate_mitre = _get_mitre(event.get("attack_type", "normal"))

                    if (
                        last_stage
                        and last_stage.get("stage") == candidate_mitre["stage"]
                        and (now - last_stage.get("ts", now)) < 180
                    ):
                        last_stage["count"] = last_stage.get("count", 1) + 1
                        last_stage["risk_score"] = max(float(last_stage.get("risk_score", 0.0)), stage_risk)
                        last_stage["last_ts"] = now
                        last_stage["endpoint"] = event.get("endpoint", last_stage.get("endpoint"))
                        last_stage["status_code"] = int(event.get("status_code", last_stage.get("status_code", 0)))
                        last_stage["event_id"] = str(event.get("id") or event.get("event_id", last_stage.get("event_id", "")))
                    else:
                        new_stage = _build_stage(
                            event,
                            stage_severity=stage_severity,
                            stage_risk=stage_risk,
                            is_initial_access=False
                        )
                        stages.append(new_stage)

                stages.sort(key=lambda s: s["ts"])

                _active_chain_ips.add((project_id, ip))

                return db_module.update_chain(
                    chain_id   = existing["id"],
                    stages     = stages,
                    max_risk   = new_max_risk,
                    updated_at = now,
                )
            else:
                new_stage = _build_stage(event, stage_severity=severity, stage_risk=risk_score)
                chain_id = f"chain_{uuid.uuid4().hex[:16]}"
                _active_chain_ips.add((project_id, ip))
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
        with _lock:
            _active_chain_ips.clear()
    except Exception:
        pass

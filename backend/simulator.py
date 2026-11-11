"""
simulator.py — Red Team Simulation Engine.

Fires controlled attack patterns (brute_force, endpoint_scan, request_burst)
through the server's internal ingest pipeline callback so every simulated event
goes through real validation, rate-limiting, ML + rule detection, persistence,
WebSocket broadcast, and kill-chain correlation without external HTTP or proxy
roundtrips.

Every simulated event carries metadata={"simulated": True, ...} so analytics
aggregations and external webhook/email notifications exclude simulation noise.
"""

import time
import uuid
import random
import threading
from collections import defaultdict
from typing import Callable, Tuple


VALID_ATTACK_TYPES = ("brute_force", "endpoint_scan", "request_burst")
VALID_INTENSITIES = ("low", "medium", "high")

# Calibrated against detection.py thresholds (BRUTE_FORCE > 5, SCAN > 15,
# BURST > 30 in 10s) and rate_limiter.py (MAX_REQUESTS = 50 in 60s).
# Note: detection.score_event inspects prior DB history before insert, so N
# requests yield max prior history of N-1; every preset exceeds threshold + 1.
ATTACK_PRESETS = {
    "brute_force": {
        "low":    {"requests": 8,  "delay": 0.45},
        "medium": {"requests": 16, "delay": 0.25},
        "high":   {"requests": 30, "delay": 0.12},
    },
    "endpoint_scan": {
        "low":    {"requests": 18, "delay": 0.35},
        "medium": {"requests": 26, "delay": 0.22},
        "high":   {"requests": 40, "delay": 0.12},
    },
    "request_burst": {
        "low":    {"requests": 33, "delay": 0.15},
        "medium": {"requests": 40, "delay": 0.10},
        "high":   {"requests": 52, "delay": 0.06},  # >50 in 60s triggers rate_limiter auto-block
    },
}

# Fixed RFC 5737 TEST-NET-1 attacker IPs (is_private=True -> skipped by GeoIP)
SIM_IPS = {
    "brute_force":   "192.0.2.1",
    "endpoint_scan": "192.0.2.2",
    "request_burst": "192.0.2.3",
}


def _default_status() -> dict:
    return {
        "running":         False,
        "attack_type":     None,
        "intensity":       None,
        "requests_total":  0,
        "requests_fired":  0,
        "requests_failed": 0,
        "alerts_fired":    0,
        "auto_blocked":    False,
        "started_at":      None,
        "finished_at":     None,
        "error":           None,
    }


_state: dict = defaultdict(_default_status)
_state_lock = threading.Lock()


def _normalize_project_id(project_id: str) -> str:
    if project_id in ("phase1-demo-token", "default"):
        return "proj_demo_default"
    return project_id


def get_presets() -> dict:
    """Return a copy of calibrated attack presets."""
    return {
        atk: {lvl: dict(cfg) for lvl, cfg in levels.items()}
        for atk, levels in ATTACK_PRESETS.items()
    }


def get_status(project_id: str) -> dict:
    """Return current simulation status snapshot for a project."""
    pid = _normalize_project_id(project_id)
    with _state_lock:
        return dict(_state[pid])


def reset_state(project_id: str = None):
    """Clear in-memory simulation state (primarily for tests)."""
    with _state_lock:
        if project_id is None:
            _state.clear()
        else:
            _state.pop(_normalize_project_id(project_id), None)


def _build_payload(attack_type: str, index: int) -> Tuple[dict, str]:
    """Construct a single simulated telemetry payload and its source IP."""
    ip = SIM_IPS.get(attack_type, "192.0.2.99")
    now = time.time()
    base_meta = {"simulated": True, "sim_index": index, "sim_attack_type": attack_type}

    if attack_type == "brute_force":
        payload = {
            "event_id":    f"sim_{uuid.uuid4().hex[:12]}",
            "endpoint":    "/api/login",
            "method":      "POST",
            "status_code": 401,
            "latency_ms":  round(random.uniform(30, 120), 2),
            "ip":          ip,
            "timestamp":   now,
            "metadata":    base_meta,
        }
    elif attack_type == "endpoint_scan":
        payload = {
            "event_id":    f"sim_{uuid.uuid4().hex[:12]}",
            "endpoint":    f"/api/probe{index}",
            "method":      "GET",
            "status_code": 404,
            "latency_ms":  round(random.uniform(10, 60), 2),
            "ip":          ip,
            "timestamp":   now,
            "metadata":    base_meta,
        }
    elif attack_type == "request_burst":
        payload = {
            "event_id":    f"sim_{uuid.uuid4().hex[:12]}",
            "endpoint":    "/api/products",
            "method":      "GET",
            "status_code": 200,
            "latency_ms":  round(random.uniform(5, 40), 2),
            "ip":          ip,
            "timestamp":   now,
            "metadata":    base_meta,
        }
    else:
        raise ValueError(f"Unsupported attack_type: {attack_type}")

    return payload, ip


def _run_simulation(
    project_id: str,
    attack_type: str,
    intensity: str,
    ingest_fn: Callable[[str, dict, str], Tuple[dict, int]],
):
    """Background daemon target that fires events sequentially and updates state."""
    preset = ATTACK_PRESETS[attack_type][intensity]
    total = preset["requests"]
    delay = preset["delay"]
    last_error = None

    try:
        for i in range(total):
            payload, ip = _build_payload(attack_type, i)
            try:
                body, status_code = ingest_fn(project_id, payload, ip)
            except Exception as exc:
                with _state_lock:
                    _state[project_id]["requests_failed"] += 1
                last_error = str(exc)
                time.sleep(delay)
                continue

            body_dict = body if isinstance(body, dict) else {}

            if status_code in (200, 201):
                is_alert = body_dict.get("severity") in ("medium", "high")
                with _state_lock:
                    _state[project_id]["requests_fired"] += 1
                    if is_alert:
                        _state[project_id]["alerts_fired"] += 1
            elif status_code == 429:
                with _state_lock:
                    _state[project_id]["requests_fired"] += 1
                    _state[project_id]["auto_blocked"] = True
                break
            else:
                with _state_lock:
                    _state[project_id]["requests_failed"] += 1
                last_error = body_dict.get("message") or body_dict.get("error") or f"HTTP {status_code}"

            if i < total - 1:
                time.sleep(delay)
    except Exception as exc:
        with _state_lock:
            _state[project_id]["error"] = str(exc)
    finally:
        with _state_lock:
            s = _state[project_id]
            if s["requests_fired"] == 0 and s["requests_failed"] > 0 and not s["error"]:
                s["error"] = last_error or "All simulated events failed"
            s["running"] = False
            s["finished_at"] = time.time()


def launch(
    project_id: str,
    attack_type: str,
    intensity: str,
    ingest_fn: Callable[[str, dict, str], Tuple[dict, int]],
) -> Tuple[bool, str]:
    """
    Launch a Red Team simulation in a background daemon thread.
    Returns (success: bool, message: str).
    Atomically reserves the running slot under _state_lock to prevent races.
    """
    if attack_type not in VALID_ATTACK_TYPES:
        return False, f"Unknown attack_type: {attack_type}"
    if intensity not in VALID_INTENSITIES:
        return False, f"Unknown intensity: {intensity}. Use low / medium / high"
    if not callable(ingest_fn):
        return False, "Invalid ingest callback"

    pid = _normalize_project_id(project_id)
    total = ATTACK_PRESETS[attack_type][intensity]["requests"]

    with _state_lock:
        if _state[pid]["running"]:
            return False, "A simulation is already running for this project"
        _state[pid] = {
            "running":         True,
            "attack_type":     attack_type,
            "intensity":       intensity,
            "requests_total":  total,
            "requests_fired":  0,
            "requests_failed": 0,
            "alerts_fired":    0,
            "auto_blocked":    False,
            "started_at":      time.time(),
            "finished_at":     None,
            "error":           None,
        }

    t = threading.Thread(
        target=_run_simulation,
        args=(pid, attack_type, intensity, ingest_fn),
        daemon=True,
        name=f"sim_{pid[:12]}",
    )
    try:
        t.start()
    except Exception as exc:
        with _state_lock:
            _state[pid]["running"] = False
            _state[pid]["finished_at"] = time.time()
            _state[pid]["error"] = str(exc)
        return False, f"Failed to start simulation thread: {exc}"

    return True, f"Simulation '{attack_type}' ({intensity}) launched"

"""
db.py — SQLite storage layer for ML-O11Y Phase 1.

Single 'events' table holds raw telemetry AND detection output.
No separate Hot/Metadata/Historical stores in Phase 1 (see architectures.md
Phase 2 notes for the full multi-store design).
"""

import sqlite3
import json
import os
import threading

DB_PATH = os.path.join(os.path.dirname(__file__), "events.db")

# SQLite + threading: Flask's dev server can handle requests on different
# threads, so we use a lock around writes to keep things simple and safe
# for a 24-hour build (no connection pooling needed at this scale).
_lock = threading.Lock()


def get_conn():
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    """Create the events table if it doesn't exist. Safe to call every startup."""
    conn = get_conn()
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp REAL NOT NULL,
            endpoint TEXT NOT NULL,
            method TEXT NOT NULL,
            status_code INTEGER NOT NULL,
            latency_ms REAL NOT NULL,
            ip TEXT NOT NULL,
            user_id TEXT,
            payload_size INTEGER DEFAULT 0,
            rule_flags TEXT DEFAULT '[]',
            anomaly_score REAL DEFAULT 0.0,
            severity TEXT DEFAULT 'low'
        )
        """
    )
    conn.commit()
    conn.close()


def insert_event(event: dict) -> int:
    """Insert a fully-scored event (after detection.py has run on it)."""
    with _lock:
        conn = get_conn()
        cur = conn.execute(
            """
            INSERT INTO events
                (timestamp, endpoint, method, status_code, latency_ms,
                 ip, user_id, payload_size, rule_flags, anomaly_score, severity)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                event["timestamp"],
                event["endpoint"],
                event["method"],
                event["status_code"],
                event["latency_ms"],
                event["ip"],
                event.get("user_id"),
                event.get("payload_size", 0),
                json.dumps(event.get("rule_flags", [])),
                event.get("anomaly_score", 0.0),
                event.get("severity", "low"),
            ),
        )
        conn.commit()
        event_id = cur.lastrowid
        conn.close()
        return event_id


def get_recent_events(limit: int = 50):
    conn = get_conn()
    rows = conn.execute(
        "SELECT * FROM events ORDER BY id DESC LIMIT ?", (limit,)
    ).fetchall()
    conn.close()
    return [_row_to_dict(r) for r in rows]


def get_recent_alerts(limit: int = 50):
    conn = get_conn()
    rows = conn.execute(
        "SELECT * FROM events WHERE severity != 'low' ORDER BY id DESC LIMIT ?",
        (limit,),
    ).fetchall()
    conn.close()
    return [_row_to_dict(r) for r in rows]


def get_alert_stats():
    """Returns the count of each attack type for the most recent 200 alerts to keep the chart dynamic."""
    conn = get_conn()
    rows = conn.execute("SELECT rule_flags, severity, anomaly_score FROM events WHERE severity != 'low' ORDER BY id DESC LIMIT 200").fetchall()
    conn.close()
    
    stats = {"brute_force": 0, "endpoint_scan": 0, "request_burst": 0, "anomaly": 0}
    for r in rows:
        flags_json = r["rule_flags"]
        
        if not flags_json:
            flags = []
        elif isinstance(flags_json, str):
            try:
                flags = json.loads(flags_json)
            except Exception:
                flags = []
        else:
            flags = flags_json
            
        if not isinstance(flags, list):
            flags = []
            
        has_rule = False
        if "brute_force" in flags:
            stats["brute_force"] += 1
            has_rule = True
        if "endpoint_scan" in flags:
            stats["endpoint_scan"] += 1
            has_rule = True
        if "request_burst" in flags:
            stats["request_burst"] += 1
            has_rule = True
            
        if not has_rule and r["anomaly_score"] > 2.5:
            stats["anomaly"] += 1
            
    return stats


def get_events_since(ip: str, since_timestamp: float):
    """Used by detection.py to compute rolling-window features for one IP."""
    conn = get_conn()
    rows = conn.execute(
        "SELECT * FROM events WHERE ip = ? AND timestamp >= ? ORDER BY timestamp ASC",
        (ip, since_timestamp),
    ).fetchall()
    conn.close()
    return [_row_to_dict(r) for r in rows]


def get_all_events_count():
    conn = get_conn()
    count = conn.execute("SELECT COUNT(*) as c FROM events").fetchone()["c"]
    conn.close()
    return count


def _row_to_dict(row):
    d = dict(row)
    d["rule_flags"] = json.loads(d["rule_flags"])
    return d


if __name__ == "__main__":
    init_db()
    print(f"Initialized DB at {DB_PATH}")

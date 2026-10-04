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
import json
from threading import Lock

DB_PATH = os.path.join(os.path.dirname(__file__), "events.db")

# SQLite + threading: Flask's dev server can handle requests on different
# threads, so we use a lock around writes to keep things simple and safe
# for a 24-hour build (no connection pooling needed at this scale).
_lock = Lock()


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
            payload_size INTEGER NOT NULL,
            rule_flags TEXT,
            anomaly_score REAL,
            severity TEXT,
            tenant_id TEXT DEFAULT 'default'
        )
        """
    )
    # create index for fast queries
    conn.execute("CREATE INDEX IF NOT EXISTS idx_events_tenant ON events(tenant_id, timestamp)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_events_ip ON events(ip, timestamp)")
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
                 ip, user_id, payload_size, rule_flags, anomaly_score, severity, tenant_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
                event.get("tenant_id", "default"),
            ),
        )
        conn.commit()
        event_id = cur.lastrowid
        conn.close()
        return event_id


def get_recent_events(limit: int = 50, tenant_id: str = "default"):
    conn = get_conn()
    rows = conn.execute(
        "SELECT * FROM events WHERE tenant_id = ? ORDER BY id DESC LIMIT ?", (tenant_id, limit)
    ).fetchall()
    conn.close()
    return [_row_to_dict(r) for r in rows]


def get_recent_alerts(limit: int = 50, tenant_id: str = "default"):
    conn = get_conn()
    rows = conn.execute(
        "SELECT * FROM events WHERE tenant_id = ? AND severity != 'low' ORDER BY id DESC LIMIT ?",
        (tenant_id, limit),
    ).fetchall()
    conn.close()
    return [_row_to_dict(r) for r in rows]


def get_alert_stats(tenant_id: str = "default"):
    """Returns the count of each attack type for the most recent 200 alerts to keep the chart dynamic."""
    conn = get_conn()
    rows = conn.execute("SELECT rule_flags, severity, anomaly_score FROM events WHERE tenant_id = ? AND severity != 'low' ORDER BY id DESC LIMIT 200", (tenant_id,)).fetchall()
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


def get_all_events_count(tenant_id: str = "default"):
    conn = get_conn()
    count = conn.execute("SELECT COUNT(*) as c FROM events WHERE tenant_id = ?", (tenant_id,)).fetchone()["c"]
    conn.close()
    return count


def get_historical_stats(tenant_id: str = "default"):
    """Fetches aggregated historical data for the analytics dashboard tab."""
    conn = get_conn()
    
    top_endpoints = conn.execute(
        "SELECT endpoint, count(*) as count FROM events WHERE tenant_id = ? AND severity != 'low' GROUP BY endpoint ORDER BY count DESC LIMIT 5", (tenant_id,)
    ).fetchall()
    
    top_ips = conn.execute(
        "SELECT ip, count(*) as count FROM events WHERE tenant_id = ? AND severity != 'low' GROUP BY ip ORDER BY count DESC LIMIT 5", (tenant_id,)
    ).fetchall()
    
    timeline = conn.execute(
        "SELECT strftime('%H:%M', datetime(timestamp, 'unixepoch', 'localtime')) as minute, sum(case when severity != 'low' then 1 else 0 end) as attacks, count(*) as total FROM events WHERE tenant_id = ? GROUP BY minute ORDER BY minute ASC LIMIT 60", (tenant_id,)
    ).fetchall()
    
    conn.close()
    
    return {
        "top_endpoints": [{"endpoint": r["endpoint"], "count": r["count"]} for r in top_endpoints],
        "top_ips": [{"ip": r["ip"], "count": r["count"]} for r in top_ips],
        "timeline": [{"minute": r["minute"], "attacks": r["attacks"], "total": r["total"]} for r in timeline]
    }


def _row_to_dict(row):
    d = dict(row)
    d["rule_flags"] = json.loads(d["rule_flags"])
    return d


if __name__ == "__main__":
    init_db()
    print(f"Initialized DB at {DB_PATH}")

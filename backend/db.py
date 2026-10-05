import psycopg2
import psycopg2.extras
from psycopg2 import pool
import json
import os
from threading import Lock

DATABASE_URL = os.environ.get("DATABASE_URL", "postgresql://postgres.tiqzlhargxftqzrrzvvf:capstone%40ojas%23123@aws-0-ap-south-1.pooler.supabase.com:5432/postgres")

_pool = None
def get_pool():
    global _pool
    if _pool is None:
        _pool = psycopg2.pool.ThreadedConnectionPool(1, 14, DATABASE_URL)
    return _pool

_lock = Lock()

def get_cursor(conn):
    return conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

def init_db():
    conn = get_pool().getconn()
    try:
        cur = get_cursor(conn)
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS events (
                id SERIAL PRIMARY KEY,
                timestamp DOUBLE PRECISION NOT NULL,
                endpoint TEXT NOT NULL,
                method TEXT NOT NULL,
                status_code INTEGER NOT NULL,
                latency_ms DOUBLE PRECISION NOT NULL,
                ip TEXT NOT NULL,
                user_id TEXT,
                payload_size INTEGER NOT NULL,
                rule_flags TEXT,
                anomaly_score DOUBLE PRECISION,
                severity TEXT,
                tenant_id TEXT DEFAULT 'default'
            )
            """
        )
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS tenants (
                tenant_id TEXT PRIMARY KEY,
                webhook_url TEXT
            )
            """
        )
        cur.execute("CREATE INDEX IF NOT EXISTS idx_events_tenant ON events(tenant_id, timestamp)")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_events_ip ON events(ip, timestamp)")
        conn.commit()
    finally:
        get_pool().putconn(conn)

def set_tenant_webhook(tenant_id: str, webhook_url: str):
    conn = get_pool().getconn()
    try:
        cur = get_cursor(conn)
        cur.execute(
            "INSERT INTO tenants (tenant_id, webhook_url) VALUES (%s, %s) ON CONFLICT(tenant_id) DO UPDATE SET webhook_url=EXCLUDED.webhook_url",
            (tenant_id, webhook_url)
        )
        conn.commit()
    finally:
        get_pool().putconn(conn)

def get_tenant_webhook(tenant_id: str) -> str:
    conn = get_pool().getconn()
    try:
        cur = get_cursor(conn)
        cur.execute("SELECT webhook_url FROM tenants WHERE tenant_id = %s", (tenant_id,))
        row = cur.fetchone()
        return row["webhook_url"] if row else ""
    finally:
        get_pool().putconn(conn)

def insert_event(event: dict) -> int:
    conn = get_pool().getconn()
    try:
        cur = get_cursor(conn)
        cur.execute(
            """
            INSERT INTO events
                (timestamp, endpoint, method, status_code, latency_ms,
                 ip, user_id, payload_size, rule_flags, anomaly_score, severity, tenant_id)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING id
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
                float(event.get("anomaly_score", 0.0)),
                event.get("severity", "low"),
                event.get("tenant_id", "default"),
            ),
        )
        event_id = cur.fetchone()["id"]
        conn.commit()
        return event_id
    finally:
        get_pool().putconn(conn)

def get_recent_events(limit: int = 50, tenant_id: str = "default"):
    conn = get_pool().getconn()
    try:
        cur = get_cursor(conn)
        cur.execute(
            "SELECT * FROM events WHERE tenant_id = %s ORDER BY id DESC LIMIT %s", (tenant_id, limit)
        )
        rows = cur.fetchall()
        return [_row_to_dict(r) for r in rows]
    finally:
        get_pool().putconn(conn)

def get_recent_alerts(limit: int = 50, tenant_id: str = "default"):
    conn = get_pool().getconn()
    try:
        cur = get_cursor(conn)
        cur.execute(
            "SELECT * FROM events WHERE tenant_id = %s AND severity != 'low' ORDER BY id DESC LIMIT %s",
            (tenant_id, limit),
        )
        rows = cur.fetchall()
        return [_row_to_dict(r) for r in rows]
    finally:
        get_pool().putconn(conn)

def get_alert_stats(tenant_id: str = "default"):
    conn = get_pool().getconn()
    try:
        cur = get_cursor(conn)
        cur.execute("SELECT rule_flags, severity, anomaly_score FROM events WHERE tenant_id = %s AND severity != 'low' ORDER BY id DESC LIMIT 200", (tenant_id,))
        rows = cur.fetchall()
        
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
    finally:
        get_pool().putconn(conn)

def get_events_since(ip: str, since_timestamp: float):
    conn = get_pool().getconn()
    try:
        cur = get_cursor(conn)
        cur.execute(
            "SELECT * FROM events WHERE ip = %s AND timestamp >= %s ORDER BY timestamp ASC",
            (ip, since_timestamp),
        )
        rows = cur.fetchall()
        return [_row_to_dict(r) for r in rows]
    finally:
        get_pool().putconn(conn)

def get_all_events_count(tenant_id: str = "default"):
    conn = get_pool().getconn()
    try:
        cur = get_cursor(conn)
        cur.execute("SELECT COUNT(*) as c FROM events WHERE tenant_id = %s", (tenant_id,))
        return cur.fetchone()["c"]
    finally:
        get_pool().putconn(conn)

def get_historical_stats(tenant_id: str = "default"):
    conn = get_pool().getconn()
    try:
        cur = get_cursor(conn)
        cur.execute(
            "SELECT endpoint, count(*) as count FROM events WHERE tenant_id = %s AND severity != 'low' GROUP BY endpoint ORDER BY count DESC LIMIT 5", (tenant_id,)
        )
        top_endpoints = cur.fetchall()
        cur.execute(
            "SELECT ip, count(*) as count FROM events WHERE tenant_id = %s AND severity != 'low' GROUP BY ip ORDER BY count DESC LIMIT 5", (tenant_id,)
        )
        top_ips = cur.fetchall()
        cur.execute(
            "SELECT to_char(to_timestamp(timestamp), 'HH24:MI') as minute, sum(case when severity != 'low' then 1 else 0 end) as attacks, count(*) as total FROM events WHERE tenant_id = %s GROUP BY minute ORDER BY minute ASC LIMIT 60", (tenant_id,)
        )
        timeline = cur.fetchall()
        return {
            "top_endpoints": [{"endpoint": r["endpoint"], "count": r["count"]} for r in top_endpoints],
            "top_ips": [{"ip": r["ip"], "count": r["count"]} for r in top_ips],
            "timeline": [{"minute": r["minute"], "attacks": r["attacks"], "total": r["total"]} for r in timeline]
        }
    finally:
        get_pool().putconn(conn)

def _row_to_dict(row):
    d = dict(row)
    d["rule_flags"] = json.loads(d["rule_flags"]) if d.get("rule_flags") else []
    return d


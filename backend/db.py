"""
db.py — SQLite storage layer for API Security Analytics Platform.

Maintains multi-tenant isolation across users, projects, API keys,
webhooks, and telemetry events.
"""

import sqlite3
import json
import os
import time
import uuid
import secrets
import hashlib
from threading import Lock
from werkzeug.security import generate_password_hash

DB_PATH = os.path.join(os.path.dirname(__file__), "events.db")
_lock = Lock()


def get_conn():
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    """Create all required tables if they don't exist. Safe to call on startup."""
    with _lock:
        conn = get_conn()
        
        # 1. Users table
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                email TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                created_at REAL NOT NULL
            )
            """
        )
        conn.execute("CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)")

        # 2. Projects table
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS projects (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                name TEXT NOT NULL,
                description TEXT DEFAULT '',
                created_at REAL NOT NULL,
                updated_at REAL NOT NULL,
                FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
            )
            """
        )
        conn.execute("CREATE INDEX IF NOT EXISTS idx_projects_user ON projects(user_id)")

        # 3. API Keys table
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS api_keys (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                project_id TEXT NOT NULL,
                name TEXT NOT NULL DEFAULT 'Default Key',
                key_prefix TEXT NOT NULL,
                key_hash TEXT NOT NULL,
                created_at REAL NOT NULL,
                revoked_at REAL,
                last_used_at REAL,
                FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
            )
            """
        )
        conn.execute("CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(key_hash)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_api_keys_project ON api_keys(project_id)")

        # 4. Webhook Configurations table
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS webhook_configs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                project_id TEXT NOT NULL,
                provider TEXT NOT NULL DEFAULT 'slack',
                webhook_url TEXT NOT NULL,
                enabled INTEGER DEFAULT 1,
                created_at REAL NOT NULL,
                updated_at REAL NOT NULL,
                FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
            )
            """
        )
        conn.execute("CREATE INDEX IF NOT EXISTS idx_webhook_project ON webhook_configs(project_id)")

        # 5. Events table (Existing telemetry and alerts store)
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
        
        # Backward-compatible column migration: add project_id if missing
        cursor = conn.execute("PRAGMA table_info(events)")
        columns = [row["name"] for row in cursor.fetchall()]
        if "project_id" not in columns:
            conn.execute("ALTER TABLE events ADD COLUMN project_id TEXT DEFAULT 'default'")
            conn.execute("UPDATE events SET project_id = tenant_id WHERE project_id = 'default'")

        # Create indexes for fast project & IP queries
        conn.execute("CREATE INDEX IF NOT EXISTS idx_events_project ON events(project_id, timestamp)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_events_tenant ON events(tenant_id, timestamp)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_events_ip ON events(ip, timestamp)")

        # 6. Automatic Seed for Default Demo Project & Compatibility
        _seed_default_demo_account(conn)

        conn.commit()
        conn.close()


def _seed_default_demo_account(conn):
    """Seed demo user, project, and API key for seamless backwards compatibility."""
    # Check if demo user exists
    user_row = conn.execute("SELECT id FROM users WHERE email = 'demo@mlo11y.local'").fetchone()
    if not user_row:
        user_id = "usr_demo_default"
        now = time.time()
        conn.execute(
            "INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)",
            (user_id, "demo@mlo11y.local", generate_password_hash("demopassword123"), now)
        )
    else:
        user_id = user_row["id"]

    # Check if demo project exists
    proj_row = conn.execute("SELECT id FROM projects WHERE id = 'phase1-demo-token' OR id = 'proj_demo_default'").fetchone()
    if not proj_row:
        proj_id = "proj_demo_default"
        now = time.time()
        conn.execute(
            "INSERT INTO projects (id, user_id, name, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
            (proj_id, user_id, "Demo E-Commerce Project", "Pre-configured demo application", now, now)
        )
    else:
        proj_id = proj_row["id"]

    # Check if phase1-demo-token API key exists
    demo_key_hash = hashlib.sha256(b"phase1-demo-token").hexdigest()
    key_row = conn.execute("SELECT id FROM api_keys WHERE key_hash = ?", (demo_key_hash,)).fetchone()
    if not key_row:
        now = time.time()
        conn.execute(
            "INSERT INTO api_keys (project_id, name, key_prefix, key_hash, created_at) VALUES (?, ?, ?, ?, ?)",
            (proj_id, "Demo Ingest Key", "phase1", demo_key_hash, now)
        )

    # Optional: seed global SLACK_WEBHOOK_URL into demo project if set in environment
    env_slack = os.environ.get("SLACK_WEBHOOK_URL", "")
    if env_slack:
        hook_row = conn.execute("SELECT id FROM webhook_configs WHERE project_id = ?", (proj_id,)).fetchone()
        if not hook_row:
            now = time.time()
            conn.execute(
                "INSERT INTO webhook_configs (project_id, provider, webhook_url, enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
                (proj_id, "slack", env_slack, 1, now, now)
            )


# ---------------------------------------------------------
# User Operations
# ---------------------------------------------------------

def create_user(email: str, password_hash: str) -> dict:
    """Create a new user."""
    user_id = f"usr_{uuid.uuid4().hex[:12]}"
    now = time.time()
    with _lock:
        conn = get_conn()
        conn.execute(
            "INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)",
            (user_id, email.strip().lower(), password_hash, now),
        )
        conn.commit()
        conn.close()
    return {"id": user_id, "email": email.strip().lower(), "created_at": now}


def get_user_by_email(email: str) -> dict:
    """Fetch user by email address (case-insensitive)."""
    if not email:
        return None
    conn = get_conn()
    row = conn.execute(
        "SELECT * FROM users WHERE LOWER(email) = LOWER(?)", (email.strip(),)
    ).fetchone()
    conn.close()
    return dict(row) if row else None


def get_user_by_id(user_id: str) -> dict:
    """Fetch user by ID (excluding password hash by default)."""
    if not user_id:
        return None
    conn = get_conn()
    row = conn.execute(
        "SELECT id, email, created_at FROM users WHERE id = ?", (user_id,)
    ).fetchone()
    conn.close()
    return dict(row) if row else None


# ---------------------------------------------------------
# Project Operations
# ---------------------------------------------------------

def create_project(user_id: str, name: str, description: str = "", project_id: str = None) -> dict:
    """Create a new project for a user."""
    pid = project_id or f"proj_{uuid.uuid4().hex[:12]}"
    now = time.time()
    with _lock:
        conn = get_conn()
        conn.execute(
            "INSERT INTO projects (id, user_id, name, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
            (pid, user_id, name.strip(), description.strip(), now, now),
        )
        conn.commit()
        conn.close()
    return {
        "id": pid,
        "user_id": user_id,
        "name": name.strip(),
        "description": description.strip(),
        "created_at": now,
        "updated_at": now,
    }


def get_projects_by_user(user_id: str) -> list:
    """List all projects owned by a user."""
    conn = get_conn()
    rows = conn.execute(
        "SELECT * FROM projects WHERE user_id = ? ORDER BY created_at ASC", (user_id,)
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_project_by_id(project_id: str) -> dict:
    """Fetch project details by project ID."""
    if not project_id:
        return None
    conn = get_conn()
    row = conn.execute("SELECT * FROM projects WHERE id = ?", (project_id,)).fetchone()
    conn.close()
    return dict(row) if row else None


def user_owns_project(user_id: str, project_id: str) -> bool:
    """Strict ownership check: does user_id own project_id?"""
    if not user_id or not project_id:
        return False
    conn = get_conn()
    # Check directly or allow demo compatibility
    row = conn.execute(
        "SELECT 1 FROM projects WHERE (id = ? OR id = ?) AND user_id = ?",
        (project_id, "proj_demo_default" if project_id in ("phase1-demo-token", "default") else project_id, user_id)
    ).fetchone()
    conn.close()
    return bool(row)


def delete_project(user_id: str, project_id: str) -> tuple:
    """
    Delete a project and its associated data if owned by the user.
    Safety checks:
    - Verifies ownership.
    - Prevents deleting if it is the user's only project.
    """
    if not user_owns_project(user_id, project_id):
        return False, "Forbidden: you do not own this project"

    user_projects = get_projects_by_user(user_id)
    if len(user_projects) <= 1:
        return False, "Cannot delete your only project. You must have at least one active project."

    with _lock:
        conn = get_conn()
        conn.execute("DELETE FROM api_keys WHERE project_id = ?", (project_id,))
        conn.execute("DELETE FROM webhook_configs WHERE project_id = ?", (project_id,))
        conn.execute("DELETE FROM events WHERE project_id = ? OR tenant_id = ?", (project_id, project_id))
        conn.execute("DELETE FROM projects WHERE id = ? AND user_id = ?", (project_id, user_id))
        conn.commit()
        conn.close()

    return True, "Project deleted successfully"



# ---------------------------------------------------------
# API Key Operations
# ---------------------------------------------------------

def create_api_key(project_id: str, name: str = "Default Key", raw_key: str = None) -> dict:
    """
    Generate an API key for a project. Returns the raw key once for display.
    Only the hash is persisted in the database.
    Format: ask_<project_identifier>_<random_secret>
    """
    if not raw_key:
        clean_pid = project_id.replace("proj_", "")
        random_secret = secrets.token_hex(16)
        raw_key = f"ask_{clean_pid}_{random_secret}"
    key_prefix = raw_key[:18] + "..." if len(raw_key) > 18 else raw_key
    key_hash = hashlib.sha256(raw_key.encode("utf-8")).hexdigest()
    now = time.time()

    with _lock:
        conn = get_conn()
        cur = conn.execute(
            "INSERT INTO api_keys (project_id, name, key_prefix, key_hash, created_at) VALUES (?, ?, ?, ?, ?)",
            (project_id, name, key_prefix, key_hash, now),
        )
        conn.commit()
        key_id = cur.lastrowid
        conn.close()

    return {
        "id": key_id,
        "project_id": project_id,
        "name": name,
        "key_prefix": key_prefix,
        "raw_key": raw_key,
        "created_at": now,
        "status": "active",
    }


def get_project_by_api_key(raw_key: str) -> dict:
    """Validate raw API key hash and return the corresponding active project."""
    if not raw_key:
        return None
    key_hash = hashlib.sha256(raw_key.encode("utf-8")).hexdigest()
    conn = get_conn()
    row = conn.execute(
        """
        SELECT p.*, k.id as key_id 
        FROM api_keys k 
        JOIN projects p ON k.project_id = p.id 
        WHERE k.key_hash = ? AND k.revoked_at IS NULL
        """,
        (key_hash,),
    ).fetchone()

    if row:
        now = time.time()
        conn.execute("UPDATE api_keys SET last_used_at = ? WHERE id = ?", (now, row["key_id"]))
        conn.commit()
        project = dict(row)
        conn.close()
        return project

    # Fallback compatibility for literal phase1 demo token
    if raw_key == "phase1-demo-token":
        row = conn.execute("SELECT * FROM projects WHERE id = 'proj_demo_default'").fetchone()
        conn.close()
        return dict(row) if row else None

    conn.close()
    return None


def list_api_keys_for_project(project_id: str) -> list:
    """List active and revoked API keys for a project (never returns secrets)."""
    conn = get_conn()
    rows = conn.execute(
        "SELECT id, project_id, name, key_prefix, created_at, revoked_at, last_used_at FROM api_keys WHERE project_id = ? ORDER BY id DESC",
        (project_id,),
    ).fetchall()
    conn.close()
    result = []
    for r in rows:
        d = dict(r)
        d["status"] = "revoked" if d.get("revoked_at") else "active"
        result.append(d)
    return result


def regenerate_api_key(project_id: str, name: str = "Regenerated SDK Key") -> dict:
    """Revoke existing active keys for a project and create a fresh new key."""
    now = time.time()
    with _lock:
        conn = get_conn()
        conn.execute(
            "UPDATE api_keys SET revoked_at = ? WHERE project_id = ? AND revoked_at IS NULL",
            (now, project_id),
        )
        conn.commit()
        conn.close()
    return create_api_key(project_id, name=name)


def revoke_api_key(key_id: int, project_id: str) -> bool:
    """Revoke an API key."""
    now = time.time()
    with _lock:
        conn = get_conn()
        cur = conn.execute(
            "UPDATE api_keys SET revoked_at = ? WHERE id = ? AND project_id = ? AND revoked_at IS NULL",
            (now, key_id, project_id),
        )
        conn.commit()
        affected = cur.rowcount
        conn.close()
    return affected > 0



# ---------------------------------------------------------
# Webhook Configurations
# ---------------------------------------------------------

def mask_webhook_url(url: str) -> str:
    """Mask sensitive tokens in webhook URL for display in API and UI."""
    if not url:
        return ""
    try:
        from urllib.parse import urlparse
        parsed = urlparse(url)
        path = parsed.path
        if "hooks.slack.com" in parsed.netloc:
            parts = [p for p in path.split("/") if p]
            if len(parts) >= 2 and parts[0] == "services":
                masked_parts = ["services"] + ["****" for _ in parts[1:]]
                return f"{parsed.scheme}://{parsed.netloc}/{'/'.join(masked_parts)}"
        elif "discord.com" in parsed.netloc or "discordapp.com" in parsed.netloc:
            parts = [p for p in path.split("/") if p]
            if len(parts) >= 4:
                return f"{parsed.scheme}://{parsed.netloc}/api/webhooks/{parts[2][:4]}****/********"
        
        parts = [p for p in path.split("/") if p]
        if parts:
            masked_path = "/" + parts[0] + "/****"
        else:
            masked_path = "/****"
        return f"{parsed.scheme}://{parsed.netloc}{masked_path}"
    except Exception:
        if len(url) > 20:
            return url[:12] + "****" + url[-4:]
        return "****"


def get_webhook_config(project_id: str, raw: bool = False, active_only: bool = False) -> dict:
    """Retrieve webhook config for a project, with URL masked unless raw=True."""
    conn = get_conn()
    query = "SELECT * FROM webhook_configs WHERE project_id = ?"
    if active_only:
        query += " AND enabled = 1"
    query += " LIMIT 1"
    row = conn.execute(query, (project_id,)).fetchone()
    conn.close()
    if not row:
        return None
    d = dict(row)
    d["enabled"] = bool(d.get("enabled", 1))
    if not raw:
        d["masked_url"] = mask_webhook_url(d.get("webhook_url", ""))
        d.pop("webhook_url", None)
    return d


def set_webhook_config(project_id: str, webhook_url: str = None, provider: str = "slack", enabled: int = 1) -> dict:
    """Save or update webhook configuration for a project. Returns masked config."""
    now = time.time()
    with _lock:
        conn = get_conn()
        existing = conn.execute("SELECT id, webhook_url FROM webhook_configs WHERE project_id = ?", (project_id,)).fetchone()
        if existing:
            target_url = webhook_url.strip() if webhook_url and "****" not in webhook_url else existing["webhook_url"]
            conn.execute(
                "UPDATE webhook_configs SET webhook_url = ?, provider = ?, enabled = ?, updated_at = ? WHERE project_id = ?",
                (target_url, provider, 1 if enabled else 0, now, project_id),
            )
        else:
            if not webhook_url:
                conn.close()
                return None
            conn.execute(
                "INSERT INTO webhook_configs (project_id, provider, webhook_url, enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
                (project_id, provider, webhook_url.strip(), 1 if enabled else 0, now, now),
            )
        conn.commit()
        conn.close()
    return get_webhook_config(project_id, raw=False)


def toggle_webhook_enabled(project_id: str, enabled: bool) -> dict:
    """Enable or disable webhook notifications for a project."""
    now = time.time()
    with _lock:
        conn = get_conn()
        conn.execute(
            "UPDATE webhook_configs SET enabled = ?, updated_at = ? WHERE project_id = ?",
            (1 if enabled else 0, now, project_id),
        )
        conn.commit()
        conn.close()
    return get_webhook_config(project_id, raw=False)


def delete_webhook_config(project_id: str) -> bool:
    """Permanently delete a project's webhook configuration."""
    with _lock:
        conn = get_conn()
        cur = conn.execute("DELETE FROM webhook_configs WHERE project_id = ?", (project_id,))
        conn.commit()
        affected = cur.rowcount
        conn.close()
    return affected > 0


# ---------------------------------------------------------
# Telemetry Events & Detection Queries
# ---------------------------------------------------------

def insert_event(event: dict) -> int:
    """Insert a fully-scored event into the database."""
    project_id = event.get("project_id") or event.get("tenant_id") or "default"
    with _lock:
        conn = get_conn()
        cur = conn.execute(
            """
            INSERT INTO events
                (timestamp, endpoint, method, status_code, latency_ms,
                 ip, user_id, payload_size, rule_flags, anomaly_score, severity, tenant_id, project_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
                project_id,
                project_id,
            ),
        )
        conn.commit()
        event_id = cur.lastrowid
        conn.close()
        return event_id


def get_event_by_id(event_id: int) -> dict:
    """Retrieve a single event by its ID."""
    conn = get_conn()
    row = conn.execute("SELECT * FROM events WHERE id = ?", (event_id,)).fetchone()
    conn.close()
    if row:
        return _row_to_dict(row)
    return None


def get_recent_events(limit: int = 50, tenant_id: str = "default"):
    """Fetch recent telemetry events scoped by project/tenant."""
    conn = get_conn()
    rows = conn.execute(
        """
        SELECT * FROM events 
        WHERE project_id = ? OR tenant_id = ? 
        ORDER BY id DESC LIMIT ?
        """,
        (tenant_id, tenant_id, limit),
    ).fetchall()
    conn.close()
    return [_row_to_dict(r) for r in rows]


def get_recent_alerts(limit: int = 50, tenant_id: str = "default"):
    """Fetch recent alerts (medium/high severity) scoped by project/tenant."""
    conn = get_conn()
    rows = conn.execute(
        """
        SELECT * FROM events 
        WHERE (project_id = ? OR tenant_id = ?) AND severity != 'low' 
        ORDER BY id DESC LIMIT ?
        """,
        (tenant_id, tenant_id, limit),
    ).fetchall()
    conn.close()
    return [_row_to_dict(r) for r in rows]


def get_alert_stats(tenant_id: str = "default"):
    """Returns the count of each attack type for the most recent 200 alerts scoped to project."""
    conn = get_conn()
    rows = conn.execute(
        """
        SELECT rule_flags, severity, anomaly_score 
        FROM events 
        WHERE (project_id = ? OR tenant_id = ?) AND severity != 'low' 
        ORDER BY id DESC LIMIT 200
        """,
        (tenant_id, tenant_id),
    ).fetchall()
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


def get_events_since(ip: str, since_timestamp: float, tenant_id: str = None):
    """Used by detection.py to compute rolling-window features for one IP."""
    conn = get_conn()
    if tenant_id:
        rows = conn.execute(
            """
            SELECT * FROM events 
            WHERE ip = ? AND (project_id = ? OR tenant_id = ?) AND timestamp >= ? 
            ORDER BY timestamp ASC
            """,
            (ip, tenant_id, tenant_id, since_timestamp),
        ).fetchall()
    else:
        rows = conn.execute(
            "SELECT * FROM events WHERE ip = ? AND timestamp >= ? ORDER BY timestamp ASC",
            (ip, since_timestamp),
        ).fetchall()
    conn.close()
    return [_row_to_dict(r) for r in rows]


def get_all_events_count(tenant_id: str = "default"):
    """Total event count for a project/tenant."""
    conn = get_conn()
    count = conn.execute(
        "SELECT COUNT(*) as c FROM events WHERE project_id = ? OR tenant_id = ?",
        (tenant_id, tenant_id),
    ).fetchone()["c"]
    conn.close()
    return count


def get_historical_stats(tenant_id: str = "default"):
    """Fetches aggregated historical data for the analytics dashboard tab scoped to project."""
    conn = get_conn()
    top_endpoints = conn.execute(
        """
        SELECT endpoint, count(*) as count 
        FROM events 
        WHERE (project_id = ? OR tenant_id = ?) AND severity != 'low' 
        GROUP BY endpoint ORDER BY count DESC LIMIT 5
        """,
        (tenant_id, tenant_id),
    ).fetchall()

    top_ips = conn.execute(
        """
        SELECT ip, count(*) as count 
        FROM events 
        WHERE (project_id = ? OR tenant_id = ?) AND severity != 'low' 
        GROUP BY ip ORDER BY count DESC LIMIT 5
        """,
        (tenant_id, tenant_id),
    ).fetchall()

    timeline = conn.execute(
        """
        SELECT strftime('%H:%M', datetime(timestamp, 'unixepoch', 'localtime')) as minute, 
               sum(case when severity != 'low' then 1 else 0 end) as attacks, 
               count(*) as total 
        FROM events 
        WHERE (project_id = ? OR tenant_id = ?) 
        GROUP BY minute ORDER BY minute ASC LIMIT 60
        """,
        (tenant_id, tenant_id),
    ).fetchall()

    conn.close()

    return {
        "top_endpoints": [{"endpoint": r["endpoint"], "count": r["count"]} for r in top_endpoints],
        "top_ips": [{"ip": r["ip"], "count": r["count"]} for r in top_ips],
        "timeline": [{"minute": r["minute"], "attacks": r["attacks"], "total": r["total"]} for r in timeline],
    }


def _row_to_dict(row):
    d = dict(row)
    if "rule_flags" in d and d["rule_flags"]:
        try:
            d["rule_flags"] = json.loads(d["rule_flags"])
        except Exception:
            d["rule_flags"] = []
    else:
        d["rule_flags"] = []
    return d


if __name__ == "__main__":
    init_db()
    print(f"Initialized DB with multi-tenant schema at {DB_PATH}")

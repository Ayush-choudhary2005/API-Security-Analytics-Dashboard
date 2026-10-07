"""
backend/migrations.py — Production Schema Migrations & Indexing Engine.

Handles database schema evolution across both PostgreSQL and SQLite.
Enforces:
- Foreign key constraints with ON DELETE CASCADE
- Primary and Unique constraints
- Strategic query indexes on organization_id, project_id, timestamp, event_id, severity
- Idempotent execution tracked in schema_migrations table
"""

import time
import os
import re
import uuid
from typing import List, Dict, Callable, Any
from werkzeug.security import generate_password_hash
from database import get_connection, is_postgres, transaction, get_database_url


def _get_schema_ddl(is_pg: bool) -> List[str]:
    """Generate DDL statements adjusted for the active database dialect."""
    auto_id = "SERIAL PRIMARY KEY" if is_pg else "INTEGER PRIMARY KEY AUTOINCREMENT"
    real_t = "DOUBLE PRECISION" if is_pg else "REAL"
    text_t = "TEXT"
    int_t = "INTEGER"

    ddl = [
        # 1. Users Table
        f"""
        CREATE TABLE IF NOT EXISTS users (
            id {text_t} PRIMARY KEY,
            email {text_t} UNIQUE NOT NULL,
            password_hash {text_t} NOT NULL,
            created_at {real_t} NOT NULL,
            updated_at {real_t},
            email_verified {int_t} DEFAULT 0,
            name {text_t} DEFAULT '',
            password_changed_at {real_t} DEFAULT NULL,
            last_login_at {real_t} DEFAULT NULL
        );
        """,

        # 2. Auth Identities (Federated OAuth providers e.g. Google)
        f"""
        CREATE TABLE IF NOT EXISTS auth_identities (
            id {text_t} PRIMARY KEY,
            user_id {text_t} NOT NULL,
            provider {text_t} NOT NULL,
            provider_user_id {text_t} NOT NULL,
            provider_email {text_t},
            created_at {real_t} NOT NULL,
            FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
            UNIQUE(provider, provider_user_id)
        );
        """,

        # 3. Email Verification Tokens
        f"""
        CREATE TABLE IF NOT EXISTS email_verification_tokens (
            id {text_t} PRIMARY KEY,
            user_id {text_t} NOT NULL,
            token_hash {text_t} UNIQUE NOT NULL,
            created_at {real_t} NOT NULL,
            expires_at {real_t} NOT NULL,
            used_at {real_t} DEFAULT NULL,
            FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
        );
        """,

        # 4. Password Reset Tokens
        f"""
        CREATE TABLE IF NOT EXISTS password_reset_tokens (
            id {text_t} PRIMARY KEY,
            user_id {text_t} NOT NULL,
            token_hash {text_t} UNIQUE NOT NULL,
            created_at {real_t} NOT NULL,
            expires_at {real_t} NOT NULL,
            used_at {real_t} DEFAULT NULL,
            FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
        );
        """,

        # 5. Organizations Table (Workspaces / Companies)
        f"""
        CREATE TABLE IF NOT EXISTS organizations (
            id {text_t} PRIMARY KEY,
            name {text_t} NOT NULL,
            slug {text_t} NOT NULL,
            created_at {real_t} NOT NULL,
            updated_at {real_t} NOT NULL
        );
        """,

        # 6. Organization Members Table
        f"""
        CREATE TABLE IF NOT EXISTS organization_members (
            id {text_t} PRIMARY KEY,
            organization_id {text_t} NOT NULL,
            user_id {text_t} NOT NULL,
            role {text_t} NOT NULL DEFAULT 'owner',
            created_at {real_t} NOT NULL,
            FOREIGN KEY(organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
            FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
            UNIQUE(organization_id, user_id)
        );
        """,

        # 7. Projects Table
        f"""
        CREATE TABLE IF NOT EXISTS projects (
            id {text_t} PRIMARY KEY,
            user_id {text_t} NOT NULL,
            name {text_t} NOT NULL,
            description {text_t} DEFAULT '',
            organization_id {text_t} DEFAULT NULL,
            created_at {real_t} NOT NULL,
            updated_at {real_t} NOT NULL,
            FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
        );
        """,

        # 8. SDK Credentials / API Keys Table
        f"""
        CREATE TABLE IF NOT EXISTS api_keys (
            id {auto_id},
            project_id {text_t} NOT NULL,
            name {text_t} NOT NULL DEFAULT 'Default Key',
            key_prefix {text_t} NOT NULL,
            key_hash {text_t} NOT NULL,
            created_at {real_t} NOT NULL,
            revoked_at {real_t},
            last_used_at {real_t},
            FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
        );
        """,

        # 9. Webhook Configurations Table
        f"""
        CREATE TABLE IF NOT EXISTS webhook_configs (
            id {auto_id},
            project_id {text_t} NOT NULL,
            provider {text_t} NOT NULL DEFAULT 'slack',
            webhook_url {text_t} NOT NULL,
            enabled {int_t} DEFAULT 1,
            created_at {real_t} NOT NULL,
            updated_at {real_t} NOT NULL,
            FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
        );
        """,

        # 10. Events Table (Telemetry & Security Alerts)
        f"""
        CREATE TABLE IF NOT EXISTS events (
            id {auto_id},
            timestamp {real_t} NOT NULL,
            endpoint {text_t} NOT NULL,
            method {text_t} NOT NULL,
            status_code {int_t} NOT NULL,
            latency_ms {real_t} NOT NULL,
            ip {text_t} NOT NULL,
            user_id {text_t},
            payload_size {int_t} NOT NULL,
            rule_flags {text_t},
            anomaly_score {real_t},
            severity {text_t},
            tenant_id {text_t} DEFAULT 'default',
            project_id {text_t} DEFAULT 'default',
            ingested_at {real_t} DEFAULT NULL,
            event_id {text_t} DEFAULT NULL,
            event_type {text_t} DEFAULT 'http_request',
            user_agent {text_t} DEFAULT NULL,
            metadata {text_t} DEFAULT '{{}}',
            organization_id {text_t} DEFAULT NULL,
            confidence {real_t} DEFAULT 0.0,
            attack_type {text_t} DEFAULT 'normal',
            risk_score {real_t} DEFAULT 0.0
        );
        """,

        # 11. Project Onboarding Table
        f"""
        CREATE TABLE IF NOT EXISTS project_onboarding (
            project_id {text_t} PRIMARY KEY,
            framework {text_t} NOT NULL DEFAULT 'flask',
            current_step {int_t} NOT NULL DEFAULT 1,
            completed_steps {text_t} NOT NULL DEFAULT '[]',
            status {text_t} NOT NULL DEFAULT 'in_progress',
            first_telemetry_at {real_t} DEFAULT NULL,
            created_at {real_t} NOT NULL,
            updated_at {real_t} NOT NULL,
            FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
        );
        """
    ]
    return ddl


def _get_indexes_ddl() -> List[str]:
    """
    Review and define all mission-critical performance indexes:
    - organization_id
    - project_id
    - timestamp
    - event_id
    - alert timestamps
    - IP lookup
    - API keys & webhooks
    """
    return [
        # User & Identity indexes
        "CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);",
        "CREATE INDEX IF NOT EXISTS idx_auth_identities_user ON auth_identities(user_id);",
        "CREATE INDEX IF NOT EXISTS idx_auth_identities_provider ON auth_identities(provider, provider_user_id);",
        "CREATE INDEX IF NOT EXISTS idx_evt_hash ON email_verification_tokens(token_hash);",
        "CREATE INDEX IF NOT EXISTS idx_evt_user ON email_verification_tokens(user_id);",
        "CREATE INDEX IF NOT EXISTS idx_prt_hash ON password_reset_tokens(token_hash);",
        "CREATE INDEX IF NOT EXISTS idx_prt_user ON password_reset_tokens(user_id);",

        # Organization & Project indexes
        "CREATE INDEX IF NOT EXISTS idx_organizations_slug ON organizations(slug);",
        "CREATE INDEX IF NOT EXISTS idx_org_members_user ON organization_members(user_id);",
        "CREATE INDEX IF NOT EXISTS idx_org_members_org ON organization_members(organization_id);",
        "CREATE INDEX IF NOT EXISTS idx_projects_user ON projects(user_id);",
        "CREATE INDEX IF NOT EXISTS idx_projects_org ON projects(organization_id);",

        # Credential & Webhook indexes
        "CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(key_hash);",
        "CREATE INDEX IF NOT EXISTS idx_api_keys_project ON api_keys(project_id);",
        "CREATE INDEX IF NOT EXISTS idx_webhook_project ON webhook_configs(project_id);",
        "CREATE INDEX IF NOT EXISTS idx_webhook_proj_provider ON webhook_configs(project_id, provider);",

        # Telemetry & Event Critical Indexes (organization_id, project_id, timestamp, event_id, alerts)
        "CREATE INDEX IF NOT EXISTS idx_events_project ON events(project_id);",
        "CREATE INDEX IF NOT EXISTS idx_events_org ON events(organization_id);",
        "CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp);",
        "CREATE INDEX IF NOT EXISTS idx_events_event_id ON events(event_id);",
        "CREATE INDEX IF NOT EXISTS idx_events_severity_time ON events(project_id, severity, timestamp);",
        "CREATE INDEX IF NOT EXISTS idx_events_ip_time ON events(ip, project_id, timestamp);",
        "CREATE INDEX IF NOT EXISTS idx_events_attack_type ON events(attack_type);",

        # Onboarding index
        "CREATE INDEX IF NOT EXISTS idx_onboarding_proj ON project_onboarding(project_id);"
    ]


def migration_001_core_schema(conn, is_pg: bool):
    """Execute initial schema creation DDL."""
    for stmt in _get_schema_ddl(is_pg):
        conn.execute(stmt)


def migration_002_performance_indexes(conn, is_pg: bool):
    """Execute strategic indexing DDL for multi-tenant queries."""
    for stmt in _get_indexes_ddl():
        conn.execute(stmt)


def migration_003_seed_demo_account(conn, is_pg: bool):
    """Seed initial demo workspace and credential for seamless backward-compatibility."""
    import hashlib
    now = time.time()
    user_row = conn.execute("SELECT id FROM users WHERE email = 'demo@mlo11y.local'").fetchone()
    if not user_row:
        user_id = "usr_demo_default"
        conn.execute(
            "INSERT INTO users (id, email, password_hash, created_at, email_verified, name) VALUES (?, ?, ?, ?, 1, 'Demo Operator')",
            (user_id, "demo@mlo11y.local", generate_password_hash("demopassword123"), now)
        )

        org_id = "org_demo_default"
        conn.execute(
            "INSERT INTO organizations (id, name, slug, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
            (org_id, "Demo Security Workspace", "demo-workspace", now, now)
        )
        conn.execute(
            "INSERT INTO organization_members (id, organization_id, user_id, role, created_at) VALUES (?, ?, ?, 'owner', ?)",
            ("mem_demo_default", org_id, user_id, now)
        )

        proj_id = "proj_demo_default"
        conn.execute(
            "INSERT INTO projects (id, user_id, name, description, organization_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (proj_id, user_id, "Production E-Commerce API", "Default demonstration project", org_id, now, now)
        )

        raw_key = "phase1-demo-token"
        key_hash = hashlib.sha256(raw_key.encode("utf-8")).hexdigest()
        conn.execute(
            "INSERT INTO api_keys (project_id, name, key_prefix, key_hash, created_at) VALUES (?, 'Demo Legacy Token', 'phase1-demo', ?, ?)",
            (proj_id, key_hash, now)
        )

        conn.execute(
            "INSERT INTO project_onboarding (project_id, framework, current_step, completed_steps, status, created_at, updated_at) VALUES (?, 'flask', 1, '[]', 'in_progress', ?, ?)",
            (proj_id, now, now)
        )


MIGRATIONS: List[Dict[str, Any]] = [
    {
        "version": "001_core_schema",
        "description": "Create core multi-tenant tables (users, orgs, projects, keys, events)",
        "func": migration_001_core_schema,
    },
    {
        "version": "002_performance_indexes",
        "description": "Add indexes for organization_id, project_id, timestamp, event_id, and alerts",
        "func": migration_002_performance_indexes,
    },
    {
        "version": "003_seed_demo_account",
        "description": "Seed default demonstration account, organization, and credential",
        "func": migration_003_seed_demo_account,
    },
]


def run_migrations(url: str = None) -> int:
    """
    Run all pending migrations in order.
    Returns the count of newly executed migrations.
    """
    target_url = url or get_database_url()
    is_pg = is_postgres(target_url)

    with transaction(target_url) as conn:
        # Create schema_migrations tracker
        text_type = "TEXT"
        real_type = "DOUBLE PRECISION" if is_pg else "REAL"
        conn.execute(
            f"""
            CREATE TABLE IF NOT EXISTS schema_migrations (
                version {text_type} PRIMARY KEY,
                description {text_type} NOT NULL,
                applied_at {real_type} NOT NULL
            );
            """
        )

        # Retrieve already applied versions
        rows = conn.execute("SELECT version FROM schema_migrations").fetchall()
        applied_versions = {r["version"] for r in rows}

        applied_count = 0
        for m in MIGRATIONS:
            v = m["version"]
            if v not in applied_versions:
                m["func"](conn, is_pg)
                conn.execute(
                    "INSERT INTO schema_migrations (version, description, applied_at) VALUES (?, ?, ?)",
                    (v, m["description"], time.time())
                )
                applied_count += 1

    return applied_count


if __name__ == "__main__":
    print(f"Connecting to database: {get_database_url()}")
    count = run_migrations()
    print(f"Migrations complete! Applied {count} migration(s).")

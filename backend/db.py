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
import re
from threading import Lock
from werkzeug.security import generate_password_hash

import database
import migrations

DB_PATH = os.path.join(os.path.dirname(__file__), "events.db")
_lock = Lock()
transaction = database.transaction


def get_conn():
    return database.get_connection()


def init_db():
    """Create all required tables, columns, and indexes via migrations engine. Safe on startup."""
    with _lock:
        migrations.run_migrations()


def _seed_default_demo_account(conn):
    """Seed demo user, organization, project, and API key for seamless backwards compatibility."""
    now = time.time()
    # 1. Check if demo user exists
    user_row = conn.execute("SELECT id FROM users WHERE email = 'demo@mlo11y.local'").fetchone()
    if not user_row:
        user_id = "usr_demo_default"
        conn.execute(
            "INSERT INTO users (id, email, password_hash, created_at, email_verified, name) VALUES (?, ?, ?, ?, 1, 'Demo Operator')",
            (user_id, "demo@mlo11y.local", generate_password_hash("demopassword123"), now)
        )
    else:
        user_id = user_row["id"]
        conn.execute("UPDATE users SET email_verified = 1 WHERE id = ?", (user_id,))

    # 2. Check if demo organization exists
    org_id = "org_demo_default"
    org_row = conn.execute("SELECT id FROM organizations WHERE id = ?", (org_id,)).fetchone()
    if not org_row:
        conn.execute(
            "INSERT INTO organizations (id, name, slug, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
            (org_id, "Acme Corporation", "acme-corp", now, now)
        )
    # Ensure demo user is owner member in demo organization
    mem_row = conn.execute("SELECT id FROM organization_members WHERE organization_id = ? AND user_id = ?", (org_id, user_id)).fetchone()
    if not mem_row:
        conn.execute(
            "INSERT INTO organization_members (id, organization_id, user_id, role, created_at) VALUES (?, ?, ?, 'owner', ?)",
            (f"mem_{uuid.uuid4().hex[:12]}", org_id, user_id, now)
        )

    # 3. Check if demo project exists
    proj_row = conn.execute("SELECT id FROM projects WHERE id = 'phase1-demo-token' OR id = 'proj_demo_default'").fetchone()
    if not proj_row:
        proj_id = "proj_demo_default"
        conn.execute(
            "INSERT INTO projects (id, organization_id, user_id, name, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (proj_id, org_id, user_id, "Demo E-Commerce Project", "Pre-configured demo application", now, now)
        )
    else:
        proj_id = proj_row["id"]
        conn.execute("UPDATE projects SET organization_id = ? WHERE id = ? AND (organization_id IS NULL OR organization_id = '')", (org_id, proj_id))

    # 4. Check if phase1-demo-token API key exists
    demo_key_hash = hashlib.sha256(b"phase1-demo-token").hexdigest()
    key_row = conn.execute("SELECT id FROM api_keys WHERE key_hash = ?", (demo_key_hash,)).fetchone()
    if not key_row:
        conn.execute(
            "INSERT INTO api_keys (project_id, name, key_prefix, key_hash, created_at) VALUES (?, ?, ?, ?, ?)",
            (proj_id, "Demo Ingest Key", "phase1", demo_key_hash, now)
        )

    # 5. Optional: seed global SLACK_WEBHOOK_URL into demo project if set in environment
    env_slack = os.environ.get("SLACK_WEBHOOK_URL", "")
    if env_slack:
        hook_row = conn.execute("SELECT id FROM webhook_configs WHERE project_id = ?", (proj_id,)).fetchone()
        if not hook_row:
            conn.execute(
                "INSERT INTO webhook_configs (project_id, provider, webhook_url, enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
                (proj_id, "slack", env_slack, 1, now, now)
            )


# ---------------------------------------------------------
# User Operations
# ---------------------------------------------------------

def create_user(email: str, password_hash: str = None, name: str = "", email_verified: int = 0) -> dict:
    """Create a new user. If no password is provided (OAuth), stores safe unmatchable marker."""
    user_id = f"usr_{uuid.uuid4().hex[:12]}"
    now = time.time()
    pw_hash = password_hash if password_hash else "!oauth_provider"
    with _lock:
        conn = get_conn()
        cursor = conn.execute("PRAGMA table_info(users)")
        cols = [r["name"] for r in cursor.fetchall()]
        
        insert_cols = ["id", "email", "password_hash", "created_at"]
        params = [user_id, email.strip().lower(), pw_hash, now]
        if "updated_at" in cols:
            insert_cols.append("updated_at")
            params.append(now)
        if "name" in cols:
            insert_cols.append("name")
            params.append(name.strip())
        if "email_verified" in cols:
            insert_cols.append("email_verified")
            params.append(int(email_verified))

        placeholders = ", ".join(["?"] * len(params))
        col_names = ", ".join(insert_cols)
        conn.execute(f"INSERT INTO users ({col_names}) VALUES ({placeholders})", params)
        conn.commit()
        conn.close()
    return {
        "id": user_id,
        "email": email.strip().lower(),
        "name": name.strip(),
        "email_verified": int(email_verified),
        "created_at": now,
        "updated_at": now
    }


def record_user_login(user_id: str):
    """Record timestamp of successful user login."""
    if not user_id:
        return
    now = time.time()
    with _lock:
        conn = get_conn()
        try:
            conn.execute("UPDATE users SET last_login_at = ? WHERE id = ?", (now, user_id))
            conn.commit()
        except Exception:
            pass
        finally:
            conn.close()


def update_user_profile(user_id: str, name: str = None) -> dict:
    """Update profile attributes such as display name."""
    if not user_id:
        return None
    now = time.time()
    with _lock:
        conn = get_conn()
        if name is not None:
            conn.execute("UPDATE users SET name = ?, updated_at = ? WHERE id = ?", (name.strip(), now, user_id))
        conn.commit()
        conn.close()
    return get_user_by_id(user_id)


def update_user_password(user_id: str, new_password_hash: str) -> bool:
    """Update user password hash and touch password_changed_at for session invalidation."""
    if not user_id or not new_password_hash:
        return False
    now = time.time()
    with _lock:
        conn = get_conn()
        conn.execute(
            "UPDATE users SET password_hash = ?, password_changed_at = ?, updated_at = ? WHERE id = ?",
            (new_password_hash, now, now, user_id)
        )
        conn.commit()
        conn.close()
    return True


def update_user_email_verified(user_id: str) -> bool:
    """Mark user email as verified. Uses db abstraction layer for PostgreSQL/SQLite compatibility."""
    if not user_id:
        return False
    now = time.time()
    with _lock:
        conn = get_conn()
        conn.execute(
            "UPDATE users SET email_verified = 1, updated_at = ? WHERE id = ?",
            (now, user_id)
        )
        conn.commit()
        conn.close()
    return True


def delete_user(user_id: str) -> tuple[bool, str]:
    """
    Permanently delete a user account and cascade-remove all owned entities:
    - User identities (auth_identities)
    - Tokens (email_verification_tokens, password_reset_tokens)
    - Organization memberships & owned organizations (with projects, keys, webhooks, events)
    - User record (users)
    """
    if not user_id:
        return False, "User ID is required"

    conn = get_conn()
    user = conn.execute("SELECT id FROM users WHERE id = ?", (user_id,)).fetchone()
    if not user:
        conn.close()
        return False, "User not found"

    # 1. Find all organizations owned by this user
    owned_org_rows = conn.execute(
        "SELECT organization_id FROM organization_members WHERE user_id = ? AND role = 'owner'",
        (user_id,)
    ).fetchall()
    owned_org_ids = [r["organization_id"] for r in owned_org_rows]

    # 2. Find all projects directly owned or within owned organizations
    proj_query = "SELECT id FROM projects WHERE user_id = ?"
    params = [user_id]
    if owned_org_ids:
        placeholders = ", ".join(["?"] * len(owned_org_ids))
        proj_query += f" OR organization_id IN ({placeholders})"
        params.extend(owned_org_ids)

    proj_rows = conn.execute(proj_query, tuple(params)).fetchall()
    proj_ids = list(set([r["id"] for r in proj_rows]))
    conn.close()

    with _lock:
        conn = get_conn()
        # Clean up projects
        for pid in proj_ids:
            conn.execute("DELETE FROM api_keys WHERE project_id = ?", (pid,))
            conn.execute("DELETE FROM webhook_configs WHERE project_id = ?", (pid,))
            conn.execute("DELETE FROM events WHERE project_id = ? OR tenant_id = ?", (pid, pid))
            try:
                conn.execute("DELETE FROM project_onboarding WHERE project_id = ?", (pid,))
            except Exception:
                pass
            conn.execute("DELETE FROM projects WHERE id = ?", (pid,))

        # Clean up owned organizations
        for oid in owned_org_ids:
            conn.execute("DELETE FROM organization_members WHERE organization_id = ?", (oid,))
            conn.execute("DELETE FROM organizations WHERE id = ?", (oid,))

        # Clean up memberships in any remaining organizations
        conn.execute("DELETE FROM organization_members WHERE user_id = ?", (user_id,))

        # Clean up authentication identities and tokens
        try:
            conn.execute("DELETE FROM auth_identities WHERE user_id = ?", (user_id,))
        except Exception:
            pass
        try:
            conn.execute("DELETE FROM email_verification_tokens WHERE user_id = ?", (user_id,))
        except Exception:
            pass
        try:
            conn.execute("DELETE FROM password_reset_tokens WHERE user_id = ?", (user_id,))
        except Exception:
            pass

        # Finally, delete user record
        conn.execute("DELETE FROM users WHERE id = ?", (user_id,))
        conn.commit()
        conn.close()

    return True, "User account and all associated data permanently deleted"


# ---------------------------------------------------------
# Email Verification & Password Reset Tokens
# ---------------------------------------------------------

def create_email_verification_token(user_id: str, expires_in_seconds: int = 86400) -> str:
    """
    Generate cryptographically random token for email verification.
    Stores only SHA-256 hash in database. Returns raw token for email delivery.
    """
    if not user_id:
        return None
    token_id = f"evt_{uuid.uuid4().hex[:12]}"
    raw_token = secrets.token_urlsafe(32)
    token_hash = hashlib.sha256(raw_token.encode("utf-8")).hexdigest()
    now = time.time()
    expires_at = now + expires_in_seconds

    with _lock:
        conn = get_conn()
        # Invalidate existing unused verification tokens for this user
        conn.execute("UPDATE email_verification_tokens SET used_at = ? WHERE user_id = ? AND used_at IS NULL", (now, user_id))
        conn.execute(
            "INSERT INTO email_verification_tokens (id, user_id, token_hash, created_at, expires_at) VALUES (?, ?, ?, ?, ?)",
            (token_id, user_id, token_hash, now, expires_at)
        )
        conn.commit()
        conn.close()
    return raw_token


def verify_email_token(raw_token: str) -> tuple[bool, str, dict]:
    """
    Validate email verification token and mark user email as verified.
    Returns (success, message, user_dict).
    """
    if not raw_token or not isinstance(raw_token, str):
        return False, "Token is required", None

    token_hash = hashlib.sha256(raw_token.strip().encode("utf-8")).hexdigest()
    now = time.time()

    with _lock:
        conn = get_conn()
        row = conn.execute(
            "SELECT * FROM email_verification_tokens WHERE token_hash = ?", (token_hash,)
        ).fetchone()

        if not row:
            conn.close()
            return False, "Invalid or unrecognized verification token", None

        if row["used_at"] is not None:
            conn.close()
            return False, "Verification token has already been used", None

        if now > row["expires_at"]:
            conn.close()
            return False, "Verification token has expired. Please request a new one.", None

        # Mark token used
        conn.execute("UPDATE email_verification_tokens SET used_at = ? WHERE id = ?", (now, row["id"]))
        # Update user email_verified flag
        conn.execute("UPDATE users SET email_verified = 1, updated_at = ? WHERE id = ?", (now, row["user_id"]))
        conn.commit()
        conn.close()

    user = get_user_by_id(row["user_id"])
    return True, "Email successfully verified", user


def create_password_reset_token(user_id: str, expires_in_seconds: int = 3600) -> str:
    """
    Generate single-use cryptographically random token for password reset.
    Stores only SHA-256 hash in database. Returns raw token.
    """
    if not user_id:
        return None
    token_id = f"prt_{uuid.uuid4().hex[:12]}"
    raw_token = secrets.token_urlsafe(32)
    token_hash = hashlib.sha256(raw_token.encode("utf-8")).hexdigest()
    now = time.time()
    expires_at = now + expires_in_seconds

    with _lock:
        conn = get_conn()
        # Invalidate any prior unused reset tokens for this user
        conn.execute("UPDATE password_reset_tokens SET used_at = ? WHERE user_id = ? AND used_at IS NULL", (now, user_id))
        conn.execute(
            "INSERT INTO password_reset_tokens (id, user_id, token_hash, created_at, expires_at) VALUES (?, ?, ?, ?, ?)",
            (token_id, user_id, token_hash, now, expires_at)
        )
        conn.commit()
        conn.close()
    return raw_token


def verify_password_reset_token(raw_token: str) -> tuple[bool, str, dict]:
    """
    Verify whether a password reset token is valid and not yet used or expired.
    Does NOT mark the token as used yet.
    """
    if not raw_token or not isinstance(raw_token, str):
        return False, "Token is required", None

    token_hash = hashlib.sha256(raw_token.strip().encode("utf-8")).hexdigest()
    now = time.time()

    conn = get_conn()
    row = conn.execute(
        "SELECT * FROM password_reset_tokens WHERE token_hash = ?", (token_hash,)
    ).fetchone()
    conn.close()

    if not row:
        return False, "Invalid or unrecognized reset token", None

    if row["used_at"] is not None:
        return False, "Reset token has already been used", None

    if now > row["expires_at"]:
        return False, "Reset token has expired. Please request a new password reset.", None

    return True, "Valid reset token", dict(row)


def apply_password_reset(raw_token: str, new_password_hash: str) -> tuple[bool, str]:
    """
    Atomically apply password reset: validates token, marks it used, and updates user password.
    Touches password_changed_at to invalidate concurrent sessions.
    """
    if not raw_token or not new_password_hash:
        return False, "Token and new password are required"

    token_hash = hashlib.sha256(raw_token.strip().encode("utf-8")).hexdigest()
    now = time.time()

    with _lock:
        conn = get_conn()
        row = conn.execute(
            "SELECT * FROM password_reset_tokens WHERE token_hash = ?", (token_hash,)
        ).fetchone()

        if not row:
            conn.close()
            return False, "Invalid or unrecognized reset token"

        if row["used_at"] is not None:
            conn.close()
            return False, "Reset token has already been used"

        if now > row["expires_at"]:
            conn.close()
            return False, "Reset token has expired"

        # Atomically consume token and update password
        conn.execute("UPDATE password_reset_tokens SET used_at = ? WHERE id = ?", (now, row["id"]))
        conn.execute(
            "UPDATE users SET password_hash = ?, password_changed_at = ?, updated_at = ? WHERE id = ?",
            (new_password_hash, now, now, row["user_id"])
        )
        conn.commit()
        conn.close()

    return True, "Password reset successfully"


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
    """Fetch user by ID (excluding password hash by default) with linked identity providers."""
    if not user_id:
        return None
    conn = get_conn()
    row = conn.execute(
        "SELECT * FROM users WHERE id = ?", (user_id,)
    ).fetchone()
    if not row:
        conn.close()
        return None
    user_data = dict(row)
    pw_hash = user_data.pop("password_hash", "")
    user_data["has_password"] = bool(pw_hash and not pw_hash.startswith("!oauth_"))
    user_data["email_verified"] = bool(user_data.get("email_verified", 0))

    ident_rows = conn.execute(
        "SELECT provider, provider_user_id, provider_email, created_at FROM auth_identities WHERE user_id = ?",
        (user_id,)
    ).fetchall()
    conn.close()
    user_data["identities"] = [dict(r) for r in ident_rows]
    return user_data


# ---------------------------------------------------------
# Federated Identity (OAuth) Operations
# ---------------------------------------------------------

def get_identity_by_provider(provider: str, provider_user_id: str) -> dict:
    """Fetch an identity by OAuth provider and stable subject ID (sub)."""
    if not provider or not provider_user_id:
        return None
    conn = get_conn()
    row = conn.execute(
        "SELECT * FROM auth_identities WHERE provider = ? AND provider_user_id = ?",
        (provider.strip().lower(), str(provider_user_id).strip())
    ).fetchone()
    conn.close()
    return dict(row) if row else None


def get_identities_by_user(user_id: str) -> list:
    """List all linked OAuth identities for an internal user."""
    if not user_id:
        return []
    conn = get_conn()
    rows = conn.execute(
        "SELECT id, provider, provider_user_id, provider_email, created_at FROM auth_identities WHERE user_id = ?",
        (user_id,)
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def link_identity(user_id: str, provider: str, provider_user_id: str, provider_email: str = None) -> dict:
    """
    Link a federated identity (e.g. Google sub) to an existing internal user.
    Enforces UNIQUE(provider, provider_user_id).
    """
    if not user_id or not provider or not provider_user_id:
        raise ValueError("user_id, provider, and provider_user_id are required")
    
    prov = provider.strip().lower()
    sub = str(provider_user_id).strip()
    norm_email = provider_email.strip().lower() if provider_email else None

    # Check if this provider_user_id is already linked
    existing = get_identity_by_provider(prov, sub)
    if existing:
        if existing["user_id"] == user_id:
            return existing  # Already linked to this user
        raise ValueError(f"This {prov} identity is already linked to another user account")

    identity_id = f"ident_{uuid.uuid4().hex[:12]}"
    now = time.time()
    with _lock:
        conn = get_conn()
        conn.execute(
            "INSERT INTO auth_identities (id, user_id, provider, provider_user_id, provider_email, created_at) VALUES (?, ?, ?, ?, ?, ?)",
            (identity_id, user_id, prov, sub, norm_email, now)
        )
        # Also update user updated_at if column exists
        try:
            conn.execute("UPDATE users SET updated_at = ? WHERE id = ?", (now, user_id))
        except Exception:
            pass
        conn.commit()
        conn.close()

    return {
        "id": identity_id,
        "user_id": user_id,
        "provider": prov,
        "provider_user_id": sub,
        "provider_email": norm_email,
        "created_at": now
    }


def create_user_with_identity(email: str, provider: str, provider_user_id: str, provider_email: str = None) -> dict:
    """
    Create a new internal user directly linked to an OAuth identity (e.g. Google signup).
    Clean slate: does NOT auto-provision workspaces, projects, or API keys.
    """
    norm_email = email.strip().lower()
    user = create_user(norm_email, password_hash=None)
    identity = link_identity(user["id"], provider, provider_user_id, provider_email or norm_email)
    
    return {
        "id": user["id"],
        "email": user["email"],
        "created_at": user["created_at"],
        "updated_at": user.get("updated_at"),
        "identity": identity
    }


# ---------------------------------------------------------
# Organization / Workspace Operations
# ---------------------------------------------------------

def create_organization(user_id: str, name: str, slug: str = None) -> dict:
    """Create a new organization workspace and set the user as its owner."""
    if not user_id or not name:
        raise ValueError("user_id and organization name are required")

    org_id = f"org_{uuid.uuid4().hex[:12]}"
    clean_name = name.strip()
    if not slug:
        clean_slug = re.sub(r'[^a-zA-Z0-9]', '-', clean_name.lower()).strip('-') or "org"
        slug = f"{clean_slug}-{org_id[-4:]}"
    else:
        slug = slug.strip().lower()

    now = time.time()
    member_id = f"mem_{uuid.uuid4().hex[:12]}"

    with _lock:
        conn = get_conn()
        conn.execute(
            "INSERT INTO organizations (id, name, slug, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
            (org_id, clean_name, slug, now, now)
        )
        conn.execute(
            "INSERT INTO organization_members (id, organization_id, user_id, role, created_at) VALUES (?, ?, ?, 'owner', ?)",
            (member_id, org_id, user_id, now)
        )
        conn.commit()
        conn.close()

    return {
        "id": org_id,
        "name": clean_name,
        "slug": slug,
        "role": "owner",
        "created_at": now,
        "updated_at": now
    }


def get_organizations_by_user(user_id: str) -> list:
    """List all organizations/workspaces the user belongs to with member and project counts."""
    if not user_id:
        return []
    conn = get_conn()
    rows = conn.execute(
        """
        SELECT o.id, o.name, o.slug, o.created_at, o.updated_at, om.role,
               (SELECT COUNT(*) FROM projects p WHERE p.organization_id = o.id) as project_count,
               (SELECT COUNT(*) FROM organization_members m WHERE m.organization_id = o.id) as member_count
        FROM organizations o
        JOIN organization_members om ON o.id = om.organization_id
        WHERE om.user_id = ?
        ORDER BY o.created_at ASC
        """,
        (user_id,)
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_organization_by_id(organization_id: str) -> dict:
    """Fetch details of an organization."""
    if not organization_id:
        return None
    conn = get_conn()
    row = conn.execute(
        """
        SELECT o.id, o.name, o.slug, o.created_at, o.updated_at,
               (SELECT COUNT(*) FROM projects p WHERE p.organization_id = o.id) as project_count,
               (SELECT COUNT(*) FROM organization_members m WHERE m.organization_id = o.id) as member_count
        FROM organizations o
        WHERE o.id = ?
        """,
        (organization_id,)
    ).fetchone()
    conn.close()
    return dict(row) if row else None


def user_in_organization(user_id: str, organization_id: str) -> bool:
    """Check if a user is a member of the given organization."""
    if not user_id or not organization_id:
        return False
    conn = get_conn()
    row = conn.execute(
        "SELECT 1 FROM organization_members WHERE user_id = ? AND organization_id = ?",
        (user_id, organization_id)
    ).fetchone()
    conn.close()
    return bool(row)


def get_user_role_in_organization(user_id: str, organization_id: str) -> str:
    """Return user's role in organization or None."""
    if not user_id or not organization_id:
        return None
    conn = get_conn()
    row = conn.execute(
        "SELECT role FROM organization_members WHERE user_id = ? AND organization_id = ?",
        (user_id, organization_id)
    ).fetchone()
    conn.close()
    return row["role"] if row else None


def add_organization_member(organization_id: str, user_id: str, role: str = "member") -> dict:
    """Add a user as a member of an organization."""
    if not organization_id or not user_id:
        raise ValueError("organization_id and user_id are required")
    now = time.time()
    member_id = f"mem_{uuid.uuid4().hex[:12]}"
    with _lock:
        conn = get_conn()
        conn.execute(
            """
            INSERT INTO organization_members (id, organization_id, user_id, role, created_at)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(organization_id, user_id) DO UPDATE SET role = excluded.role
            """,
            (member_id, organization_id, user_id, role, now)
        )
        conn.commit()
        conn.close()
    return {
        "id": member_id,
        "organization_id": organization_id,
        "user_id": user_id,
        "role": role,
        "created_at": now
    }


def remove_organization_member(organization_id: str, user_id: str) -> bool:
    """Remove a user from an organization."""
    with _lock:
        conn = get_conn()
        cur = conn.execute(
            "DELETE FROM organization_members WHERE organization_id = ? AND user_id = ?",
            (organization_id, user_id)
        )
        conn.commit()
        affected = cur.rowcount
        conn.close()
    return affected > 0


def get_organization_members(organization_id: str) -> list:
    """List all members of an organization with user profile details."""
    conn = get_conn()
    rows = conn.execute(
        """
        SELECT om.id, om.organization_id, om.user_id, om.role, om.created_at,
               u.email, u.name, u.email_verified
        FROM organization_members om
        JOIN users u ON om.user_id = u.id
        WHERE om.organization_id = ?
        ORDER BY om.created_at ASC
        """,
        (organization_id,)
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def delete_organization(user_id: str, organization_id: str) -> tuple:
    """
    Delete an organization if owned by user. Cascades to members, projects, keys, webhooks, events.
    """
    if get_user_role_in_organization(user_id, organization_id) != "owner":
        return False, "Forbidden: only organization owners can delete an organization"

    # Fetch all project IDs in this org
    conn = get_conn()
    proj_rows = conn.execute("SELECT id FROM projects WHERE organization_id = ?", (organization_id,)).fetchall()
    proj_ids = [r["id"] for r in proj_rows]
    conn.close()

    with _lock:
        conn = get_conn()
        for pid in proj_ids:
            conn.execute("DELETE FROM api_keys WHERE project_id = ?", (pid,))
            conn.execute("DELETE FROM webhook_configs WHERE project_id = ?", (pid,))
            conn.execute("DELETE FROM events WHERE project_id = ? OR tenant_id = ?", (pid, pid))
            conn.execute("DELETE FROM projects WHERE id = ?", (pid,))

        conn.execute("DELETE FROM organization_members WHERE organization_id = ?", (organization_id,))
        conn.execute("DELETE FROM organizations WHERE id = ?", (organization_id,))
        conn.commit()
        conn.close()

    return True, "Organization deleted successfully"


# ---------------------------------------------------------
# Project Operations
# ---------------------------------------------------------

def create_project(user_id: str, name: str, description: str = "", project_id: str = None, organization_id: str = None) -> dict:
    """
    Create a new project scoped to an organization.
    Authorizes via organization membership.
    """
    if not user_id or not name:
        raise ValueError("user_id and project name are required")

    # If organization_id is provided, verify user is a member of that organization
    if organization_id:
        if not user_in_organization(user_id, organization_id):
            raise PermissionError("Forbidden: user is not a member of this organization")
        org_id = organization_id
    else:
        # Resolve to user's first organization or auto-provision one
        user_orgs = get_organizations_by_user(user_id)
        if user_orgs:
            org_id = user_orgs[0]["id"]
        else:
            new_org = create_organization(user_id, name="Default Organization")
            org_id = new_org["id"]

    pid = project_id or f"proj_{uuid.uuid4().hex[:12]}"
    now = time.time()
    with _lock:
        conn = get_conn()
        conn.execute(
            "INSERT INTO projects (id, organization_id, user_id, name, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (pid, org_id, user_id, name.strip(), description.strip(), now, now),
        )
        conn.execute(
            "INSERT OR IGNORE INTO project_onboarding (project_id, framework, current_step, completed_steps, status, created_at, updated_at) VALUES (?, 'flask', 1, '[]', 'in_progress', ?, ?)",
            (pid, now, now)
        )
        conn.commit()
        conn.close()

    org = get_organization_by_id(org_id)
    return {
        "id": pid,
        "organization_id": org_id,
        "organization_name": org["name"] if org else "",
        "user_id": user_id,
        "name": name.strip(),
        "description": description.strip(),
        "created_at": now,
        "updated_at": now,
    }


def get_projects_by_user(user_id: str, organization_id: str = None) -> list:
    """
    List all projects accessible to the user through organization membership or ownership.
    Optionally filter by organization_id.
    """
    if not user_id:
        return []

    conn = get_conn()
    if organization_id:
        if not user_in_organization(user_id, organization_id):
            conn.close()
            return []
        rows = conn.execute(
            """
            SELECT p.*, o.name as organization_name 
            FROM projects p
            LEFT JOIN organizations o ON p.organization_id = o.id
            WHERE p.organization_id = ?
            ORDER BY p.created_at ASC
            """,
            (organization_id,)
        ).fetchall()
    else:
        rows = conn.execute(
            """
            SELECT DISTINCT p.*, o.name as organization_name 
            FROM projects p
            LEFT JOIN organizations o ON p.organization_id = o.id
            LEFT JOIN organization_members om ON p.organization_id = om.organization_id
            WHERE om.user_id = ? OR p.user_id = ?
            ORDER BY p.created_at ASC
            """,
            (user_id, user_id)
        ).fetchall()

    conn.close()
    return [dict(r) for r in rows]


def get_project_by_id(project_id: str) -> dict:
    """Fetch project details including organization info."""
    if not project_id:
        return None
    effective_pid = "proj_demo_default" if project_id in ("phase1-demo-token", "default") else project_id
    conn = get_conn()
    row = conn.execute(
        """
        SELECT p.*, o.name as organization_name 
        FROM projects p
        LEFT JOIN organizations o ON p.organization_id = o.id
        WHERE p.id = ?
        """,
        (effective_pid,)
    ).fetchone()
    conn.close()
    return dict(row) if row else None


def user_has_project_access(user_id: str, project_id: str) -> bool:
    """
    Strict server-side multi-tenant authorization check:
    authenticated user -> organization membership -> project.
    Never trusts organization_id or project_id supplied by frontend.
    """
    if not user_id or not project_id:
        return False

    effective_pid = "proj_demo_default" if project_id in ("phase1-demo-token", "default") else project_id
    conn = get_conn()

    # Primary Check: User is in the organization that owns this project
    row_org = conn.execute(
        """
        SELECT 1 
        FROM projects p
        JOIN organization_members om ON p.organization_id = om.organization_id
        WHERE p.id = ? AND om.user_id = ?
        """,
        (effective_pid, user_id)
    ).fetchone()

    if row_org:
        conn.close()
        return True

    # Secondary Check: Direct user_id match on project
    row_user = conn.execute(
        "SELECT 1 FROM projects WHERE id = ? AND user_id = ?",
        (effective_pid, user_id)
    ).fetchone()
    conn.close()
    return bool(row_user)


def user_owns_project(user_id: str, project_id: str) -> bool:
    """Alias for user_has_project_access to enforce multi-tenant authorization everywhere."""
    return user_has_project_access(user_id, project_id)


def delete_project(user_id: str, project_id: str) -> tuple:
    """
    Delete a project if the user has authorized access in that organization.
    Checks:
    - User has project access
    - User cannot delete if it is their only project in that organization
    """
    if not user_has_project_access(user_id, project_id):
        return False, "Forbidden: you do not have access to this project"

    proj = get_project_by_id(project_id)
    org_id = proj.get("organization_id") if proj else None

    # Check remaining projects in this organization
    org_projects = get_projects_by_user(user_id, organization_id=org_id)
    if len(org_projects) <= 1:
        return False, "Cannot delete your only project. You must have at least one active project."

    with _lock:
        conn = get_conn()
        conn.execute("DELETE FROM api_keys WHERE project_id = ?", (project_id,))
        conn.execute("DELETE FROM webhook_configs WHERE project_id = ?", (project_id,))
        conn.execute("DELETE FROM events WHERE project_id = ? OR tenant_id = ?", (project_id, project_id))
        conn.execute("DELETE FROM projects WHERE id = ?", (project_id,))
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


def verify_api_key(raw_key: str) -> str:
    """Validate raw key and return the project_id string, or None if invalid/revoked."""
    project = get_project_by_api_key(raw_key)
    return project["id"] if project else None


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


def rotate_single_api_key(key_id: int, project_id: str, new_name: str = None) -> dict:
    """Revoke an individual API key and generate a fresh key replacing it."""
    conn = get_conn()
    row = conn.execute(
        "SELECT name FROM api_keys WHERE id = ? AND project_id = ?",
        (key_id, project_id),
    ).fetchone()
    conn.close()
    if not row:
        return None

    old_name = row["name"] if isinstance(row, dict) else row[0]
    name_to_use = new_name or f"{old_name} (Rotated)"

    now = time.time()
    with _lock:
        conn = get_conn()
        conn.execute(
            "UPDATE api_keys SET revoked_at = ? WHERE id = ? AND project_id = ? AND revoked_at IS NULL",
            (now, key_id, project_id),
        )
        conn.commit()
        conn.close()

    return create_api_key(project_id, name=name_to_use)



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


def get_webhook_config(project_id: str, provider: str = None, raw: bool = False, active_only: bool = False) -> dict:
    """Retrieve webhook config for a project, optionally filtered by provider, with URL masked unless raw=True."""
    conn = get_conn()
    params = [project_id]
    query = "SELECT * FROM webhook_configs WHERE project_id = ?"
    if provider:
        query += " AND provider = ?"
        params.append(provider.strip().lower())
    if active_only:
        query += " AND enabled = 1"
    query += " ORDER BY id ASC LIMIT 1"
    row = conn.execute(query, tuple(params)).fetchone()
    conn.close()
    if not row:
        return None
    d = dict(row)
    d["enabled"] = bool(d.get("enabled", 1))
    if not raw:
        d["masked_url"] = mask_webhook_url(d.get("webhook_url", ""))
        d.pop("webhook_url", None)
    return d


def list_webhook_configs(project_id: str, raw: bool = False, active_only: bool = False) -> list:
    """List all webhook configs (Slack, Discord, etc.) for a project."""
    conn = get_conn()
    query = "SELECT * FROM webhook_configs WHERE project_id = ?"
    if active_only:
        query += " AND enabled = 1"
    query += " ORDER BY id ASC"
    rows = conn.execute(query, (project_id,)).fetchall()
    conn.close()
    result = []
    for r in rows:
        d = dict(r)
        d["enabled"] = bool(d.get("enabled", 1))
        if not raw:
            d["masked_url"] = mask_webhook_url(d.get("webhook_url", ""))
            d.pop("webhook_url", None)
        result.append(d)
    return result


def set_webhook_config(project_id: str, webhook_url: str = None, provider: str = "slack", enabled: int = 1) -> dict:
    """Save or update webhook configuration for a project and provider. Returns masked config."""
    now = time.time()
    clean_provider = (provider or "slack").strip().lower()
    with _lock:
        conn = get_conn()
        existing = conn.execute(
            "SELECT id, webhook_url FROM webhook_configs WHERE project_id = ? AND provider = ?",
            (project_id, clean_provider)
        ).fetchone()

        if existing:
            target_url = webhook_url.strip() if webhook_url and "****" not in webhook_url else existing["webhook_url"]
            conn.execute(
                "UPDATE webhook_configs SET webhook_url = ?, enabled = ?, updated_at = ? WHERE id = ?",
                (target_url, 1 if enabled else 0, now, existing["id"]),
            )
        else:
            if not webhook_url:
                conn.close()
                return None
            conn.execute(
                "INSERT INTO webhook_configs (project_id, provider, webhook_url, enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
                (project_id, clean_provider, webhook_url.strip(), 1 if enabled else 0, now, now),
            )
        conn.commit()
        conn.close()
    return get_webhook_config(project_id, provider=clean_provider, raw=False)


def toggle_webhook_enabled(project_id: str, enabled: bool, provider: str = None) -> dict:
    """Enable or disable webhook notifications for a project (optionally scoped to provider)."""
    now = time.time()
    with _lock:
        conn = get_conn()
        if provider:
            conn.execute(
                "UPDATE webhook_configs SET enabled = ?, updated_at = ? WHERE project_id = ? AND provider = ?",
                (1 if enabled else 0, now, project_id, provider.strip().lower()),
            )
        else:
            conn.execute(
                "UPDATE webhook_configs SET enabled = ?, updated_at = ? WHERE project_id = ?",
                (1 if enabled else 0, now, project_id),
            )
        conn.commit()
        conn.close()
    return get_webhook_config(project_id, provider=provider, raw=False)


def delete_webhook_config(project_id: str, provider: str = None) -> bool:
    """Permanently delete a project's webhook configuration (optionally scoped to provider)."""
    with _lock:
        conn = get_conn()
        if provider:
            cur = conn.execute(
                "DELETE FROM webhook_configs WHERE project_id = ? AND provider = ?",
                (project_id, provider.strip().lower())
            )
        else:
            cur = conn.execute("DELETE FROM webhook_configs WHERE project_id = ?", (project_id,))
        conn.commit()
        affected = cur.rowcount
        conn.close()
    return affected > 0


_org_cache = {}


def get_organization_id_for_project(project_id: str) -> str:
    """Resolve organization_id for a project with in-memory caching."""
    if not project_id or project_id in ("default", "phase1-demo-token"):
        return "org_demo_default"
    if project_id in _org_cache:
        return _org_cache[project_id]

    conn = get_conn()
    row = conn.execute("SELECT organization_id FROM projects WHERE id = ?", (project_id,)).fetchone()
    conn.close()
    if row and row["organization_id"]:
        _org_cache[project_id] = row["organization_id"]
        return row["organization_id"]
    return None


def insert_event(event: dict) -> int:
    """Insert a fully-scored event into the database."""
    project_id = event.get("project_id") or event.get("tenant_id") or "default"
    meta_val = event.get("metadata", {})
    if isinstance(meta_val, dict):
        meta_str = json.dumps(meta_val)
    else:
        meta_str = str(meta_val or "{}")

    # Resolve organization_id if not explicitly provided
    org_id = event.get("organization_id")
    if not org_id:
        org_id = get_organization_id_for_project(project_id)

    confidence = float(event.get("confidence", 0.0))
    attack_type = str(event.get("attack_type", "normal"))
    risk_score = float(event.get("risk_score", 0.0))

    now = time.time()
    with _lock:
        conn = get_conn()
        cur = conn.execute(
            """
            INSERT INTO events
                (timestamp, endpoint, method, status_code, latency_ms,
                 ip, user_id, payload_size, rule_flags, anomaly_score, severity, tenant_id, project_id,
                 ingested_at, event_id, event_type, user_agent, metadata,
                 organization_id, confidence, attack_type, risk_score)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                event.get("timestamp", now),
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
                event.get("ingested_at", now),
                event.get("event_id"),
                event.get("event_type", "http_request"),
                event.get("user_agent"),
                meta_str,
                org_id,
                confidence,
                attack_type,
                risk_score,
            ),
        )
        conn.commit()
        event_id = cur.lastrowid

        # Auto-update project onboarding if telemetry is received for a project
        if project_id and project_id not in ("default", "phase1-demo-token"):
            try:
                row_ob = conn.execute("SELECT first_telemetry_at, completed_steps FROM project_onboarding WHERE project_id = ?", (project_id,)).fetchone()
                if row_ob:
                    raw_steps = row_ob["completed_steps"] or "[]"
                    steps = json.loads(raw_steps) if isinstance(raw_steps, str) else list(raw_steps)
                    needs_update = False
                    first_t = row_ob["first_telemetry_at"]
                    if not first_t:
                        first_t = time.time()
                        needs_update = True
                    for s in (6, 7):
                        if s not in steps:
                            steps.append(s)
                            needs_update = True
                    if needs_update:
                        conn.execute(
                            "UPDATE project_onboarding SET first_telemetry_at = ?, completed_steps = ?, current_step = 7, status = 'completed', updated_at = ? WHERE project_id = ?",
                            (first_t, json.dumps(sorted(list(set(steps)))), time.time(), project_id)
                        )
                        conn.commit()
            except Exception:
                pass

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


def get_recent_events(limit: int = 50, tenant_id: str = "default", project_id: str = None):
    """Fetch recent telemetry events scoped by project/tenant."""
    target_id = project_id or tenant_id
    conn = get_conn()
    rows = conn.execute(
        """
        SELECT * FROM events 
        WHERE project_id = ? OR tenant_id = ? 
        ORDER BY id DESC LIMIT ?
        """,
        (target_id, target_id, limit),
    ).fetchall()
    conn.close()
    return [_row_to_dict(r) for r in rows]


def get_recent_alerts(limit: int = 50, tenant_id: str = "default", project_id: str = None):
    """Fetch recent alerts (medium/high severity) scoped by project/tenant."""
    target_id = project_id or tenant_id
    conn = get_conn()
    rows = conn.execute(
        """
        SELECT * FROM events 
        WHERE (project_id = ? OR tenant_id = ?) AND severity != 'low' 
        ORDER BY id DESC LIMIT ?
        """,
        (target_id, target_id, limit),
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

    # Keep top-level keys for test assertion backwards compatibility, and include attack_distribution key for dashboard charts
    stats["attack_distribution"] = {
        "brute_force": stats["brute_force"],
        "endpoint_scan": stats["endpoint_scan"],
        "request_burst": stats["request_burst"],
        "anomaly": stats["anomaly"]
    }

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
               count(*) as total,
               round(avg(latency_ms), 1) as avg_latency
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
        "timeline": [
            {
                "minute": r["minute"],
                "attacks": r["attacks"],
                "total": r["total"],
                "avg_latency": r["avg_latency"] if r["avg_latency"] is not None else 0.0,
            }
            for r in timeline
        ],
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

    if "metadata" in d and d["metadata"]:
        try:
            d["metadata"] = json.loads(d["metadata"])
        except Exception:
            d["metadata"] = {}
    elif "metadata" in d:
        d["metadata"] = {}

    # Canonical aliases for consistent detection event retention
    if "project_id" in d and "affected_project" not in d:
        d["affected_project"] = d["project_id"]
    if "endpoint" in d and "affected_endpoint" not in d:
        d["affected_endpoint"] = d["endpoint"]
    if "ip" in d and "source_ip" not in d:
        d["source_ip"] = d["ip"]
    if "timestamp" in d and "detection_timestamp" not in d:
        d["detection_timestamp"] = d["timestamp"]

    return d


# ---------------------------------------------------------
# Guided Developer Onboarding Operations
# ---------------------------------------------------------

def get_or_create_onboarding(project_id: str) -> dict:
    """Retrieve onboarding progress for a project, creating initial state if not found."""
    if not project_id:
        return None
    now = time.time()
    conn = get_conn()
    row = conn.execute("SELECT * FROM project_onboarding WHERE project_id = ?", (project_id,)).fetchone()
    if not row:
        with _lock:
            conn.execute(
                """
                INSERT OR IGNORE INTO project_onboarding 
                    (project_id, framework, current_step, completed_steps, status, created_at, updated_at) 
                VALUES (?, 'flask', 1, '[]', 'in_progress', ?, ?)
                """,
                (project_id, now, now)
            )
            conn.commit()
        row = conn.execute("SELECT * FROM project_onboarding WHERE project_id = ?", (project_id,)).fetchone()
    conn.close()

    if not row:
        return {
            "project_id": project_id,
            "framework": "flask",
            "current_step": 1,
            "completed_steps": [],
            "status": "in_progress",
            "first_telemetry_at": None,
            "created_at": now,
            "updated_at": now
        }

    d = dict(row)
    raw_steps = d.get("completed_steps") or "[]"
    try:
        d["completed_steps"] = json.loads(raw_steps) if isinstance(raw_steps, str) else list(raw_steps)
    except Exception:
        d["completed_steps"] = []
    return d


def update_onboarding_progress(project_id: str, current_step: int = None, completed_step: int = None, framework: str = None, status: str = None) -> dict:
    """Update active onboarding step, mark steps as completed, or switch framework."""
    rec = get_or_create_onboarding(project_id)
    steps = set(rec.get("completed_steps", []))
    if completed_step is not None:
        try:
            steps.add(int(completed_step))
        except (ValueError, TypeError):
            pass

    new_step = int(current_step) if current_step is not None else rec.get("current_step", 1)
    new_framework = framework.strip().lower() if framework else rec.get("framework", "flask")
    new_status = status.strip().lower() if status else rec.get("status", "in_progress")
    now = time.time()

    with _lock:
        conn = get_conn()
        conn.execute(
            """
            UPDATE project_onboarding
            SET current_step = ?, completed_steps = ?, framework = ?, status = ?, updated_at = ?
            WHERE project_id = ?
            """,
            (new_step, json.dumps(sorted(list(steps))), new_framework, new_status, now, project_id)
        )
        conn.commit()
        conn.close()

    return get_or_create_onboarding(project_id)


def record_first_telemetry_onboarding(project_id: str) -> bool:
    """Record first telemetry event for project, marking steps 6 & 7 complete."""
    if not project_id:
        return False
    now = time.time()
    with _lock:
        conn = get_conn()
        row = conn.execute("SELECT * FROM project_onboarding WHERE project_id = ?", (project_id,)).fetchone()
        if not row:
            conn.execute(
                """
                INSERT OR IGNORE INTO project_onboarding 
                    (project_id, framework, current_step, completed_steps, status, first_telemetry_at, created_at, updated_at) 
                VALUES (?, 'flask', 7, '[1,2,3,4,5,6,7]', 'completed', ?, ?, ?)
                """,
                (project_id, now, now, now)
            )
            conn.commit()
            conn.close()
            return True

        first_t = row["first_telemetry_at"] or now
        raw_steps = row["completed_steps"] or "[]"
        try:
            steps = set(json.loads(raw_steps) if isinstance(raw_steps, str) else list(raw_steps))
        except Exception:
            steps = set()
        steps.update([6, 7])
        conn.execute(
            """
            UPDATE project_onboarding
            SET first_telemetry_at = ?, completed_steps = ?, current_step = 7, status = 'completed', updated_at = ?
            WHERE project_id = ?
            """,
            (first_t, json.dumps(sorted(list(steps))), now, project_id)
        )
        conn.commit()
        conn.close()
    return True


if __name__ == "__main__":
    init_db()
    print(f"Initialized DB with multi-tenant schema at {DB_PATH}")

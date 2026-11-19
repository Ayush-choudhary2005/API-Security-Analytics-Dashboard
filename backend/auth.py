"""
auth.py — Authentication & authorization helpers for API Security Analytics Platform.
"""
from __future__ import annotations

import re
import hashlib
import hmac
from functools import wraps
from flask import session, jsonify, request, g
from werkzeug.security import generate_password_hash, check_password_hash
import db

# macOS system Python 3.9 (compiled against LibreSSL 2.8.3) lacks hashlib.scrypt.
# Polyfill hashlib.scrypt using cryptography.hazmat.primitives.kdf.scrypt so
# Werkzeug's check_password_hash and generate_password_hash work seamlessly across all platforms.
if not hasattr(hashlib, "scrypt"):
    try:
        from cryptography.hazmat.primitives.kdf.scrypt import Scrypt

        def _scrypt_polyfill(password, *, salt=None, n=16384, r=8, p=1, maxmem=0, dklen=64):
            kdf = Scrypt(salt=salt, length=dklen, n=n, r=r, p=p)
            return kdf.derive(password)

        hashlib.scrypt = _scrypt_polyfill
    except Exception:
        pass


def hash_password(password: str) -> str:
    """Hash password using PBKDF2:SHA256 (fully portable across all Python and OS runtimes)."""
    return generate_password_hash(password, method="pbkdf2:sha256")


def hash_token(token: str) -> str:
    """Hash single-use verification/reset tokens using SHA-256."""
    if not token or not isinstance(token, str):
        return ""
    return hashlib.sha256(token.strip().encode("utf-8")).hexdigest()


def verify_password(password_hash: str, password: str) -> bool:
    """Verify password against stored hash with automatic scrypt/pbkdf2 compatibility."""
    if not password_hash or not password or password_hash.startswith("!oauth_"):
        return False
    try:
        return check_password_hash(password_hash, password)
    except Exception:
        # Fallback: if check_password_hash fails due to scrypt C-extension incompatibility,
        # perform direct scrypt verification via cryptography
        try:
            if password_hash.startswith("scrypt:"):
                parts = password_hash.split("$")
                if len(parts) == 3:
                    method_parts = parts[0].split(":")
                    n = int(method_parts[1]) if len(method_parts) > 1 else 16384
                    r = int(method_parts[2]) if len(method_parts) > 2 else 8
                    p = int(method_parts[3]) if len(method_parts) > 3 else 1
                    salt = parts[1].encode("utf-8")
                    expected_hex = parts[2]
                    from cryptography.hazmat.primitives.kdf.scrypt import Scrypt
                    kdf = Scrypt(salt=salt, length=len(bytes.fromhex(expected_hex)), n=n, r=r, p=p)
                    derived = kdf.derive(password.encode("utf-8")).hex()
                    return hmac.compare_digest(derived, expected_hex)
        except Exception:
            pass
        return False


def validate_email(email: str) -> bool:
    """Validate email format."""
    if not email or not isinstance(email, str):
        return False
    email_regex = r"^[^@\s]+@[^@\s]+\.[^@\s]+$"
    return bool(re.match(email_regex, email.strip()))


def validate_password(password: str) -> tuple[bool, str]:
    """Validate password minimum complexity."""
    if not password or not isinstance(password, str):
        return False, "Password is required"
    if len(password) < 8:
        return False, "Password must be at least 8 characters long"
    return True, ""


def login_required(f):
    """Decorator ensuring request has an active, valid session."""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        user_id = session.get("user_id")
        if not user_id:
            return jsonify({"error": "unauthenticated"}), 401

        user = db.get_user_by_id(user_id)
        if not user:
            session.clear()
            return jsonify({"error": "unauthenticated"}), 401

        # Session invalidation check: verify if password was changed after this session was authorized
        pwd_changed = user.get("password_changed_at")
        auth_time = session.get("auth_time", 0)
        if pwd_changed and (not auth_time or auth_time < pwd_changed):
            session.clear()
            return jsonify({"error": "Session invalidated due to password change. Please log in again."}), 401

        g.current_user = user
        return f(*args, **kwargs)
    return decorated_function


def get_current_user():
    """Retrieve currently authenticated user or None."""
    user_id = session.get("user_id")
    if not user_id:
        return None
    return db.get_user_by_id(user_id)


def verify_project_ownership(user_id: str, project_id: str) -> bool:
    """Check if user owns the given project."""
    if not user_id or not project_id:
        return False
    return db.user_owns_project(user_id, project_id)

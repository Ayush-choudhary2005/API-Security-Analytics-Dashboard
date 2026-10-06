"""
auth.py — Authentication & authorization helpers for API Security Analytics Platform.
"""

import re
from functools import wraps
from flask import session, jsonify, request, g
from werkzeug.security import generate_password_hash, check_password_hash
import db


def hash_password(password: str) -> str:
    """Hash password using Werkzeug's secure key derivation."""
    return generate_password_hash(password)


def verify_password(password_hash: str, password: str) -> bool:
    """Verify password against stored hash."""
    if not password_hash or not password or password_hash.startswith("!oauth_"):
        return False
    try:
        return check_password_hash(password_hash, password)
    except Exception:
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

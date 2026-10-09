"""
google_auth.py — Google OAuth 2.0 / OpenID Connect helper for API Security Analytics Platform.
"""

import os
from authlib.integrations.flask_client import OAuth

oauth = OAuth()

GOOGLE_METADATA_URL = "https://accounts.google.com/.well-known/openid-configuration"


def is_google_oauth_configured() -> bool:
    """Check if Google OAuth credentials are provided via environment variables."""
    client_id = os.environ.get("GOOGLE_CLIENT_ID", "").strip()
    client_secret = os.environ.get("GOOGLE_CLIENT_SECRET", "").strip()
    return bool(client_id and client_secret)


def get_redirect_uri(req=None) -> str:
    """
    Return the configured OAuth redirect URI.
    Defaults to request host callback or http://127.0.0.1:5001/auth/google/callback.
    """
    env_uri = os.environ.get("GOOGLE_REDIRECT_URI", "").strip()
    if env_uri:
        return env_uri
    try:
        from flask import has_request_context, request as flask_req
        target_req = req or (flask_req if has_request_context() else None)
        if target_req:
            return f"{target_req.scheme}://{target_req.host}/auth/google/callback"
    except Exception:
        pass
    return "http://127.0.0.1:5001/auth/google/callback"


def init_google_oauth(app):
    """
    Register Google OAuth client with Flask application.
    Uses OpenID Connect discovery for automatic endpoints and keys.
    """
    oauth.init_app(app)

    client_id = os.environ.get("GOOGLE_CLIENT_ID", "").strip() or "placeholder_client_id"
    client_secret = os.environ.get("GOOGLE_CLIENT_SECRET", "").strip() or "placeholder_client_secret"

    oauth.register(
        name="google",
        client_id=client_id,
        client_secret=client_secret,
        server_metadata_url=GOOGLE_METADATA_URL,
        client_kwargs={
            "scope": "openid email profile",
            "prompt": "select_account"
        }
    )
    return oauth

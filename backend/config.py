"""
backend/config.py — Centralized Environment Configuration & Security Profiles.

Provides:
- Distinct profiles for Development, Staging, and Production
- Environment variable extraction with sensible, secure defaults
- Strict validation of secrets in production environments
"""

import os
import secrets
from typing import List

# Blacklist of known insecure, placeholder, or default secrets
INSECURE_DEFAULT_SECRET_KEYS = {
    "api-security-dashboard-secret-321",
    "replace-with-a-secure-random-32-byte-hex-key-in-production",
    "replace-with-a-real-secret-key-32-bytes-long",
    "your_secure_random_session_secret",
    "secret",
    "secret123",
    "changeme",
    "admin",
    "password",
}


class BaseConfig:
    """Base application configuration."""
    ENV = os.environ.get("ENVIRONMENT") or os.environ.get("FLASK_ENV") or "development"
    DEBUG = False
    TESTING = False

    # Core Secrets: Load from environment if set; otherwise generate an ephemeral secure key for local dev
    _raw_secret = os.environ.get("SECRET_KEY", "").strip()
    SECRET_KEY = _raw_secret if _raw_secret else secrets.token_hex(32)

    # Database URL
    DATABASE_URL = os.environ.get("DATABASE_URL", "")

    # Session & Cookie Security
    SESSION_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SAMESITE = "Lax"
    SESSION_COOKIE_SECURE = False
    PERMANENT_SESSION_LIFETIME = 86400 * 7  # 7 days

    # Request Bounds & Ingestion Limits
    MAX_CONTENT_LENGTH = int(os.environ.get("MAX_CONTENT_LENGTH", 5 * 1024 * 1024))  # 5 MB
    COLLECTOR_MAX_PAYLOAD_BYTES = int(os.environ.get("COLLECTOR_MAX_PAYLOAD_BYTES", 64 * 1024))  # 64 KB

    # CORS & WebSockets
    CORS_ALLOWED_ORIGINS = os.environ.get("CORS_ALLOWED_ORIGINS", "*")

    # Rate Limiting
    RATE_LIMIT_PER_MINUTE = int(os.environ.get("RATE_LIMIT_PER_MINUTE", 50))
    RATE_LIMIT_BURST = int(os.environ.get("RATE_LIMIT_BURST", 30))

    # Google OAuth
    GOOGLE_CLIENT_ID = os.environ.get("GOOGLE_CLIENT_ID", "")
    GOOGLE_CLIENT_SECRET = os.environ.get("GOOGLE_CLIENT_SECRET", "")
    GOOGLE_REDIRECT_URI = os.environ.get("GOOGLE_REDIRECT_URI", "http://127.0.0.1:5001/auth/google/callback")

    # Gemini AI Threat Analyst
    GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")

    # Global Fallback Webhook
    SLACK_WEBHOOK_URL = os.environ.get("SLACK_WEBHOOK_URL", "")

    # Ingestion Token & Demo Bypass Control
    ALLOW_DEMO_TOKEN = os.environ.get("ALLOW_DEMO_TOKEN", "true" if (os.environ.get("ENVIRONMENT") or os.environ.get("FLASK_ENV") or "development").lower() != "production" else "false").lower() == "true"


class DevelopmentConfig(BaseConfig):
    """Local development profile."""
    DEBUG = True
    SESSION_COOKIE_SECURE = False
    CORS_ALLOWED_ORIGINS = os.environ.get("CORS_ALLOWED_ORIGINS", "*")
    ALLOW_DEMO_TOKEN = os.environ.get("ALLOW_DEMO_TOKEN", "true").lower() == "true"


class StagingConfig(BaseConfig):
    """Staging and pre-production test profile."""
    DEBUG = False
    SESSION_COOKIE_SECURE = True
    CORS_ALLOWED_ORIGINS = os.environ.get("CORS_ALLOWED_ORIGINS", "https://staging.mlo11y.com")
    ALLOW_DEMO_TOKEN = False

    def __init__(self):
        raw_secret = os.environ.get("SECRET_KEY", "").strip()
        if not raw_secret or raw_secret in INSECURE_DEFAULT_SECRET_KEYS or len(raw_secret) < 32:
            raise RuntimeError(
                "FATAL SECURITY CONFIGURATION: Staging environment requires a cryptographically "
                "strong SECRET_KEY (minimum 32 characters). Set a secure SECRET_KEY in your environment."
            )
        self.SECRET_KEY = raw_secret


class ProductionConfig(BaseConfig):
    """Hardened production deployment profile."""
    DEBUG = False
    SESSION_COOKIE_SECURE = True
    SESSION_COOKIE_SAMESITE = "Lax"
    ALLOW_DEMO_TOKEN = False  # Hardcoded demo bypass is strictly forbidden in production

    def __init__(self):
        raw_secret = os.environ.get("SECRET_KEY", "").strip()
        if not raw_secret or raw_secret in INSECURE_DEFAULT_SECRET_KEYS or len(raw_secret) < 32:
            raise RuntimeError(
                "FATAL SECURITY CONFIGURATION: Production refuses to start with a missing, "
                "default, or weak SECRET_KEY. You must configure a cryptographically secure "
                "SECRET_KEY (minimum 32 characters, e.g. generated via `secrets.token_hex(32)`) "
                "in your environment variables."
            )
        self.SECRET_KEY = raw_secret


CONFIG_MAP = {
    "development": DevelopmentConfig,
    "staging": StagingConfig,
    "production": ProductionConfig,
}


def get_config(env_name: str = None) -> BaseConfig:
    """Retrieve active configuration object based on environment."""
    env = env_name or os.environ.get("ENVIRONMENT") or os.environ.get("FLASK_ENV") or "development"
    cfg_cls = CONFIG_MAP.get(env.lower(), DevelopmentConfig)
    return cfg_cls()

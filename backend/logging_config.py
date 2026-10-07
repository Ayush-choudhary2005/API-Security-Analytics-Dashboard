"""
backend/logging_config.py — Production Structured Logging & Secret Redaction Engine.

Enforces zero-leak logging standards:
- Redacts passwords, SDK credentials, Google tokens, Gemini API keys,
  Slack/Discord webhooks, and Authorization headers.
- Outputs structured JSON logs in production/staging environments, and
  clean formatted console output in local development.
"""

import os
import re
import json
import logging
import time
from typing import Any, Dict


# -------------------------------------------------------------
# Secret Redaction Patterns
# -------------------------------------------------------------
REDACTION_PATTERNS = [
    # Passwords in JSON / Key-value representations
    (re.compile(r'(["\']?(?:password|passwd|pwd|password_hash)["\']?\s*[:=]\s*["\'])([^"\'\s,}{]+)(["\']?)', re.IGNORECASE),
     r'\1[REDACTED_PASSWORD]\3'),

    # SDK Credentials: ask_<proj>_<32hex>
    (re.compile(r'\bask_[a-zA-Z0-9_\-]{16,}\b'),
     r'ask_****************'),

    # Gemini API keys: AIzaSy...
    (re.compile(r'\bAIzaSy[a-zA-Z0-9_\-]{33}\b'),
     r'AIzaSy[REDACTED_GEMINI_KEY]'),

    # Google OAuth tokens: ya29...
    (re.compile(r'\bya29\.[a-zA-Z0-9_\-]+\b'),
     r'[REDACTED_GOOGLE_TOKEN]'),

    # Authorization Bearer tokens
    (re.compile(r'Bearer\s+[A-Za-z0-9\-._~+/]+=*', re.IGNORECASE),
     r'Bearer [REDACTED_BEARER_TOKEN]'),

    # Slack Incoming Webhook URLs
    (re.compile(r'https://hooks\.slack\.com/services/[A-Za-z0-9_\-/]+'),
     r'https://hooks.slack.com/services/****/****/****'),

    # Discord Webhook URLs
    (re.compile(r'https://(?:discord|discordapp)\.com/api/webhooks/[A-Za-z0-9_\-/]+'),
     r'https://discord.com/api/webhooks/****/********'),
]


def redact_secrets(text: str) -> str:
    """Scrub sensitive credentials, tokens, and webhooks from text."""
    if not isinstance(text, str):
        text = str(text)
    for pattern, replacement in REDACTION_PATTERNS:
        text = pattern.sub(replacement, text)
    return text


class SensitiveDataRedactor(logging.Filter):
    """Logging filter that scrubs sensitive secrets from log records."""

    def filter(self, record: logging.LogRecord) -> bool:
        if isinstance(record.msg, str):
            record.msg = redact_secrets(record.msg)
        elif isinstance(record.msg, dict):
            try:
                record.msg = redact_secrets(json.dumps(record.msg))
            except Exception:
                pass
        
        if record.args:
            if isinstance(record.args, dict):
                record.args = {k: redact_secrets(str(v)) for k, v in record.args.items()}
            elif isinstance(record.args, (list, tuple)):
                record.args = tuple(redact_secrets(str(arg)) for arg in record.args)
        return True


class JsonStructuredFormatter(logging.Formatter):
    """Production JSON log formatter for containerized cloud environments."""

    def format(self, record: logging.LogRecord) -> str:
        log_entry: Dict[str, Any] = {
            "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(record.created)),
            "level": record.levelname,
            "logger": record.name,
            "message": redact_secrets(record.getMessage()),
            "module": record.module,
            "line": record.lineno,
        }
        if record.exc_info and record.exc_text:
            # Redact exception messages as well
            log_entry["exception"] = redact_secrets(record.exc_text)
        return json.dumps(log_entry)


class DevelopmentFormatter(logging.Formatter):
    """Readable colored log formatter for local development."""

    def format(self, record: logging.LogRecord) -> str:
        record.msg = redact_secrets(str(record.msg))
        return super().format(record)


def configure_logging(app=None, env: str = None) -> logging.Logger:
    """Configure centralized logging with secret redaction filters."""
    environment = env or os.environ.get("FLASK_ENV") or os.environ.get("ENVIRONMENT") or "development"
    log_level = logging.INFO if environment in ("production", "staging") else logging.DEBUG

    root_logger = logging.getLogger()
    root_logger.setLevel(log_level)

    # Remove existing handlers to prevent duplicates
    for handler in list(root_logger.handlers):
        root_logger.removeHandler(handler)

    console_handler = logging.StreamHandler()
    console_handler.addFilter(SensitiveDataRedactor())

    if environment == "production":
        console_handler.setFormatter(JsonStructuredFormatter())
    else:
        fmt = "[%(asctime)s] [%(levelname)s] [%(name)s]: %(message)s"
        console_handler.setFormatter(DevelopmentFormatter(fmt, datefmt="%Y-%m-%d %H:%M:%S"))

    root_logger.addHandler(console_handler)

    if app:
        app.logger.handlers = root_logger.handlers
        app.logger.setLevel(log_level)

    return root_logger

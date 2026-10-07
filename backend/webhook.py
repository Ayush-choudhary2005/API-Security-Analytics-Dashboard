"""
webhook.py — Backward-compatible facade wrapping the new NotificationService integration engine.
"""

import os
from integrations.service import notification_service

# Fallback default from environment variable for legacy demo compatibility
WEBHOOK_URL = os.environ.get("SLACK_WEBHOOK_URL", "")


def mask_webhook_url(url: str, provider: str = None) -> str:
    """Mask sensitive tokens in webhook URL for display in API, UI, and logs."""
    return notification_service.mask_url(url, provider)


def test_webhook(webhook_url: str, project_name: str = "Project", provider: str = None) -> tuple:
    """Send a test notification to verify webhook configuration. Returns (success, message)."""
    return notification_service.test_connection(webhook_url, project_name=project_name, provider_id=provider)


def send_alert(alert_data, webhook_url=None, provider=None):
    """Fires a webhook in the background so it doesn't block the ingest pipeline."""
    target_url = webhook_url or WEBHOOK_URL
    if not target_url:
        return
    notification_service.dispatch_alert_direct(alert_data, target_url, provider_id=provider)

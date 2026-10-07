"""
service.py — Production Notification & Integration Orchestration Service.
Manages provider adapters, project-scoped configurations, alert dispatching,
connection verification, and health/status checks.
"""

import os
import threading
from typing import Dict, Any, Tuple, Optional, List
from .base import BaseNotificationProvider
from .slack import SlackProvider
from .discord import DiscordProvider


class NotificationService:
    """
    Central service orchestrating all external notification and alert integrations.
    Decouples threat detection logic from provider-specific protocols.
    """

    def __init__(self):
        self._providers: Dict[str, BaseNotificationProvider] = {}
        self._lock = threading.Lock()

        # Register standard built-in providers
        self.register_provider(SlackProvider())
        self.register_provider(DiscordProvider())

    def register_provider(self, provider: BaseNotificationProvider):
        """Register a new provider adapter (allows future integrations like PagerDuty)."""
        with self._lock:
            self._providers[provider.provider_id.lower()] = provider

    def get_provider(self, provider_id: Optional[str]) -> BaseNotificationProvider:
        """Resolve a provider adapter by ID, defaulting to Slack."""
        key = (provider_id or "slack").strip().lower()
        with self._lock:
            if key in self._providers:
                return self._providers[key]
            # Fallback to Slack adapter if provider is unrecognized
            return self._providers.get("slack", SlackProvider())

    def list_supported_providers(self) -> List[Dict[str, str]]:
        """List all supported providers with IDs and display names."""
        with self._lock:
            return [
                {"provider_id": p.provider_id, "display_name": p.display_name}
                for p in self._providers.values()
            ]

    def mask_url(self, url: str, provider_id: Optional[str] = None) -> str:
        """Mask secrets in destination URL."""
        if not url:
            return ""
        provider = self.get_provider(provider_id)
        return provider.mask_url(url)

    def test_connection(
        self,
        webhook_url: str,
        project_name: str = "Project",
        provider_id: Optional[str] = None
    ) -> Tuple[bool, str]:
        """
        Verify an integration endpoint before saving.
        Returns: (success: bool, message: str)
        """
        if not webhook_url:
            return False, "Webhook URL cannot be empty"

        # Auto-detect provider if unspecified
        if not provider_id:
            lower_url = webhook_url.lower()
            if "discord.com" in lower_url or "discordapp.com" in lower_url:
                provider_id = "discord"
            else:
                provider_id = "slack"

        provider = self.get_provider(provider_id)
        return provider.test_connection(webhook_url, project_name=project_name)

    def dispatch_alert_direct(
        self,
        alert_data: Dict[str, Any],
        webhook_url: str,
        provider_id: Optional[str] = None
    ):
        """
        Directly dispatch an alert to a specific webhook URL in the background.
        Maintains backward compatibility with legacy webhook.send_alert().
        """
        if not webhook_url:
            return

        # Auto-detect provider if not explicitly given
        if not provider_id:
            lower = webhook_url.lower()
            if "discord.com" in lower or "discordapp.com" in lower:
                provider_id = "discord"
            else:
                provider_id = "slack"

        provider = self.get_provider(provider_id)

        def _worker():
            masked = provider.mask_url(webhook_url)
            try:
                print(f"[INTEGRATION] Dispatching alert via {provider.display_name} to {masked}...")
                provider.send_alert(alert_data, webhook_url)
            except Exception as e:
                print(f"[INTEGRATION] Non-critical error sending alert to {masked}: {e}")

        thread = threading.Thread(target=_worker, daemon=True)
        thread.start()

    def dispatch_project_alerts(self, alert_data: Dict[str, Any], project_id: str, sender_fn=None):
        """
        Dispatch alerts to all active integrations configured for this project.
        Non-blocking daemon worker ensures detection pipeline is NEVER stalled or halted.
        """
        import db

        configs = db.list_webhook_configs(project_id, raw=True, active_only=True)
        if not configs:
            # Fallback for default demo project
            if project_id in ('proj_demo_default', 'phase1-demo-token', 'default'):
                env_slack = os.environ.get("SLACK_WEBHOOK_URL", "")
                if env_slack:
                    if sender_fn:
                        sender_fn(alert_data, webhook_url=env_slack)
                    else:
                        self.dispatch_alert_direct(alert_data, env_slack, provider_id="slack")
            return

        for cfg in configs:
            url = cfg.get("webhook_url")
            prov = cfg.get("provider", "slack")
            if url:
                if sender_fn:
                    sender_fn(alert_data, webhook_url=url)
                else:
                    self.dispatch_alert_direct(alert_data, url, provider_id=prov)

    def get_project_integration_status(self, project_id: str) -> Dict[str, Any]:
        """
        Compute health/status indicators for Slack, Discord, Gemini, and SDK for a project.
        Never exposes raw secrets.
        """
        import db

        # 1. Fetch webhook configs for this project
        configs = db.list_webhook_configs(project_id, raw=False)
        configs_by_provider = {c["provider"]: c for c in configs}

        # Slack status
        slack_cfg = configs_by_provider.get("slack")
        if slack_cfg:
            slack_status = "Connected ✓" if slack_cfg.get("enabled") else "Disabled"
            slack_info = {
                "configured": True,
                "enabled": slack_cfg.get("enabled", True),
                "status": slack_status,
                "masked_url": slack_cfg.get("masked_url", "")
            }
        else:
            slack_info = {
                "configured": False,
                "enabled": False,
                "status": "Not Configured",
                "masked_url": ""
            }

        # Discord status
        discord_cfg = configs_by_provider.get("discord")
        if discord_cfg:
            discord_status = "Connected ✓" if discord_cfg.get("enabled") else "Disabled"
            discord_info = {
                "configured": True,
                "enabled": discord_cfg.get("enabled", True),
                "status": discord_status,
                "masked_url": discord_cfg.get("masked_url", "")
            }
        else:
            discord_info = {
                "configured": False,
                "enabled": False,
                "status": "Not Configured",
                "masked_url": ""
            }

        # 2. Gemini status
        gemini_key = os.environ.get("GEMINI_API_KEY", "").strip()
        gemini_configured = bool(gemini_key)
        gemini_info = {
            "configured": gemini_configured,
            "status": "Configured ✓" if gemini_configured else "Missing Key (Fallback Mode)"
        }

        # 3. SDK status
        active_keys = db.list_api_keys_for_project(project_id)
        event_count = db.get_all_events_count(project_id)
        sdk_connected = event_count > 0
        sdk_status = "Connected ✓" if sdk_connected else ("Key Active (Awaiting Traffic)" if active_keys else "Not Configured")
        sdk_info = {
            "connected": sdk_connected,
            "status": sdk_status,
            "event_count": event_count,
            "active_keys_count": len([k for k in active_keys if not k.get("revoked_at")])
        }

        return {
            "project_id": project_id,
            "integrations": {
                "slack": slack_info,
                "discord": discord_info,
                "gemini": gemini_info,
                "sdk": sdk_info,
            }
        }


notification_service = NotificationService()

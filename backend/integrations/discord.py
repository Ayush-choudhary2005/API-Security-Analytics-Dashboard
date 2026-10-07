"""
discord.py — Discord Webhook Provider Adapter.
"""

from urllib.parse import urlparse
from typing import Dict, Any, Tuple
from .base import BaseNotificationProvider


class DiscordProvider(BaseNotificationProvider):
    """Adapter for Discord Webhooks."""

    @property
    def provider_id(self) -> str:
        return "discord"

    @property
    def display_name(self) -> str:
        return "Discord"

    def validate_url(self, url: str) -> Tuple[bool, str]:
        valid, err = super().validate_url(url)
        if not valid:
            return False, err
        return True, ""

    def mask_url(self, url: str) -> str:
        if not url:
            return ""
        try:
            parsed = urlparse(url)
            path = parsed.path
            if "discord.com" in parsed.netloc or "discordapp.com" in parsed.netloc:
                parts = [p for p in path.split("/") if p]
                if len(parts) >= 4:
                    return f"{parsed.scheme}://{parsed.netloc}/api/webhooks/{parts[2][:4]}****/********"
            return super().mask_url(url)
        except Exception:
            return "****"

    def format_alert(self, alert_data: Dict[str, Any]) -> Dict[str, Any]:
        sev = str(alert_data.get("severity", "HIGH")).upper()
        # Discord color hex int: Red for High, Amber/Yellow for Medium
        color = 0xEA4335 if sev == "HIGH" else 0xFBBC04
        proj = alert_data.get("project_id", "default")
        endpoint = alert_data.get("endpoint", "/")
        ip = alert_data.get("ip") or alert_data.get("source_ip", "unknown")
        score = alert_data.get("anomaly_score", 0.0)
        rules = ", ".join(alert_data.get("rule_flags", []) or ["None"])
        attack_type = alert_data.get("attack_type", "security_anomaly")

        return {
            "content": f"🚨 **{sev} SEVERITY ALERT** on `{proj}`",
            "embeds": [
                {
                    "title": f"ML-O11Y Security Incident: {attack_type}",
                    "color": color,
                    "fields": [
                        {"name": "Project", "value": f"`{proj}`", "inline": True},
                        {"name": "Severity", "value": f"**{sev}**", "inline": True},
                        {"name": "Attack Type", "value": f"`{attack_type}`", "inline": True},
                        {"name": "Target Endpoint", "value": f"`{endpoint}`", "inline": True},
                        {"name": "Source IP", "value": f"`{ip}`", "inline": True},
                        {"name": "Anomaly Score", "value": f"`{score}`", "inline": True},
                        {"name": "Triggered Rules", "value": rules, "inline": False}
                    ],
                    "footer": {
                        "text": "ML-O11Y Active Defense & Threat Observability"
                    }
                }
            ]
        }

    def format_test_message(self, project_name: str) -> Dict[str, Any]:
        return {
            "content": "🔔 **ML-O11Y Security Integration Test**",
            "embeds": [
                {
                    "title": "Webhook Connected Successfully",
                    "description": f"Discord alert notifications are now successfully connected to project: **{project_name}**.",
                    "color": 0x34A853,
                    "footer": {
                        "text": "ML-O11Y Active Defense Platform"
                    }
                }
            ]
        }

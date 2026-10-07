"""
slack.py — Slack Incoming Webhook Provider Adapter.
"""

from urllib.parse import urlparse
from typing import Dict, Any, Tuple
from .base import BaseNotificationProvider


class SlackProvider(BaseNotificationProvider):
    """Adapter for Slack Incoming Webhooks."""

    @property
    def provider_id(self) -> str:
        return "slack"

    @property
    def display_name(self) -> str:
        return "Slack"

    def validate_url(self, url: str) -> Tuple[bool, str]:
        valid, err = super().validate_url(url)
        if not valid:
            return False, err
        if "hooks.slack.com" not in url.lower():
            # Soft check — allow internal slack bridges if valid http/https, but standard is hooks.slack.com
            pass
        return True, ""

    def mask_url(self, url: str) -> str:
        if not url:
            return ""
        try:
            parsed = urlparse(url)
            path = parsed.path
            if "hooks.slack.com" in parsed.netloc:
                parts = [p for p in path.split("/") if p]
                if len(parts) >= 2 and parts[0] == "services":
                    masked_parts = ["services"] + ["****" for _ in parts[1:]]
                    return f"{parsed.scheme}://{parsed.netloc}/{'/'.join(masked_parts)}"
            return super().mask_url(url)
        except Exception:
            return "****"

    def format_alert(self, alert_data: Dict[str, Any]) -> Dict[str, Any]:
        sev = str(alert_data.get("severity", "HIGH")).upper()
        emoji = "🚨" if sev == "HIGH" else "⚠️"
        proj = alert_data.get("project_id", "default")
        endpoint = alert_data.get("endpoint", "/")
        ip = alert_data.get("ip") or alert_data.get("source_ip", "unknown")
        score = alert_data.get("anomaly_score", 0.0)
        rules = ", ".join(alert_data.get("rule_flags", []) or ["None"])
        attack_type = alert_data.get("attack_type", "security_anomaly")

        text = (
            f"{emoji} *{sev} SEVERITY ALERT* {emoji}\n"
            f"*Project:* `{proj}`\n"
            f"*Attack Type:* `{attack_type}`\n"
            f"*Endpoint:* {endpoint}\n"
            f"*IP:* {ip}\n"
            f"*Score:* {score}\n"
            f"*Rules:* {rules}"
        )

        return {
            "text": text,
            "blocks": [
                {
                    "type": "header",
                    "text": {
                        "type": "plain_text",
                        "text": f"{emoji} ML-O11Y {sev} Security Alert: {attack_type}",
                        "emoji": True
                    }
                },
                {
                    "type": "section",
                    "fields": [
                        {"type": "mrkdwn", "text": f"*Project:*\n`{proj}`"},
                        {"type": "mrkdwn", "text": f"*Severity:*\n*{sev}*"},
                        {"type": "mrkdwn", "text": f"*Target Endpoint:*\n`{endpoint}`"},
                        {"type": "mrkdwn", "text": f"*Attacking IP:*\n`{ip}`"},
                        {"type": "mrkdwn", "text": f"*ML Anomaly Score:*\n`{score}`"},
                        {"type": "mrkdwn", "text": f"*Active Rules:*\n{rules}"}
                    ]
                }
            ]
        }

    def format_test_message(self, project_name: str) -> Dict[str, Any]:
        return {
            "text": f"🔔 *ML-O11Y Security Integration Test*\nProject: *{project_name}*\nStatus: Connected successfully!",
            "blocks": [
                {
                    "type": "header",
                    "text": {
                        "type": "plain_text",
                        "text": "🔔 ML-O11Y Security Integration Test",
                        "emoji": True
                    }
                },
                {
                    "type": "section",
                    "text": {
                        "type": "mrkdwn",
                        "text": f"Your Slack notification channel is now successfully connected to project: *{project_name}*.\nYou will receive immediate notifications when anomalous behavior or attacks are detected."
                    }
                }
            ]
        }

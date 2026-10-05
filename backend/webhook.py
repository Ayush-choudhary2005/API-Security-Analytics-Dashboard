import os
import requests
import threading
from urllib.parse import urlparse

# Fallback default from environment variable for legacy demo compatibility
WEBHOOK_URL = os.environ.get("SLACK_WEBHOOK_URL", "")


def mask_webhook_url(url: str) -> str:
    """Mask sensitive tokens in webhook URL for display in API, UI, and logs."""
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


def test_webhook(webhook_url: str, project_name: str = "Project") -> tuple:
    """Send a test notification to verify webhook configuration. Returns (success, message)."""
    if not webhook_url:
        return False, "No webhook URL provided"
    
    payload = {
        "text": f"🔔 *ML-O11Y Security Integration Test*\nProject: *{project_name}*\nStatus: Connected successfully!",
        "content": f"🔔 **ML-O11Y Security Integration Test**\nProject: **{project_name}**\nStatus: Connected successfully!"
    }
    masked = mask_webhook_url(webhook_url)
    try:
        print(f"\n[WEBHOOK] Testing connection to {masked}...")
        res = requests.post(webhook_url, json=payload, timeout=5)
        if res.status_code in (200, 204):
            return True, f"Webhook delivered successfully (HTTP {res.status_code})"
        return False, f"Webhook endpoint returned HTTP {res.status_code}: {res.text[:100]}"
    except Exception as e:
        return False, f"Failed to connect to webhook: {str(e)}"


def send_alert(alert_data, webhook_url=None):
    """Fires a webhook in the background so it doesn't block the ingest pipeline."""
    target_url = webhook_url or WEBHOOK_URL
    if not target_url:
        return

    def _post():
        masked = mask_webhook_url(target_url)
        sev = alert_data.get("severity", "HIGH").upper()
        proj = alert_data.get("project_id", "default")
        payload = {
            "text": f"🚨 *{sev} SEVERITY ALERT* 🚨\n"
                    f"*Project:* `{proj}`\n"
                    f"*Endpoint:* {alert_data.get('endpoint')}\n"
                    f"*IP:* {alert_data.get('ip')}\n"
                    f"*Score:* {alert_data.get('anomaly_score')}\n"
                    f"*Rules:* {', '.join(alert_data.get('rule_flags', []) or ['None'])}",
            "content": f"🚨 **{sev} SEVERITY ALERT** 🚨\n"
                       f"**Project:** `{proj}`\n"
                       f"**Endpoint:** {alert_data.get('endpoint')}\n"
                       f"**IP:** {alert_data.get('ip')}\n"
                       f"**Score:** {alert_data.get('anomaly_score')}\n"
                       f"**Rules:** {', '.join(alert_data.get('rule_flags', []) or ['None'])}"
        }
        try:
            print(f"\n[WEBHOOK] Sending {sev} alert to {masked}...")
            res = requests.post(target_url, json=payload, timeout=5)
            print(f"[WEBHOOK] Response from {masked}: {res.status_code}\n")
        except Exception as e:
            print(f"\n[WEBHOOK] FAILED TO SEND to {masked}: {e}\n")

    threading.Thread(target=_post, daemon=True).start()


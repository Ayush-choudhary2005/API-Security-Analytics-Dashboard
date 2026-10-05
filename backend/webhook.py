import os
import requests
import threading

# Fallback default from environment variable
WEBHOOK_URL = os.environ.get("SLACK_WEBHOOK_URL", "")


def send_alert(alert_data, webhook_url=None):
    """Fires a webhook in the background so it doesn't block the ingest pipeline.
    Uses the project-specific webhook_url if configured, falling back to SLACK_WEBHOOK_URL.
    """
    target_url = webhook_url or WEBHOOK_URL
    if not target_url:
        return

    def _post():
        payload = {
            "text": f"🚨 *HIGH SEVERITY ALERT* 🚨\n"
                    f"*Endpoint:* {alert_data.get('endpoint')}\n"
                    f"*IP:* {alert_data.get('ip')}\n"
                    f"*Score:* {alert_data.get('anomaly_score')}\n"
                    f"*Rules:* {', '.join(alert_data.get('rule_flags', []))}"
        }
        try:
            print(f"\n[WEBHOOK] Attempting to send to {target_url[:35]}...")
            res = requests.post(target_url, json=payload, timeout=5)
            print(f"[WEBHOOK] Response: {res.status_code} {res.text}\n")
        except Exception as e:
            print(f"\n[WEBHOOK] FAILED TO SEND: {e}\n")

    threading.Thread(target=_post, daemon=True).start()

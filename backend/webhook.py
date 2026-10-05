import requests
import threading

# You can set this to a real Slack/Discord webhook URL
import os



def send_alert(alert_data, webhook_url=None):
    """Fires a webhook in the background so it doesn't block the ingest pipeline."""
    if not webhook_url:
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
            print(f"\n[WEBHOOK] Attempting to send to Slack...")
            res = requests.post(webhook_url, json=payload, timeout=5)
            print(f"[WEBHOOK] Slack responded: {res.status_code} {res.text}\n")
        except Exception as e:
            print(f"\n[WEBHOOK] FAILED TO SEND: {e}\n")
            
    threading.Thread(target=_post, daemon=True).start()

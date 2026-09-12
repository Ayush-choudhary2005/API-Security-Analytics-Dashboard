import requests
import threading

# You can set this to a real Slack/Discord webhook URL
WEBHOOK_URL = "http://localhost:5001/api/webhook_test"

def send_alert(alert_data):
    """Fires a webhook in the background so it doesn't block the ingest pipeline."""
    if not WEBHOOK_URL:
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
            requests.post(WEBHOOK_URL, json=payload, timeout=2)
        except Exception as e:
            pass
            
    threading.Thread(target=_post, daemon=True).start()

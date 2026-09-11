import os
import json
from google import genai
from db import get_conn, _row_to_dict

def get_event_by_id(event_id: int):
    conn = get_conn()
    row = conn.execute("SELECT * FROM events WHERE id = ?", (event_id,)).fetchone()
    conn.close()
    if row:
        return _row_to_dict(row)
    return None

def get_recent_ip_history(ip: str, limit: int = 50):
    conn = get_conn()
    rows = conn.execute(
        "SELECT timestamp, method, endpoint, status_code, latency_ms FROM events WHERE ip = ? ORDER BY timestamp DESC LIMIT ?", 
        (ip, limit)
    ).fetchall()
    conn.close()
    # Reverse so they are in chronological order
    events = [dict(r) for r in rows][::-1]
    return events

def generate_threat_report(event_id: int):
    """Generates an LLM threat report for a specific anomalous event."""
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        return "Error: GEMINI_API_KEY environment variable is not set. Please set it in your terminal."
    
    event = get_event_by_id(event_id)
    if not event:
        return "Error: Event not found."
    
    history = get_recent_ip_history(event['ip'], limit=100)
    
    # Truncate to the 30 most recent events (the actual attack) rather than the oldest
    if len(history) > 30:
        history = history[-30:]
        history_lines = ["... [truncated older events] ...", "time | method | endpoint | status | latency"]
    else:
        history_lines = ["time | method | endpoint | status | latency"]
        
    for h in history:
        history_lines.append(f"{h['timestamp']:.1f} | {h['method']} | {h['endpoint']} | {h['status_code']} | {h['latency_ms']:.1f}ms")
    
    history_text = "\n".join(history_lines)
    
    prompt = f"""
You are a senior cybersecurity analyst. We have detected anomalous traffic in our API gateway.
Please analyze the following event and the recent traffic history for the offending IP address.

### Anomalous Event (Triggered Alert)
- IP: {event['ip']}
- Target Endpoint: {event['method']} {event['endpoint']}
- ML Anomaly Score: {event['anomaly_score']}
- Hardcoded Rule Flags: {event['rule_flags']}

### Recent Traffic History for IP {event['ip']} (Chronological)
```
{history_text}
```

Write a brief, professional threat intelligence report in Markdown format containing:
1. **Threat Analysis**: Explain what the attacker is doing based on the endpoint pattern and timing (e.g. scraping, fuzzing, credential stuffing, etc).
2. **ML Interpretation**: Why did the model flag this? (e.g., high burst, unusual endpoints, etc).
3. **Remediation Plan**: 2-3 specific, actionable steps to stop this threat (e.g., WAF rules, rate limiting, IP blocking).

Keep it concise and punchy. Use markdown formatting.
"""

    try:
        client = genai.Client(api_key=api_key)
        response = client.models.generate_content(
            model='gemini-3.6-flash',
            contents=prompt,
        )
        return response.text
    except Exception as e:
        return f"Error connecting to Gemini API: {str(e)}"

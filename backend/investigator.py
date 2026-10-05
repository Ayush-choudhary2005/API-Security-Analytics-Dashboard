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

def get_recent_ip_history(ip: str, project_id: str = None, limit: int = 50):
    """Fetch recent events for an IP strictly scoped to the specified project."""
    conn = get_conn()
    if project_id:
        rows = conn.execute(
            """
            SELECT timestamp, method, endpoint, status_code, latency_ms, project_id, tenant_id 
            FROM events 
            WHERE ip = ? AND (project_id = ? OR tenant_id = ?) 
            ORDER BY timestamp DESC LIMIT ?
            """, 
            (ip, project_id, project_id, limit)
        ).fetchall()
    else:
        rows = conn.execute(
            "SELECT timestamp, method, endpoint, status_code, latency_ms, project_id, tenant_id FROM events WHERE ip = ? ORDER BY timestamp DESC LIMIT ?", 
            (ip, limit)
        ).fetchall()
    conn.close()
    # Reverse so they are in chronological order
    events = [dict(r) for r in rows][::-1]
    return events

def build_investigation_prompt(event: dict, history: list) -> str:
    """Build the structured prompt for Gemini threat analysis scoped to this project."""
    project_id = event.get("project_id") or event.get("tenant_id") or "default"
    
    # Truncate to the 30 most recent events (the actual attack) rather than the oldest
    if len(history) > 30:
        history_window = history[-30:]
        history_lines = ["... [truncated older events] ...", "time | method | endpoint | status | latency"]
    else:
        history_window = history
        history_lines = ["time | method | endpoint | status | latency"]
        
    for h in history_window:
        history_lines.append(f"{h['timestamp']:.1f} | {h['method']} | {h['endpoint']} | {h['status_code']} | {h['latency_ms']:.1f}ms")
    
    history_text = "\n".join(history_lines)
    
    prompt = f"""
You are a senior cybersecurity analyst. We have detected anomalous traffic in our API gateway.
Please analyze the following event and the recent traffic history for the offending IP address.

### Target Application
- Project ID: {project_id}

### Anomalous Event (Triggered Alert)
- IP: {event['ip']}
- Target Endpoint: {event['method']} {event['endpoint']}
- ML Anomaly Score: {event['anomaly_score']}
- Hardcoded Rule Flags: {event['rule_flags']}

### Recent Traffic History for IP {event['ip']} in Project {project_id} (Chronological)
```
{history_text}
```

Write a brief, professional threat intelligence report in Markdown format containing:
1. **Threat Analysis**: Explain what the attacker is doing based on the endpoint pattern and timing (e.g. scraping, fuzzing, credential stuffing, etc).
2. **ML Interpretation**: Why did the model flag this? (e.g., high burst, unusual endpoints, etc).
3. **Remediation Plan**: 2-3 specific, actionable steps to stop this threat (e.g., WAF rules, rate limiting, IP blocking).

Keep it concise and punchy. Use markdown formatting.
"""
    return prompt

def generate_threat_report(event_id: int):
    """Generates an LLM threat report for a specific anomalous event scoped to its project."""
    event = get_event_by_id(event_id)
    if not event:
        return "Error: Event not found."
    
    project_id = event.get("project_id") or event.get("tenant_id") or "default"
    history = get_recent_ip_history(event['ip'], project_id=project_id, limit=100)
    prompt = build_investigation_prompt(event, history)

    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        # Provide a structured fallback report so offline investigation still works and displays project-scoped data
        return f"""# 🛡️ AI Threat Investigation Report
**Project:** `{project_id}`  
**Target:** `{event['method']} {event['endpoint']}`  
**Source IP:** `{event['ip']}`  
**Anomaly Score:** `{event['anomaly_score']}`  
**Rule Detections:** `{', '.join(event.get('rule_flags', []) or ['None'])}`  

### 1. Threat Analysis
Anomalous traffic pattern detected targeting endpoint `{event['endpoint']}`. Analyzed `{len(history)}` recent events strictly within project `{project_id}`.

### 2. ML Interpretation
Isolation Forest anomaly detector and rule engine flagged this activity due to statistical divergence in request rate, status distribution, or error bursts.

### 3. Recommended Remediation
1. Rate limit or block IP `{event['ip']}` on Project `{project_id}`.
2. Review authentication credentials for unauthorized access attempts.
3. Configure Slack/Discord alert notifications for instant incident triage.

*(Note: Live GenAI analysis requires GEMINI_API_KEY environment variable)*"""
    
    # Fallback models in case of 503 High Demand errors
    models_to_try = ['gemini-3.6-flash', 'gemini-3.7-flash', 'gemini-3.5-flash']
    last_error = ""
    
    try:
        client = genai.Client(api_key=api_key)
        for model_name in models_to_try:
            try:
                response = client.models.generate_content(
                    model=model_name,
                    contents=prompt,
                )
                return response.text
            except Exception as e:
                print(f"Model {model_name} failed: {e}")
                last_error = str(e)
                continue
                
        return f"Error: All fallback models failed. Last error: {last_error}"
    except Exception as e:
        return f"Error connecting to Gemini API: {str(e)}"


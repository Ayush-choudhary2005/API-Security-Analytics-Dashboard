"""
investigator.py — Production GenAI Threat Investigation Service.
Provides project-scoped incident analysis, multi-tenant isolation,
graceful offline/error fallbacks, and server-side secret protection.
"""

import os
import json
import time
from db import get_conn, _row_to_dict, user_has_project_access

try:
    from google import genai
except ImportError:
    genai = None

# Production Gemini Models (with automatic failover)
GEMINI_MODELS = ['gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-1.5-pro']


def is_valid_gemini_key(key: str) -> bool:
    """Validate whether the key is a real candidate key or an unconfigured placeholder."""
    if not key or not isinstance(key, str):
        return False
    k = key.strip()
    if not k or "your_" in k.lower() or len(k) < 15 or k.lower() in ("placeholder", "none", "null"):
        return False
    return True


def get_event_by_id(event_id: int):
    """Retrieve event by id."""
    conn = get_conn()
    row = conn.execute("SELECT * FROM events WHERE id = ?", (event_id,)).fetchone()
    conn.close()
    if row:
        return _row_to_dict(row)
    return None


def get_gemini_status() -> dict:
    """
    Check Gemini configuration health without leaking the API key.
    """
    api_key = os.environ.get("GEMINI_API_KEY", "").strip()
    configured = is_valid_gemini_key(api_key)
    return {
        "configured": configured,
        "status": "Configured ✓" if configured else "Missing Key (Fallback Mode)",
        "models": GEMINI_MODELS if configured else []
    }


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
    return [dict(r) for r in rows][::-1]


def build_investigation_prompt(event: dict, history: list) -> str:
    """Build the structured prompt for Gemini threat analysis scoped to this project."""
    project_id = event.get("project_id") or event.get("tenant_id") or "default"
    
    # Truncate to the 30 most recent events strictly within this project
    if len(history) > 30:
        history_window = history[-30:]
        history_lines = ["... [truncated older events] ...", "time | method | endpoint | status | latency"]
    else:
        history_window = history
        history_lines = ["time | method | endpoint | status | latency"]
        
    for h in history_window:
        ts = float(h.get('timestamp') or 0.0)
        meth = h.get('method') or 'GET'
        ep = h.get('endpoint') or '/'
        sc = h.get('status_code') or 200
        lat = float(h.get('latency_ms') or 0.0)
        history_lines.append(f"{ts:.1f} | {meth} | {ep} | {sc} | {lat:.1f}ms")
    
    history_text = "\n".join(history_lines)
    
    ip = event.get('ip') or event.get('source_ip') or '127.0.0.1'
    method = event.get('method') or 'GET'
    endpoint = event.get('endpoint') or '/'
    score = event.get('anomaly_score', 0.0) or 0.0
    flags = event.get('rule_flags', []) or []
    
    prompt = f"""
You are a senior cybersecurity analyst. We have detected anomalous traffic in our API gateway.
Please analyze the following event and the recent traffic history for the offending IP address.

### Target Application
- Project ID: {project_id}

### Anomalous Event (Triggered Alert)
- IP: {ip}
- Target Endpoint: {method} {endpoint}
- ML Anomaly Score: {score}
- Hardcoded Rule Flags: {flags}

### Recent Traffic History for IP {ip} in Project {project_id} (Chronological)
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


def generate_fallback_threat_report(event: dict, history: list, project_id: str, notice: str = None) -> str:
    """Generate high-quality structured heuristic report when Gemini is offline or API fails."""
    raw_attack = event.get("attack_type") or "security_anomaly"
    attack_type = raw_attack.replace("_", " ").title()

    raw_flags = event.get("rule_flags") or []
    if isinstance(raw_flags, str):
        try:
            raw_flags = json.loads(raw_flags)
        except Exception:
            raw_flags = [raw_flags]
    if not isinstance(raw_flags, list):
        raw_flags = []

    rule_list = ", ".join(raw_flags) if raw_flags else "Statistical Outlier"
    status_code = event.get("status_code", 200) or 200
    latency = float(event.get("latency_ms") or 0.0)
    ip = event.get("ip") or event.get("source_ip") or "127.0.0.1"
    method = event.get("method") or "GET"
    endpoint = event.get("endpoint") or "/"
    score = event.get("anomaly_score", 0.0)
    if score is None:
        score = 0.0

    notice_banner = f"> [!NOTE]\n> {notice}\n\n" if notice else ""

    # Synthesize threat context based on detected characteristics
    if "brute_force" in raw_flags:
        analysis = (
            f"The offending IP `{ip}` executed repeated rapid authentication attempts against `{endpoint}`. "
            f"With status codes indicating access denial ({status_code}), this behavioral pattern is characteristic of "
            "credential stuffing, automated password spraying, or dictionary enumeration."
        )
        remediation_action = f"Enforce multi-factor authentication (MFA) and enable IP-based rate limiting on `{endpoint}`."
    elif "endpoint_scan" in raw_flags:
        analysis = (
            f"The offending IP `{ip}` systematically enumerated diverse unlinked endpoint paths within a short time window. "
            "This pattern indicates reconnaissance scanning by automated vulnerability tools (e.g., dirbuster, nikto, or custom fuzzer)."
        )
        remediation_action = "Deploy API Gateway route whitelisting and block directory enumeration probes."
    elif "request_burst" in raw_flags:
        analysis = (
            f"A volumetric request burst was detected from `{ip}` exceeding standard client consumption limits. "
            "This behavior is consistent with scraping bots, denial-of-service attempts, or unthrottled API client loops."
        )
        remediation_action = f"Apply token-bucket rate limits and Cloudflare / WAF burst protection."
    else:
        analysis = (
            f"Statistical deviation observed in latency ({latency:.1f}ms) or endpoint parameter distributions. "
            f"Historical events analyzed: {len(history)} events strictly within project `{project_id}`."
        )
        remediation_action = "Audit anomalous request payloads for injection attempts or unexpected parameter structures."

    report = f"""{notice_banner}# 🛡️ AI Threat Investigation Report
**Project:** `{project_id}`  
**Attack Vector:** `{attack_type}`  
**Target:** `{method} {endpoint}`  
**Source IP:** `{ip}`  
**Anomaly Score:** `{score}`  
**Rule Detections:** `{rule_list}`  

---

### 1. Threat Analysis
{analysis}

### 2. ML & Statistical Interpretation
The Hybrid Isolation Forest anomaly detector and rule engine flagged this transaction due to:
* High multi-metric divergence from the project's baseline traffic profile.
* Deviation depth relative to rolling project history ({len(history)} baseline samples).
* Concurrent trigger of deterministic threat signatures.

### 3. Recommended Remediation Plan
1. **Immediate Active Defense:** Block or rate-limit IP `{ip}` on Project `{project_id}` using the dashboard active defense controls.
2. **Defensive Hardening:** {remediation_action}
3. **Automated Notification:** Connect Slack or Discord webhook integrations to receive immediate alerts for future high-severity incidents.
"""
    return report


def generate_threat_report(event_id: int, user_id: str = None) -> str:
    """
    Generates an LLM threat report for a specific anomalous event.
    Verifies project access if user_id is provided.
    Never exposes internal credentials.
    Gracefully falls back to heuristic engine if Gemini is not configured or fails.
    """
    try:
        event = get_event_by_id(event_id)
        if not event:
            return "Error: Event not found."

        project_id = event.get("project_id") or event.get("tenant_id") or "default"

        # Enforce strict server-side authorization check if user context is provided
        if user_id and not user_has_project_access(user_id, project_id):
            return "Forbidden: You do not have permission to investigate alerts in this project."

        # Fetch history strictly scoped to this project
        ip = event.get('ip') or event.get('source_ip') or '127.0.0.1'
        history = get_recent_ip_history(ip, project_id=project_id, limit=100)

        api_key = os.environ.get("GEMINI_API_KEY", "").strip()
        if not is_valid_gemini_key(api_key):
            return generate_fallback_threat_report(
                event, history, project_id,
                notice="Live LLM generation is operating in Heuristic Fallback Mode (GEMINI_API_KEY environment variable is not configured)."
            )

        if genai is None:
            return generate_fallback_threat_report(
                event, history, project_id,
                notice="`google-genai` Python library is not installed in the active environment. Showing automated threat intelligence report:"
            )

        # Attempt live GenAI call with genuine production models and failover
        try:
            client = genai.Client(api_key=api_key)
            prompt = build_investigation_prompt(event, history)

            last_error = ""
            for model_name in GEMINI_MODELS:
                try:
                    response = client.models.generate_content(
                        model=model_name,
                        contents=prompt,
                    )
                    if response and response.text:
                        return response.text
                except Exception as model_err:
                    last_error = str(model_err)
                    continue

            # If all Gemini models failed (e.g. quota limit, network outage)
            clean_err = "Gemini service temporarily unavailable or rate limited."
            if "quota" in last_error.lower():
                clean_err = "Gemini API quota exceeded."
            elif "timeout" in last_error.lower():
                clean_err = "Gemini API request timed out."

            return generate_fallback_threat_report(
                event, history, project_id,
                notice=f"Live GenAI call encountered an issue ({clean_err}). Showing automated threat intelligence report:"
            )

        except ImportError:
            return generate_fallback_threat_report(
                event, history, project_id,
                notice="`google-genai` Python library is not installed in the active environment. Showing automated threat intelligence report:"
            )
        except Exception as e:
            clean_err = "External API connection error"
            return generate_fallback_threat_report(
                event, history, project_id,
                notice=f"{clean_err}. Showing automated threat intelligence report:"
            )
    except Exception as top_err:
        import logging
        logging.getLogger("api_security.investigator").error(f"Error in generate_threat_report: {top_err}", exc_info=True)
        return (
            "# ⚠️ Threat Report Unavailable\n\n"
            "An unexpected error occurred while analyzing this incident. "
            "Please check that the incident exists and that valid traffic features are associated with it."
        )

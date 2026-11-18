#!/usr/bin/env python3
"""
demo_attack_scenario.py — Real-World Security Telemetry & Attack Simulation.

Sends realistic ingress telemetry to the local collector (http://127.0.0.1:5001/ingest):
1. Normal user browsing traffic (baseline latency & green metrics)
2. Credential stuffing / Brute-force attack (triggers High-Severity ML Alert & Webhook)
3. Volumetric burst attack (triggers Early Warning Threat Radar & Auto-Blocking)
"""

import sys
import time
import json
import urllib.request
import urllib.error

COLLECTOR_URL = "http://127.0.0.1:5001/ingest"
API_TOKEN = "phase1-demo-token"


def send_telemetry(payload):
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        COLLECTOR_URL,
        data=data,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {API_TOKEN}",
            "User-Agent": "SecurityDemoAgent/1.0",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=5) as resp:
            return resp.status, json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read().decode("utf-8"))
    except Exception as e:
        return 0, {"error": str(e)}


def run_normal_traffic(count=8):
    print("\n[SCENARIO 1/3] Generating Legitimate User Traffic (Baseline)...")
    endpoints = [
        ("/api/v1/products", "GET", 200, 45),
        ("/api/v1/products/item-84", "GET", 200, 62),
        ("/api/v1/cart", "POST", 201, 88),
        ("/api/v1/categories", "GET", 200, 35),
        ("/api/v1/checkout/shipping", "GET", 200, 110),
    ]
    for i in range(count):
        ep, method, status, lat = endpoints[i % len(endpoints)]
        payload = {
            "endpoint": ep,
            "method": method,
            "status_code": status,
            "latency_ms": lat,
            "ip": f"198.51.100.{10 + (i % 3)}",
            "metadata": {
                "latitude": 37.7749,
                "longitude": -122.4194,
                "city": "San Francisco",
                "country": "United States",
            },
        }
        code, res = send_telemetry(payload)
        print(f"  ✓ [{code}] {method} {ep} (lat: {lat}ms)")
        time.sleep(0.3)
    print("  -> Legitimate traffic recorded. Live telemetry graphs updated.")


def run_credential_stuffing_attack():
    print("\n[SCENARIO 2/3] Simulating Hostile Credential Stuffing / Brute-Force Attack...")
    print("  Target: POST /api/v1/auth/login from Hostile IP: 185.220.101.5 (Frankfurt, Germany)")
    print("  -> Watch your Webhook (Discord / Slack) and the Threat Geolocation Map in the dashboard!")
    
    attacker_ip = "185.220.101.5"
    geo = {
        "latitude": 50.1109,
        "longitude": 8.6821,
        "city": "Frankfurt",
        "country": "Germany",
    }
    
    # 8 consecutive failed login attempts in rapid succession
    for i in range(1, 9):
        payload = {
            "endpoint": "/api/v1/auth/login",
            "method": "POST",
            "status_code": 401,
            "latency_ms": 350 + (i * 20),
            "ip": attacker_ip,
            "user_id": f"target_user_{i}@company.com",
            "metadata": geo,
        }
        code, res = send_telemetry(payload)
        flagged = res.get("severity") in ("medium", "high") or res.get("anomaly_score", 0) > 1.5
        sev_tag = f" [ALERT: {res.get('severity', 'FLAGGED').upper()}]" if flagged else ""
        print(f"  ⚡ [{code}] Attempt {i}/8 on /api/v1/auth/login{sev_tag}")
        time.sleep(0.4)
    print("  -> Brute force signature flagged by Isolation Forest & Rules!")
    print("  -> Dispatched webhook alert & radiating Cyber Radar shockwave rendered on map.")


def run_volumetric_burst_attack():
    print("\n[SCENARIO 3/3] Simulating Volumetric Burst Attack & Early Warning Radar...")
    print("  Target: Rapid endpoint scanning & flooding from 203.0.113.88 (Tokyo, Japan)")
    print("  -> Watch the 'Early Warning Threat Radar' appear on the Overview Page!")
    
    burst_ip = "203.0.113.88"
    geo = {
        "latitude": 35.6762,
        "longitude": 139.6503,
        "city": "Tokyo",
        "country": "Japan",
    }

    # Step A: 20 rapid requests to push velocity into Warning Zone (>=15 req/min)
    print("  [Stage A] Surging to 20 req/min (Warning Zone)...")
    for i in range(1, 22):
        payload = {
            "endpoint": f"/api/v1/search?query=exploit_{i}",
            "method": "GET",
            "status_code": 200,
            "latency_ms": 50,
            "ip": burst_ip,
            "metadata": geo,
        }
        code, res = send_telemetry(payload)
        if i % 5 == 0 or i == 20:
            print(f"  🔥 [{code}] Request {i}/20 dispatched (Threat Radar active)")
        time.sleep(0.1)

    print("  -> IP 203.0.113.88 is now active in the Early Warning Threat Radar.")
    print("  -> You can click 'PRE-EMPTIVE BLOCK' in the UI, or continue to trigger Auto-Block.")


if __name__ == "__main__":
    print("=" * 70)
    print(" API SECURITY ANALYTICS & ACTIVE DEFENSE — LIVE ATTACK DEMO")
    print("=" * 70)
    print("Target Collector:", COLLECTOR_URL)
    print("Project Token:   ", API_TOKEN)
    
    arg = sys.argv[1].lower() if len(sys.argv) > 1 else "all"
    
    if arg in ("1", "normal"):
        run_normal_traffic()
    elif arg in ("2", "brute", "webhook"):
        run_credential_stuffing_attack()
    elif arg in ("3", "burst", "radar"):
        run_volumetric_burst_attack()
    else:
        run_normal_traffic(count=5)
        time.sleep(1)
        run_credential_stuffing_attack()
        time.sleep(1)
        run_volumetric_burst_attack()

    print("\n" + "=" * 70)
    print(" DEMO EXECUTION COMPLETE")
    print(" Open http://127.0.0.1:5001 to view live telemetry, radar, and map.")
    print("=" * 70)

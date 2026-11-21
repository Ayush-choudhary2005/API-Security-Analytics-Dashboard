#!/usr/bin/env python3
"""
continuous_traffic_simulator.py — Real-Time Production Traffic & Attack Simulator
with 5-Minute Slack Security Heartbeat & Digest.

Simulates a live production environment:
1. Continuous legitimate API traffic (varied endpoints, latencies, global geolocations)
2. Periodic hostile attack waves (Credential Stuffing, Vulnerability Scans, Volumetric Bursts)
3. Timely Slack Health & Security Digest every 5 minutes reporting "Everything is OK"
   along with the timestamp and details of the last detected attack.

Usage:
    python3 continuous_traffic_simulator.py
    python3 continuous_traffic_simulator.py --report-interval 60   # Heartbeat every 1 min (demo mode)
    python3 continuous_traffic_simulator.py --attack-interval 30   # Attack wave every 30s
    python3 continuous_traffic_simulator.py --no-attacks           # Pure legitimate traffic baseline
"""

import os
import sys
import time
import json
import random
import signal
import sqlite3
import argparse
import urllib.request
import urllib.error
from datetime import datetime

# Setup backend paths
BACKEND_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "backend")
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

COLLECTOR_URL = "http://127.0.0.1:5001/ingest"
BLOCKED_IPS_URL = "http://127.0.0.1:5001/api/v1/blocked-ips"
API_TOKEN = "phase1-demo-token"
DB_PATH = os.path.join(BACKEND_DIR, "events.db")

# ---- Global Geolocation Pool for Legitimate Traffic ----
GEO_LOCATIONS = [
    {"city": "San Francisco", "country": "United States", "latitude": 37.7749, "longitude": -122.4194, "ip_prefix": "198.51.100."},
    {"city": "New York", "country": "United States", "latitude": 40.7128, "longitude": -74.0060, "ip_prefix": "198.51.101."},
    {"city": "London", "country": "United Kingdom", "latitude": 51.5074, "longitude": -0.1278, "ip_prefix": "82.165.197."},
    {"city": "Tokyo", "country": "Japan", "latitude": 35.6762, "longitude": 139.6503, "ip_prefix": "133.242.18."},
    {"city": "Singapore", "country": "Singapore", "latitude": 1.3521, "longitude": 103.8198, "ip_prefix": "103.252.118."},
    {"city": "Frankfurt", "country": "Germany", "latitude": 50.1109, "longitude": 8.6821, "ip_prefix": "185.12.112."},
    {"city": "Mumbai", "country": "India", "latitude": 19.0760, "longitude": 72.8777, "ip_prefix": "103.115.196."},
    {"city": "Sydney", "country": "Australia", "latitude": -33.8688, "longitude": 151.2093, "ip_prefix": "139.130.4."},
    {"city": "São Paulo", "country": "Brazil", "latitude": -23.5505, "longitude": -46.6333, "ip_prefix": "177.18.200."},
]

NORMAL_ENDPOINTS = [
    ("/api/v1/products", "GET", 200, (25, 65)),
    ("/api/v1/products/item-102", "GET", 200, (35, 80)),
    ("/api/v1/products/item-84", "GET", 200, (30, 75)),
    ("/api/v1/categories", "GET", 200, (20, 50)),
    ("/api/v1/cart", "POST", 201, (60, 110)),
    ("/api/v1/checkout/shipping", "GET", 200, (50, 95)),
    ("/api/v1/orders/history", "GET", 200, (40, 90)),
    ("/api/v1/search?q=wireless+headphones", "GET", 200, (45, 90)),
    ("/api/v1/users/profile", "GET", 200, (30, 70)),
]

running = True


def handle_sigint(sig, frame):
    global running
    print("\n\n[!] Shutdown signal received. Stopping traffic simulator cleanly...")
    running = False


signal.signal(signal.SIGINT, handle_sigint)


def resolve_slack_webhook(override_url=None):
    """Resolve active Slack webhook URL from CLI, DB, or environment."""
    if override_url:
        return override_url
    if os.path.exists(DB_PATH):
        try:
            conn = sqlite3.connect(DB_PATH)
            row = conn.execute(
                "SELECT webhook_url FROM webhook_configs WHERE provider='slack' AND enabled=1 ORDER BY id DESC LIMIT 1"
            ).fetchone()
            if row and row[0]:
                return row[0]
        except Exception:
            pass
    return os.environ.get("SLACK_WEBHOOK_URL", "")


def send_telemetry_event(payload):
    """Post single telemetry payload to the ingest pipeline."""
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        COLLECTOR_URL,
        data=data,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {API_TOKEN}",
            "User-Agent": "ProductionTrafficSimulator/1.0",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=4) as resp:
            return resp.status, json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read().decode("utf-8"))
        except Exception:
            return e.code, {"error": str(e)}
    except Exception as e:
        return 0, {"error": str(e)}


def get_blocked_ips_count():
    """Fetch count of currently quarantined IPs from the collector."""
    req = urllib.request.Request(
        BLOCKED_IPS_URL,
        headers={"Authorization": f"Bearer {API_TOKEN}"}
    )
    try:
        with urllib.request.urlopen(req, timeout=3) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            return data.get("count", 0)
    except Exception:
        return 0


def get_last_attack_info(window_seconds=300):
    """Query recent attack telemetry from local SQLite database."""
    now = time.time()
    cutoff = now - window_seconds
    if not os.path.exists(DB_PATH):
        return None, 0

    try:
        conn = sqlite3.connect(DB_PATH)
        # Recent attacks in the window
        cur = conn.cursor()
        cur.execute(
            """
            SELECT COUNT(*) FROM events 
            WHERE project_id='proj_demo_default' 
              AND severity IN ('medium', 'high', 'critical')
              AND timestamp >= ?
            """,
            (cutoff,)
        )
        attacks_in_window = cur.fetchone()[0]

        # Last attack ever recorded
        cur.execute(
            """
            SELECT timestamp, endpoint, ip, severity, attack_type, anomaly_score, metadata 
            FROM events 
            WHERE project_id='proj_demo_default' 
              AND severity IN ('medium', 'high', 'critical')
            ORDER BY timestamp DESC LIMIT 1
            """
        )
        last_row = cur.fetchone()
        if not last_row:
            return None, attacks_in_window

        ts, ep, ip, sev, atk_type, score, raw_meta = last_row
        meta = {}
        try:
            meta = json.loads(raw_meta) if raw_meta else {}
        except Exception:
            pass

        loc = ", ".join(filter(None, [meta.get("city"), meta.get("country")])) or "Remote Host"
        sec_ago = max(0, int(now - ts))
        if sec_ago < 60:
            ago_str = f"{sec_ago}s ago"
        elif sec_ago < 3600:
            ago_str = f"{sec_ago // 60}m {sec_ago % 60}s ago"
        else:
            ago_str = f"{sec_ago // 3600}h {(sec_ago % 3600) // 60}m ago"

        info = {
            "attack_type": atk_type or "security_anomaly",
            "endpoint": ep,
            "ip": ip,
            "severity": sev.upper(),
            "location": loc,
            "time_ago": ago_str,
            "timestamp": ts,
        }
        return info, attacks_in_window
    except Exception as e:
        print(f"  [!] DB query error: {e}")
        return None, 0


def send_slack_heartbeat(webhook_url, window_requests, interval_seconds=300):
    """Dispatch rich 5-minute health report to Slack channel."""
    if not webhook_url:
        return

    last_attack, attacks_in_window = get_last_attack_info(window_seconds=interval_seconds)
    blocked_count = get_blocked_ips_count()

    interval_min = max(1, interval_seconds // 60)
    current_time_str = datetime.now().strftime("%H:%M:%S")

    if attacks_in_window == 0:
        status_text = (
            f"✅ *Status: Everything is OK — System Operating Normally*\n"
            f"Ingress traffic is operating within baseline security parameters. "
            f"Zero hostile breaches detected in the last {interval_min}-minute window."
        )
        status_badge = "HEALTHY / BASELINE NORMAL"
    else:
        status_text = (
            f"⚠️ *Status: Active Threats Mitigated ({attacks_in_window} in window)*\n"
            f"The Isolation Forest engine and rate limiter detected and neutralized hostile attempts. "
            f"Host endpoints remain protected."
        )
        status_badge = f"{attacks_in_window} ATTACKS MITIGATED"

    if last_attack:
        last_attack_desc = f"{last_attack['time_ago']} ({last_attack['attack_type']} from {last_attack['ip']}, {last_attack['location']})"
    else:
        last_attack_desc = "None recorded in current session"

    payload = {
        "text": f"🛡️ ML-O11Y Security Digest ({interval_min}m Heartbeat): {status_badge}",
        "blocks": [
            {
                "type": "header",
                "text": {
                    "type": "plain_text",
                    "text": f"🛡️ ML-O11Y Security Digest ({interval_min}-Min Heartbeat)",
                    "emoji": True
                }
            },
            {
                "type": "section",
                "text": {
                    "type": "mrkdwn",
                    "text": status_text
                }
            },
            {
                "type": "section",
                "fields": [
                    {"type": "mrkdwn", "text": "*Project:*\n`Production E-Commerce API`"},
                    {"type": "mrkdwn", "text": f"*Requests Analyzed ({interval_min}m):*\n`{window_requests} requests`"},
                    {"type": "mrkdwn", "text": f"*Last Attack Detected:*\n`{last_attack_desc}`"},
                    {"type": "mrkdwn", "text": f"*Quarantined IP Addresses:*\n`{blocked_count} active edge drops`"}
                ]
            },
            {
                "type": "context",
                "elements": [
                    {
                        "type": "mrkdwn",
                        "text": f"⚡ *Continuous Active Defense Engine* • Generated at {current_time_str} • Next report in {interval_min} min"
                    }
                ]
            }
        ]
    }

    req = urllib.request.Request(
        webhook_url,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"}
    )
    try:
        with urllib.request.urlopen(req, timeout=5) as resp:
            if resp.status == 200:
                print(f"  [📢 SLACK HEARTBEAT SENT] Status: {status_badge} | Window Reqs: {window_requests} | Blocked IPs: {blocked_count}")
    except Exception as e:
        print(f"  [!] Failed to send Slack heartbeat: {e}")


def simulate_normal_request():
    """Fire one legitimate user interaction."""
    geo = random.choice(GEO_LOCATIONS)
    ep, method, status, lat_range = random.choice(NORMAL_ENDPOINTS)
    latency = random.randint(*lat_range)
    client_ip = f"{geo['ip_prefix']}{random.randint(2, 240)}"

    payload = {
        "endpoint": ep,
        "method": method,
        "status_code": status,
        "latency_ms": latency,
        "ip": client_ip,
        "metadata": {
            "city": geo["city"],
            "country": geo["country"],
            "latitude": geo["latitude"],
            "longitude": geo["longitude"],
        }
    }
    code, _ = send_telemetry_event(payload)
    return code, ep, client_ip, geo["city"]


def simulate_attack_wave():
    """Randomly inject one of three hostile real-world attack vectors."""
    wave_choice = random.choice(["brute_force", "fuzz_scan", "request_burst"])

    if wave_choice == "brute_force":
        attacker_ip = "185.220.101.5"  # Frankfurt, Germany
        print(f"\n  🚨 [ATTACK WAVE] Injecting Credential Stuffing / Brute-Force from {attacker_ip} (Frankfurt)...")
        geo = {"city": "Frankfurt", "country": "Germany", "latitude": 50.1109, "longitude": 8.6821}
        for i in range(1, 7):
            payload = {
                "endpoint": "/api/v1/auth/login",
                "method": "POST",
                "status_code": 401,
                "latency_ms": 320 + (i * 15),
                "ip": attacker_ip,
                "user_id": f"victim_{i}@acmecorp.com",
                "metadata": geo
            }
            send_telemetry_event(payload)
            time.sleep(0.15)
        print("     -> Dispatched high-severity alert to Slack + red Sonar Shockwave on map.")

    elif wave_choice == "fuzz_scan":
        attacker_ip = "194.26.29.112"  # Moscow, Russia
        print(f"\n  🔍 [ATTACK WAVE] Injecting Vulnerability & Endpoint Scan from {attacker_ip}...")
        geo = {"city": "Moscow", "country": "Russia", "latitude": 55.7558, "longitude": 37.6173}
        fuzz_paths = ["/.env", "/admin/dump.sql", "/api/v1/internal/config", "/wp-login.php", "/actuator/health"]
        for p in fuzz_paths:
            payload = {
                "endpoint": p,
                "method": "GET",
                "status_code": 404,
                "latency_ms": 140,
                "ip": attacker_ip,
                "metadata": geo
            }
            send_telemetry_event(payload)
            time.sleep(0.12)
        print("     -> Scanning vector recorded into MITRE ATT&CK Kill Chain.")

    elif wave_choice == "request_burst":
        attacker_ip = "203.0.113.88"  # Tokyo, Japan
        print(f"\n  ⚡ [ATTACK WAVE] Injecting Volumetric Burst from {attacker_ip} (Tokyo)...")
        geo = {"city": "Tokyo", "country": "Japan", "latitude": 35.6762, "longitude": 139.6503}
        for i in range(1, 22):
            payload = {
                "endpoint": f"/api/v1/search?query=dos_pattern_{i}",
                "method": "GET",
                "status_code": 200,
                "latency_ms": 50,
                "ip": attacker_ip,
                "metadata": geo
            }
            send_telemetry_event(payload)
            time.sleep(0.08)
        print("     -> Threat velocity surged: Early Warning Threat Radar activated.")


def main():
    parser = argparse.ArgumentParser(description="Live Production Traffic & Attack Simulator with Slack Heartbeat")
    parser.add_argument("--report-interval", "-r", type=int, default=300, help="Heartbeat interval in seconds (default: 300 = 5 min)")
    parser.add_argument("--attack-interval", "-a", type=int, default=45, help="Seconds between attack waves (default: 45)")
    parser.add_argument("--traffic-delay", "-d", type=float, default=0.75, help="Seconds between normal requests (default: 0.75)")
    parser.add_argument("--no-attacks", action="store_true", help="Run only legitimate baseline traffic without attacks")
    parser.add_argument("--no-slack", action="store_true", help="Disable Slack digest reporting")
    parser.add_argument("--webhook", type=str, default=None, help="Custom Slack Webhook URL override")
    args = parser.parse_args()

    slack_webhook = None if args.no_slack else resolve_slack_webhook(args.webhook)

    print("=" * 76)
    print("   ML-O11Y PRODUCTION TELEMETRY SIMULATOR & ACTIVE DEFENSE ENGINE")
    print("=" * 76)
    print(f" Collector Ingestion URL : {COLLECTOR_URL}")
    print(f" Normal Request Cadence  : ~1 req every {args.traffic_delay}s")
    print(f" Attack Wave Cadence     : Every {args.attack_interval}s" if not args.no_attacks else " Attack Waves            : DISABLED (Clean Baseline)")
    print(f" Slack Heartbeat Report  : Every {args.report_interval}s ({args.report_interval // 60}m)" if slack_webhook else " Slack Heartbeat Report  : DISABLED (No webhook found)")
    if slack_webhook:
        print(f" Webhook Destination     : {slack_webhook[:38]}...")
    print("=" * 76)
    print(" [✓] Simulator active. Press Ctrl+C at any time to stop cleanly.\n")

    # Send initial startup heartbeat to Slack so user sees immediate confirmation
    if slack_webhook:
        print("Sending initial startup heartbeat to Slack...")
        send_slack_heartbeat(slack_webhook, window_requests=0, interval_seconds=args.report_interval)

    total_requests = 0
    window_requests = 0
    last_report_time = time.time()
    last_attack_time = time.time()

    while running:
        # 1. Dispatch legitimate user interaction
        try:
            code, ep, ip, city = simulate_normal_request()
            total_requests += 1
            window_requests += 1
            sys.stdout.write(f"\r  ✓ [{code}] {ep:<28} from {ip:<15} ({city}) | Total: {total_requests}")
            sys.stdout.flush()
        except Exception as e:
            print(f"\n  [!] Error sending normal telemetry: {e}")

        now = time.time()

        # 2. Check if it's time for an attack wave
        if not args.no_attacks and (now - last_attack_time >= args.attack_interval):
            simulate_attack_wave()
            last_attack_time = now

        # 3. Check if it's time for the Slack Heartbeat Report (every 5 min)
        if slack_webhook and (now - last_report_time >= args.report_interval):
            print("\n")
            send_slack_heartbeat(slack_webhook, window_requests=window_requests, interval_seconds=args.report_interval)
            window_requests = 0
            last_report_time = now

        time.sleep(args.traffic_delay)

    print("\n" + "=" * 76)
    print(" SIMULATION TERMINATED CLEANLY")
    print(f" Total Ingress Requests Dispatched: {total_requests}")
    print("=" * 76)


if __name__ == "__main__":
    main()

"""
simulate_traffic.py — Real-time telemetry and attack simulator for ML-O11Y demo.

Directly feeds live HTTP requests and security attacks into the collector at
http://localhost:5001/ingest using the demo token 'phase1-demo-token'.

Usage:
    python demo/simulate_traffic.py             # Runs continuous realistic traffic (normal + periodic attacks)
    python demo/simulate_traffic.py --attack    # Sends an immediate attack wave (brute force, scan, burst)
    python demo/simulate_traffic.py --normal    # Sends only steady normal traffic
"""

import sys
import time
import random
import uuid
import requests

COLLECTOR_URL = "http://localhost:5001/ingest"
TOKEN = "phase1-demo-token"
HEADERS = {
    "Authorization": f"Bearer {TOKEN}",
    "Content-Type": "application/json"
}

NORMAL_IPS = [f"10.0.0.{i}" for i in range(1, 45)]
ENDPOINTS = [
    ("GET", "/api/products", 200, 15.0),
    ("GET", "/api/users", 200, 22.0),
    ("GET", "/api/orders", 200, 35.0),
    ("GET", "/api/search", 200, 18.0),
    ("GET", "/api/products/items", 200, 12.0),
    ("GET", "/api/health", 200, 4.0),
]

def random_attack_ip():
    return f"{random.randint(100, 210)}.{random.randint(1, 254)}.{random.randint(1, 254)}.{random.randint(1, 254)}"

def send_event(method: str, endpoint: str, status_code: int, latency: float, ip: str):
    payload = {
        "event_id": f"evt_{uuid.uuid4().hex[:12]}",
        "method": method,
        "endpoint": endpoint,
        "status_code": status_code,
        "latency_ms": round(latency + random.uniform(-2.0, 5.0), 2),
        "ip": ip,
        "timestamp": time.time(),
        "user_agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "metadata": {"source": "demo_simulator"}
    }
    try:
        res = requests.post(COLLECTOR_URL, json=payload, headers=HEADERS, timeout=3)
        return res.status_code
    except Exception as e:
        print(f"[ERROR] Ingestion failed: {e}")
        return None

def simulate_normal(count: int = 5):
    for _ in range(count):
        method, ep, status, lat = random.choice(ENDPOINTS)
        ip = random.choice(NORMAL_IPS)
        status_code = send_event(method, ep, status, lat, ip)
        if status_code == 201:
            print(f"[NORMAL] {method} {ep} -> 200 OK (IP: {ip})")
        time.sleep(0.3)

def simulate_brute_force(attempts: int = 8):
    attacker_ip = random_attack_ip()
    print(f"\n[ATTACK] Starting credential brute-force from {attacker_ip}...")
    for i in range(attempts):
        status_code = send_event("POST", "/api/login", 401, 85.0, attacker_ip)
        print(f"  -> Attempt {i+1}/{attempts}: POST /api/login (401 Unauthorized)")
        time.sleep(0.2)

def simulate_endpoint_scan(hits: int = 15):
    attacker_ip = random_attack_ip()
    print(f"\n[ATTACK] Starting endpoint reconnaissance scan from {attacker_ip}...")
    for i in range(hits):
        ep = f"/api/admin/probe_{i}_{random.randint(100, 999)}"
        send_event("GET", ep, 404, 30.0, attacker_ip)
        print(f"  -> Probing {ep} (404 Not Found)")
        time.sleep(0.15)

def simulate_burst(requests_count: int = 35):
    attacker_ip = random_attack_ip()
    print(f"\n[ATTACK] Starting high-frequency request burst anomaly from {attacker_ip}...")
    for i in range(requests_count):
        send_event("GET", "/api/products", 200, 25.0, attacker_ip)
        time.sleep(0.04)
    print(f"  -> Fired {requests_count} rapid requests in <2 seconds.")

def run_continuous():
    print("=" * 65)
    print("Real-Time Telemetry & Attack Simulator")
    print(f" Target: {COLLECTOR_URL}")
    print(f" Key:    {TOKEN} (Demo E-Commerce Project)")
    print("=" * 65)
    print("Streaming live traffic. Press Ctrl+C to terminate.\n")

    iteration = 0
    attack_funcs = [simulate_brute_force, simulate_endpoint_scan, simulate_burst]

    try:
        while True:
            iteration += 1
            # Normal traffic stream
            simulate_normal(count=random.randint(3, 7))

            # Trigger an attack every ~4-5 cycles
            if iteration % 4 == 0:
                attack = random.choice(attack_funcs)
                attack()
                print("\n[RESUMING] Normal background traffic...")

            time.sleep(random.uniform(1.0, 2.5))
    except KeyboardInterrupt:
        print("\nSimulator stopped by user.")

if __name__ == "__main__":
    arg = sys.argv[1] if len(sys.argv) > 1 else ""
    if arg == "--attack":
        simulate_brute_force()
        simulate_endpoint_scan()
        simulate_burst()
    elif arg == "--normal":
        while True:
            simulate_normal(count=5)
            time.sleep(1)
    else:
        run_continuous()

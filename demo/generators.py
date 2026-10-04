"""
generators.py — demo traffic generators for the ML-O11Y Phase 1 pipeline.

Targets the sample app (port 5000), NOT the collector directly, so every
request goes through the real SDK middleware exactly like a real developer's
traffic would.

Usage:
    python3 generators.py normal        # simulate normal background traffic
    python3 generators.py brute_force   # simulate rapid failed logins
    python3 generators.py scan          # simulate endpoint enumeration
    python3 generators.py burst         # simulate a request-rate spike
    python3 generators.py all           # normal traffic + all 3 attacks, in sequence
"""

import sys
import time
import random
import requests

APP_URL = "http://localhost:5002"

ENDPOINTS = [
    ("GET", "/api/users"),
    ("GET", "/api/products"),
    ("GET", "/api/orders"),
    ("GET", "/api/search"),
    ("GET", "/api/users/alice"),
]

NORMAL_IPS = [f"10.0.0.{i}" for i in range(1, 50)]  # Expanded normal IP pool

def random_attack_ip():
    """Generates a random external IP address for attackers."""
    return f"{random.randint(100, 203)}.{random.randint(0, 255)}.{random.randint(0, 255)}.{random.randint(1, 254)}"


def normal_traffic(duration_sec: int = 20, rate_per_sec: float = 2.0):
    print(f"[normal] generating ~{rate_per_sec} req/s for {duration_sec}s across {len(NORMAL_IPS)} IPs")
    end = time.time() + duration_sec
    while time.time() < end:
        method, path = random.choice(ENDPOINTS)
        ip = random.choice(NORMAL_IPS)
        try:
            requests.request(method, APP_URL + path, headers={"X-Forwarded-For": ip}, timeout=2)
        except requests.RequestException:
            pass
        time.sleep(1.0 / rate_per_sec)
    print("[normal] done")


def brute_force(attempts: int = 10, ip: str = None):
    ip = ip or random_attack_ip()
    print(f"[brute_force] sending {attempts} failed logins from {ip}")
    for i in range(attempts):
        try:
            requests.post(
                APP_URL + "/api/login",
                json={"username": "alice", "password": f"guess{i}"},
                headers={"X-Forwarded-For": ip},
                timeout=2,
            )
        except requests.RequestException:
            pass
        time.sleep(0.3)
    print("[brute_force] done")


def endpoint_scan(unique_hits: int = 20, ip: str = None):
    ip = ip or random_attack_ip()
    print(f"[scan] hitting {unique_hits} distinct endpoints from {ip}")
    for i in range(unique_hits):
        path = f"/api/users/probe{i}"
        try:
            requests.get(APP_URL + path, headers={"X-Forwarded-For": ip}, timeout=2)
        except requests.RequestException:
            pass
        time.sleep(0.1)
    print("[scan] done")


def request_burst(requests_count: int = 60, ip: str = None):
    ip = ip or random_attack_ip()
    print(f"[burst] firing {requests_count} requests in a short window from {ip}")
    for i in range(requests_count):
        try:
            requests.get(APP_URL + "/api/products", headers={"X-Forwarded-For": ip}, timeout=2)
        except requests.RequestException:
            pass
        time.sleep(0.05)
    print("[burst] done")


def continuous_traffic():
    """Runs forever, mixing continuous normal traffic with random attacks."""
    import threading
    print("[continuous] Starting infinite traffic generation. Press Ctrl+C to stop.")
    
    # Thread to keep normal traffic flowing constantly
    def background_normal():
        while True:
            normal_traffic(duration_sec=10, rate_per_sec=4.0)
            
    t = threading.Thread(target=background_normal, daemon=True)
    t.start()
    
    # Main thread randomly injects attacks
    attack_funcs = [
        lambda: brute_force(attempts=random.randint(6, 12)),
        lambda: endpoint_scan(unique_hits=random.randint(16, 25)),
        lambda: request_burst(requests_count=random.randint(35, 60))
    ]
    
    try:
        while True:
            time.sleep(random.uniform(5.0, 15.0)) # Wait 5-15 seconds between attacks
            attack = random.choice(attack_funcs)
            attack()
    except KeyboardInterrupt:
        print("\n[continuous] Stopped.")


if __name__ == "__main__":
    mode = sys.argv[1] if len(sys.argv) > 1 else "all"

    if mode == "normal":
        normal_traffic(duration_sec=60) # Increased default for manual runs
    elif mode == "brute_force":
        brute_force()
    elif mode == "scan":
        endpoint_scan()
    elif mode == "burst":
        request_burst()
    elif mode == "continuous":
        continuous_traffic()
    elif mode == "all":
        normal_traffic(duration_sec=15, rate_per_sec=3)
        time.sleep(1)
        brute_force()
        time.sleep(2)
        endpoint_scan()
        time.sleep(2)
        request_burst()
    else:
        print(f"Unknown mode: {mode}")
        print(__doc__)

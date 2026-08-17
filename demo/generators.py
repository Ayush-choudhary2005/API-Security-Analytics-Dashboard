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

APP_URL = "http://localhost:5000"

ENDPOINTS = [
    ("GET", "/api/users"),
    ("GET", "/api/products"),
    ("GET", "/api/orders"),
    ("GET", "/api/search"),
    ("GET", "/api/users/alice"),
]

NORMAL_IPS = [f"10.0.0.{i}" for i in range(1, 6)]


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


def brute_force(attempts: int = 10, ip: str = "203.0.113.9"):
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
    print("[brute_force] done - check dashboard for 'brute_force' alert")


def endpoint_scan(unique_hits: int = 20, ip: str = "203.0.113.44"):
    print(f"[scan] hitting {unique_hits} distinct endpoints from {ip}")
    # /api/users/<username> is a dynamic route, so each different username
    # segment is genuinely a distinct request.path - real path enumeration,
    # not just query-string noise (query strings aren't part of request.path
    # in Flask, so they wouldn't count toward the unique-endpoint feature).
    for i in range(unique_hits):
        path = f"/api/users/probe{i}"
        try:
            requests.get(APP_URL + path, headers={"X-Forwarded-For": ip}, timeout=2)
        except requests.RequestException:
            pass
        time.sleep(0.1)
    print("[scan] done - check dashboard for 'endpoint_scan' alert")


def request_burst(requests_count: int = 40, ip: str = "203.0.113.77"):
    print(f"[burst] firing {requests_count} requests in a short window from {ip}")
    for i in range(requests_count):
        try:
            requests.get(APP_URL + "/api/products", headers={"X-Forwarded-For": ip}, timeout=2)
        except requests.RequestException:
            pass
        time.sleep(0.05)
    print("[burst] done - check dashboard for 'request_burst' alert")


if __name__ == "__main__":
    mode = sys.argv[1] if len(sys.argv) > 1 else "all"

    if mode == "normal":
        normal_traffic()
    elif mode == "brute_force":
        brute_force()
    elif mode == "scan":
        endpoint_scan()
    elif mode == "burst":
        request_burst()
    elif mode == "all":
        normal_traffic(duration_sec=8, rate_per_sec=3)
        time.sleep(1)
        brute_force()
        time.sleep(1)
        endpoint_scan()
        time.sleep(1)
        request_burst()
    else:
        print(f"Unknown mode: {mode}")
        print(__doc__)

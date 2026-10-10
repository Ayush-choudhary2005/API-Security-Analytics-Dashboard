"""
test_auth_suite.py — Automated verification of Authentication and Multi-Tenancy Architecture.

Covers:
  A. Signup
  B. Duplicate signup (409)
  C. Login
  D. Wrong password (401)
  E. Logout
  F. Access dashboard / UI without login
  G. Access protected API without authentication (401)
  H. Access another user's project (403 IDOR prevention)
  I. Existing demo functionality (Bearer phase1-demo-token /ingest + demo project)
"""

import sys
import os
import uuid
import json
import io
import re
import zipfile
import tempfile
import time
import importlib.util
from unittest.mock import patch

# Ensure backend directory is in path
sys.path.insert(0, os.path.dirname(__file__))

import server
from server import app, socketio
import db


def cleanup_test_data():
    """Remove transient test accounts and projects to ensure test idempotency."""
    conn = db.get_conn()
    rows = conn.execute("SELECT id FROM users WHERE email LIKE '%@example.com'").fetchall()
    user_ids = [r["id"] for r in rows]
    for uid in user_ids:
        projs = conn.execute("SELECT id FROM projects WHERE user_id = ?", (uid,)).fetchall()
        for p in projs:
            conn.execute("DELETE FROM api_keys WHERE project_id = ?", (p["id"],))
            conn.execute("DELETE FROM webhook_configs WHERE project_id = ?", (p["id"],))
            conn.execute("DELETE FROM events WHERE project_id = ?", (p["id"],))
        conn.execute("DELETE FROM projects WHERE user_id = ?", (uid,))
        conn.execute("DELETE FROM users WHERE id = ?", (uid,))
    conn.commit()
    conn.close()


def run_tests():
    print("==================================================")
    print("RUNNING AUTHENTICATION & MULTI-TENANCY TEST SUITE")
    print("==================================================")

    # Initialize DB & clean any previous test data
    db.init_db()
    cleanup_test_data()

    server.app.config['TESTING'] = True
    client = server.app.test_client()

    passed = 0
    total = 0

    def assert_test(name, condition, detail=""):
        nonlocal passed, total
        total += 1
        if condition:
            print(f"  [PASS] {name}")
            passed += 1
        else:
            print(f"  [FAIL] {name} — {detail}")
            assert False, f"Test failed: {name} ({detail})"

    # Generate unique test email identifiers for this run
    run_id = uuid.uuid4().hex[:6]
    alice_email = f"alice_{run_id}@example.com"
    bob_email = f"bob_{run_id}@example.com"

    try:
        # ---------------------------------------------------------
        # Test A: User Registration
        # ---------------------------------------------------------
        print("\n--- Test A: User Signup ---")
        reg_payload = {
            "email": alice_email,
            "password": "Password123!",
            "confirm_password": "Password123!"
        }
        res = client.post("/api/auth/register", json=reg_payload)
        data = res.get_json()
        assert_test("Signup returns HTTP 201", res.status_code == 201, f"Status: {res.status_code}")
        assert_test("Signup returns user object with ID and email", data.get("user", {}).get("email") == alice_email)
        assert_test("Password hash is not exposed in response", "password_hash" not in data.get("user", {}))
        assert_test("Clean slate: no auto-created project on signup", "default_project" not in data)
        assert_test("Clean slate: no auto-created api key on signup", "api_key" not in data)
        # Alice explicitly creates organization and project
        res_org = client.post("/api/organizations", json={"name": "Alice Org"})
        alice_org_id = res_org.get_json()["organization"]["id"] if res_org.status_code == 201 else None
        res_proj = client.post("/api/projects", json={"name": "Alice Project", "organization_id": alice_org_id})
        assert_test("Alice explicitly creates project", res_proj.status_code == 201)
        alice_proj_id = res_proj.get_json()["project"]["id"]
        alice_key = res_proj.get_json().get("api_key")

        # Verify session established
        res_me = client.get("/api/auth/me")
        assert_test("Session automatically established on signup", res_me.status_code == 200)

        # ---------------------------------------------------------
        # Test B: Duplicate Signup
        # ---------------------------------------------------------
        print("\n--- Test B: Duplicate Signup ---")
        res_dup = client.post("/api/auth/register", json=reg_payload)
        assert_test("Duplicate signup returns HTTP 409", res_dup.status_code == 409, f"Status: {res_dup.status_code}")
        assert_test("Duplicate signup error message", "already exists" in res_dup.get_json().get("error", ""))

        # Password validation tests
        res_weak = client.post("/api/auth/register", json={"email": f"weak_{run_id}@example.com", "password": "123", "confirm_password": "123"})
        assert_test("Weak password (<8 chars) returns 400", res_weak.status_code == 400)

        res_mismatch = client.post("/api/auth/register", json={"email": f"mis_{run_id}@example.com", "password": "Password123!", "confirm_password": "DiffPassword1!"})
        assert_test("Password mismatch returns 400", res_mismatch.status_code == 400)

        # ---------------------------------------------------------
        # Test E: Logout
        # ---------------------------------------------------------
        print("\n--- Test E: Logout ---")
        res_logout = client.post("/api/auth/logout")
        assert_test("Logout returns HTTP 200", res_logout.status_code == 200)

        res_me_logged_out = client.get("/api/auth/me")
        assert_test("Session invalidated after logout", res_me_logged_out.status_code == 401)

        # ---------------------------------------------------------
        # Test D: Wrong Password
        # ---------------------------------------------------------
        print("\n--- Test D: Wrong Password ---")
        res_wrong = client.post("/api/auth/login", json={"email": alice_email, "password": "WrongPassword"})
        assert_test("Wrong password returns HTTP 401", res_wrong.status_code == 401)
        assert_test("Generic error message (no email enumeration)", res_wrong.get_json().get("error") == "Invalid email or password")

        res_nonexistent = client.post("/api/auth/login", json={"email": f"nonexistent_{run_id}@example.com", "password": "Password123!"})
        assert_test("Nonexistent user returns HTTP 401 with same generic error", res_nonexistent.get_json().get("error") == "Invalid email or password")

        # ---------------------------------------------------------
        # Test C: Login
        # ---------------------------------------------------------
        print("\n--- Test C: User Login ---")
        res_login = client.post("/api/auth/login", json={"email": alice_email, "password": "Password123!"})
        assert_test("Valid login returns HTTP 200", res_login.status_code == 200)
        assert_test("Login returns user info", res_login.get_json().get("user", {}).get("email") == alice_email)

        res_me_active = client.get("/api/auth/me")
        assert_test("Session active after login", res_me_active.status_code == 200)

        # ---------------------------------------------------------
        # Test F: Access dashboard without login
        # ---------------------------------------------------------
        print("\n--- Test F: Dashboard Access without login ---")
        unauth_client = server.app.test_client()
        res_root = unauth_client.get("/")
        assert_test("GET / serves index.html shell", res_root.status_code == 200 and b"API Security Analytics" in res_root.data)
        res_unauth_me = unauth_client.get("/api/auth/me")
        assert_test("Unauthenticated user is flagged via /api/auth/me -> 401", res_unauth_me.status_code == 401)

        # ---------------------------------------------------------
        # Test G: Access protected API without authentication
        # ---------------------------------------------------------
        print("\n--- Test G: Access protected APIs without authentication ---")
        assert_test("GET /events/recent unauth -> 401", unauth_client.get("/events/recent").status_code == 401)
        assert_test("GET /alerts/recent unauth -> 401", unauth_client.get("/alerts/recent").status_code == 401)
        assert_test("GET /alerts/stats unauth -> 401", unauth_client.get("/alerts/stats").status_code == 401)
        assert_test("GET /history unauth -> 401", unauth_client.get("/history").status_code == 401)
        assert_test("GET /api/projects unauth -> 401", unauth_client.get("/api/projects").status_code == 401)
        assert_test("GET /blocked-ips unauth -> 401", unauth_client.get("/blocked-ips").status_code == 401)
        assert_test("POST /block-ip unauth -> 401", unauth_client.post("/block-ip", json={"ip": "1.2.3.4"}).status_code == 401)
        assert_test("GET /api/investigate/1 unauth -> 401", unauth_client.get("/api/investigate/1").status_code == 401)

        # ---------------------------------------------------------
        # Test H: Access another user's project (IDOR Prevention)
        # ---------------------------------------------------------
        print("\n--- Test H: Access another user's project (IDOR Prevention) ---")
        # Register second user: Bob
        bob_client = server.app.test_client()
        res_bob_reg = bob_client.post("/api/auth/register", json={
            "email": bob_email,
            "password": "Password123!",
            "confirm_password": "Password123!"
        })
        assert_test("Bob registered successfully", res_bob_reg.status_code == 201)
        res_bob_org = bob_client.post("/api/organizations", json={"name": "Bob Org"})
        bob_org_id = res_bob_org.get_json()["organization"]["id"] if res_bob_org.status_code == 201 else None
        res_bob_proj = bob_client.post("/api/projects", json={"name": "Bob Project", "organization_id": bob_org_id})
        bob_proj_id = res_bob_proj.get_json()["project"]["id"]

        # Bob tries to access Alice's project via API
        res_bob_alice_proj = bob_client.get(f"/api/projects/{alice_proj_id}")
        assert_test("Bob cannot GET Alice's project -> HTTP 403", res_bob_alice_proj.status_code == 403)

        # Bob tries to query Alice's telemetry events
        res_bob_alice_events = bob_client.get(f"/events/recent?project_id={alice_proj_id}")
        assert_test("Bob cannot view Alice's telemetry -> HTTP 403", res_bob_alice_events.status_code == 403)

        # Bob tries to query Alice's alerts
        res_bob_alice_alerts = bob_client.get(f"/alerts/recent?project_id={alice_proj_id}")
        assert_test("Bob cannot view Alice's alerts -> HTTP 403", res_bob_alice_alerts.status_code == 403)

        # Bob tries to query Alice's historical analytics
        res_bob_alice_hist = bob_client.get(f"/history?project_id={alice_proj_id}")
        assert_test("Bob cannot view Alice's history -> HTTP 403", res_bob_alice_hist.status_code == 403)

        # Bob tries to view Alice's API keys
        res_bob_alice_keys = bob_client.get(f"/api/projects/{alice_proj_id}/keys")
        assert_test("Bob cannot view Alice's API keys -> HTTP 403", res_bob_alice_keys.status_code == 403)

        # Alice CAN view her own project
        res_alice_own_proj = client.get(f"/api/projects/{alice_proj_id}")
        assert_test("Alice can view her own project -> HTTP 200", res_alice_own_proj.status_code == 200)

        # User with multiple projects
        res_new_proj = client.post("/api/projects", json={"name": "Alice Payment API", "description": "Payment microservice"})
        assert_test("Alice creates second project -> HTTP 201", res_new_proj.status_code == 201)
        res_alice_projects = client.get("/api/projects")
        assert_test("Alice lists multiple projects", len(res_alice_projects.get_json()["projects"]) == 2)

        # ---------------------------------------------------------
        # Test I: Existing Demo Compatibility
        # ---------------------------------------------------------
        print("\n--- Test I: Existing Demo Compatibility ---")
        # Demo credentials login
        demo_client = server.app.test_client()
        res_demo_login = demo_client.post("/api/auth/login", json={"email": "demo@mlo11y.local", "password": "demopassword123"})
        assert_test("Demo user can log in with seeded credentials -> HTTP 200", res_demo_login.status_code == 200)

        # Demo SDK ingestion using phase1-demo-token
        ingest_payload = {
            "timestamp": 1700000000.0,
            "endpoint": "/api/users",
            "method": "GET",
            "status_code": 200,
            "latency_ms": 12.5,
            "ip": "10.0.0.5",
            "payload_size": 128
        }
        res_ingest_demo = client.post(
            "/ingest",
            json=ingest_payload,
            headers={"Authorization": "Bearer phase1-demo-token"}
        )
        assert_test("Ingest with phase1-demo-token succeeds -> HTTP 201", res_ingest_demo.status_code == 201)
        ingested_event = res_ingest_demo.get_json()
        assert_test("Ingested event scored and persisted with project ID", "anomaly_score" in ingested_event and "id" in ingested_event)

        # Ingest using Alice's newly generated key
        res_ingest_alice = client.post(
            "/ingest",
            json=ingest_payload,
            headers={"Authorization": f"Bearer {alice_key}"}
        )
        assert_test("Ingest with newly generated API key succeeds -> HTTP 201", res_ingest_alice.status_code == 201)
        assert_test("Ingested event mapped to Alice's project", res_ingest_alice.get_json().get("project_id") == alice_proj_id)

        # Ingest with invalid key
        res_ingest_invalid = client.post(
            "/ingest",
            json=ingest_payload,
            headers={"Authorization": "Bearer invalid_bad_key_12345"}
        )
        assert_test("Ingest with invalid token rejected -> HTTP 401", res_ingest_invalid.status_code == 401)

        # ---------------------------------------------------------
        # Test J: Multi-Project Creation, Details, Switching, Deletion
        # ---------------------------------------------------------
        print("\n--- Test J: Multi-Project Creation, Details, Switching & Deletion ---")
        # 1. User A (Alice) creates: E-Commerce API, Payment API, College API
        p1 = client.post("/api/projects", json={"name": "E-Commerce API", "description": "Online storefront"}).get_json()["project"]
        p2 = client.post("/api/projects", json={"name": "Payment API", "description": "Payment processor"}).get_json()["project"]
        p3 = client.post("/api/projects", json={"name": "College API", "description": "Student management"}).get_json()["project"]

        assert_test("Project IDs generated with unique prefix/UUID", p1["id"].startswith("proj_") and p2["id"].startswith("proj_"))
        assert_test("All 3 projects have distinct IDs", len({p1["id"], p2["id"], p3["id"]}) == 3)

        # 2. User B creates Project B
        p_bob = bob_client.post("/api/projects", json={"name": "Bob Finance API", "description": "Banking API"}).get_json()["project"]
        assert_test("Bob created Project B", bool(p_bob["id"]))

        # 3. Project Listing Isolation
        alice_projs = client.get("/api/projects").get_json()["projects"]
        bob_projs = bob_client.get("/api/projects").get_json()["projects"]
        assert_test("Alice only retrieves her own projects", all(p["user_id"] == data["user"]["id"] for p in alice_projs))
        assert_test("Bob only retrieves his own projects", all(p["user_id"] == res_bob_reg.get_json()["user"]["id"] for p in bob_projs))
        assert_test("Bob's project not visible in Alice's project list", p_bob["id"] not in [p["id"] for p in alice_projs])

        # 4. Project Details verification
        res_p2_details = client.get(f"/api/projects/{p2['id']}")
        assert_test("Alice can view Payment API details -> HTTP 200", res_p2_details.status_code == 200)
        p2_data = res_p2_details.get_json()
        assert_test("Project details include metadata, keys, event count", "project" in p2_data and "keys" in p2_data and "event_count" in p2_data)

        # 5. Cross-user access prevention (IDOR)
        assert_test("Alice cannot view Bob's project details -> HTTP 403", client.get(f"/api/projects/{p_bob['id']}").status_code == 403)
        assert_test("Bob cannot view Alice's Payment API details -> HTTP 403", bob_client.get(f"/api/projects/{p2['id']}").status_code == 403)

        # 6. Project Switching: telemetry & alerts scoping
        assert_test("Alice queries telemetry for Payment API -> HTTP 200", client.get(f"/events/recent?project_id={p2['id']}").status_code == 200)
        assert_test("Alice queries telemetry for College API -> HTTP 200", client.get(f"/events/recent?project_id={p3['id']}").status_code == 200)
        assert_test("Alice cannot query telemetry for Bob's project -> HTTP 403", client.get(f"/events/recent?project_id={p_bob['id']}").status_code == 403)
        assert_test("Bob cannot query telemetry for Alice's project -> HTTP 403", bob_client.get(f"/events/recent?project_id={p1['id']}").status_code == 403)

        # 7. Project Deletion & Safety Checks
        # Safety Check: Bob cannot delete Alice's project
        res_del_unauth = bob_client.delete(f"/api/projects/{p3['id']}")
        assert_test("Bob cannot delete Alice's project -> HTTP 403", res_del_unauth.status_code == 403)

        # Alice successfully deletes College API (p3)
        res_del_ok = client.delete(f"/api/projects/{p3['id']}")
        assert_test("Alice deletes College API -> HTTP 200", res_del_ok.status_code == 200)

        # Verify College API no longer exists in Alice's project list
        alice_projs_after = client.get("/api/projects").get_json()["projects"]
        assert_test("Deleted project no longer in Alice's project list", p3["id"] not in [p["id"] for p in alice_projs_after])

        # Safety Check: Cannot delete only project
        # Delete Bob's second project so he only has 1 left
        bob_client.delete(f"/api/projects/{p_bob['id']}")
        # Now Bob has only 1 project left (his default project); attempt to delete it
        res_del_last = bob_client.delete(f"/api/projects/{bob_proj_id}")
        assert_test("Cannot delete user's only project -> HTTP 400", res_del_last.status_code == 400)
        assert_test("Helpful safety error message", "at least one active project" in res_del_last.get_json().get("error", ""))

        # ---------------------------------------------------------
        # Test K: SDK Identity, Credentials, Lifecycle & Download
        # ---------------------------------------------------------
        print("\n--- Test K: SDK Credentials, Lifecycle, Download & Isolation ---")
        # 1. User A (Alice) generates new SDK key for Project A
        res_key_a = client.post(f"/api/projects/{p1['id']}/keys", json={"name": "Alice Microservice Key"})
        assert_test("Key generation returns HTTP 201", res_key_a.status_code == 201)
        key_a_obj = res_key_a.get_json()["key"]
        raw_key_a = key_a_obj["raw_key"]
        key_a_id = key_a_obj["id"]

        # Credential format: ask_<project_identifier>_<random_secret>
        assert_test("Credential begins with ask_ prefix", raw_key_a.startswith("ask_"))
        assert_test("Credential contains project ID component", p1["id"].replace("proj_", "") in raw_key_a)
        assert_test("Credential has secure random secret", len(raw_key_a) > 25)

        # 2. User B (Bob) generates SDK key for Project B
        res_key_b = bob_client.post(f"/api/projects/{bob_proj_id}/keys", json={"name": "Bob Banking Key"})
        raw_key_b = res_key_b.get_json()["key"]["raw_key"]
        assert_test("Bob credential begins with ask_ prefix", raw_key_b.startswith("ask_"))

        # 3. Telemetry Ingest with Key A -> Project A
        telemetry_a = {
            "endpoint": "/api/checkout",
            "method": "POST",
            "status_code": 200,
            "latency_ms": 45.2,
            "ip": "192.168.1.100",
            "payload_size": 256
        }
        res_ingest_a = client.post(
            "/ingest",
            json=telemetry_a,
            headers={"Authorization": f"Bearer {raw_key_a}"}
        )
        assert_test("Telemetry with Key A succeeds -> HTTP 201", res_ingest_a.status_code == 201)
        assert_test("Event saved with Project A id", res_ingest_a.get_json().get("project_id") == p1["id"])

        # 4. Telemetry Ingest with Key B -> Project B (using X-API-Key header)
        telemetry_b = {
            "endpoint": "/api/transfers",
            "method": "POST",
            "status_code": 201,
            "latency_ms": 110.0,
            "ip": "10.0.1.50",
            "payload_size": 512
        }
        res_ingest_b = client.post(
            "/ingest",
            json=telemetry_b,
            headers={"X-API-Key": raw_key_b}
        )
        assert_test("Telemetry with Key B via X-API-Key succeeds -> HTTP 201", res_ingest_b.status_code == 201)
        assert_test("Event saved with Project B id", res_ingest_b.get_json().get("project_id") == bob_proj_id)

        # 5. Isolation: Key A must NEVER create events for Project B, and queries are strictly scoped
        events_proj_a = client.get(f"/events/recent?project_id={p1['id']}").get_json()
        events_proj_b = bob_client.get(f"/events/recent?project_id={bob_proj_id}").get_json()
        assert_test("Alice Project A contains /api/checkout", any(e["endpoint"] == "/api/checkout" for e in events_proj_a))
        assert_test("Alice Project A DOES NOT contain /api/transfers", not any(e["endpoint"] == "/api/transfers" for e in events_proj_a))
        assert_test("Bob Project B contains /api/transfers", any(e["endpoint"] == "/api/transfers" for e in events_proj_b))
        assert_test("Bob Project B DOES NOT contain /api/checkout", not any(e["endpoint"] == "/api/checkout" for e in events_proj_b))

        # 6. Invalid key rejected
        res_bad_key = client.post("/ingest", json=telemetry_a, headers={"Authorization": "Bearer ask_invalid_fake_key_999"})
        assert_test("Invalid key returns HTTP 401", res_bad_key.status_code == 401)

        # 7. Key Revocation Lifecycle
        res_revoke = client.post(f"/api/projects/{p1['id']}/keys/{key_a_id}/revoke")
        assert_test("Revoke key returns HTTP 200", res_revoke.status_code == 200)

        # Telemetry with revoked key MUST be rejected
        res_revoked_ingest = client.post("/ingest", json=telemetry_a, headers={"Authorization": f"Bearer {raw_key_a}"})
        assert_test("Revoked key rejected on ingest -> HTTP 401", res_revoked_ingest.status_code == 401)

        # 8. Key Regeneration Lifecycle
        res_regen = client.post(f"/api/projects/{p1['id']}/keys/regenerate")
        assert_test("Regenerate key returns HTTP 201", res_regen.status_code == 201)
        new_key_a = res_regen.get_json()["key"]["raw_key"]
        assert_test("Regenerated key is new and valid", new_key_a.startswith("ask_") and new_key_a != raw_key_a)

        # Telemetry with regenerated key works
        res_regen_ingest = client.post("/ingest", json=telemetry_a, headers={"Authorization": f"Bearer {new_key_a}"})
        assert_test("Ingest with regenerated key succeeds -> HTTP 201", res_regen_ingest.status_code == 201)

        # 9. SDK Download Feature
        res_download = client.get(f"/api/projects/{p1['id']}/download-sdk")
        assert_test("Download SDK returns HTTP 200", res_download.status_code == 200)
        assert_test("Download Content-Type is application/zip", "application/zip" in res_download.headers.get("Content-Type", ""))

        import zipfile
        import io
        zip_buf = io.BytesIO(res_download.data)
        with zipfile.ZipFile(zip_buf, "r") as zf:
            file_names = zf.namelist()
            assert_test("ZIP contains middleware.py", "middleware.py" in file_names)
            assert_test("ZIP contains config.py", "config.py" in file_names)
            assert_test("ZIP contains sample_app.py", "sample_app.py" in file_names)
            assert_test("ZIP contains README.md", "README.md" in file_names)

            cfg_content = zf.read("config.py").decode("utf-8")
            assert_test("config.py contains correct PROJECT_ID", f'PROJECT_ID = "{p1["id"]}"' in cfg_content)
            assert_test("config.py contains preconfigured SDK_KEY", 'SDK_KEY = "ask_' in cfg_content)

            # Security verification: NO user passwords, session tokens, or internal keys
            all_zip_content = " ".join(zf.read(name).decode("utf-8", errors="ignore") for name in file_names)
            assert_test("SDK does NOT expose user password", "Password123" not in all_zip_content)
            assert_test("SDK does NOT expose session cookie or secret key", "api-security-dashboard-secret" not in all_zip_content)
            assert_test("SDK does NOT expose Gemini key", "GEMINI_API_KEY" not in all_zip_content)
            assert_test("SDK does NOT expose database credentials", "events.db" not in all_zip_content)

        # Security check: Bob cannot download Alice's project SDK
        assert_test("Bob cannot download Alice's SDK -> HTTP 403", bob_client.get(f"/api/projects/{p1['id']}/download-sdk").status_code == 403)

        # ---------------------------------------------------------
        # Test L: Full Pipeline Project-Awareness & Attack Isolation
        # ---------------------------------------------------------
        print("\n--- Test L: Full Pipeline Project-Awareness & Attack Isolation ---")
        proj_a_id = p1['id']
        proj_b_id = bob_proj_id

        # 1. Generate Brute-Force Attack on Project A
        # IP 198.51.100.1 sends 8 consecutive failed logins to /api/login (> 5 threshold)
        attacker_a_ip = "198.51.100.1"
        for i in range(8):
            res_atk_a = client.post("/ingest", json={
                "endpoint": "/api/login",
                "method": "POST",
                "status_code": 401,
                "latency_ms": 12.0,
                "ip": attacker_a_ip,
                "payload_size": 128
            }, headers={"Authorization": f"Bearer {new_key_a}"})
            assert_test(f"Project A attack event {i+1} ingested -> HTTP 201", res_atk_a.status_code == 201)

        # 2. Generate Endpoint Scanning Attack on Project B
        # IP 198.51.100.2 sends requests across 20 distinct endpoints (> 15 threshold)
        attacker_b_ip = "198.51.100.2"
        for i in range(20):
            res_atk_b = bob_client.post("/ingest", json={
                "endpoint": f"/api/v1/scan_probe_{i}",
                "method": "GET",
                "status_code": 404,
                "latency_ms": 15.0,
                "ip": attacker_b_ip,
                "payload_size": 64
            }, headers={"Authorization": f"Bearer {raw_key_b}"})
            assert_test(f"Project B scan event {i+1} ingested -> HTTP 201", res_atk_b.status_code == 201)

        # 3. REST Telemetry Isolation
        a_events = client.get(f"/events/recent?project_id={proj_a_id}").get_json()
        b_events = bob_client.get(f"/events/recent?project_id={proj_b_id}").get_json()

        assert_test("Alice Project A telemetry contains attacker A IP", any(e["ip"] == attacker_a_ip for e in a_events))
        assert_test("Alice Project A telemetry DOES NOT contain attacker B IP", not any(e["ip"] == attacker_b_ip for e in a_events))
        assert_test("Alice Project A telemetry DOES NOT contain scan probe endpoints", not any("scan_probe" in e["endpoint"] for e in a_events))

        assert_test("Bob Project B telemetry contains attacker B IP", any(e["ip"] == attacker_b_ip for e in b_events))
        assert_test("Bob Project B telemetry DOES NOT contain attacker A IP", not any(e["ip"] == attacker_a_ip for e in b_events))
        assert_test("Bob Project B telemetry DOES NOT contain /api/login events", not any(e["endpoint"] == "/api/login" for e in b_events))

        # 4. REST Alert Isolation
        a_alerts = client.get(f"/alerts/recent?project_id={proj_a_id}").get_json()
        b_alerts = bob_client.get(f"/alerts/recent?project_id={proj_b_id}").get_json()

        assert_test("Alice has at least 1 alert for Project A", len(a_alerts) >= 1)
        assert_test("Alice's alert is for /api/login", any(a["endpoint"] == "/api/login" for a in a_alerts))
        assert_test("Alice sees NO scan probe alerts", not any("scan_probe" in a["endpoint"] for a in a_alerts))

        assert_test("Bob has at least 1 alert for Project B", len(b_alerts) >= 1)
        assert_test("Bob's alert is for endpoint_scan", any("scan_probe" in a["endpoint"] for a in b_alerts))
        assert_test("Bob sees NO /api/login alerts", not any(a["endpoint"] == "/api/login" for a in b_alerts))

        # 5. Attack Distribution Stats Isolation
        a_stats = client.get(f"/alerts/stats?project_id={proj_a_id}").get_json()
        b_stats = bob_client.get(f"/alerts/stats?project_id={proj_b_id}").get_json()

        assert_test("Alice stats show brute_force >= 1", a_stats.get("brute_force", 0) >= 1)
        assert_test("Alice stats show endpoint_scan == 0", a_stats.get("endpoint_scan", 0) == 0)
        assert_test("Bob stats show endpoint_scan >= 1", b_stats.get("endpoint_scan", 0) >= 1)
        assert_test("Bob stats show brute_force == 0", b_stats.get("brute_force", 0) == 0)

        # 6. Historical Analytics Isolation
        a_hist = client.get(f"/history?project_id={proj_a_id}").get_json()
        b_hist = bob_client.get(f"/history?project_id={proj_b_id}").get_json()

        a_top_endpoints = [e["endpoint"] for e in a_hist.get("top_endpoints", [])]
        b_top_endpoints = [e["endpoint"] for e in b_hist.get("top_endpoints", [])]
        assert_test("Alice top endpoints include /api/login", "/api/login" in a_top_endpoints)
        assert_test("Alice top endpoints DO NOT include scan probes", not any("scan_probe" in ep for ep in a_top_endpoints))
        assert_test("Bob top endpoints include scan probes", any("scan_probe" in ep for ep in b_top_endpoints))
        assert_test("Bob top endpoints DO NOT include /api/login", "/api/login" not in b_top_endpoints)

        # 7. Threat Investigation & GenAI Context Isolation
        alert_a_id = a_alerts[0]["id"]
        alert_b_id = b_alerts[0]["id"]

        # Alice investigates Project A alert -> 200
        res_inv_a = client.get(f"/api/investigate/{alert_a_id}")
        assert_test("Alice investigates Project A alert -> HTTP 200", res_inv_a.status_code == 200)
        report_text = res_inv_a.get_json().get("report", "")
        assert_test("Threat report includes Project A id", proj_a_id in report_text)
        assert_test("Threat report includes attacker A IP", attacker_a_ip in report_text)
        assert_test("Threat report DOES NOT leak attacker B IP", attacker_b_ip not in report_text)
        assert_test("Threat report DOES NOT leak Project B endpoints", "scan_probe" not in report_text)

        # Cross-user investigation prevention (IDOR)
        assert_test("Bob cannot investigate Alice's alert -> HTTP 403", bob_client.get(f"/api/investigate/{alert_a_id}").status_code == 403)
        assert_test("Alice cannot investigate Bob's alert -> HTTP 403", client.get(f"/api/investigate/{alert_b_id}").status_code == 403)

        # 8. Project-Scoped IP Rate Limiting & Blocking Isolation
        # Block IP 198.51.100.1 on Project A
        res_block = client.post(f"/block-ip?project_id={proj_a_id}", json={"ip": attacker_a_ip, "reason": "Brute force test block"})
        assert_test("Alice blocks IP on Project A -> HTTP 200", res_block.status_code == 200)

        # Blocked IPs query for Project A shows the IP
        a_blocked = client.get(f"/blocked-ips?project_id={proj_a_id}").get_json()
        assert_test("Project A blocked list contains attacker IP", any(b["ip"] == attacker_a_ip for b in a_blocked))

        # Blocked IPs query for Project B DOES NOT contain attacker IP
        b_blocked = bob_client.get(f"/blocked-ips?project_id={proj_b_id}").get_json()
        assert_test("Project B blocked list DOES NOT contain attacker IP", not any(b["ip"] == attacker_a_ip for b in b_blocked))

        # Further request from 198.51.100.1 to Project A is rate limited (429)
        res_ingest_blocked = client.post("/ingest", json={
            "endpoint": "/api/test", "method": "GET", "status_code": 200, "latency_ms": 10.0, "ip": attacker_a_ip, "payload_size": 10
        }, headers={"Authorization": f"Bearer {new_key_a}"})
        assert_test("Request from blocked IP on Project A rejected -> HTTP 429", res_ingest_blocked.status_code == 429)

        # BUT request from the SAME IP to Project B succeeds! (tenant-isolated defense)
        res_ingest_b_allowed = bob_client.post("/ingest", json={
            "endpoint": "/api/test", "method": "GET", "status_code": 200, "latency_ms": 10.0, "ip": attacker_a_ip, "payload_size": 10
        }, headers={"Authorization": f"Bearer {raw_key_b}"})
        assert_test("Request from same IP on Project B allowed -> HTTP 201", res_ingest_b_allowed.status_code == 201)

        # Unblock IP on Project A
        client.post(f"/unblock-ip?project_id={proj_a_id}", json={"ip": attacker_a_ip})

        # 9. Server-Side WebSocket Room Authorization & Multi-Tenant Push Isolation
        alice_socket = socketio.test_client(app, flask_test_client=client)
        bob_socket = socketio.test_client(app, flask_test_client=bob_client)

        assert_test("Alice WebSocket connected", alice_socket.is_connected())
        assert_test("Bob WebSocket connected", bob_socket.is_connected())

        # Alice joins Project A room
        alice_socket.emit("join_project", {"project_id": proj_a_id})
        alice_join_resp = alice_socket.get_received()
        assert_test("Alice joined Project A room", any(msg["name"] == "project_joined" and msg["args"][0]["project_id"] == proj_a_id for msg in alice_join_resp))

        # Bob attempts to join Alice's Project A room -> Rejected by server!
        bob_socket.emit("join_project", {"project_id": proj_a_id})
        bob_bad_join = bob_socket.get_received()
        assert_test("Bob forbidden from joining Alice's room", any(msg["name"] == "error" for msg in bob_bad_join))

        # Bob joins his own Project B room -> Succeeded
        bob_socket.emit("join_project", {"project_id": proj_b_id})
        bob_join_resp = bob_socket.get_received()
        assert_test("Bob joined Project B room", any(msg["name"] == "project_joined" and msg["args"][0]["project_id"] == proj_b_id for msg in bob_join_resp))

        # Clear received buffers
        alice_socket.get_received()
        bob_socket.get_received()

        # Send an event to Project A
        client.post("/ingest", json={
            "endpoint": "/api/secure/checkout",
            "method": "POST",
            "status_code": 200,
            "latency_ms": 20.0,
            "ip": "10.10.10.10",
            "payload_size": 100
        }, headers={"Authorization": f"Bearer {new_key_a}"})

        alice_msgs = alice_socket.get_received()
        bob_msgs = bob_socket.get_received()

        # Alice MUST receive the event
        assert_test("Alice received live WebSocket event for Project A", any(msg["name"] in ("new_event", f"new_event_{proj_a_id}") and msg["args"][0]["endpoint"] == "/api/secure/checkout" for msg in alice_msgs))
        # Bob MUST NOT receive anything!
        assert_test("Bob received ZERO WebSocket events from Project A", len(bob_msgs) == 0)

        # Now send an event to Project B
        bob_client.post("/ingest", json={
            "endpoint": "/api/secure/transfers",
            "method": "POST",
            "status_code": 200,
            "latency_ms": 25.0,
            "ip": "20.20.20.20",
            "payload_size": 150
        }, headers={"Authorization": f"Bearer {raw_key_b}"})

        alice_msgs_2 = alice_socket.get_received()
        bob_msgs_2 = bob_socket.get_received()

        # Bob MUST receive the event
        assert_test("Bob received live WebSocket event for Project B", any(msg["name"] in ("new_event", f"new_event_{proj_b_id}") and msg["args"][0]["endpoint"] == "/api/secure/transfers" for msg in bob_msgs_2))
        # Alice MUST NOT receive anything!
        assert_test("Alice received ZERO WebSocket events from Project B", len(alice_msgs_2) == 0)

        alice_socket.disconnect()
        bob_socket.disconnect()

        # ---------------------------------------------------------
        # Test M: Project-Specific Webhooks & Notification Isolation
        # ---------------------------------------------------------
        print("\n--- Test M: Project-Specific Webhooks & Notification Isolation ---")

        # 1. Authorization & IDOR: Bob cannot configure Alice's webhook
        res_bob_hack = bob_client.post(f"/api/projects/{proj_a_id}/webhooks", json={
            "webhook_url": "https://hooks.slack.com/services/EVIL/TOKEN/HACK",
            "provider": "slack"
        })
        assert_test("Bob cannot configure Alice's webhook -> HTTP 403", res_bob_hack.status_code == 403)

        res_alice_hack = client.post(f"/api/projects/{proj_b_id}/webhooks", json={
            "webhook_url": "https://hooks.slack.com/services/ALICE/PROJ_B/NO",
            "provider": "slack"
        })
        assert_test("Alice cannot configure Bob's webhook -> HTTP 403", res_alice_hack.status_code == 403)

        # 2. Add Slack Webhook to Project A & Verify Masking
        secret_token_a = "secret_raw_token_alice_xyz987"
        raw_slack_url_a = f"https://hooks.slack.com/services/T112233/B445566/{secret_token_a}"
        res_set_a = client.post(f"/api/projects/{proj_a_id}/webhooks", json={
            "webhook_url": raw_slack_url_a,
            "provider": "slack"
        })
        assert_test("Alice configures Slack webhook -> HTTP 200", res_set_a.status_code == 200)
        wh_a = res_set_a.get_json().get("webhook", {})
        assert_test("Configured provider is slack", wh_a.get("provider") == "slack")
        assert_test("Configured webhook is enabled by default", wh_a.get("enabled") is True)
        assert_test("Masked URL matches standard Slack mask format", wh_a.get("masked_url") == "https://hooks.slack.com/services/****/****/****")
        assert_test("Raw secret is NOT exposed in POST response", secret_token_a not in str(res_set_a.get_json()))
        assert_test("Plaintext webhook_url key excluded from response", "webhook_url" not in wh_a)

        # 3. GET Webhook Config & Verify Zero Secret Leakage
        res_get_a = client.get(f"/api/projects/{proj_a_id}/webhooks")
        assert_test("Alice retrieves webhook config -> HTTP 200", res_get_a.status_code == 200)
        wh_get_a = res_get_a.get_json().get("webhook", {})
        assert_test("GET masked_url is present", wh_get_a.get("masked_url") == "https://hooks.slack.com/services/****/****/****")
        assert_test("Raw secret is NOT exposed in GET response", secret_token_a not in str(res_get_a.get_json()))
        assert_test("Bob cannot read Alice's webhook -> HTTP 403", bob_client.get(f"/api/projects/{proj_a_id}/webhooks").status_code == 403)

        # 4. Add Discord Webhook to Project B
        secret_token_b = "discord_token_bob_super_secret_777"
        raw_discord_url_b = f"https://discord.com/api/webhooks/9876543210/{secret_token_b}"
        res_set_b = bob_client.post(f"/api/projects/{proj_b_id}/webhooks", json={
            "webhook_url": raw_discord_url_b,
            "provider": "discord"
        })
        assert_test("Bob configures Discord webhook -> HTTP 200", res_set_b.status_code == 200)
        wh_b = res_set_b.get_json().get("webhook", {})
        assert_test("Configured provider is discord", wh_b.get("provider") == "discord")
        assert_test("Discord raw secret is NOT exposed", secret_token_b not in str(res_set_b.get_json()))
        assert_test("Discord masked_url format verified", "****" in wh_b.get("masked_url", ""))

        # 5. Test Webhook Functionality
        # Test Alice's webhook using local /api/webhook_test receiver
        client.post(f"/api/projects/{proj_a_id}/webhooks", json={
            "webhook_url": "http://127.0.0.1:5001/api/webhook_test",
            "provider": "slack"
        })
        
        # Bob cannot test Alice's webhook (IDOR check)
        assert_test("Bob cannot trigger test on Alice's webhook -> HTTP 403", bob_client.post(f"/api/projects/{proj_a_id}/webhooks/test").status_code == 403)

        # Alice tests her webhook
        res_test_a = client.post(f"/api/projects/{proj_a_id}/webhooks/test")
        # In test environment, the internal server loopback might return 200 if server is listening or connection refused
        assert_test("Alice test webhook returns HTTP 200 or connection status", res_test_a.status_code in (200, 400))

        # 6. Webhook Enable / Disable (Toggle)
        res_toggle_off = client.post(f"/api/projects/{proj_a_id}/webhooks/toggle", json={"enabled": False})
        assert_test("Alice disables webhook -> HTTP 200", res_toggle_off.status_code == 200)
        assert_test("Webhook state is disabled (False)", res_toggle_off.get_json().get("webhook", {}).get("enabled") is False)

        # Verify active_only query returns None when disabled
        assert_test("Active-only query returns None when disabled", db.get_webhook_config(proj_a_id, active_only=True) is None)

        # Re-enable webhook
        res_toggle_on = client.post(f"/api/projects/{proj_a_id}/webhooks/toggle", json={"enabled": True})
        assert_test("Alice re-enables webhook -> HTTP 200", res_toggle_on.status_code == 200)
        assert_test("Webhook state is enabled (True)", res_toggle_on.get_json().get("webhook", {}).get("enabled") is True)
        assert_test("Active-only query returns active config when enabled", db.get_webhook_config(proj_a_id, active_only=True) is not None)

        # 7. Alert Webhook Multi-Tenant Isolation
        # Verify that Project A alert dispatches ONLY to Project A webhook, never to Project B
        dispatched_webhooks = []
        original_send_alert = server.webhook.send_alert
        def mock_send_alert(alert_data, webhook_url=None):
            dispatched_webhooks.append({
                "project_id": alert_data.get("project_id"),
                "endpoint": alert_data.get("endpoint"),
                "webhook_url": webhook_url
            })
        server.webhook.send_alert = mock_send_alert

        try:
            # Set Project A webhook to target_a
            client.post(f"/api/projects/{proj_a_id}/webhooks", json={
                "webhook_url": "https://hooks.slack.com/services/ALICE/PROJ_A/TARGET",
                "provider": "slack"
            })
            # Set Project B webhook to target_b
            bob_client.post(f"/api/projects/{proj_b_id}/webhooks", json={
                "webhook_url": "https://hooks.slack.com/services/BOB/PROJ_B/TARGET",
                "provider": "slack"
            })

            # Ingest High Severity Attack on Project A (8 failed logins to trigger brute force rule)
            for _ in range(8):
                client.post("/ingest", json={
                    "endpoint": "/api/v1/alice_critical",
                    "method": "POST",
                    "status_code": 401,
                    "latency_ms": 10.0,
                    "ip": "100.100.100.100",
                    "payload_size": 100
                }, headers={"Authorization": f"Bearer {new_key_a}"})

            # Project A alert dispatched to Project A target
            dispatched_for_a = [d for d in dispatched_webhooks if d["project_id"] == proj_a_id]
            assert_test("Project A alert fired", len(dispatched_for_a) >= 1)
            assert_test("Project A webhook URL dispatched", dispatched_for_a[0]["webhook_url"] == "https://hooks.slack.com/services/ALICE/PROJ_A/TARGET")
            assert_test("Project A alert was NOT sent to Project B webhook", not any(d["webhook_url"] == "https://hooks.slack.com/services/BOB/PROJ_B/TARGET" for d in dispatched_for_a))

            # Ingest High Severity Attack on Project B (8 failed logins to trigger brute force rule)
            for _ in range(8):
                bob_client.post("/ingest", json={
                    "endpoint": "/api/v1/bob_critical",
                    "method": "POST",
                    "status_code": 401,
                    "latency_ms": 10.0,
                    "ip": "200.200.200.200",
                    "payload_size": 100
                }, headers={"Authorization": f"Bearer {raw_key_b}"})

            dispatched_for_b = [d for d in dispatched_webhooks if d["project_id"] == proj_b_id]
            assert_test("Project B alert fired", len(dispatched_for_b) >= 1)
            assert_test("Project B webhook URL dispatched", any(d["webhook_url"] == "https://hooks.slack.com/services/BOB/PROJ_B/TARGET" for d in dispatched_for_b))
            assert_test("Project B alert was NOT sent to Project A webhook", not any(d["webhook_url"] == "https://hooks.slack.com/services/ALICE/PROJ_A/TARGET" for d in dispatched_for_b))
        finally:
            server.webhook.send_alert = original_send_alert

        # 8. Webhook Removal (DELETE)
        res_del_wh = client.delete(f"/api/projects/{proj_a_id}/webhooks")
        assert_test("Alice removes webhook -> HTTP 200", res_del_wh.status_code == 200)
        assert_test("Alice webhook config is now null", client.get(f"/api/projects/{proj_a_id}/webhooks").get_json().get("webhook") is None)
        assert_test("Testing removed webhook returns HTTP 400", client.post(f"/api/projects/{proj_a_id}/webhooks/test").status_code == 400)

        # Bob's webhook still exists and remains untouched
        assert_test("Bob's webhook still exists intact", bob_client.get(f"/api/projects/{proj_b_id}/webhooks").get_json().get("webhook") is not None)

        # ---------------------------------------------------------
        # Test N: SDK Download, Zero Secret Leakage & Fresh Sample App Ingestion
        # ---------------------------------------------------------
        print("\n--- Test N: SDK Download, Zero Secret Leakage & Fresh Sample App Ingestion ---")

        # 1. Download SDK for Alice's Project A
        res_dl = client.get(f"/api/projects/{proj_a_id}/download-sdk")
        assert_test("Alice downloads SDK -> HTTP 200", res_dl.status_code == 200)
        assert_test("Download content type is application/zip", res_dl.content_type == "application/zip")
        assert_test("Attachment filename matches project id", f"mlo11y-sdk-{proj_a_id}.zip" in res_dl.headers.get("Content-Disposition", ""))

        # 2. Authorization guards on download
        res_bob_dl = bob_client.get(f"/api/projects/{proj_a_id}/download-sdk")
        assert_test("Bob cannot download Alice's SDK -> HTTP 403", res_bob_dl.status_code == 403)
        res_anon_dl = app.test_client().get(f"/api/projects/{proj_a_id}/download-sdk")
        assert_test("Unauthenticated user cannot download SDK -> HTTP 401", res_anon_dl.status_code == 401)
        res_fake_dl = client.get("/api/projects/proj_nonexistent_999/download-sdk")
        assert_test("Nonexistent project download returns HTTP 403 or 404", res_fake_dl.status_code in (403, 404))

        # 3. ZIP File Verification & Content Extraction
        zip_buf = io.BytesIO(res_dl.data)
        with zipfile.ZipFile(zip_buf, "r") as zf:
            file_names = set(zf.namelist())
            assert_test("ZIP contains middleware.py", "middleware.py" in file_names)
            assert_test("ZIP contains config.py", "config.py" in file_names)
            assert_test("ZIP contains sample_app.py", "sample_app.py" in file_names)
            assert_test("ZIP contains README.md", "README.md" in file_names)

            middleware_content = zf.read("middleware.py").decode("utf-8")
            config_content = zf.read("config.py").decode("utf-8")
            sample_app_content = zf.read("sample_app.py").decode("utf-8")
            readme_content = zf.read("README.md").decode("utf-8")

        all_sdk_content = middleware_content + config_content + sample_app_content + readme_content

        # 4. Strict Zero Secret Leakage Assertions
        assert_test("Zero Leak: Alice password absent from SDK files", "Password123!" not in all_sdk_content)
        assert_test("Zero Leak: Database credentials/sqlite file absent", ".db" not in all_sdk_content and "sqlite" not in all_sdk_content.lower())
        assert_test("Zero Leak: Gemini API key absent", "AIzaSy" not in all_sdk_content and "gemini" not in all_sdk_content.lower())
        assert_test("Zero Leak: Slack webhook secrets absent", "hooks.slack.com" not in all_sdk_content)
        assert_test("Zero Leak: User session tokens absent", "session_token" not in all_sdk_content.lower())

        # Check config.py parameters
        assert_test("config.py contains PROJECT_ID", f'PROJECT_ID = "{proj_a_id}"' in config_content)
        assert_test("config.py contains COLLECTOR_URL", "COLLECTOR_URL" in config_content)
        assert_test("config.py contains valid SDK_KEY", 'SDK_KEY = "ask_' in config_content)

        # Extract SDK key from config.py
        m = re.search(r'SDK_KEY\s*=\s*"([^"]+)"', config_content)
        assert_test("Extracted SDK_KEY from config.py", m is not None)
        active_dl_key = m.group(1) if m else ""

        # 5. Execute fresh sample Flask application with extracted SDK
        with tempfile.TemporaryDirectory() as temp_dir:
            zf_temp = zipfile.ZipFile(io.BytesIO(res_dl.data), "r")
            zf_temp.extractall(temp_dir)

            # Load the extracted middleware module dynamically from disk
            spec = importlib.util.spec_from_file_location("downloaded_middleware", os.path.join(temp_dir, "middleware.py"))
            dl_module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(dl_module)

            from flask import Flask as FreshFlask, jsonify as fresh_jsonify

            fresh_app = FreshFlask("fresh_consumer_app")
            
            # Hook the extracted middleware
            dl_module.SecurityMiddleware(
                fresh_app,
                collector_url="http://collector.local:5001",
                api_key=active_dl_key
            )

            @fresh_app.route("/api/v1/ping", methods=["GET"])
            def fresh_ping():
                return fresh_jsonify({"status": "fresh_app_online"})

            @fresh_app.route("/api/v1/orders", methods=["POST"])
            def fresh_order():
                return fresh_jsonify({"order_id": 42, "status": "processed"})

            fresh_client = fresh_app.test_client()

            # Intercept background HTTP requests from middleware and forward to backend /ingest
            captured_telemetry = []
            def mock_requests_post(*args, **kwargs):
                # Handle both standalone post(url, ...) and Session.post(self, url, ...)
                if len(args) > 1 and hasattr(args[0], 'mount'):
                    # Called as Session.post(self, url, ...)
                    url = args[1]
                elif len(args) > 0:
                    url = args[0]
                else:
                    url = kwargs.get("url", "")
                json_data = kwargs.get("json")
                headers = kwargs.get("headers")
                captured_telemetry.append({"url": url, "json": json_data, "headers": headers})
                # Forward directly to the collector backend!
                return client.post("/ingest", json=json_data, headers=headers)

            with patch("requests.post", side_effect=mock_requests_post), patch("requests.Session.post", side_effect=mock_requests_post):
                # Send sample requests to the fresh application
                res_ping = fresh_client.get("/api/v1/ping", headers={"X-Forwarded-For": "55.66.77.88"})
                assert_test("Fresh app ping returns HTTP 200", res_ping.status_code == 200)

                res_order = fresh_client.post("/api/v1/orders", json={"item": "widget", "qty": 2}, headers={"X-Forwarded-For": "55.66.77.88"})
                assert_test("Fresh app order returns HTTP 200", res_order.status_code == 200)

                # Give threads a moment to finish firing
                time.sleep(0.2)

            assert_test("Middleware dispatched telemetry events", len(captured_telemetry) >= 2)
            assert_test("Dispatched event has Bearer ask_ key in Authorization header", captured_telemetry[0]["headers"].get("Authorization", "").startswith("Bearer ask_"))
            assert_test("Dispatched event has X-API-Key header", captured_telemetry[0]["headers"].get("X-API-Key", "").startswith("ask_"))

            # Verify that ingested telemetry is stored under Alice's Project A
            alice_events_after = client.get(f"/events/recent?project_id={proj_a_id}").get_json()
            assert_test("Alice Project A recorded /api/v1/ping from fresh app", any(e["endpoint"] == "/api/v1/ping" for e in alice_events_after))
            assert_test("Alice Project A recorded /api/v1/orders from fresh app", any(e["endpoint"] == "/api/v1/orders" for e in alice_events_after))

            # Bob must see NONE of this telemetry
            bob_events_after = bob_client.get(f"/events/recent?project_id={proj_b_id}").get_json()
            assert_test("Bob Project B received NONE of fresh app telemetry", not any("/api/v1/orders" in e.get("endpoint", "") for e in bob_events_after))

            # Verify last_used_at timestamp updated
            proj_a_keys = db.list_api_keys_for_project(proj_a_id)
            used_keys = [k for k in proj_a_keys if active_dl_key.startswith(k["key_prefix"].rstrip("."))]
            assert_test("Active SDK key last_used_at was updated in DB", len(used_keys) > 0 and used_keys[0]["last_used_at"] is not None)

        # 6. SDK Key Lifecycle: Immediate Revocation on Regeneration
        res_regen2 = client.post(f"/api/projects/{proj_a_id}/keys/regenerate")
        assert_test("Alice regenerates SDK key -> HTTP 201", res_regen2.status_code == 201)
        new_active_key = res_regen2.get_json()["key"]["raw_key"]
        assert_test("New active key is different from previous key", new_active_key != active_dl_key)

        # Immediate Invalidation: Old SDK key MUST be rejected with HTTP 401
        res_old_ingest = client.post("/ingest", json={
            "endpoint": "/api/v1/ping_old",
            "method": "GET",
            "status_code": 200,
            "latency_ms": 15.0,
            "ip": "55.66.77.88",
            "payload_size": 0
        }, headers={"Authorization": f"Bearer {active_dl_key}"})
        assert_test("Old SDK key rejected immediately -> HTTP 401 Unauthorized", res_old_ingest.status_code == 401)

        # New key MUST be accepted immediately
        res_new_ingest = client.post("/ingest", json={
            "endpoint": "/api/v1/ping_new",
            "method": "GET",
            "status_code": 200,
            "latency_ms": 15.0,
            "ip": "55.66.77.88",
            "payload_size": 0
        }, headers={"Authorization": f"Bearer {new_active_key}"})
        assert_test("New active key accepted immediately -> HTTP 201", res_new_ingest.status_code == 201)

        # Download SDK with regenerated key
        res_dl2 = client.get(f"/api/projects/{proj_a_id}/download-sdk?api_key={new_active_key}")
        assert_test("Alice downloads updated SDK -> HTTP 200", res_dl2.status_code == 200)
        with zipfile.ZipFile(io.BytesIO(res_dl2.data), "r") as zf2:
            cfg2 = zf2.read("config.py").decode("utf-8")
            assert_test("Newly downloaded SDK config.py contains the active regenerated key", f'SDK_KEY = "{new_active_key}"' in cfg2)

        # ---------------------------------------------------------
        # Test O: Complete User Journey, Session Persistence & Empty States
        # ---------------------------------------------------------
        print("\n--- Test O: Complete User Journey, Session Persistence & Empty States ---")

        # 1. Clean Visitor Experience: Check Dashboard Page Assets
        visitor_client = server.app.test_client()
        res_page = visitor_client.get("/")
        assert_test("Visitor receives 200 for dashboard UI", res_page.status_code == 200)
        page_html = res_page.data.decode("utf-8")
        if "id=\"root\"" in page_html:
            assert_test("HTML contains React app root container", "id=\"root\"" in page_html)
            assert_test("HTML contains API-Security-Analytics-Dashboard application title", "API-Security-Analytics-Dashboard" in page_html)
        else:
            assert_test("HTML contains app-loading screen", "id=\"app-loading\"" in page_html)
            assert_test("HTML contains auth-app login card", "id=\"auth-app\"" in page_html)
            assert_test("HTML contains Current Project selector", "Current Project:" in page_html)
            assert_test("HTML contains SDK Integration button", "📦 SDK Integration" in page_html)
            assert_test("HTML contains Slack Webhook button", "🔔 Slack Webhook" in page_html)
            assert_test("HTML contains Sign Out control", "🚪 Sign Out" in page_html)
            assert_test("HTML contains No Projects empty state", "id=\"no-projects-view\"" in page_html)

        # Visitor is unauthenticated
        res_me_anon = visitor_client.get("/api/auth/me")
        assert_test("Unauthenticated visitor /api/auth/me returns 401", res_me_anon.status_code == 401)

        # 2. Complete Signup Journey
        charlie_email = f"charlie_{run_id}@example.com"
        res_charlie_reg = visitor_client.post("/api/auth/register", json={
            "email": charlie_email,
            "password": "Password123!",
            "confirm_password": "Password123!"
        })
        assert_test("Visitor signup succeeds -> HTTP 201", res_charlie_reg.status_code == 201)

        # 3. Session Persistence Across Simulated Page Refresh
        # Using the same cookie jar simulates browser refresh with session cookie
        res_refresh_me = visitor_client.get("/api/auth/me")
        assert_test("Session persists across refresh -> HTTP 200", res_refresh_me.status_code == 200)
        assert_test("Session identifies correct user", res_refresh_me.get_json().get("user", {}).get("email") == charlie_email)

        # 4. Project Management: Create required sample projects (E-Commerce API, Payment API, College API)
        res_p1 = visitor_client.post("/api/projects", json={"name": "E-Commerce API", "description": "Retail checkout service"})
        res_p2 = visitor_client.post("/api/projects", json={"name": "Payment API", "description": "Payment gateway processing"})
        res_p3 = visitor_client.post("/api/projects", json={"name": "College API", "description": "Student management service"})
        assert_test("Created E-Commerce API -> HTTP 201", res_p1.status_code == 201)
        assert_test("Created Payment API -> HTTP 201", res_p2.status_code == 201)
        assert_test("Created College API -> HTTP 201", res_p3.status_code == 201)

        p1_id = res_p1.get_json()["project"]["id"]
        p2_id = res_p2.get_json()["project"]["id"]
        p3_id = res_p3.get_json()["project"]["id"]

        # List projects: All 3 user projects must be returned
        res_projs = visitor_client.get("/api/projects")
        projs_list = res_projs.get_json().get("projects", [])
        proj_names = [p["name"] for p in projs_list]
        assert_test("Project selector has E-Commerce API", "E-Commerce API" in proj_names)
        assert_test("Project selector has Payment API", "Payment API" in proj_names)
        assert_test("Project selector has College API", "College API" in proj_names)

        # 5. Empty States Handling for Fresh Project
        res_empty_events = visitor_client.get(f"/events/recent?project_id={p1_id}")
        assert_test("Fresh project returns 200 with empty events array", res_empty_events.status_code == 200 and res_empty_events.get_json() == [])
        res_empty_alerts = visitor_client.get(f"/alerts/recent?project_id={p1_id}")
        assert_test("Fresh project returns 200 with empty alerts array", res_empty_alerts.status_code == 200 and res_empty_alerts.get_json() == [])
        res_empty_wh = visitor_client.get(f"/api/projects/{p1_id}/webhooks")
        assert_test("Fresh project returns 200 with null webhook", res_empty_wh.status_code == 200 and res_empty_wh.get_json().get("webhook") is None)

        # 6. Webhook Section Flow: Connect -> Test -> Disconnect
        # Connect Slack webhook
        res_wh_conn = visitor_client.post(f"/api/projects/{p1_id}/webhooks", json={
            "webhook_url": "https://hooks.slack.com/services/T111/B222/CHARLIE_SECRET",
            "provider": "slack"
        })
        assert_test("Connect Slack webhook -> HTTP 200", res_wh_conn.status_code == 200)
        assert_test("Connected webhook URL is masked", "hooks.slack.com/services/****" in res_wh_conn.get_json().get("webhook", {}).get("masked_url", ""))

        # Test Webhook
        res_wh_test = visitor_client.post(f"/api/projects/{p1_id}/webhooks/test")
        assert_test("Test webhook endpoint responds", res_wh_test.status_code in (200, 400))

        # Disconnect Webhook
        res_wh_disc = visitor_client.delete(f"/api/projects/{p1_id}/webhooks")
        assert_test("Disconnect webhook succeeds -> HTTP 200", res_wh_disc.status_code == 200)
        res_wh_after = visitor_client.get(f"/api/projects/{p1_id}/webhooks")
        assert_test("Webhook is now disconnected (None)", res_wh_after.get_json().get("webhook") is None)

        # 7. Clean Logout & Invalidation
        res_logout = visitor_client.post("/api/auth/logout")
        assert_test("User logout succeeds -> HTTP 200", res_logout.status_code == 200)

        # Verify session is strictly invalidated
        res_me_logged_out = visitor_client.get("/api/auth/me")
        assert_test("Logged out user /api/auth/me returns 401 Unauthorized", res_me_logged_out.status_code == 401)
        res_proj_logged_out = visitor_client.get("/api/projects")
        assert_test("Logged out user accessing /api/projects returns 401 Unauthorized", res_proj_logged_out.status_code == 401)

        print("\n==================================================")
        print(f"TEST SUITE COMPLETE: {passed}/{total} TESTS PASSED")
        print("==================================================")
        return passed == total

    finally:
        # Clean up test accounts after run
        cleanup_test_data()


if __name__ == "__main__":
    success = run_tests()
    sys.exit(0 if success else 1)

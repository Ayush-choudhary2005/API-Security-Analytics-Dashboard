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

# Ensure backend directory is in path
sys.path.insert(0, os.path.dirname(__file__))

import server
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
        assert_test("Auto-creates default project", data.get("default_project", {}).get("name") == "Default Project")
        assert_test("Auto-generates raw API key", bool(data.get("api_key")))
        alice_key = data.get("api_key")
        alice_proj_id = data.get("default_project", {}).get("id")

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
        bob_proj_id = res_bob_reg.get_json()["default_project"]["id"]
        assert_test("Bob registered successfully", res_bob_reg.status_code == 201)

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

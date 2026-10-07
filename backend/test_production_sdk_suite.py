"""
test_production_sdk_suite.py — Production Developer SDK Integration Test Suite.

Verifies:
1. Developer-friendly installation & import paths:
   - from security_sdk import SecurityMiddleware
   - from mlo11y import SecurityMiddleware
   - from middleware import SecurityMiddleware
2. Complete parameter & environment variable configuration:
   - SECURITY_SDK_API_KEY, SECURITY_SDK_COLLECTOR_URL, SECURITY_SDK_ENABLED, etc.
   - Precedence: Arguments > Env Vars > Defaults.
3. Fail-safe operation & graceful collector downtime handling:
   - Host API MUST continue operating normally when collector is offline.
   - Zero crashes, zero unhandled exceptions, zero request blocking.
4. Telemetry capture:
   - Endpoint, method, status code, latency (time.perf_counter), IP (proxies/Cloudflare).
   - Auth failure tracking (401/403) and user_id extraction.
5. Security compliance:
   - Never logs or prints raw credentials (credential masking).
   - Never contains user credentials or server secrets.
6. Integration with a completely fresh Flask application.
"""

import os
import sys
import time
import unittest
import uuid
from flask import Flask, jsonify, request

# Add paths
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "sdk")))
sys.path.insert(0, os.path.abspath(os.path.dirname(__file__)))

import db
from server import app as collector_app


class TestProductionSDKSuite(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        db.init_db()

    def test_01_import_variations(self):
        """Verify developers can import the SDK using any documented entry point."""
        # 1. Primary developer import: security_sdk
        from security_sdk import SecurityMiddleware as SM_Primary, SecurityConfig as SC_Primary, observe as obs_Primary, __version__ as v1
        self.assertEqual(v1, "1.0.0")
        self.assertIsNotNone(SM_Primary)

        # 2. Package namespace import: mlo11y
        from mlo11y import SecurityMiddleware as SM_Pkg, SecurityConfig as SC_Pkg, observe as obs_Pkg, __version__ as v2
        self.assertEqual(v2, "1.0.0")
        self.assertIs(SM_Primary, SM_Pkg)

        # 3. Drop-in standalone import: middleware
        from middleware import SecurityMiddleware as SM_Dropin, observe as obs_Dropin
        self.assertIsNotNone(SM_Dropin)

    def test_02_credential_masking_security(self):
        """Verify SDK credentials are never logged or exposed in representation strings."""
        from security_sdk import SecurityConfig, mask_credential

        raw_secret = "ask_ecomm_a1b2c3d4e5f67890123456789abcdef0"
        masked = mask_credential(raw_secret)
        self.assertNotIn("a1b2c3d4e5f67890123456789abcdef0", masked)
        self.assertTrue(masked.startswith("ask_ec..."))

        cfg = SecurityConfig(api_key=raw_secret, collector_url="http://127.0.0.1:5001")
        cfg_repr = repr(cfg)
        self.assertNotIn("a1b2c3d4e5f67890123456789abcdef0", cfg_repr)
        self.assertIn("ask_ec...", cfg_repr)

    def test_03_configuration_precedence_and_env_vars(self):
        """Verify configuration precedence: constructor args > env vars > defaults."""
        from security_sdk import SecurityConfig

        # Default values
        cfg_default = SecurityConfig()
        self.assertEqual(cfg_default.collector_url, "http://localhost:5001")
        self.assertEqual(cfg_default.timeout, 2.0)
        self.assertTrue(cfg_default.enabled)

        # Environment variables
        os.environ["SECURITY_SDK_API_KEY"] = "ask_env_key_123456789"
        os.environ["SECURITY_SDK_COLLECTOR_URL"] = "http://env-collector.corp.internal:8000"
        os.environ["SECURITY_SDK_TIMEOUT"] = "3.5"
        os.environ["SECURITY_SDK_ENABLED"] = "false"

        try:
            cfg_env = SecurityConfig()
            self.assertEqual(cfg_env.api_key, "ask_env_key_123456789")
            self.assertEqual(cfg_env.collector_url, "http://env-collector.corp.internal:8000")
            self.assertEqual(cfg_env.timeout, 3.5)
            self.assertFalse(cfg_env.enabled)

            # Explicit arguments override environment variables
            cfg_override = SecurityConfig(
                api_key="ask_explicit_key_999",
                collector_url="https://explicit-collector.com",
                enabled=True,
                timeout=1.0
            )
            self.assertEqual(cfg_override.api_key, "ask_explicit_key_999")
            self.assertEqual(cfg_override.collector_url, "https://explicit-collector.com")
            self.assertTrue(cfg_override.enabled)
            self.assertEqual(cfg_override.timeout, 1.0)
        finally:
            os.environ.pop("SECURITY_SDK_API_KEY", None)
            os.environ.pop("SECURITY_SDK_COLLECTOR_URL", None)
            os.environ.pop("SECURITY_SDK_TIMEOUT", None)
            os.environ.pop("SECURITY_SDK_ENABLED", None)

    def test_04_fresh_flask_app_integration_and_timing(self):
        """Test attaching SDK to a completely fresh Flask API that knows nothing about the platform."""
        from security_sdk import SecurityMiddleware

        fresh_app = Flask(f"fresh_api_{uuid.uuid4().hex[:6]}")

        # Developer initializes in one line:
        SecurityMiddleware(
            fresh_app,
            api_key="ask_test_key_dummy",
            collector_url="http://127.0.0.1:5001"
        )

        @fresh_app.route("/api/v1/products/<int:pid>")
        def get_product(pid):
            return jsonify({"product_id": pid, "title": "Developer Platform Subscription"})

        client = fresh_app.test_client()

        # Send requests through fresh API
        t0 = time.perf_counter()
        resp = client.get("/api/v1/products/42")
        elapsed_ms = (time.perf_counter() - t0) * 1000.0

        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.get_json()["product_id"], 42)
        # Verify overhead is negligible
        self.assertLess(elapsed_ms, 150.0)

    def test_05_graceful_downtime_fail_safe(self):
        """
        FAIL-SAFE VERIFICATION:
        If collector is completely offline (unreachable port), the host API
        MUST continue operating normally without throwing or crashing.
        """
        from security_sdk import SecurityMiddleware

        fresh_app = Flask(f"resilient_api_{uuid.uuid4().hex[:6]}")

        # Point to an offline/non-existent local port
        SecurityMiddleware(
            fresh_app,
            api_key="ask_dead_collector_test",
            collector_url="http://127.0.0.1:59999",  # Port is down/offline
            timeout=0.2
        )

        @fresh_app.route("/api/checkout", methods=["POST"])
        def checkout():
            return jsonify({"status": "payment_processed", "amount": 100}), 200

        client = fresh_app.test_client()

        # Execute multiple requests against the host API while collector is down
        for i in range(5):
            resp = client.post("/api/checkout")
            # Host API must succeed with 200 OK — zero interruption
            self.assertEqual(resp.status_code, 200)
            self.assertEqual(resp.get_json()["status"], "payment_processed")

    def test_06_ip_and_auth_failure_capture(self):
        """Verify accurate client IP resolution (proxies/Cloudflare) and auth failure extraction."""
        from security_sdk import SecurityMiddleware

        fresh_app = Flask(f"auth_test_api_{uuid.uuid4().hex[:6]}")
        captured_events = []

        # Subclass or mock transport enqueue to inspect captured event data
        sdk = SecurityMiddleware(fresh_app, api_key="ask_auth_test", collector_url="http://127.0.0.1:5001")
        original_enqueue = sdk.transport.enqueue

        def mock_enqueue(event):
            captured_events.append(event)
            return original_enqueue(event)

        sdk.transport.enqueue = mock_enqueue

        @fresh_app.route("/api/secure")
        def secure_route():
            if not request.headers.get("Authorization"):
                return jsonify({"error": "Unauthorized"}), 401
            return jsonify({"secret": "data"}), 200

        client = fresh_app.test_client()

        # 1. Request with proxy X-Forwarded-For header triggering 401 Unauthorized
        resp = client.get("/api/secure", headers={
            "X-Forwarded-For": "203.0.113.195, 10.0.0.1",
            "X-User-Id": "usr_hacker_suspect"
        })
        self.assertEqual(resp.status_code, 401)
        self.assertGreaterEqual(len(captured_events), 1)

        event = captured_events[-1]
        self.assertEqual(event["endpoint"], "/api/secure")
        self.assertEqual(event["method"], "GET")
        self.assertEqual(event["status_code"], 401)
        self.assertEqual(event["ip"], "203.0.113.195")  # Real client IP extracted
        self.assertEqual(event["user_id"], "usr_hacker_suspect")
        self.assertGreater(event["latency_ms"], 0.0)

        # 2. Cloudflare CF-Connecting-IP resolution
        client.get("/api/secure", headers={
            "CF-Connecting-IP": "198.51.100.88",
            "Authorization": "Bearer valid_token"
        })
        event2 = captured_events[-1]
        self.assertEqual(event2["status_code"], 200)
        self.assertEqual(event2["ip"], "198.51.100.88")

    def test_07_bounded_memory_queue(self):
        """Verify queue bounds protect host application against memory leaks / OOM."""
        from security_sdk import SecurityConfig
        from mlo11y.transport import TelemetryTransport

        # Small buffer for test
        config = SecurityConfig(api_key="ask_test_bounded", max_queue_size=10, enabled=True)
        transport = TelemetryTransport(config)

        # Enqueue 50 items into a buffer of size 10 (without worker popping)
        transport._stop_event.set()  # Pause worker
        for i in range(50):
            transport.enqueue({"test_id": i})

        # Queue size must not exceed bounded capacity
        self.assertLessEqual(transport.queue.qsize(), 10)
        self.assertGreaterEqual(transport._dropped_count, 40)
        transport.shutdown()

    def test_08_end_to_end_fresh_app_to_collector(self):
        """
        Full End-to-End Test:
        Fresh Flask API -> SecurityMiddleware -> Collector /ingest -> Database
        """
        # 1. Provision a real project in the database
        demo_user = db.get_user_by_email("demo@mlo11y.local")
        user_id = demo_user["id"] if demo_user else "usr_demo_default"
        proj = db.create_project(user_id, name="E2E Fresh Test API")
        key_info = db.create_api_key(proj["id"], name="E2E Test Key")
        raw_key = key_info["raw_key"]

        # 2. Spin up fresh Flask API using the SDK
        from security_sdk import SecurityMiddleware

        fresh_app = Flask("e2e_fresh_production_api")
        sdk = SecurityMiddleware(
            fresh_app,
            api_key=raw_key,
            collector_url="http://127.0.0.1:5001"
        )

        @fresh_app.route("/api/v1/payments/process", methods=["POST"])
        def process_payment():
            return jsonify({"status": "success", "charge_id": "ch_987654"}), 201

        fresh_client = fresh_app.test_client()

        # Intercept event sent by SDK transport and route to collector test client
        collector_test_client = collector_app.test_client()

        def route_to_collector(event, headers):
            resp = collector_test_client.post(
                "/ingest",
                json=event,
                headers=headers
            )
            return resp.status_code in (200, 201)

        sdk.transport._send_event = route_to_collector

        # 3. Client executes request on the fresh company API
        resp = fresh_client.post(
            "/api/v1/payments/process",
            headers={"X-Forwarded-For": "198.51.100.22", "X-User-Id": "customer_42"}
        )
        self.assertEqual(resp.status_code, 201)

        # Allow background queue worker to deliver
        time.sleep(0.8)

        # 4. Verify telemetry reached the database for this specific project
        recent_events = db.get_recent_events(limit=10, project_id=proj["id"])
        self.assertGreaterEqual(len(recent_events), 1)

        recorded = recent_events[0]
        self.assertEqual(recorded["endpoint"], "/api/v1/payments/process")
        self.assertEqual(recorded["method"], "POST")
        self.assertEqual(recorded["status_code"], 201)
        self.assertEqual(recorded["ip"], "198.51.100.22")
        self.assertEqual(recorded["user_id"], "customer_42")
        self.assertEqual(recorded["project_id"], proj["id"])

        sdk.transport.shutdown()


if __name__ == "__main__":
    unittest.main()

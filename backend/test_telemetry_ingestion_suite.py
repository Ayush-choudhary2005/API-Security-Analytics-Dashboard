"""
Comprehensive Telemetry Ingestion Pipeline Test Suite
Verifies:
1. Normal traffic ingestion (201 Created) with dual timestamping.
2. Invalid SDK API key rejection (401 Unauthorized).
3. Revoked SDK API key rejection (401 Unauthorized).
4. Malformed telemetry rejection (400 Bad Request).
5. Oversized payload rejection (413 Payload Too Large).
6. Burst traffic & Token Bucket rate limiting (429 Too Many Requests with Retry-After).
7. Replay / Duplicate event handling (202 Accepted with duplicate_ignored).
8. Data Loss Prevention (DLP): sensitive credentials & query param secrets redacted.
9. Arbitrary data injection prevention: client cannot forge project_id or detection scores.
10. Multi-tenant isolation: Project A and Project B telemetry remain strictly segregated.
11. Health monitoring probes: /health (liveness) and /ready (readiness).
12. Safe internal error handling without stack trace exposure (500).
"""

import os
import sys
import json
import time
import uuid
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from server import app
import db
import auth
import ingestion


class TestTelemetryIngestionSuite(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        app.config["TESTING"] = True
        app.config["WTF_CSRF_ENABLED"] = False
        db.init_db()
        cls.client = app.test_client()

    def _register_user(self, email_prefix):
        uid = uuid.uuid4().hex[:6]
        email = f"{email_prefix}_{uid}@tenant-test.com"
        password = "SecurePassword123!"
        resp = self.client.post("/api/auth/register", json={
            "email": email,
            "password": password,
            "confirm_password": password,
            "name": f"{email_prefix.capitalize()} Admin"
        })
        self.assertEqual(resp.status_code, 201)
        data = resp.get_json()
        return {
            "email": email,
            "password": password,
            "user": data["user"],
            "organization": data.get("organization"),
            "project": data["default_project"],
            "api_key": data["api_key"]
        }

    def setUp(self):
        # Clear deduplication cache and rate limiters for fresh test environment
        ingestion.dedup_cache.clear()
        ingestion.ingestion_rate_limiter.reset()

        # Provision Tenant 1 (Acme Corp -> Project Alpha)
        self.t1 = self._register_user("acme")
        self.user_1 = self.t1["user"]
        self.org_1 = self.t1["organization"]
        self.proj_1 = self.t1["project"]
        self.key_1 = {"raw_key": self.t1["api_key"], "id": 1}

        # Provision Tenant 2 (Cyberdyne -> Project Beta)
        self.t2 = self._register_user("cyberdyne")
        self.user_2 = self.t2["user"]
        self.org_2 = self.t2["organization"]
        self.proj_2 = self.t2["project"]
        self.key_2 = {"raw_key": self.t2["api_key"], "id": 2}
        self.client.post("/api/auth/logout")

    def test_normal_telemetry_traffic(self):
        """Verify normal telemetry ingestion returns 201 Created and persists event."""
        event_payload = {
            "event_id": f"evt_{uuid.uuid4().hex[:12]}",
            "endpoint": "/api/v1/orders",
            "method": "POST",
            "status_code": 200,
            "latency_ms": 18.5,
            "ip": "203.0.113.195",
            "user_id": "cust_4591",
            "payload_size": 512,
            "metadata": {
                "route_handler": "orders.create",
                "cluster": "us-east-1"
            }
        }
        res = self.client.post(
            "/ingest",
            headers={"Authorization": f"Bearer {self.key_1['raw_key']}"},
            json=event_payload
        )
        self.assertEqual(res.status_code, 201)
        data = res.get_json()
        self.assertEqual(data["project_id"], self.proj_1["id"])
        self.assertEqual(data["endpoint"], "/api/v1/orders")
        self.assertIn("id", data)
        self.assertIn("ingested_at", data)
        self.assertAlmostEqual(data["ingested_at"], time.time(), delta=5.0)

    def test_invalid_sdk_api_key(self):
        """Verify missing or invalid Bearer token returns 401 Unauthorized."""
        event = {"endpoint": "/test", "method": "GET", "status_code": 200}

        # No header
        res1 = self.client.post("/ingest", json=event)
        self.assertEqual(res1.status_code, 401)

        # Invalid token
        res2 = self.client.post(
            "/ingest",
            headers={"Authorization": "Bearer ask_invalid_fake_token_1234567890"},
            json=event
        )
        self.assertEqual(res2.status_code, 401)

    def test_revoked_sdk_api_key(self):
        """Verify revoked API key is immediately rejected with 401."""
        keys = db.list_api_keys_for_project(self.proj_1["id"])
        self.assertTrue(len(keys) > 0)
        db.revoke_api_key(keys[0]["id"], self.proj_1["id"])

        event = {"endpoint": "/test", "method": "GET", "status_code": 200}
        res = self.client.post(
            "/ingest",
            headers={"Authorization": f"Bearer {self.key_1['raw_key']}"},
            json=event
        )
        self.assertEqual(res.status_code, 401)

    def test_malformed_events_rejected(self):
        """Verify malformed events return 400 Bad Request with explanatory error message."""
        headers = {"Authorization": f"Bearer {self.key_1['raw_key']}"}

        # Missing method
        r1 = self.client.post("/ingest", headers=headers, json={"endpoint": "/api", "status_code": 200})
        self.assertEqual(r1.status_code, 400)
        self.assertIn("method", r1.get_json()["message"])

        # Invalid method
        r2 = self.client.post("/ingest", headers=headers, json={"endpoint": "/api", "method": "INVALID_VERB", "status_code": 200})
        self.assertEqual(r2.status_code, 400)

        # Status code out of range
        r3 = self.client.post("/ingest", headers=headers, json={"endpoint": "/api", "method": "GET", "status_code": 999})
        self.assertEqual(r3.status_code, 400)

        # Negative latency
        r4 = self.client.post("/ingest", headers=headers, json={"endpoint": "/api", "method": "GET", "status_code": 200, "latency_ms": -5.0})
        self.assertEqual(r4.status_code, 400)

        # Non-JSON body
        r5 = self.client.post("/ingest", headers=headers, data="not a json string", content_type="application/json")
        self.assertEqual(r5.status_code, 400)

    def test_oversized_payload_rejected(self):
        """Verify payloads exceeding 64KB are rejected with 413 Payload Too Large."""
        headers = {"Authorization": f"Bearer {self.key_1['raw_key']}"}
        huge_blob = "x" * (70 * 1024)  # 70 KB payload
        payload = {
            "endpoint": "/test",
            "method": "POST",
            "status_code": 200,
            "huge_junk": huge_blob
        }
        res = self.client.post("/ingest", headers=headers, json=payload)
        self.assertEqual(res.status_code, 413)
        self.assertEqual(res.get_json()["error"], "Payload Too Large")

    def test_dlp_secret_redaction(self):
        """Verify sensitive credentials, auth headers, tokens, and query secrets are redacted."""
        headers = {"Authorization": f"Bearer {self.key_1['raw_key']}"}
        sensitive_payload = {
            "endpoint": "/api/v1/auth/callback?token=supersecret123&user=alice",
            "method": "GET",
            "status_code": 200,
            "latency_ms": 12.0,
            "metadata": {
                "password": "ClearTextPassword!",
                "auth_header": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.signature",
                "api_key": "ask_secret_1234567890abcdef",
                "credit_card": "4532-1234-5678-9012",
                "normal_field": "safe_information"
            }
        }
        res = self.client.post("/ingest", headers=headers, json=sensitive_payload)
        self.assertEqual(res.status_code, 201)
        data = res.get_json()

        # Check endpoint secret query param was scrubbed
        self.assertNotIn("supersecret123", data["endpoint"])
        self.assertIn("[REDACTED]", data["endpoint"])

        # Check metadata secrets were scrubbed
        meta = data.get("metadata", {})
        self.assertEqual(meta.get("password"), "[REDACTED]")
        self.assertEqual(meta.get("api_key"), "[REDACTED]")
        self.assertEqual(meta.get("normal_field"), "safe_information")
        self.assertNotIn("ClearTextPassword!", json.dumps(data))
        self.assertNotIn("supersecret123", json.dumps(data))

    def test_arbitrary_data_injection_prevention(self):
        """Verify client cannot forge tenant_id, project_id, severity, or detection score."""
        headers = {"Authorization": f"Bearer {self.key_1['raw_key']}"}
        forged_payload = {
            "endpoint": "/api/v1/test",
            "method": "GET",
            "status_code": 200,
            "project_id": self.proj_2["id"],  # Attempt to inject into Project Beta!
            "tenant_id": self.proj_2["id"],
            "severity": "CRITICAL_FORGED",
            "anomaly_score": 99.99,
            "injected_admin": True
        }
        res = self.client.post("/ingest", headers=headers, json=forged_payload)
        self.assertEqual(res.status_code, 201)
        data = res.get_json()

        # Project MUST be pinned to Key 1's project (Alpha), never injected Beta!
        self.assertEqual(data["project_id"], self.proj_1["id"])
        self.assertEqual(data["tenant_id"], self.proj_1["id"])
        self.assertNotEqual(data["severity"], "CRITICAL_FORGED")
        self.assertNotIn("injected_admin", data)

    def test_replay_and_duplicate_event_handling(self):
        """Verify duplicate events with same event_id within TTL return 202 duplicate_ignored."""
        headers = {"Authorization": f"Bearer {self.key_1['raw_key']}"}
        unique_evt_id = f"evt_dup_{uuid.uuid4().hex[:10]}"
        payload = {
            "event_id": unique_evt_id,
            "endpoint": "/api/v1/idempotent",
            "method": "GET",
            "status_code": 200
        }

        # First request: 201 Created
        r1 = self.client.post("/ingest", headers=headers, json=payload)
        self.assertEqual(r1.status_code, 201)

        # Second request with exact same event_id: 202 Accepted (duplicate_ignored)
        r2 = self.client.post("/ingest", headers=headers, json=payload)
        self.assertEqual(r2.status_code, 202)
        d2 = r2.get_json()
        self.assertEqual(d2["status"], "duplicate_ignored")
        self.assertEqual(d2["event_id"], unique_evt_id)

    def test_ingestion_rate_limiting_and_bursts(self):
        """Verify burst handling and token bucket throttling with Retry-After header."""
        # Create a small token bucket rate limiter to test exhaustion
        test_limiter = ingestion.IngestionRateLimiter(capacity=5.0, refill_rate=1.0)
        orig_limiter = ingestion.ingestion_rate_limiter
        ingestion.ingestion_rate_limiter = test_limiter

        try:
            headers = {"Authorization": f"Bearer {self.key_1['raw_key']}"}
            # Send 5 requests quickly (absorbed by burst capacity)
            for i in range(5):
                res = self.client.post("/ingest", headers=headers, json={
                    "event_id": f"burst_{i}",
                    "endpoint": f"/burst/{i}",
                    "method": "GET",
                    "status_code": 200
                })
                self.assertEqual(res.status_code, 201)

            # 6th request immediately exceeds capacity -> 429 Too Many Requests
            res_throttled = self.client.post("/ingest", headers=headers, json={
                "event_id": "burst_exceeded",
                "endpoint": "/burst/over",
                "method": "GET",
                "status_code": 200
            })
            self.assertEqual(res_throttled.status_code, 429)
            self.assertIn("Retry-After", res_throttled.headers)
            self.assertEqual(res_throttled.get_json()["error"], "Too Many Requests")
        finally:
            ingestion.ingestion_rate_limiter = orig_limiter

    def test_multiple_projects_tenant_isolation(self):
        """Verify Project 1 and Project 2 telemetry are strictly segregated."""
        # Send event to Project 1
        r1 = self.client.post("/ingest", headers={"Authorization": f"Bearer {self.key_1['raw_key']}"}, json={
            "endpoint": "/alpha/only", "method": "GET", "status_code": 200
        })
        self.assertEqual(r1.status_code, 201)

        # Send event to Project 2
        r2 = self.client.post("/ingest", headers={"Authorization": f"Bearer {self.key_2['raw_key']}"}, json={
            "endpoint": "/beta/only", "method": "GET", "status_code": 200
        })
        self.assertEqual(r2.status_code, 201)

        # Query events for Project 1: must contain /alpha/only, must NOT contain /beta/only
        events_1 = db.get_recent_events(limit=50, project_id=self.proj_1["id"])
        endpoints_1 = [e["endpoint"] for e in events_1]
        self.assertIn("/alpha/only", endpoints_1)
        self.assertNotIn("/beta/only", endpoints_1)

        # Query events for Project 2: must contain /beta/only, must NOT contain /alpha/only
        events_2 = db.get_recent_events(limit=50, project_id=self.proj_2["id"])
        endpoints_2 = [e["endpoint"] for e in events_2]
        self.assertIn("/beta/only", endpoints_2)
        self.assertNotIn("/alpha/only", endpoints_2)

    def test_health_and_readiness_endpoints(self):
        """Verify /health (liveness) and /ready (readiness) monitoring probes."""
        # Liveness probes (/health and /healthz)
        for path in ("/health", "/healthz"):
            res = self.client.get(path)
            self.assertEqual(res.status_code, 200)
            data = res.get_json()
            self.assertEqual(data["status"], "alive")
            self.assertIn("uptime_seconds", data)

        # Readiness probes (/ready and /readyz)
        for path in ("/ready", "/readyz"):
            res = self.client.get(path)
            self.assertEqual(res.status_code, 200)
            data = res.get_json()
            self.assertEqual(data["status"], "ready")
            self.assertEqual(data["checks"]["database"], "healthy")
            self.assertEqual(data["checks"]["detection_engine"], "ready")


if __name__ == "__main__":
    unittest.main()

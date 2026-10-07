"""
test_ml_detection_pipeline_suite.py — Comprehensive Unit & Integration Tests
for the Production ML Detection, Active Defense & Multi-Tenant Pipeline.

Verifies:
1. Core Detection: Brute force, Endpoint scan, Request burst, Isolation Forest ML anomaly scoring.
2. Option C Hybrid Architecture: Project baseline tracker, cold start handling, project-calibrated scoring.
3. Multi-Tenant Project Isolation: Strict boundary verification between Project A and Project B.
4. Auto-blocking & Rate Limiting: Project-scoped IP blocking without cross-project leakage.
5. Alert Deduplication & Cooldown: Suppression of alert storms during ongoing attacks.
6. Detection Retention Schema: Verification that all required fields are populated and persisted.
7. External Service Fault Tolerance: Resilience against external webhook/socket failures.
8. Realistic Traffic & False Positive Verification: Validation of normal API traffic vs attacks.
"""

import os
import sys
import time
import json
import uuid
import unittest
from unittest.mock import patch, MagicMock

# Add backend directory to sys.path
backend_dir = os.path.dirname(os.path.abspath(__file__))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

import db
import detection
import rate_limiter
import server


class TestMLDetectionPipelineSuite(unittest.TestCase):

    def setUp(self):
        """Prepare fresh test environment before every test."""
        # Reset detection and rate limiting in-memory state
        detection.reset_detection_state()
        rate_limiter.reset_state()

        self.app = server.app
        self.app.config["TESTING"] = True
        self.client = self.app.test_client()

        # Provision two distinct test organizations and projects
        self.now = time.time()
        self.user_a = db.create_user(f"tenant_a_{uuid.uuid4().hex[:6]}@example.com", "Password123!")
        self.org_a = db.create_organization(self.user_a["id"], name="Acme Security Org")
        self.proj_a = db.create_project(self.user_a["id"], name="Acme Production API", organization_id=self.org_a["id"])
        self.key_a = db.create_api_key(self.proj_a["id"], name="Acme Key")["raw_key"]

        self.user_b = db.create_user(f"tenant_b_{uuid.uuid4().hex[:6]}@example.com", "Password123!")
        self.org_b = db.create_organization(self.user_b["id"], name="Globex Analytics Org")
        self.proj_b = db.create_project(self.user_b["id"], name="Globex Payment API", organization_id=self.org_b["id"])
        self.key_b = db.create_api_key(self.proj_b["id"], name="Globex Key")["raw_key"]

    def tearDown(self):
        detection.reset_detection_state()
        rate_limiter.reset_state()

    # -------------------------------------------------------------
    # 1. Core Detection Rules & ML Anomaly Scoring
    # -------------------------------------------------------------

    def test_brute_force_detection(self):
        """Verify that rapid failed auth attempts trigger brute_force detection with high severity."""
        test_ip = "198.51.100.11"
        now_ts = time.time()

        # Seed 6 failed logins for Project A
        for i in range(6):
            evt = {
                "timestamp": now_ts - (6 - i),
                "endpoint": "/api/v1/login",
                "method": "POST",
                "status_code": 401,
                "latency_ms": 25.0,
                "ip": test_ip,
                "project_id": self.proj_a["id"],
                "tenant_id": self.proj_a["id"],
            }
            scored = detection.score_event(evt)
            db.insert_event(scored)

        # Trigger event should detect brute force
        final_event = {
            "timestamp": now_ts,
            "endpoint": "/api/v1/login",
            "method": "POST",
            "status_code": 401,
            "latency_ms": 28.0,
            "ip": test_ip,
            "project_id": self.proj_a["id"],
        }
        scored = detection.score_event(final_event)

        self.assertIn("brute_force", scored["rule_flags"])
        self.assertEqual(scored["attack_type"], "brute_force")
        self.assertIn(scored["severity"], ("medium", "high"))
        self.assertGreaterEqual(scored["confidence"], 0.85)
        self.assertGreaterEqual(scored["risk_score"], 45.0)

    def test_endpoint_scanning_detection(self):
        """Verify that scanning >15 unique endpoints triggers endpoint_scan detection."""
        test_ip = "198.51.100.22"
        now_ts = time.time()

        # Seed 16 distinct endpoint requests
        for i in range(16):
            evt = {
                "timestamp": now_ts - (20 - i),
                "endpoint": f"/api/probe/{i}",
                "method": "GET",
                "status_code": 404,
                "latency_ms": 15.0,
                "ip": test_ip,
                "project_id": self.proj_a["id"],
                "tenant_id": self.proj_a["id"],
            }
            scored = detection.score_event(evt)
            db.insert_event(scored)

        final_event = {
            "timestamp": now_ts,
            "endpoint": "/api/probe/final",
            "method": "GET",
            "status_code": 404,
            "latency_ms": 18.0,
            "ip": test_ip,
            "project_id": self.proj_a["id"],
        }
        scored = detection.score_event(final_event)

        self.assertIn("endpoint_scan", scored["rule_flags"])
        self.assertEqual(scored["attack_type"], "endpoint_scan")
        self.assertIn(scored["severity"], ("medium", "high"))
        self.assertGreaterEqual(scored["confidence"], 0.85)

    def test_request_burst_detection(self):
        """Verify that >30 requests in a 10s window triggers request_burst detection."""
        test_ip = "198.51.100.33"
        now_ts = time.time()

        # Seed 32 rapid requests within 8 seconds
        for i in range(32):
            evt = {
                "timestamp": now_ts - (8 - (i * 0.2)),
                "endpoint": "/api/v1/search",
                "method": "GET",
                "status_code": 200,
                "latency_ms": 30.0,
                "ip": test_ip,
                "project_id": self.proj_a["id"],
                "tenant_id": self.proj_a["id"],
            }
            scored = detection.score_event(evt)
            db.insert_event(scored)

        final_event = {
            "timestamp": now_ts,
            "endpoint": "/api/v1/search",
            "method": "GET",
            "status_code": 200,
            "latency_ms": 35.0,
            "ip": test_ip,
            "project_id": self.proj_a["id"],
        }
        scored = detection.score_event(final_event)

        self.assertIn("request_burst", scored["rule_flags"])
        self.assertEqual(scored["attack_type"], "request_burst")
        self.assertIn(scored["severity"], ("medium", "high"))

    def test_composite_attack_detection(self):
        """Verify that simultaneous scanning and brute force triggers composite_attack."""
        test_ip = "198.51.100.44"
        now_ts = time.time()

        # Seed both 16 endpoints AND 6 failed auths
        for i in range(16):
            evt = {
                "timestamp": now_ts - (20 - i),
                "endpoint": f"/api/admin/probe_{i}",
                "method": "POST",
                "status_code": 401 if i < 6 else 200,
                "latency_ms": 20.0,
                "ip": test_ip,
                "project_id": self.proj_a["id"],
                "tenant_id": self.proj_a["id"],
            }
            scored = detection.score_event(evt)
            db.insert_event(scored)

        final_event = {
            "timestamp": now_ts,
            "endpoint": "/api/admin/probe_99",
            "method": "POST",
            "status_code": 401,
            "latency_ms": 22.0,
            "ip": test_ip,
            "project_id": self.proj_a["id"],
        }
        scored = detection.score_event(final_event)

        self.assertIn("brute_force", scored["rule_flags"])
        self.assertIn("endpoint_scan", scored["rule_flags"])
        self.assertEqual(scored["attack_type"], "composite_attack")
        self.assertEqual(scored["severity"], "high")
        self.assertGreaterEqual(scored["confidence"], 0.90)

    # -------------------------------------------------------------
    # 2. Option C: Hybrid Architecture & Project Baseline Tracker
    # -------------------------------------------------------------

    def test_hybrid_isolation_forest_cold_start_and_mature_project(self):
        """Verify baseline tracker handles cold projects and adapts as project accumulates traffic."""
        cold_proj_id = f"proj_cold_{uuid.uuid4().hex[:6]}"
        
        # Cold project (0 events) should be identified as is_cold
        stats_cold = detection.baseline_tracker.get_project_stats(cold_proj_id)
        self.assertTrue(stats_cold["is_cold"])

        # Mature project with higher normal latency (e.g. mean 500ms batch export service)
        mature_proj_id = f"proj_batch_{uuid.uuid4().hex[:6]}"
        for _ in range(60):
            detection.baseline_tracker.record_event(mature_proj_id, 500.0)

        stats_mature = detection.baseline_tracker.get_project_stats(mature_proj_id)
        self.assertFalse(stats_mature["is_cold"])
        self.assertAlmostEqual(stats_mature["mean_latency"], 500.0, delta=1.0)

        # In this mature batch project, a 510ms request is NORMAL (not an anomaly)
        z_score_normal = detection.baseline_tracker.compute_project_z_score(mature_proj_id, 510.0)
        self.assertLess(z_score_normal, 2.0)

        # In contrast, an extreme 3500ms request is anomalous relative to this project's baseline
        z_score_outlier = detection.baseline_tracker.compute_project_z_score(mature_proj_id, 3500.0)
        self.assertGreater(z_score_outlier, 5.0)

    # -------------------------------------------------------------
    # 3. Multi-Tenant Project Isolation
    # -------------------------------------------------------------

    def test_strict_cross_project_isolation(self):
        """Verify that an attack in Project A does NOT taint Project B's history or detection."""
        shared_ip = "198.51.100.55"
        now_ts = time.time()

        # Seed brute force failed logins in Project A ONLY
        for i in range(8):
            evt_a = {
                "timestamp": now_ts - (10 - i),
                "endpoint": "/api/login",
                "method": "POST",
                "status_code": 401,
                "latency_ms": 20.0,
                "ip": shared_ip,
                "project_id": self.proj_a["id"],
                "tenant_id": self.proj_a["id"],
            }
            scored_a = detection.score_event(evt_a)
            db.insert_event(scored_a)

        # A request from the same IP to Project B must see ZERO history from Project A
        evt_b = {
            "timestamp": now_ts,
            "endpoint": "/api/data",
            "method": "GET",
            "status_code": 200,
            "latency_ms": 20.0,
            "ip": shared_ip,
            "project_id": self.proj_b["id"],
            "tenant_id": self.proj_b["id"],
        }
        scored_b = detection.score_event(evt_b)

        # Project B event MUST be clean (low severity, no brute force, attack_type='normal')
        self.assertEqual(scored_b["rule_flags"], [])
        self.assertEqual(scored_b["attack_type"], "normal")
        self.assertEqual(scored_b["severity"], "low")
        self.assertEqual(scored_b["affected_project"], self.proj_b["id"])

    # -------------------------------------------------------------
    # 4. Project-Scoped Auto-blocking
    # -------------------------------------------------------------

    def test_project_scoped_ip_autoblocking(self):
        """Verify that auto-blocking in Project A never blocks the same IP in Project B."""
        attacker_ip = "198.51.100.77"

        # Drive 55 requests in Project A to trigger auto-block (threshold: 50)
        status_a = None
        for _ in range(55):
            status_a = rate_limiter.record_request(attacker_ip, project_id=self.proj_a["id"])

        self.assertTrue(status_a["blocked"])
        self.assertTrue(rate_limiter.is_blocked(attacker_ip, project_id=self.proj_a["id"]))

        # But in Project B, this IP must NOT be blocked!
        self.assertFalse(rate_limiter.is_blocked(attacker_ip, project_id=self.proj_b["id"]))
        status_b = rate_limiter.record_request(attacker_ip, project_id=self.proj_b["id"])
        self.assertFalse(status_b["blocked"])

    # -------------------------------------------------------------
    # 5. Alert Deduplication & Cooldown
    # -------------------------------------------------------------

    def test_alert_cooldown_and_suppression(self):
        """Verify that continuous attack alerts are deduplicated during the cooldown period."""
        attacker_ip = "198.51.100.88"
        now_ts = time.time()

        # Seed brute force history
        for i in range(6):
            evt = {
                "timestamp": now_ts - 20 + i,
                "endpoint": "/api/auth/login",
                "method": "POST",
                "status_code": 401,
                "latency_ms": 25.0,
                "ip": attacker_ip,
                "project_id": self.proj_a["id"],
                "tenant_id": self.proj_a["id"],
            }
            db.insert_event(detection.score_event(evt))

        # First alert event should NOT be suppressed
        first_alert = {
            "timestamp": now_ts,
            "endpoint": "/api/auth/login",
            "method": "POST",
            "status_code": 401,
            "latency_ms": 25.0,
            "ip": attacker_ip,
            "project_id": self.proj_a["id"],
        }
        scored_first = detection.score_event(first_alert)
        self.assertIn(scored_first["severity"], ("medium", "high"))
        self.assertFalse(scored_first["alert_suppressed"])
        self.assertIsNone(scored_first["suppression_reason"])

        # Second alert event 5 seconds later MUST be suppressed to prevent alert storms
        second_alert = {
            "timestamp": now_ts + 5,
            "endpoint": "/api/auth/login",
            "method": "POST",
            "status_code": 401,
            "latency_ms": 25.0,
            "ip": attacker_ip,
            "project_id": self.proj_a["id"],
        }
        scored_second = detection.score_event(second_alert)
        self.assertTrue(scored_second["alert_suppressed"])
        self.assertEqual(scored_second["suppression_reason"], "cooldown_active")

    # -------------------------------------------------------------
    # 6. Detection Schema Retention in Ingest Pipeline
    # -------------------------------------------------------------

    def test_detection_retention_schema_via_ingest(self):
        """Verify that every ingested event retains all required detection attributes."""
        payload = {
            "event_id": f"evt_test_{uuid.uuid4().hex[:8]}",
            "timestamp": time.time(),
            "method": "GET",
            "endpoint": "/api/v1/customers",
            "status_code": 200,
            "latency_ms": 42.5,
            "client_ip": "203.0.113.15",
            "user_agent": "PythonSDK/1.0",
        }

        resp = self.client.post(
            "/ingest",
            headers={"Authorization": f"Bearer {self.key_a}"},
            data=json.dumps(payload),
            content_type="application/json"
        )
        self.assertEqual(resp.status_code, 201)
        data = resp.get_json()

        # Verify all mandatory retention fields
        self.assertEqual(data["project_id"], self.proj_a["id"])
        self.assertEqual(data["organization_id"], self.org_a["id"])
        self.assertEqual(data["affected_project"], self.proj_a["id"])
        self.assertEqual(data["affected_endpoint"], "/api/v1/customers")
        self.assertEqual(data["source_ip"], "203.0.113.15")
        self.assertIn("severity", data)
        self.assertIn("risk_score", data)
        self.assertIn("confidence", data)
        self.assertIn("attack_type", data)
        self.assertIn("detection_timestamp", data)
        self.assertIn("alert_suppressed", data)

        # Verify database record matches
        db_event = db.get_event_by_id(data["id"])
        self.assertIsNotNone(db_event)
        self.assertEqual(db_event["project_id"], self.proj_a["id"])
        self.assertEqual(db_event["organization_id"], self.org_a["id"])
        self.assertEqual(db_event["affected_project"], self.proj_a["id"])

    # -------------------------------------------------------------
    # 7. Fault Tolerance against External Dependencies
    # -------------------------------------------------------------

    @patch("server.webhook.send_alert")
    @patch("server.socketio.emit")
    def test_fault_tolerance_webhook_and_socket_failures(self, mock_socket_emit, mock_send_alert):
        """Verify that failing webhooks or disconnected WebSockets never crash or block ingestion."""
        mock_socket_emit.side_effect = RuntimeError("WebSocket connection dropped")
        mock_send_alert.side_effect = TimeoutError("Slack webhook timed out")

        # Configure webhook for project A
        db.set_webhook_config(self.proj_a["id"], webhook_url="https://hooks.slack.com/services/T00/B00/X00", enabled=1)

        payload = {
            "timestamp": time.time(),
            "method": "POST",
            "endpoint": "/api/v1/sensitive",
            "status_code": 401,
            "latency_ms": 30.0,
            "client_ip": "198.51.100.99",
        }

        # Send request through /ingest
        resp = self.client.post(
            "/ingest",
            headers={"Authorization": f"Bearer {self.key_a}"},
            data=json.dumps(payload),
            content_type="application/json"
        )

        # Ingestion MUST succeed with 201 despite external failures
        self.assertEqual(resp.status_code, 201)
        data = resp.get_json()
        self.assertEqual(data["project_id"], self.proj_a["id"])

    # -------------------------------------------------------------
    # 8. Realistic Traffic & False-Positive Verification
    # -------------------------------------------------------------

    def test_realistic_normal_traffic_stays_low_risk(self):
        """
        Verify that realistic, typical API traffic produces low severity, normal attack type,
        and does not falsely flag legitimate operations.
        (Note: Statistical anomaly detection is probabilistic; this verifies safe operational baselines).
        """
        normal_endpoints = ["/api/v1/products", "/api/v1/users/me", "/api/v1/orders", "/api/v1/health"]
        now_ts = time.time()

        for i in range(25):
            endpoint = normal_endpoints[i % len(normal_endpoints)]
            latency = 20.0 + (i % 5) * 5.0  # 20ms - 40ms healthy latency
            client_ip = f"10.0.1.{10 + (i % 3)}"

            payload = {
                "timestamp": now_ts + i,
                "method": "GET",
                "endpoint": endpoint,
                "status_code": 200,
                "latency_ms": latency,
                "client_ip": client_ip,
            }

            resp = self.client.post(
                "/ingest",
                headers={"Authorization": f"Bearer {self.key_a}"},
                data=json.dumps(payload),
                content_type="application/json"
            )
            self.assertEqual(resp.status_code, 201)
            scored = resp.get_json()

            # Every normal request must be classified as normal / low severity
            self.assertEqual(scored["severity"], "low", f"Failed on request {i}")
            self.assertEqual(scored["attack_type"], "normal")
            self.assertLessEqual(scored["risk_score"], 25.0)
            self.assertFalse(scored["alert_suppressed"])


if __name__ == "__main__":
    unittest.main()

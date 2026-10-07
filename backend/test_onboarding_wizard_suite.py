"""
Test Suite for Guided Developer Onboarding Wizard
Verifies:
1. Project creation automatically provisions onboarding state in DB.
2. GET /api/projects/<id>/onboarding returns steps, masked API key, collector URL, telemetry status.
3. POST /api/projects/<id>/onboarding updates framework, active step, and completed steps.
4. POST /api/projects/<id>/onboarding/test-event generates live verification telemetry.
5. Telemetry ingestion automatically detects first event and marks onboarding complete.
6. Server-side multi-tenant isolation ensures tenants cannot access or alter other tenants' onboarding.
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


class TestOnboardingWizardSuite(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        app.config["TESTING"] = True
        app.config["WTF_CSRF_ENABLED"] = False
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
        # Register User A
        self.user_a_info = self._register_user("alice")
        self.user_a_email = self.user_a_info["email"]
        self.proj_a = self.user_a_info["project"]
        self.key_a = {"raw_key": self.user_a_info["api_key"]}

        # Register User B
        self.user_b_info = self._register_user("bob")
        self.user_b_email = self.user_b_info["email"]
        self.proj_b = self.user_b_info["project"]
        self.key_b = {"raw_key": self.user_b_info["api_key"]}
        self._logout()

    def _login(self, email, password="SecurePassword123!"):
        res = self.client.post("/api/auth/login", json={"email": email, "password": password})
        self.assertEqual(res.status_code, 200)

    def _logout(self):
        self.client.post("/api/auth/logout")

    def test_onboarding_auto_provision_and_retrieval(self):
        """Verify project creation automatically creates onboarding record in DB and GET returns state."""
        self._login(self.user_a_email)

        res = self.client.get(f"/api/projects/{self.proj_a['id']}/onboarding")
        self.assertEqual(res.status_code, 200)
        data = res.get_json()

        self.assertIn("onboarding", data)
        ob = data["onboarding"]
        self.assertEqual(ob["project_id"], self.proj_a["id"])
        self.assertEqual(ob["framework"], "flask")
        self.assertEqual(ob["current_step"], 1)
        self.assertFalse(data["telemetry_received"])
        self.assertTrue(data["key_prefix"].startswith("ask_") or data["key_prefix"].startswith("sec_live_"))
        self.assertIn("/ingest", data["collector_url"])

        self._logout()

    def test_onboarding_step_and_framework_updates(self):
        """Verify updating onboarding step, completed steps, and framework."""
        self._login(self.user_a_email)

        # Update step to 3, framework to fastapi, and mark step 2 as completed
        res = self.client.post(f"/api/projects/{self.proj_a['id']}/onboarding", json={
            "current_step": 3,
            "completed_step": 2,
            "framework": "fastapi"
        })
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        ob = data["onboarding"]

        self.assertEqual(ob["current_step"], 3)
        self.assertEqual(ob["framework"], "fastapi")
        self.assertIn(2, ob["completed_steps"])

        # Fetch again to verify persistence in DB
        res_get = self.client.get(f"/api/projects/{self.proj_a['id']}/onboarding")
        data_get = res_get.get_json()
        self.assertEqual(data_get["onboarding"]["current_step"], 3)
        self.assertEqual(data_get["onboarding"]["framework"], "fastapi")
        self.assertIn(2, data_get["onboarding"]["completed_steps"])

        self._logout()

    def test_send_onboarding_test_event(self):
        """Verify emitting live verification event via test-event route."""
        self._login(self.user_a_email)

        res = self.client.post(f"/api/projects/{self.proj_a['id']}/onboarding/test-event")
        self.assertEqual(res.status_code, 201)
        data = res.get_json()
        self.assertTrue(data["success"])
        self.assertEqual(data["event"]["project_id"], self.proj_a["id"])

        # Check onboarding endpoint reports telemetry received and completed
        res_ob = self.client.get(f"/api/projects/{self.proj_a['id']}/onboarding")
        data_ob = res_ob.get_json()
        self.assertTrue(data_ob["telemetry_received"])
        self.assertIsNotNone(data_ob["first_telemetry_at"])
        self.assertIn(7, data_ob["onboarding"]["completed_steps"])
        self.assertEqual(data_ob["onboarding"]["status"], "completed")

        self._logout()

    def test_telemetry_ingest_auto_completes_onboarding(self):
        """Verify that normal SDK telemetry ingestion automatically updates onboarding state."""
        # Check initial state: no telemetry
        ob_initial = db.get_or_create_onboarding(self.proj_b["id"])
        self.assertIsNone(ob_initial.get("first_telemetry_at"))

        # Send telemetry via /ingest with project B's API key
        raw_key = self.key_b["raw_key"]
        event_payload = {
            "timestamp": time.time(),
            "endpoint": "/api/v1/charge",
            "method": "POST",
            "status_code": 200,
            "latency_ms": 25.4,
            "ip": "198.51.100.12",
            "payload_size": 256
        }
        res_ingest = self.client.post(
            "/ingest",
            headers={"Authorization": f"Bearer {raw_key}"},
            json=event_payload
        )
        self.assertEqual(res_ingest.status_code, 201)

        # Login Bob and verify onboarding is marked complete
        self._login(self.user_b_email)
        res_ob = self.client.get(f"/api/projects/{self.proj_b['id']}/onboarding")
        self.assertEqual(res_ob.status_code, 200)
        data_ob = res_ob.get_json()
        self.assertTrue(data_ob["telemetry_received"])
        self.assertIsNotNone(data_ob["first_telemetry_at"])
        self.assertIn(7, data_ob["onboarding"]["completed_steps"])

        self._logout()

    def test_tenant_isolation_onboarding(self):
        """Verify cross-tenant security: User A cannot read, update, or emit test events for User B's project."""
        self._login(self.user_a_email)

        # User A attempting to view User B's onboarding
        res_get = self.client.get(f"/api/projects/{self.proj_b['id']}/onboarding")
        self.assertEqual(res_get.status_code, 403)

        # User A attempting to update User B's onboarding
        res_post = self.client.post(f"/api/projects/{self.proj_b['id']}/onboarding", json={"current_step": 7})
        self.assertEqual(res_post.status_code, 403)

        # User A attempting to emit a test event into User B's project
        res_test = self.client.post(f"/api/projects/{self.proj_b['id']}/onboarding/test-event")
        self.assertEqual(res_test.status_code, 403)

        self._logout()


if __name__ == "__main__":
    unittest.main()

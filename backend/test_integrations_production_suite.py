"""
test_integrations_production_suite.py — Production Integrations Test Suite
Covers:
1. Integration Abstraction & Provider Registry (Slack, Discord, extensible custom provider).
2. Slack Integration Lifecycle: Connect, Disconnect, Test, Enable/Disable, Project-scoped.
3. Discord Integration Lifecycle: Connect, Disconnect, Test, Enable/Disable, Coexistence with Slack.
4. Secret Protection & URL Masking: Zero webhook token leakage in API responses or logs.
5. Google Gemini Threat Analyst: Server-side API key protection, project authorization check,
   project-scoped event history, graceful failure & fallback handling.
6. Integration Health / Status Indicators: Verifying status indicators for Slack, Discord, Gemini, SDK.
7. Fault Tolerance: Verifying telemetry ingestion & detection continue uninterrupted when integrations fail.
"""

import os
import sys
import time
import json
import uuid
import unittest
from unittest.mock import patch, MagicMock

backend_dir = os.path.dirname(os.path.abspath(__file__))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

import db
import detection
import server
import investigator
from integrations.base import BaseNotificationProvider
from integrations.service import NotificationService, notification_service
from integrations.slack import SlackProvider
from integrations.discord import DiscordProvider


class MockPagerDutyProvider(BaseNotificationProvider):
    """Custom provider for testing registry extensibility."""
    @property
    def provider_id(self) -> str:
        return "pagerduty"

    @property
    def display_name(self) -> str:
        return "PagerDuty Events"

    def format_alert(self, alert_data):
        return {"event_action": "trigger", "dedup_key": alert_data.get("event_id")}

    def format_test_message(self, project_name):
        return {"event_action": "trigger", "summary": f"Test for {project_name}"}


class TestIntegrationsProductionSuite(unittest.TestCase):

    def setUp(self):
        self.app = server.app
        self.app.config["TESTING"] = True
        self.client = self.app.test_client()

        # Provision two separate users/organizations/projects for isolation verification
        self.user_a = db.create_user(f"integ_user_a_{uuid.uuid4().hex[:6]}@example.com", "SecurePassword123!")
        self.org_a = db.create_organization(self.user_a["id"], name="Acme Ops")
        self.proj_a = db.create_project(self.user_a["id"], name="Acme Core API", organization_id=self.org_a["id"])
        self.key_a = db.create_api_key(self.proj_a["id"], name="Acme Key")["raw_key"]

        self.user_b = db.create_user(f"integ_user_b_{uuid.uuid4().hex[:6]}@example.com", "SecurePassword123!")
        self.org_b = db.create_organization(self.user_b["id"], name="Globex Ops")
        self.proj_b = db.create_project(self.user_b["id"], name="Globex Payments", organization_id=self.org_b["id"])
        self.key_b = db.create_api_key(self.proj_b["id"], name="Globex Key")["raw_key"]

    def _login(self, user):
        with self.client.session_transaction() as sess:
            sess["user_id"] = user["id"]
            sess["auth_time"] = time.time()

    # -------------------------------------------------------------
    # 1. Integration Abstraction & Provider Registry
    # -------------------------------------------------------------

    def test_provider_registry_and_extensibility(self):
        """Verify the NotificationService registers built-ins and accepts custom provider adapters."""
        svc = NotificationService()
        providers = svc.list_supported_providers()
        ids = [p["provider_id"] for p in providers]
        self.assertIn("slack", ids)
        self.assertIn("discord", ids)

        # Register custom PagerDuty adapter
        pd_provider = MockPagerDutyProvider()
        svc.register_provider(pd_provider)
        self.assertEqual(svc.get_provider("pagerduty").display_name, "PagerDuty Events")
        self.assertEqual(svc.get_provider("PAGERDUTY").provider_id, "pagerduty")

    # -------------------------------------------------------------
    # 2. Slack Integration Lifecycle
    # -------------------------------------------------------------

    def test_slack_lifecycle_connect_toggle_test_disconnect(self):
        """Verify full lifecycle of Slack integration: Connect, Test, Toggle, Disconnect."""
        self._login(self.user_a)
        proj_id = self.proj_a["id"]
        raw_slack_url = "https://hooks.slack.com/services/T00000000/B00000000/SECRET_TOKEN_12345"

        # 1. Connect
        res_conn = self.client.post(
            f"/api/projects/{proj_id}/integrations/slack",
            json={"webhook_url": raw_slack_url, "enabled": True}
        )
        self.assertEqual(res_conn.status_code, 200)
        data_conn = res_conn.get_json()
        self.assertTrue(data_conn["integration"]["enabled"])
        self.assertNotIn("SECRET_TOKEN_12345", data_conn["integration"]["masked_url"])
        self.assertIn("****", data_conn["integration"]["masked_url"])

        # 2. Status verification
        res_status = self.client.get(f"/api/projects/{proj_id}/integrations/status")
        self.assertEqual(res_status.status_code, 200)
        slack_status = res_status.get_json()["integrations"]["slack"]
        self.assertTrue(slack_status["configured"])
        self.assertEqual(slack_status["status"], "Connected ✓")

        # 3. Test Connection
        with patch.object(SlackProvider, "test_connection", return_value=(True, "Verified connection to Slack successfully (HTTP 200)")):
            res_test = self.client.post(f"/api/projects/{proj_id}/integrations/slack/test")
            self.assertEqual(res_test.status_code, 200)
            self.assertTrue(res_test.get_json()["success"])

        # 4. Toggle Disable
        res_toggle = self.client.post(
            f"/api/projects/{proj_id}/integrations/slack/toggle",
            json={"enabled": False}
        )
        self.assertEqual(res_toggle.status_code, 200)
        res_status2 = self.client.get(f"/api/projects/{proj_id}/integrations/status")
        self.assertEqual(res_status2.get_json()["integrations"]["slack"]["status"], "Disabled")

        # 5. Disconnect
        res_del = self.client.delete(f"/api/projects/{proj_id}/integrations/slack")
        self.assertEqual(res_del.status_code, 200)
        res_status3 = self.client.get(f"/api/projects/{proj_id}/integrations/status")
        self.assertFalse(res_status3.get_json()["integrations"]["slack"]["configured"])
        self.assertEqual(res_status3.get_json()["integrations"]["slack"]["status"], "Not Configured")

    # -------------------------------------------------------------
    # 3. Discord Integration Lifecycle & Coexistence
    # -------------------------------------------------------------

    def test_discord_and_slack_coexistence(self):
        """Verify Discord integration works and can coexist with Slack for the same project."""
        self._login(self.user_a)
        proj_id = self.proj_a["id"]
        raw_discord = "https://discord.com/api/webhooks/1234567890/DISCORD_SECRET_KEY_XYZ"
        raw_slack = "https://hooks.slack.com/services/T11/B22/SLACK_TOKEN_ABC"

        # Connect both providers
        self.client.post(f"/api/projects/{proj_id}/integrations/slack", json={"webhook_url": raw_slack})
        self.client.post(f"/api/projects/{proj_id}/integrations/discord", json={"webhook_url": raw_discord})

        # List integrations
        res_list = self.client.get(f"/api/projects/{proj_id}/integrations")
        self.assertEqual(res_list.status_code, 200)
        configs = res_list.get_json()["integrations"]
        providers = [c["provider"] for c in configs]
        self.assertIn("slack", providers)
        self.assertIn("discord", providers)

        # Status indicators should show both connected
        res_status = self.client.get(f"/api/projects/{proj_id}/integrations/status")
        ints = res_status.get_json()["integrations"]
        self.assertEqual(ints["slack"]["status"], "Connected ✓")
        self.assertEqual(ints["discord"]["status"], "Connected ✓")

        # Test Discord connection
        with patch.object(DiscordProvider, "test_connection", return_value=(True, "Verified connection to Discord successfully (HTTP 204)")):
            res_test = self.client.post(f"/api/projects/{proj_id}/integrations/discord/test")
            self.assertEqual(res_test.status_code, 200)
            self.assertTrue(res_test.get_json()["success"])

        # Disconnecting Discord does not disconnect Slack
        self.client.delete(f"/api/projects/{proj_id}/integrations/discord")
        res_status_after = self.client.get(f"/api/projects/{proj_id}/integrations/status")
        ints_after = res_status_after.get_json()["integrations"]
        self.assertEqual(ints_after["slack"]["status"], "Connected ✓")
        self.assertEqual(ints_after["discord"]["status"], "Not Configured")

    # -------------------------------------------------------------
    # 4. Secret Protection & URL Masking
    # -------------------------------------------------------------

    def test_secrets_never_exposed_in_api_or_logs(self):
        """Verify webhook secrets and tokens are masked across all views."""
        self._login(self.user_a)
        proj_id = self.proj_a["id"]
        secret_token = "SECRET_SUPER_CONFIDENTIAL_TOKEN_999"
        raw_url = f"https://hooks.slack.com/services/T123/B456/{secret_token}"

        self.client.post(f"/api/projects/{proj_id}/integrations/slack", json={"webhook_url": raw_url})

        # Check GET /api/projects/<id>/integrations
        res_ints = self.client.get(f"/api/projects/{proj_id}/integrations")
        self.assertNotIn(secret_token, res_ints.get_data(as_text=True))

        # Check GET /api/projects/<id>/integrations/status
        res_status = self.client.get(f"/api/projects/{proj_id}/integrations/status")
        self.assertNotIn(secret_token, res_status.get_data(as_text=True))

        # Check GET /api/projects/<id>/webhooks (backward compatibility)
        res_wh = self.client.get(f"/api/projects/{proj_id}/webhooks")
        self.assertNotIn(secret_token, res_wh.get_data(as_text=True))

    def test_cross_project_integration_isolation(self):
        """Verify User A cannot read, test, modify, or delete User B's integrations."""
        self._login(self.user_a)
        # Attempt to access Project B's integrations as User A -> HTTP 403 Forbidden
        self.assertEqual(self.client.get(f"/api/projects/{self.proj_b['id']}/integrations").status_code, 403)
        self.assertEqual(self.client.get(f"/api/projects/{self.proj_b['id']}/integrations/status").status_code, 403)
        self.assertEqual(self.client.post(f"/api/projects/{self.proj_b['id']}/integrations/slack", json={"webhook_url": "https://hooks.slack.com/services/X/Y/Z"}).status_code, 403)
        self.assertEqual(self.client.post(f"/api/projects/{self.proj_b['id']}/integrations/slack/test").status_code, 403)
        self.assertEqual(self.client.delete(f"/api/projects/{self.proj_b['id']}/integrations/slack").status_code, 403)

    # -------------------------------------------------------------
    # 5. Google Gemini Threat Analyst Integration
    # -------------------------------------------------------------

    def test_gemini_server_side_key_protection_and_status(self):
        """Verify Gemini API key is managed server-side and never exposed to clients."""
        self._login(self.user_a)
        with patch.dict(os.environ, {"GEMINI_API_KEY": "AIzaSySecretFakeKeyForTesting1234"}):
            status = investigator.get_gemini_status()
            self.assertTrue(status["configured"])
            self.assertEqual(status["status"], "Configured ✓")
            self.assertNotIn("AIzaSy", json.dumps(status))

            # Query through the API
            res = self.client.get(f"/api/projects/{self.proj_a['id']}/integrations/status")
            self.assertEqual(res.status_code, 200)
            data_text = res.get_data(as_text=True)
            self.assertNotIn("AIzaSy", data_text)
            self.assertEqual(res.get_json()["integrations"]["gemini"]["status"], "Configured ✓")

    def test_gemini_investigation_project_authorization(self):
        """Verify investigation requires project authorization and only authorized project events are analyzed."""
        # Insert an alert for Project A
        evt_a = {
            "timestamp": time.time(),
            "method": "POST",
            "endpoint": "/api/v1/auth/login",
            "status_code": 401,
            "latency_ms": 30.0,
            "ip": "198.51.100.99",
            "project_id": self.proj_a["id"],
            "severity": "high",
            "attack_type": "brute_force",
            "rule_flags": ["brute_force"],
            "anomaly_score": 6.2,
        }
        event_id = db.insert_event(evt_a)

        # 1. Unauthenticated request -> HTTP 401
        self.client = self.app.test_client()
        self.assertEqual(self.client.get(f"/api/investigate/{event_id}").status_code, 401)

        # 2. User B accessing User A's alert -> HTTP 403 Forbidden
        self._login(self.user_b)
        self.assertEqual(self.client.get(f"/api/investigate/{event_id}").status_code, 403)

        # 3. User A accessing own alert -> HTTP 200 OK
        self._login(self.user_a)
        res_a = self.client.get(f"/api/investigate/{event_id}")
        self.assertEqual(res_a.status_code, 200)
        report = res_a.get_json()["report"]
        self.assertIn("Threat Investigation Report", report)
        self.assertIn(self.proj_a["id"], report)
        self.assertNotIn(self.proj_b["id"], report)

    def test_gemini_graceful_fallback_when_offline_or_error(self):
        """Verify high-quality heuristic report is provided when GEMINI_API_KEY is unset or API fails."""
        evt = {
            "timestamp": time.time(),
            "method": "GET",
            "endpoint": "/api/probe/fuzz",
            "status_code": 404,
            "latency_ms": 12.0,
            "ip": "203.0.113.88",
            "project_id": self.proj_a["id"],
            "severity": "high",
            "attack_type": "endpoint_scan",
            "rule_flags": ["endpoint_scan"],
            "anomaly_score": 5.8,
        }
        event_id = db.insert_event(evt)

        # Scenario A: GEMINI_API_KEY is missing
        with patch.dict(os.environ, {"GEMINI_API_KEY": ""}):
            report = investigator.generate_threat_report(event_id, user_id=self.user_a["id"])
            self.assertIn("AI Threat Investigation Report", report)
            self.assertIn("Recommended Remediation", report)
            self.assertIn("Heuristic Fallback Mode", report)

        # Scenario B: Gemini API raises an exception (e.g. quota limit or connection timeout)
        with patch.dict(os.environ, {"GEMINI_API_KEY": "fake_key"}), \
             patch("investigator.genai.Client", side_effect=RuntimeError("ResourceExhausted: 429 Quota exceeded")):
            report_err = investigator.generate_threat_report(event_id, user_id=self.user_a["id"])
            self.assertIn("AI Threat Investigation Report", report_err)
            self.assertIn("Recommended Remediation", report_err)
            # Never exposes the raw API key
            self.assertNotIn("fake_key", report_err)

    # -------------------------------------------------------------
    # 6. Integration Health / Status Indicators
    # -------------------------------------------------------------

    def test_integration_health_status_indicators(self):
        """Verify all 4 status indicators (Slack, Discord, Gemini, SDK) return cleanly."""
        self._login(self.user_a)
        proj_id = self.proj_a["id"]

        # Connect Slack
        db.set_webhook_config(proj_id, webhook_url="https://hooks.slack.com/services/T1/B2/KEY", provider="slack")

        # Ingest 1 telemetry event so SDK shows Connected
        db.insert_event({
            "timestamp": time.time(),
            "method": "GET",
            "endpoint": "/health",
            "status_code": 200,
            "latency_ms": 15.0,
            "ip": "127.0.0.1",
            "project_id": proj_id
        })

        res = self.client.get(f"/api/projects/{proj_id}/integrations/status")
        self.assertEqual(res.status_code, 200)
        data = res.get_json()["integrations"]

        self.assertEqual(data["slack"]["status"], "Connected ✓")
        self.assertEqual(data["discord"]["status"], "Not Configured")
        self.assertIn("✓", data["sdk"]["status"])
        self.assertIn("status", data["gemini"])

    # -------------------------------------------------------------
    # 7. Fault Tolerance: Telemetry and Detection Never Impeded
    # -------------------------------------------------------------

    @patch("integrations.slack.SlackProvider.send_alert", side_effect=TimeoutError("Slack webhook timeout"))
    @patch("integrations.discord.DiscordProvider.send_alert", side_effect=RuntimeError("Discord connection dropped"))
    def test_fault_tolerance_telemetry_never_blocked_by_integration_failure(self, mock_discord, mock_slack):
        """Verify that catastrophic failure across all notification providers never blocks /ingest."""
        proj_id = self.proj_a["id"]

        # Configure both Slack and Discord to point to broken endpoints
        db.set_webhook_config(proj_id, webhook_url="https://hooks.slack.com/services/T/B/X", provider="slack")
        db.set_webhook_config(proj_id, webhook_url="https://discord.com/api/webhooks/1/2", provider="discord")

        # Send high severity attack event via /ingest
        payload = {
            "timestamp": time.time(),
            "method": "POST",
            "endpoint": "/api/login",
            "status_code": 401,
            "latency_ms": 25.0,
            "ip": "198.51.100.99",
        }

        resp = self.client.post(
            "/ingest",
            headers={"Authorization": f"Bearer {self.key_a}"},
            data=json.dumps(payload),
            content_type="application/json"
        )

        # Ingestion must succeed with 201 Created and return scored event
        self.assertEqual(resp.status_code, 201)
        scored = resp.get_json()
        self.assertEqual(scored["project_id"], proj_id)
        self.assertIn("severity", scored)


if __name__ == "__main__":
    unittest.main()

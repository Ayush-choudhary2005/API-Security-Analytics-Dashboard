"""
backend/test_production_tenant_isolation_suite.py

Comprehensive Production Tenant-Isolation & IDOR Attack Verification Suite.
Systematically attempts cross-tenant IDOR attacks against:
1. Projects (read, update, delete)
2. Events (telemetry query, tenant spoofing)
3. Alerts (recent alerts, stats, history, blocked IPs)
4. Webhooks (read, configure, test, toggle, delete)
5. SDK Credentials (keys listing, regeneration, revocation, SDK download)
6. Investigations (AI threat investigation)
7. Threat Reports & PDF (report data, report.pdf)
8. WebSockets (unauthorized room joining, cross-tenant event isolation)
9. Database Dialect & Persistence Abstraction
10. Structured Logging Secret Redaction
"""

import unittest
import json
import time
import uuid
import os
import sys
import re
from unittest.mock import patch

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import server
import db
import database
import migrations
import logging_config


class TestProductionTenantIsolationSuite(unittest.TestCase):

    def setUp(self):
        self.app = server.app
        self.app.config["TESTING"] = True
        self.client = self.app.test_client()

        # ---------------------------------------------------------
        # Provision Tenant A: Alice (Acme Corp)
        # ---------------------------------------------------------
        self.user_a = db.create_user(f"alice_{uuid.uuid4().hex[:6]}@acme.corp", "AliceStrongPass123!")
        self.org_a = db.create_organization(self.user_a["id"], name="Acme Corporation")
        self.proj_a = db.create_project(self.user_a["id"], name="Acme Production API", organization_id=self.org_a["id"])
        self.key_a_obj = db.create_api_key(self.proj_a["id"], name="Acme Primary SDK Key")
        self.key_a_raw = self.key_a_obj["raw_key"]
        self.key_a_id = self.key_a_obj["id"]

        # ---------------------------------------------------------
        # Provision Tenant B: Bob (Globex Corp)
        # ---------------------------------------------------------
        self.user_b = db.create_user(f"bob_{uuid.uuid4().hex[:6]}@globex.corp", "BobStrongPass123!")
        self.org_b = db.create_organization(self.user_b["id"], name="Globex Corporation")
        self.proj_b = db.create_project(self.user_b["id"], name="Globex Payments API", organization_id=self.org_b["id"])
        self.key_b_obj = db.create_api_key(self.proj_b["id"], name="Globex Primary SDK Key")
        self.key_b_raw = self.key_b_obj["raw_key"]
        self.key_b_id = self.key_b_obj["id"]

        # Insert Alice's sample anomalous event & alert
        self.alert_a_id = db.insert_event({
            "timestamp": time.time(),
            "method": "POST",
            "endpoint": "/api/v1/auth/login",
            "status_code": 401,
            "latency_ms": 32.5,
            "ip": "198.51.100.44",
            "project_id": self.proj_a["id"],
            "severity": "high",
            "attack_type": "brute_force",
            "rule_flags": ["brute_force"],
            "anomaly_score": 7.4
        })

        # Insert Alice's Slack webhook
        self.alice_secret_token = "T0123/B0456/SecretAliceTokenXYZ"
        self.alice_slack_url = f"https://hooks.slack.com/services/{self.alice_secret_token}"
        db.set_webhook_config(self.proj_a["id"], webhook_url=self.alice_slack_url, provider="slack")

    def _login(self, user: dict):
        """Set active authenticated user session."""
        with self.client.session_transaction() as sess:
            sess["user_id"] = user["id"]
            sess["auth_time"] = time.time()

    def _logout(self):
        """Reset client session to unauthenticated state."""
        self.client = self.app.test_client()

    # -------------------------------------------------------------
    # 1. Projects IDOR Attacks
    # -------------------------------------------------------------

    def test_idor_projects(self):
        """Bob must be forbidden from reading or deleting Alice's project."""
        proj_a_id = self.proj_a["id"]

        # 1. Unauthenticated -> 401
        self._logout()
        self.assertEqual(self.client.get(f"/api/projects/{proj_a_id}").status_code, 401)
        self.assertEqual(self.client.delete(f"/api/projects/{proj_a_id}").status_code, 401)

        # 2. Authenticated as Bob -> 403 Forbidden
        self._login(self.user_b)
        res_get = self.client.get(f"/api/projects/{proj_a_id}")
        self.assertEqual(res_get.status_code, 403)
        self.assertIn("Forbidden", res_get.get_json()["error"])

        res_del = self.client.delete(f"/api/projects/{proj_a_id}")
        self.assertEqual(res_del.status_code, 403)

        # 3. Authenticated as Alice -> 200 OK
        self._login(self.user_a)
        res_alice = self.client.get(f"/api/projects/{proj_a_id}")
        self.assertEqual(res_alice.status_code, 200)
        self.assertEqual(res_alice.get_json()["project"]["id"], proj_a_id)

    # -------------------------------------------------------------
    # 2. Events IDOR Attacks & Telemetry Tenant Pinning
    # -------------------------------------------------------------

    def test_idor_events_and_telemetry_pinning(self):
        """Bob cannot query Alice's telemetry, and cannot spoof project_id via Key B."""
        proj_a_id = self.proj_a["id"]
        proj_b_id = self.proj_b["id"]

        # 1. Bob queries Alice's events -> 403 Forbidden
        self._login(self.user_b)
        self.assertEqual(self.client.get(f"/events/recent?project_id={proj_a_id}").status_code, 403)
        self.assertEqual(self.client.get(f"/events/recent?tenant_id={proj_a_id}").status_code, 403)

        # 2. Unauthenticated -> 401
        self._logout()
        self.assertEqual(self.client.get(f"/events/recent?project_id={proj_a_id}").status_code, 401)

        # 3. Malicious Tenant Spoofing Attack: Bob uses Key B, but specifies project_id = Alice's project
        ingest_payload = {
            "endpoint": "/api/v1/sensitive-data",
            "method": "POST",
            "status_code": 200,
            "latency_ms": 14.0,
            "ip": "203.0.113.195",
            "project_id": proj_a_id  # MALICIOUS SPOOF ATTEMPT
        }
        res_spoof = self.client.post(
            "/ingest",
            headers={"Authorization": f"Bearer {self.key_b_raw}"},
            data=json.dumps(ingest_payload),
            content_type="application/json"
        )
        self.assertEqual(res_spoof.status_code, 201)
        scored_evt = res_spoof.get_json()

        # Telemetry collector MUST pin event strictly to Key B's project, completely ignoring body spoof
        self.assertEqual(scored_evt["project_id"], proj_b_id)
        self.assertNotEqual(scored_evt["project_id"], proj_a_id)

    # -------------------------------------------------------------
    # 3. Alerts IDOR Attacks
    # -------------------------------------------------------------

    def test_idor_alerts_and_stats(self):
        """Bob cannot query Alice's alerts, attack statistics, history, or blocked IPs."""
        proj_a_id = self.proj_a["id"]

        self._login(self.user_b)
        self.assertEqual(self.client.get(f"/alerts/recent?project_id={proj_a_id}").status_code, 403)
        self.assertEqual(self.client.get(f"/alerts/stats?project_id={proj_a_id}").status_code, 403)
        self.assertEqual(self.client.get(f"/history?project_id={proj_a_id}").status_code, 403)
        self.assertEqual(self.client.get(f"/blocked-ips?project_id={proj_a_id}").status_code, 403)

        # Unauthenticated -> 401
        self._logout()
        self.assertEqual(self.client.get(f"/alerts/recent?project_id={proj_a_id}").status_code, 401)

    # -------------------------------------------------------------
    # 4. Webhooks & Integrations IDOR Attacks
    # -------------------------------------------------------------

    def test_idor_webhooks_and_integrations(self):
        """Bob cannot view, test, modify, toggle, or delete Alice's webhooks."""
        proj_a_id = self.proj_a["id"]

        self._login(self.user_b)
        # Reading webhooks
        self.assertEqual(self.client.get(f"/api/projects/{proj_a_id}/webhooks").status_code, 403)
        self.assertEqual(self.client.get(f"/api/projects/{proj_a_id}/integrations").status_code, 403)
        self.assertEqual(self.client.get(f"/api/projects/{proj_a_id}/integrations/status").status_code, 403)

        # Tampering with webhooks
        tamper_payload = {"webhook_url": "https://hooks.slack.com/services/EVIL/HACK/TOKEN"}
        self.assertEqual(self.client.post(f"/api/projects/{proj_a_id}/webhooks", json=tamper_payload).status_code, 403)
        self.assertEqual(self.client.post(f"/api/projects/{proj_a_id}/integrations/slack", json=tamper_payload).status_code, 403)

        # Triggering test dispatches
        self.assertEqual(self.client.post(f"/api/projects/{proj_a_id}/webhooks/test").status_code, 403)
        self.assertEqual(self.client.post(f"/api/projects/{proj_a_id}/integrations/slack/test").status_code, 403)

        # Deleting webhooks
        self.assertEqual(self.client.delete(f"/api/projects/{proj_a_id}/webhooks").status_code, 403)
        self.assertEqual(self.client.delete(f"/api/projects/{proj_a_id}/integrations/slack").status_code, 403)

    # -------------------------------------------------------------
    # 5. SDK Credentials IDOR Attacks
    # -------------------------------------------------------------

    def test_idor_sdk_credentials(self):
        """Bob cannot view, regenerate, revoke Alice's API keys or download Alice's SDK."""
        proj_a_id = self.proj_a["id"]

        self._login(self.user_b)
        self.assertEqual(self.client.get(f"/api/projects/{proj_a_id}/keys").status_code, 403)
        self.assertEqual(self.client.get(f"/api/projects/{proj_a_id}/credentials").status_code, 403)
        self.assertEqual(self.client.post(f"/api/projects/{proj_a_id}/keys/regenerate").status_code, 403)
        self.assertEqual(self.client.post(f"/api/projects/{proj_a_id}/keys/{self.key_a_id}/revoke").status_code, 403)
        self.assertEqual(self.client.get(f"/api/projects/{proj_a_id}/sdk/download").status_code, 403)

        # Unauthenticated -> 401
        self._logout()
        self.assertEqual(self.client.get(f"/api/projects/{proj_a_id}/keys").status_code, 401)

    # -------------------------------------------------------------
    # 6. AI Threat Investigations IDOR Attacks
    # -------------------------------------------------------------

    def test_idor_ai_investigations(self):
        """Bob cannot trigger AI investigation into Alice's security incident."""
        alert_id = self.alert_a_id

        # 1. Unauthenticated -> 401
        self._logout()
        self.assertEqual(self.client.get(f"/api/investigate/{alert_id}").status_code, 401)

        # 2. Bob -> 403 Forbidden
        self._login(self.user_b)
        res_bob = self.client.get(f"/api/investigate/{alert_id}")
        self.assertEqual(res_bob.status_code, 403)

        # 3. Alice -> 200 OK
        self._login(self.user_a)
        res_alice = self.client.get(f"/api/investigate/{alert_id}")
        self.assertEqual(res_alice.status_code, 200)
        report = res_alice.get_json()["report"]
        self.assertIn(self.proj_a["id"], report)
        self.assertNotIn(self.proj_b["id"], report)

    # -------------------------------------------------------------
    # 7. Threat Reports & PDF Export IDOR Attacks
    # -------------------------------------------------------------

    def test_idor_threat_reports_and_pdf(self):
        """Bob cannot download or view executive threat reports / PDF exports of Alice's alerts."""
        alert_id = self.alert_a_id

        # 1. Unauthenticated -> 401
        self._logout()
        self.assertEqual(self.client.get(f"/api/alerts/{alert_id}/report").status_code, 401)
        self.assertEqual(self.client.get(f"/api/alerts/{alert_id}/report.pdf").status_code, 401)

        # 2. Bob -> 403 Forbidden
        self._login(self.user_b)
        self.assertEqual(self.client.get(f"/api/alerts/{alert_id}/report").status_code, 403)
        self.assertEqual(self.client.get(f"/api/alerts/{alert_id}/report.pdf").status_code, 403)

        # 3. Alice -> 200 OK
        self._login(self.user_a)
        res_rep = self.client.get(f"/api/alerts/{alert_id}/report")
        self.assertEqual(res_rep.status_code, 200)
        self.assertIn("report", res_rep.get_json())

    # -------------------------------------------------------------
    # 8. WebSockets Cross-Tenant Room Isolation
    # -------------------------------------------------------------

    def test_idor_websockets(self):
        """Unauthorized WebSocket room joins are rejected, preventing live event leakage."""
        socket_client_b = server.socketio.test_client(self.app)

        # 1. Unauthenticated socket attempting to join Alice's private project room
        socket_client_b.emit('join_project', {'project_id': self.proj_a["id"]})
        recv_unauth = socket_client_b.get_received()
        error_msgs = [m['args'][0]['message'] for m in recv_unauth if m['name'] == 'error']
        self.assertIn('Unauthenticated WebSocket connection', error_msgs)

        # 2. Authenticated as Bob attempting to join Alice's private project room
        with self.client.session_transaction() as sess:
            sess["user_id"] = self.user_b["id"]
        
        # Test client with session
        socket_client_bob = server.socketio.test_client(self.app, flask_test_client=self.client)
        socket_client_bob.emit('join_project', {'project_id': self.proj_a["id"]})
        recv_bob = socket_client_bob.get_received()
        error_bob_msgs = [m['args'][0]['message'] for m in recv_bob if m['name'] == 'error']
        self.assertIn('Forbidden: you do not own this project', error_bob_msgs)

    # -------------------------------------------------------------
    # 9. Persistence Layer & Dialect Abstraction Verification
    # -------------------------------------------------------------

    def test_database_persistence_and_dialect_adapter(self):
        """Verify unified connection wrapper, transactions, and parameter translation."""
        # 1. Health check
        healthy, msg = database.check_database_health()
        self.assertTrue(healthy)
        self.assertIn("healthy", msg)

        unique_suffix = uuid.uuid4().hex[:8]
        tx_user_id = f"usr_tx_{unique_suffix}"
        tx_email = f"tx_{unique_suffix}@example.com"
        tx_fail_id = f"usr_tx_fail_{unique_suffix}"
        tx_fail_email = f"tx_fail_{unique_suffix}@example.com"

        # 2. Transaction commit & rollback behavior
        with database.transaction() as conn:
            conn.execute(
                "INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)",
                (tx_user_id, tx_email, "hash", time.time())
            )

        # Verify committed
        conn = db.get_conn()
        row = conn.execute("SELECT email FROM users WHERE id = ?", (tx_user_id,)).fetchone()
        self.assertIsNotNone(row)
        self.assertEqual(row["email"], tx_email)
        conn.close()

        # Verify rollback on exception
        try:
            with database.transaction() as tx_conn:
                tx_conn.execute(
                    "INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)",
                    (tx_fail_id, tx_fail_email, "hash", time.time())
                )
                raise RuntimeError("Simulated transaction failure")
        except RuntimeError:
            pass

        conn_check = db.get_conn()
        row_fail = conn_check.execute("SELECT id FROM users WHERE id = ?", (tx_fail_id,)).fetchone()
        self.assertIsNone(row_fail)
        conn_check.close()

    # -------------------------------------------------------------
    # 10. Structured Logging Secret Redaction Verification
    # -------------------------------------------------------------

    def test_structured_logging_secret_redaction(self):
        """Verify logs NEVER contain passwords, SDK credentials, Google tokens, Gemini keys, or webhooks."""
        fake_gemini_key = "AIza" + "Sy" + "C1234567890abcdef1234567890abcdef"
        fake_google_tok = "ya29." + "a0AfH6SMD1234567890abcdef"
        test_strings = [
            'User login with password: "SuperSecretPassword123!" failed',
            'Telemetry ingested with token ask_proj123_0123456789abcdef0123456789abcdef',
            f'Gemini threat analysis initiated with {fake_gemini_key}',
            f'Google OAuth exchange token {fake_google_tok}',
            'Alert dispatched to https://hooks.slack.com/services/T11/B22/SecretKeyAlice',
            'Alert dispatched to https://discord.com/api/webhooks/123456789/SecretDiscordKey',
            'Authorization: Bearer ask_proj123_0123456789abcdef0123456789abcdef'
        ]

        for raw in test_strings:
            sanitized = logging_config.redact_secrets(raw)
            # Assert secrets are completely scrubbed
            self.assertNotIn("SuperSecretPassword123!", sanitized)
            self.assertNotIn("0123456789abcdef0123456789abcdef", sanitized)
            self.assertNotIn(fake_gemini_key, sanitized)
            self.assertNotIn("a0AfH6SMD1234567890abcdef", sanitized)
            self.assertNotIn("SecretKeyAlice", sanitized)
            self.assertNotIn("SecretDiscordKey", sanitized)

    # -------------------------------------------------------------
    # 11. PostgreSQL Dialect Adapter & Query Translation Unit Test
    # -------------------------------------------------------------

    def test_postgres_dialect_translation_unit(self):
        """Verify CursorWrapper translates SQLite syntax to PostgreSQL compliant queries."""
        from unittest.mock import MagicMock
        raw_mock = MagicMock()
        pg_cursor = database.CursorWrapper(raw_mock, is_pg=True)

        # 1. Parameter translation: '?' -> '%s'
        pg_cursor.execute("SELECT * FROM events WHERE project_id = ? AND timestamp > ?", ("proj_1", 123.45))
        executed_sql, executed_params = raw_mock.execute.call_args[0]
        self.assertEqual(executed_sql, "SELECT * FROM events WHERE project_id = %s AND timestamp > %s")
        self.assertEqual(executed_params, ("proj_1", 123.45))

        # 2. PRAGMA table_info translation to information_schema
        pg_cursor.execute("PRAGMA table_info(users)")
        executed_sql, executed_params = raw_mock.execute.call_args[0]
        self.assertIn("information_schema.columns", executed_sql)
        self.assertEqual(executed_params, ("users",))

        # 3. PRAGMA foreign_keys translation
        pg_cursor.execute("PRAGMA foreign_keys")
        executed_sql = raw_mock.execute.call_args[0][0]
        self.assertIn("SELECT 1 AS foreign_keys", executed_sql)

        # 4. INSERT into events auto-appends RETURNING id for lastrowid
        raw_mock.fetchone.return_value = (42,)
        pg_cursor.execute("INSERT INTO events (endpoint, method) VALUES (?, ?)", ("/api", "GET"))
        executed_sql = raw_mock.execute.call_args[0][0]
        self.assertTrue(executed_sql.strip().endswith("RETURNING id"))
        self.assertEqual(pg_cursor.lastrowid, 42)


if __name__ == "__main__":
    unittest.main()

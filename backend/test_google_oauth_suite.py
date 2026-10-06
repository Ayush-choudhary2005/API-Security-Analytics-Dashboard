"""
test_google_oauth_suite.py — Automated verification suite for Google OAuth 2.0 / OpenID Connect.
Tests all 14 scenarios specified in the Google OAuth test matrix.
"""

import sys
import os
import time
import zipfile
import io
import unittest
from unittest.mock import patch, MagicMock

# Ensure backend directory is in path
sys.path.insert(0, os.path.dirname(__file__))

import server
from server import app, socketio
import db
import google_auth


class GoogleOAuthTestSuite(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        db.init_db()
        app.config["TESTING"] = True
        app.config["SECRET_KEY"] = "test-security-secret-key-google-suite"

    def setUp(self):
        self.client = app.test_client()

    def tearDown(self):
        # Clean up any test users created during runs
        conn = db.get_conn()
        test_emails = [
            "google_newbie@example.com",
            "existing_pwd_user@example.com",
            "google_victim@example.com",
            "google_attacker@example.com",
        ]
        for em in test_emails:
            u = conn.execute("SELECT id FROM users WHERE email = ?", (em,)).fetchone()
            if u:
                uid = u["id"]
                projs = conn.execute("SELECT id FROM projects WHERE user_id = ?", (uid,)).fetchall()
                for p in projs:
                    conn.execute("DELETE FROM api_keys WHERE project_id = ?", (p["id"],))
                    conn.execute("DELETE FROM webhook_configs WHERE project_id = ?", (p["id"],))
                    conn.execute("DELETE FROM events WHERE project_id = ?", (p["id"],))
                conn.execute("DELETE FROM projects WHERE user_id = ?", (uid,))
                conn.execute("DELETE FROM auth_identities WHERE user_id = ?", (uid,))
                conn.execute("DELETE FROM users WHERE id = ?", (uid,))
        conn.commit()
        conn.close()

    # =========================================================
    # TEST 1: New user → Google signup
    # =========================================================
    @patch("google_auth.is_google_oauth_configured", return_value=True)
    @patch("google_auth.oauth.google.authorize_access_token")
    def test_01_new_user_google_signup(self, mock_token, mock_conf):
        mock_token.return_value = {
            "access_token": "mock_google_access_token",
            "id_token": "mock_google_id_token",
            "userinfo": {
                "sub": "google_sub_1001",
                "email": "google_newbie@example.com",
                "email_verified": True,
            }
        }

        res = self.client.get("/auth/google/callback?code=mock_auth_code_1")
        self.assertEqual(res.status_code, 302, "Should redirect to dashboard on successful login")
        self.assertEqual(res.headers.get("Location"), "/", "Redirect destination should be dashboard root")

        # Verify internal user created
        user = db.get_user_by_email("google_newbie@example.com")
        self.assertIsNotNone(user, "Internal user should exist in users table")
        self.assertTrue(user["id"].startswith("usr_"), "User should receive standard internal ID prefix")

        # Verify federated identity linked
        ident = db.get_identity_by_provider("google", "google_sub_1001")
        self.assertIsNotNone(ident, "Google identity record should exist in auth_identities")
        self.assertEqual(ident["user_id"], user["id"], "Identity must link to internal user ID")
        self.assertEqual(ident["provider"], "google")
        self.assertEqual(ident["provider_user_id"], "google_sub_1001")

        # Verify default project and SDK key provisioned
        projects = db.get_projects_by_user(user["id"])
        self.assertEqual(len(projects), 1, "Should provision initial default project")
        keys = db.list_api_keys_for_project(projects[0]["id"])
        self.assertTrue(len(keys) >= 1, "Should provision initial SDK key")

        # Verify authenticated session can access protected API
        res_me = self.client.get("/api/auth/me")
        self.assertEqual(res_me.status_code, 200, "Authenticated session must access /api/auth/me")
        me_data = res_me.get_json()
        self.assertEqual(me_data["user"]["email"], "google_newbie@example.com")
        self.assertTrue(any(i["provider"] == "google" for i in me_data["user"].get("identities", [])))

    # =========================================================
    # TEST 2: Existing Google user → Google login
    # =========================================================
    @patch("google_auth.is_google_oauth_configured", return_value=True)
    @patch("google_auth.oauth.google.authorize_access_token")
    def test_02_existing_google_user_login(self, mock_token, mock_conf):
        # 1. First login / signup
        mock_token.return_value = {
            "access_token": "mock_token_1",
            "userinfo": {"sub": "google_sub_1001", "email": "google_newbie@example.com"}
        }
        self.client.get("/auth/google/callback?code=mock_code_1")
        first_user = db.get_user_by_email("google_newbie@example.com")
        first_projects = db.get_projects_by_user(first_user["id"])
        first_pid = first_projects[0]["id"]

        # Logout
        self.client.post("/api/auth/logout")

        # 2. Subsequent Google login
        mock_token.return_value = {
            "access_token": "mock_token_2",
            "userinfo": {"sub": "google_sub_1001", "email": "google_newbie@example.com"}
        }
        res_subsequent = self.client.get("/auth/google/callback?code=mock_code_2")
        self.assertEqual(res_subsequent.status_code, 302)

        # Verify it resolves to the EXACT same internal user ID
        res_me = self.client.get("/api/auth/me")
        self.assertEqual(res_me.status_code, 200)
        self.assertEqual(res_me.get_json()["user"]["id"], first_user["id"])

        # Verify same projects are retrieved
        res_projects = self.client.get("/api/projects")
        self.assertEqual(res_projects.status_code, 200)
        proj_ids = [p["id"] for p in res_projects.get_json()["projects"]]
        self.assertIn(first_pid, proj_ids, "Existing projects must persist seamlessly across Google logins")

    # =========================================================
    # TEST 3: Existing email/password user → Google login with same email
    # =========================================================
    @patch("google_auth.is_google_oauth_configured", return_value=True)
    @patch("google_auth.oauth.google.authorize_access_token")
    def test_03_existing_password_user_safe_linking(self, mock_token, mock_conf):
        # 1. User registers via normal email/password
        res_reg = self.client.post("/api/auth/register", json={
            "email": "existing_pwd_user@example.com",
            "password": "Password123!",
            "confirm_password": "Password123!"
        })
        self.assertEqual(res_reg.status_code, 201)
        original_user = db.get_user_by_email("existing_pwd_user@example.com")
        self.client.post("/api/auth/logout")

        # 2. User attempts "Continue with Google" using the same email
        mock_token.return_value = {
            "access_token": "mock_token_pwd_match",
            "userinfo": {"sub": "google_sub_9999", "email": "existing_pwd_user@example.com"}
        }
        res_oauth = self.client.get("/auth/google/callback?code=code_linking_test")
        self.assertEqual(res_oauth.status_code, 302)
        loc = res_oauth.headers.get("Location")
        self.assertIn("link_required=1", loc, "Must trigger safe account-linking redirect")
        self.assertIn("existing_pwd_user", loc)

        # Verify NO parallel second user account was created!
        conn = db.get_conn()
        user_count = conn.execute(
            "SELECT COUNT(*) FROM users WHERE email = 'existing_pwd_user@example.com'"
        ).fetchone()[0]
        conn.close()
        self.assertEqual(user_count, 1, "Never create duplicate parallel user accounts for matching emails")

        # Verify pending link in session
        res_pending = self.client.get("/api/auth/pending-link")
        self.assertEqual(res_pending.status_code, 200)
        self.assertTrue(res_pending.get_json()["has_pending"])

        # 3. User authenticates with existing account password to confirm ownership & link
        res_link_login = self.client.post("/api/auth/login", json={
            "email": "existing_pwd_user@example.com",
            "password": "Password123!"
        })
        self.assertEqual(res_link_login.status_code, 200)
        self.assertTrue(res_link_login.get_json().get("linked_google"), "Should link Google account on password verification")

        # Verify identity is now permanently linked
        ident = db.get_identity_by_provider("google", "google_sub_9999")
        self.assertIsNotNone(ident)
        self.assertEqual(ident["user_id"], original_user["id"], "Identity linked to original internal user ID")

        # Logout and log in purely with Google -> immediate access to same user
        self.client.post("/api/auth/logout")
        res_future_google = self.client.get("/auth/google/callback?code=code_future")
        self.assertEqual(res_future_google.status_code, 302)
        self.assertEqual(res_future_google.headers.get("Location"), "/")
        self.assertEqual(self.client.get("/api/auth/me").get_json()["user"]["id"], original_user["id"])

    # =========================================================
    # TEST 4: Google user creates project
    # =========================================================
    @patch("google_auth.is_google_oauth_configured", return_value=True)
    @patch("google_auth.oauth.google.authorize_access_token")
    def test_04_google_user_creates_project(self, mock_token, mock_conf):
        mock_token.return_value = {
            "access_token": "mock_token",
            "userinfo": {"sub": "google_sub_1001", "email": "google_newbie@example.com"}
        }
        self.client.get("/auth/google/callback?code=code")
        internal_user = db.get_user_by_email("google_newbie@example.com")

        # Create project via API
        res_p = self.client.post("/api/projects", json={
            "name": "Google Microservice API",
            "description": "Created by Google-authenticated user"
        })
        self.assertEqual(res_p.status_code, 201)
        created_proj = res_p.get_json()["project"]
        self.assertEqual(created_proj["user_id"], internal_user["id"], "Project user_id must match internal user ID")

    # =========================================================
    # TEST 5: Google user downloads SDK
    # =========================================================
    @patch("google_auth.is_google_oauth_configured", return_value=True)
    @patch("google_auth.oauth.google.authorize_access_token")
    def test_05_google_user_downloads_sdk(self, mock_token, mock_conf):
        mock_token.return_value = {
            "access_token": "mock_google_secret_token_123",
            "id_token": "mock_google_id_token_456",
            "userinfo": {"sub": "google_sub_1001", "email": "google_newbie@example.com"}
        }
        self.client.get("/auth/google/callback?code=code")
        projects = self.client.get("/api/projects").get_json()["projects"]
        pid = projects[0]["id"]

        res_dl = self.client.get(f"/api/projects/{pid}/sdk/download")
        self.assertEqual(res_dl.status_code, 200)
        self.assertEqual(res_dl.content_type, "application/zip")

        # Inspect ZIP archive contents
        zf = zipfile.ZipFile(io.BytesIO(res_dl.data))
        files = zf.namelist()
        self.assertIn("config.py", files)
        config_src = zf.read("config.py").decode("utf-8")

        # ZERO LEAKAGE OF GOOGLE CREDENTIALS OR SESSIONS
        self.assertNotIn("mock_google_secret_token_123", config_src)
        self.assertNotIn("mock_google_id_token_456", config_src)
        self.assertNotIn("client_secret", config_src)
        self.assertIn(pid, config_src)
        self.assertIn("ask_", config_src)

    # =========================================================
    # TEST 6: Google user sends telemetry
    # =========================================================
    @patch("google_auth.is_google_oauth_configured", return_value=True)
    @patch("google_auth.oauth.google.authorize_access_token")
    def test_06_google_user_sends_telemetry(self, mock_token, mock_conf):
        mock_token.return_value = {
            "access_token": "t",
            "userinfo": {"sub": "google_sub_1001", "email": "google_newbie@example.com"}
        }
        self.client.get("/auth/google/callback?code=code")
        projects = self.client.get("/api/projects").get_json()["projects"]
        pid = projects[0]["id"]

        # Regenerate SDK key to get raw token
        res_key = self.client.post(f"/api/projects/{pid}/keys/regenerate")
        raw_key = res_key.get_json()["key"]["raw_key"]

        # Ingest telemetry event with SDK key
        anon_client = app.test_client()
        res_ingest = anon_client.post("/ingest", json={
            "endpoint": "/api/v1/billing",
            "method": "POST",
            "status_code": 200,
            "latency_ms": 14.5,
            "ip": "203.0.113.19"
        }, headers={"Authorization": f"Bearer {raw_key}"})
        self.assertEqual(res_ingest.status_code, 201)
        self.assertEqual(res_ingest.get_json()["project_id"], pid)

    # =========================================================
    # TEST 7: Google user receives WebSocket events
    # =========================================================
    @patch("google_auth.is_google_oauth_configured", return_value=True)
    @patch("google_auth.oauth.google.authorize_access_token")
    def test_07_google_user_websocket_events(self, mock_token, mock_conf):
        mock_token.return_value = {
            "access_token": "t",
            "userinfo": {"sub": "google_sub_1001", "email": "google_newbie@example.com"}
        }
        self.client.get("/auth/google/callback?code=code")
        projects = self.client.get("/api/projects").get_json()["projects"]
        pid = projects[0]["id"]

        # Connect WebSocket using authenticated session
        ws_client = socketio.test_client(app, flask_test_client=self.client)
        self.assertTrue(ws_client.is_connected())

        # Join project room
        ack = ws_client.emit("join_project", {"project_id": pid}, callback=True)
        self.assertEqual(ack.get("status"), "joined")

        ws_client.disconnect()

    # =========================================================
    # TEST 8: Google user configures Slack
    # =========================================================
    @patch("google_auth.is_google_oauth_configured", return_value=True)
    @patch("google_auth.oauth.google.authorize_access_token")
    def test_08_google_user_configures_slack(self, mock_token, mock_conf):
        mock_token.return_value = {
            "access_token": "t",
            "userinfo": {"sub": "google_sub_1001", "email": "google_newbie@example.com"}
        }
        self.client.get("/auth/google/callback?code=code")
        projects = self.client.get("/api/projects").get_json()["projects"]
        pid = projects[0]["id"]

        res_wh = self.client.post(f"/api/projects/{pid}/webhooks", json={
            "webhook_url": "https://hooks.slack.com/services/T999/B888/secretToken999",
            "provider": "slack"
        })
        self.assertEqual(res_wh.status_code, 200)
        self.assertIn("masked_url", res_wh.get_json()["webhook"])
        self.assertNotIn("secretToken999", str(res_wh.get_json()))

    # =========================================================
    # TEST 9: User logs out
    # =========================================================
    @patch("google_auth.is_google_oauth_configured", return_value=True)
    @patch("google_auth.oauth.google.authorize_access_token")
    def test_09_user_logout_invalidates_session(self, mock_token, mock_conf):
        mock_token.return_value = {
            "access_token": "t",
            "userinfo": {"sub": "google_sub_1001", "email": "google_newbie@example.com"}
        }
        self.client.get("/auth/google/callback?code=code")
        self.assertEqual(self.client.get("/api/auth/me").status_code, 200)

        # Perform logout
        res_logout = self.client.post("/api/auth/logout")
        self.assertEqual(res_logout.status_code, 200)

        # Subsequent protected queries must return 401
        self.assertEqual(self.client.get("/api/auth/me").status_code, 401)
        self.assertEqual(self.client.get("/api/projects").status_code, 401)

    # =========================================================
    # TEST 10: Attempt to access another user's project
    # =========================================================
    @patch("google_auth.is_google_oauth_configured", return_value=True)
    @patch("google_auth.oauth.google.authorize_access_token")
    def test_10_cross_tenant_project_access_denied(self, mock_token, mock_conf):
        # 1. Create Victim via Google
        mock_token.return_value = {
            "access_token": "t1",
            "userinfo": {"sub": "google_sub_victim", "email": "google_victim@example.com"}
        }
        self.client.get("/auth/google/callback?code=code1")
        victim_proj_id = self.client.get("/api/projects").get_json()["projects"][0]["id"]
        self.client.post("/api/auth/logout")

        # 2. Attacker logs in via Google
        mock_token.return_value = {
            "access_token": "t2",
            "userinfo": {"sub": "google_sub_attacker", "email": "google_attacker@example.com"}
        }
        self.client.get("/auth/google/callback?code=code2")

        # Attacker attempts to read / delete victim's project
        self.assertEqual(self.client.get(f"/api/projects/{victim_proj_id}").status_code, 403)
        self.assertEqual(self.client.delete(f"/api/projects/{victim_proj_id}").status_code, 403)
        self.assertEqual(self.client.get(f"/events/recent?project_id={victim_proj_id}").status_code, 403)

    # =========================================================
    # TEST 11: Attempt to manipulate project_id in telemetry
    # =========================================================
    @patch("google_auth.is_google_oauth_configured", return_value=True)
    @patch("google_auth.oauth.google.authorize_access_token")
    def test_11_project_id_spoofing_denied(self, mock_token, mock_conf):
        # Setup Victim
        mock_token.return_value = {
            "access_token": "t1",
            "userinfo": {"sub": "google_sub_victim", "email": "google_victim@example.com"}
        }
        self.client.get("/auth/google/callback?code=code1")
        victim_pid = self.client.get("/api/projects").get_json()["projects"][0]["id"]
        self.client.post("/api/auth/logout")

        # Setup Attacker
        mock_token.return_value = {
            "access_token": "t2",
            "userinfo": {"sub": "google_sub_attacker", "email": "google_attacker@example.com"}
        }
        self.client.get("/auth/google/callback?code=code2")
        attacker_pid = self.client.get("/api/projects").get_json()["projects"][0]["id"]
        attacker_key = self.client.post(f"/api/projects/{attacker_pid}/keys/regenerate").get_json()["key"]["raw_key"]

        # Attacker injects payload claiming victim_pid with attacker_key
        anon_client = app.test_client()
        res_spoof = anon_client.post("/ingest", json={
            "endpoint": "/api/malicious",
            "method": "POST",
            "status_code": 200,
            "latency_ms": 10.0,
            "ip": "1.2.3.4",
            "project_id": victim_pid  # SPOOF ATTEMPT
        }, headers={"Authorization": f"Bearer {attacker_key}"})
        self.assertEqual(res_spoof.status_code, 201)
        # Server pins event to attacker_pid, ignoring body's victim_pid
        self.assertEqual(res_spoof.get_json()["project_id"], attacker_pid)

    # =========================================================
    # TEST 12: Invalid OAuth state
    # =========================================================
    @patch("google_auth.is_google_oauth_configured", return_value=True)
    @patch("google_auth.oauth.google.authorize_access_token")
    def test_12_invalid_oauth_state(self, mock_token, mock_conf):
        # Simulate state mismatch exception
        mock_token.side_effect = Exception("MismatchingStateError")
        res = self.client.get("/auth/google/callback?code=bad_state_code")
        self.assertEqual(res.status_code, 302)
        self.assertIn("error=invalid_oauth_state", res.headers.get("Location"))

    # =========================================================
    # TEST 13: User cancels Google login
    # =========================================================
    def test_13_user_cancels_google_login(self):
        res = self.client.get("/auth/google/callback?error=access_denied")
        self.assertEqual(res.status_code, 302)
        self.assertIn("error=google_cancelled", res.headers.get("Location"))

    # =========================================================
    # TEST 14: Google callback without valid OAuth response / code
    # =========================================================
    @patch("google_auth.is_google_oauth_configured", return_value=True)
    def test_14_callback_without_code(self, mock_conf):
        res = self.client.get("/auth/google/callback")
        self.assertEqual(res.status_code, 302)
        self.assertIn("error=google_invalid_code", res.headers.get("Location"))


def run_tests():
    suite = unittest.TestLoader().loadTestsFromTestCase(GoogleOAuthTestSuite)
    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(suite)
    return result.wasSuccessful()


if __name__ == "__main__":
    success = run_tests()
    sys.exit(0 if success else 1)

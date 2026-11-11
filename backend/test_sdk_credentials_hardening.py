"""
backend/test_sdk_credentials_hardening.py

Regression & security suite for SDK Credentials and SDK Download hardening (Phases 1-5):
1. Workspace RBAC enforcement on key lifecycle and secret-bearing SDK downloads.
2. GET /download-sdk rejection of ?api_key= URL secrets and non-mutating template-only behavior.
3. POST /download-sdk modes (template, existing, new), no-store caching, X-SDK-Key-* headers,
   28-char distinguishing key_prefix, DB label resolution, and /ingest documentation.
4. Fresh authentication enforcement (verify_fresh_authentication) for stale sessions.
"""

import io
import os
import sys
import time
import unittest
import uuid
import zipfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import auth
import db
import server


class TestSdkCredentialsHardening(unittest.TestCase):
    def setUp(self):
        self.app = server.app
        self.app.config["TESTING"] = True
        self.password = "HardeningPass123!"
        pw_hash = auth.hash_password(self.password)

        self.owner = db.create_user(f"hard_owner_{uuid.uuid4().hex[:6]}@test.local", pw_hash)
        self.admin = db.create_user(f"hard_admin_{uuid.uuid4().hex[:6]}@test.local", pw_hash)
        self.member = db.create_user(f"hard_member_{uuid.uuid4().hex[:6]}@test.local", pw_hash)
        self.viewer = db.create_user(f"hard_viewer_{uuid.uuid4().hex[:6]}@test.local", pw_hash)
        self.outsider = db.create_user(f"hard_outsider_{uuid.uuid4().hex[:6]}@test.local", pw_hash)

        self.org = db.create_organization(self.owner["id"], name="Hardening Org")
        db.add_organization_member(self.org["id"], self.admin["id"], role="admin")
        db.add_organization_member(self.org["id"], self.member["id"], role="member")
        db.add_organization_member(self.org["id"], self.viewer["id"], role="viewer")

        self.proj_primary = db.create_project(self.owner["id"], name="Primary API", organization_id=self.org["id"])
        self.proj_secondary = db.create_project(self.owner["id"], name="Secondary API", organization_id=self.org["id"])
        self.proj_other = db.create_project(self.outsider["id"], name="Outsider API")

        self.initial_key = db.create_api_key(self.proj_primary["id"], name="Initial Hardening Key")
        self.other_key = db.create_api_key(self.proj_other["id"], name="Outsider Key")

    def _client_for(self, user, auth_age_seconds=0):
        c = self.app.test_client()
        with c.session_transaction() as sess:
            sess["user_id"] = user["id"]
            sess["auth_time"] = time.time() - auth_age_seconds
        return c

    def test_rbac_key_lifecycle_and_download_modes(self):
        """Only owner and admin may mutate keys or bundle secret keys; member/viewer are template-only."""
        pid = self.proj_primary["id"]
        c_admin = self._client_for(self.admin)
        c_member = self._client_for(self.member)
        c_viewer = self._client_for(self.viewer)

        # Admin creates key
        r_create = c_admin.post(f"/api/projects/{pid}/keys", json={"name": "Admin Provisioned"})
        self.assertEqual(r_create.status_code, 201)
        self.assertIn("no-store", r_create.headers.get("Cache-Control", ""))
        key_obj = r_create.get_json()["key"]
        kid = key_obj["id"]
        raw_key = key_obj["raw_key"]

        # Member and Viewer: read + template allowed, all key mutations + secret downloads rejected
        for role_name, client in [("member", c_member), ("viewer", c_viewer)]:
            self.assertEqual(client.get(f"/api/projects/{pid}/keys").status_code, 200, role_name)
            self.assertEqual(client.post(f"/api/projects/{pid}/keys", json={"name": "X"}).status_code, 403, role_name)
            self.assertEqual(client.post(f"/api/projects/{pid}/keys/{kid}/rotate").status_code, 403, role_name)
            self.assertEqual(client.delete(f"/api/projects/{pid}/keys/{kid}").status_code, 403, role_name)
            self.assertEqual(client.post(f"/api/projects/{pid}/keys/regenerate").status_code, 403, role_name)
            self.assertEqual(client.post(f"/api/projects/{pid}/download-sdk", json={"mode": "new"}).status_code, 403, role_name)
            self.assertEqual(
                client.post(f"/api/projects/{pid}/download-sdk", json={"mode": "existing", "api_key": raw_key}).status_code,
                403,
                role_name,
            )

            r_tpl = client.post(f"/api/projects/{pid}/download-sdk", json={"mode": "template"})
            self.assertEqual(r_tpl.status_code, 200, role_name)
            self.assertEqual(r_tpl.headers.get("X-SDK-Key-Mode"), "template")

        # Admin rotates and revokes cleanly
        r_rot = c_admin.post(f"/api/projects/{pid}/keys/{kid}/rotate", json={"name": "Admin Rotated"})
        self.assertEqual(r_rot.status_code, 201)
        rot_id = r_rot.get_json()["key"]["id"]
        r_rev = c_admin.delete(f"/api/projects/{pid}/keys/{rot_id}")
        self.assertEqual(r_rev.status_code, 200)
        self.assertTrue(r_rev.get_json()["success"])

    def test_get_download_rejects_url_secret_and_never_mints_keys(self):
        """GET /download-sdk rejects ?api_key= with 400 and serves template-only without creating keys."""
        pid = self.proj_primary["id"]
        c_owner = self._client_for(self.owner)
        raw_k = self.initial_key["raw_key"]

        # Reject URL-borne secret key
        r_url_secret = c_owner.get(f"/api/projects/{pid}/download-sdk?api_key={raw_k}")
        self.assertEqual(r_url_secret.status_code, 400)
        r_url_secret_alias = c_owner.get(f"/api/projects/{pid}/sdk/download?api_key={raw_k}")
        self.assertEqual(r_url_secret_alias.status_code, 400)

        # GET without query params does not mint a key and returns template mode
        before_count = len(db.list_api_keys_for_project(pid))
        r_get = c_owner.get(f"/api/projects/{pid}/download-sdk")
        after_count = len(db.list_api_keys_for_project(pid))

        self.assertEqual(r_get.status_code, 200)
        self.assertEqual(before_count, after_count)
        self.assertEqual(r_get.headers.get("X-SDK-Key-Mode"), "template")
        self.assertIn("no-store", r_get.headers.get("Cache-Control", ""))

        with zipfile.ZipFile(io.BytesIO(r_get.data), "r") as zf:
            cfg = zf.read("config.py").decode("utf-8")
            self.assertNotIn("ask_", cfg)
            self.assertIn('os.environ.get("SECURITY_SDK_API_KEY", "")', cfg)

    def test_post_download_modes_headers_prefix_and_docs(self):
        """Verify POST /download-sdk validation, prefix format, DB label lookup, and /ingest docs."""
        pid = self.proj_primary["id"]
        c_owner = self._client_for(self.owner)
        raw_k = self.initial_key["raw_key"]

        self.assertEqual(c_owner.post(f"/api/projects/{pid}/download-sdk", json={"mode": "invalid"}).status_code, 400)
        self.assertEqual(c_owner.post(f"/api/projects/{pid}/download-sdk", json={"mode": "existing"}).status_code, 400)
        self.assertEqual(
            c_owner.post(
                f"/api/projects/{pid}/download-sdk",
                json={"mode": "existing", "api_key": self.other_key["raw_key"]},
            ).status_code,
            403,
        )

        # Existing mode resolves DB label automatically and sets 28-char prefix
        r_ex = c_owner.post(f"/api/projects/{pid}/download-sdk", json={"mode": "existing", "api_key": raw_k})
        self.assertEqual(r_ex.status_code, 200)
        self.assertIn("no-store", r_ex.headers.get("Cache-Control", ""))
        self.assertEqual(r_ex.headers.get("X-SDK-Key-Mode"), "existing")
        self.assertEqual(r_ex.headers.get("X-SDK-Key-Name"), "Initial Hardening Key")
        expected_prefix = db.format_key_prefix(raw_k)
        self.assertEqual(len(expected_prefix), 28)
        self.assertEqual(r_ex.headers.get("X-SDK-Key-Prefix"), expected_prefix)

        with zipfile.ZipFile(io.BytesIO(r_ex.data), "r") as zf:
            readme = zf.read("README.md").decode("utf-8")
            cfg = zf.read("config.py").decode("utf-8")
            self.assertIn(expected_prefix, readme)
            self.assertIn("Initial Hardening Key", readme)
            self.assertIn("/ingest", readme)
            self.assertNotIn("/api/telemetry/ingest", readme)
            self.assertIn(f'SDK_KEY = "{raw_k}"', cfg)

        # New mode provisions key with explicit label
        r_new = c_owner.post(
            f"/api/projects/{pid}/sdk/download",
            json={"mode": "new", "key_name": "Hardening Zip Key"},
        )
        self.assertEqual(r_new.status_code, 200)
        self.assertEqual(r_new.headers.get("X-SDK-Key-Mode"), "new")
        self.assertEqual(r_new.headers.get("X-SDK-Key-Name"), "Hardening Zip Key")
        self.assertEqual(len(r_new.headers.get("X-SDK-Key-Prefix", "")), 28)

    def test_reauth_enforcement_for_stale_sessions(self):
        """Stale sessions (>5 min) must re-authenticate on regenerate and project deletion."""
        pid = self.proj_secondary["id"]
        c_stale = self._client_for(self.owner, auth_age_seconds=600)

        # Missing password -> 403 REAUTH_REQUIRED
        r_regen_stale = c_stale.post(f"/api/projects/{pid}/keys/regenerate", json={})
        self.assertEqual(r_regen_stale.status_code, 403)
        body = r_regen_stale.get_json()
        self.assertEqual(body.get("code"), "REAUTH_REQUIRED")
        self.assertEqual(body.get("reauth_method"), "password")

        r_del_stale = c_stale.delete(f"/api/projects/{pid}", json={})
        self.assertEqual(r_del_stale.status_code, 403)
        self.assertEqual(r_del_stale.get_json().get("code"), "REAUTH_REQUIRED")

        # Wrong password -> 403
        r_wrong = c_stale.post(f"/api/projects/{pid}/keys/regenerate", json={"password": "WrongPassword!"})
        self.assertEqual(r_wrong.status_code, 403)

        # Valid password -> succeeds and refreshes session auth_time
        r_ok_regen = c_stale.post(
            f"/api/projects/{pid}/keys/regenerate",
            json={"password": self.password, "name": "Reauthed Key"},
        )
        self.assertEqual(r_ok_regen.status_code, 201)

        # Now session is fresh, so delete succeeds without repeating password
        r_ok_del = c_stale.delete(f"/api/projects/{pid}")
        self.assertEqual(r_ok_del.status_code, 200)

        # OAuth-only user with stale session receives reauth_method='oauth'
        oauth_user = db.create_user(f"hard_oauth_{uuid.uuid4().hex[:6]}@test.local", password_hash=None, name="OAuth User")
        oauth_proj = db.create_project(oauth_user["id"], name="OAuth Proj")
        c_oauth_stale = self._client_for(oauth_user, auth_age_seconds=600)
        r_oauth = c_oauth_stale.post(f"/api/projects/{oauth_proj['id']}/keys/regenerate", json={})
        self.assertEqual(r_oauth.status_code, 403)
        self.assertEqual(r_oauth.get_json().get("code"), "REAUTH_REQUIRED")
        self.assertEqual(r_oauth.get_json().get("reauth_method"), "oauth")


if __name__ == "__main__":
    unittest.main()

"""
test_multitenant_org_suite.py — Multi-Tenant SaaS Isolation & Organization Architecture Test Suite

Verifies:
1. Organization & Workspace CRUD (create, list, get, members, invite, remove).
2. Hierarchy: Organization -> Users/Members -> Projects -> SDK Credentials -> Telemetry.
3. Strict Server-Side Tenant Isolation:
   - User A (Org A, Project A) CANNOT access Org B, Project B, Keys B, Webhooks B, Events B, Alerts B, Investigations B.
   - Cross-tenant attacks fail with 403 Forbidden via URL params, query strings, and body payloads.
   - Member sharing: Users in the same organization can access projects in that organization.
"""

import unittest
import time
import json
import uuid
import sys
import os

# Ensure backend directory is in path
sys.path.insert(0, os.path.abspath(os.path.dirname(__file__)))

from server import app, socketio
import db
import auth


class TestMultiTenantOrgSuite(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        app.config["TESTING"] = True
        app.config["WTF_CSRF_ENABLED"] = False
        db.init_db()

    def setUp(self):
        self.client = app.test_client()

    def _register_user(self, email_prefix):
        """Helper to register a user and return user object, org, and project."""
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

    def _login_user(self, user_info):
        """Login user and establish session cookie."""
        resp = self.client.post("/api/auth/login", json={
            "email": user_info["email"],
            "password": user_info["password"]
        })
        self.assertEqual(resp.status_code, 200)

    # =========================================================================
    # 1. Organization & Membership Functionality
    # =========================================================================

    def test_organization_creation_and_listing(self):
        """Test creating additional organizations and listing them."""
        user_a = self._register_user("acme")
        self._login_user(user_a)

        # List organizations — should include the default workspace created during registration
        resp = self.client.get("/api/organizations")
        self.assertEqual(resp.status_code, 200)
        orgs = resp.get_json()["organizations"]
        self.assertGreaterEqual(len(orgs), 1)
        self.assertEqual(orgs[0]["role"], "owner")

        # Create a new organization "Acme Enterprise"
        resp = self.client.post("/api/organizations", json={
            "name": "Acme Enterprise",
            "slug": "acme-enterprise"
        })
        self.assertEqual(resp.status_code, 201)
        new_org = resp.get_json()["organization"]
        self.assertEqual(new_org["name"], "Acme Enterprise")

        # Verify listed organizations now includes Acme Enterprise
        resp = self.client.get("/api/organizations")
        orgs = resp.get_json()["organizations"]
        self.assertEqual(len(orgs), 2)
        org_names = [o["name"] for o in orgs]
        self.assertIn("Acme Enterprise", org_names)

    def test_organization_member_management(self):
        """Test inviting a user to an organization and role permissions."""
        user_owner = self._register_user("owner")
        user_colleague = self._register_user("colleague")

        # Login as owner
        self._login_user(user_owner)
        org_id = user_owner["organization"]["id"]

        # Owner invites colleague to their organization as member
        resp = self.client.post(f"/api/organizations/{org_id}/members", json={
            "email": user_colleague["email"],
            "role": "member"
        })
        self.assertEqual(resp.status_code, 201)
        data = resp.get_json()
        self.assertIn("added to organization", data["message"])

        # Fetch organization details and members
        resp = self.client.get(f"/api/organizations/{org_id}")
        self.assertEqual(resp.status_code, 200)
        org_detail = resp.get_json()
        member_emails = [m["email"] for m in org_detail["members"]]
        self.assertIn(user_owner["email"], member_emails)
        self.assertIn(user_colleague["email"], member_emails)

        # Login as colleague — should now see the owner's organization
        self._login_user(user_colleague)
        resp = self.client.get("/api/organizations")
        self.assertEqual(resp.status_code, 200)
        colleague_orgs = resp.get_json()["organizations"]
        colleague_org_ids = [o["id"] for o in colleague_orgs]
        self.assertIn(org_id, colleague_orgs_ids := colleague_org_ids)

        # As a 'member', colleague CANNOT invite others (requires owner or admin)
        resp = self.client.post(f"/api/organizations/{org_id}/members", json={
            "email": "someone_else@test.com"
        })
        self.assertEqual(resp.status_code, 403)

    # =========================================================================
    # 2. Project Hierarchy Scoped to Organization
    # =========================================================================

    def test_project_creation_in_organization(self):
        """Test creating projects scoped to a specific organization."""
        user = self._register_user("devops")
        self._login_user(user)

        # Create new organization "Staging Team"
        resp = self.client.post("/api/organizations", json={"name": "Staging Team"})
        self.assertEqual(resp.status_code, 201)
        staging_org = resp.get_json()["organization"]

        # Create project explicitly in Staging Team
        resp = self.client.post("/api/projects", json={
            "name": "Staging Microservice",
            "description": "Internal staging service",
            "organization_id": staging_org["id"]
        })
        self.assertEqual(resp.status_code, 201)
        proj = resp.get_json()["project"]
        self.assertEqual(proj["organization_id"], staging_org["id"])

        # List projects filtered by organization_id
        resp = self.client.get(f"/api/projects?organization_id={staging_org['id']}")
        self.assertEqual(resp.status_code, 200)
        proj_list = resp.get_json()["projects"]
        self.assertEqual(len(proj_list), 2)  # default project created with org + new project
        proj_names = [p["name"] for p in proj_list]
        self.assertIn("Staging Microservice", proj_names)

    # =========================================================================
    # 3. Server-Side Multi-Tenant Isolation Tests (Cross-Tenant Attacks)
    # =========================================================================

    def test_cross_tenant_organization_isolation(self):
        """Verify User A cannot access or tamper with Org B."""
        user_a = self._register_user("alpha")
        user_b = self._register_user("beta")

        org_b_id = user_b["organization"]["id"]

        # Login as User A
        self._login_user(user_a)

        # User A attempts to view Org B
        resp = self.client.get(f"/api/organizations/{org_b_id}")
        self.assertEqual(resp.status_code, 403)

        # User A attempts to list members of Org B
        resp = self.client.get(f"/api/organizations/{org_b_id}/members")
        self.assertEqual(resp.status_code, 403)

        # User A attempts to add a member to Org B
        resp = self.client.post(f"/api/organizations/{org_b_id}/members", json={
            "email": user_a["email"]
        })
        self.assertEqual(resp.status_code, 403)

        # User A attempts to remove User B from Org B
        resp = self.client.delete(f"/api/organizations/{org_b_id}/members/{user_b['user']['id']}")
        self.assertEqual(resp.status_code, 403)

        # User A attempts to create a project in Org B
        resp = self.client.post("/api/projects", json={
            "name": "Malicious Injection Project",
            "organization_id": org_b_id
        })
        self.assertEqual(resp.status_code, 403)

        # User A attempts to list projects filtered to Org B
        resp = self.client.get(f"/api/projects?organization_id={org_b_id}")
        self.assertEqual(resp.status_code, 403)

    def test_cross_tenant_project_and_resource_isolation(self):
        """Verify User A cannot access Project B, its keys, webhooks, or telemetry."""
        user_a = self._register_user("tenant_one")
        user_b = self._register_user("tenant_two")

        proj_b_id = user_b["project"]["id"]

        # Login as User A
        self._login_user(user_a)

        # 1. Project details
        resp = self.client.get(f"/api/projects/{proj_b_id}")
        self.assertEqual(resp.status_code, 403)

        # 2. Project deletion
        resp = self.client.delete(f"/api/projects/{proj_b_id}")
        self.assertEqual(resp.status_code, 403)

        # 3. Project API keys
        resp = self.client.get(f"/api/projects/{proj_b_id}/keys")
        self.assertEqual(resp.status_code, 403)

        resp = self.client.post(f"/api/projects/{proj_b_id}/keys", json={"name": "Attacker Key"})
        self.assertEqual(resp.status_code, 403)

        resp = self.client.post(f"/api/projects/{proj_b_id}/keys/regenerate")
        self.assertEqual(resp.status_code, 403)

        # 4. Project Webhooks
        resp = self.client.get(f"/api/projects/{proj_b_id}/webhooks")
        self.assertEqual(resp.status_code, 403)

        resp = self.client.post(f"/api/projects/{proj_b_id}/webhooks", json={
            "webhook_url": "https://hooks.slack.com/services/attacker/fake/webhook"
        })
        self.assertEqual(resp.status_code, 403)

        # 5. Telemetry & Analytics endpoints with project_id manipulation
        resp = self.client.get(f"/events/recent?project_id={proj_b_id}")
        self.assertEqual(resp.status_code, 403)

        resp = self.client.get(f"/alerts/recent?project_id={proj_b_id}")
        self.assertEqual(resp.status_code, 403)

        resp = self.client.get(f"/alerts/stats?project_id={proj_b_id}")
        self.assertEqual(resp.status_code, 403)

        resp = self.client.get(f"/history?project_id={proj_b_id}")
        self.assertEqual(resp.status_code, 403)

        resp = self.client.get(f"/blocked-ips?project_id={proj_b_id}")
        self.assertEqual(resp.status_code, 403)

        resp = self.client.post("/block-ip", json={"ip": "1.2.3.4", "project_id": proj_b_id})
        self.assertEqual(resp.status_code, 403)

    def test_telemetry_ingest_and_data_isolation(self):
        """
        Verify that telemetry ingested under Project B's SDK key is strictly isolated:
        User A cannot read Project B's events, alerts, or investigations.
        """
        user_a = self._register_user("corp_a")
        user_b = self._register_user("corp_b")

        key_b = user_b["api_key"]
        proj_b_id = user_b["project"]["id"]

        # Ingest a suspicious event for Project B using Project B's SDK key
        event_payload = {
            "endpoint": "/api/v1/payments/transfer",
            "method": "POST",
            "status_code": 200,
            "latency_ms": 12.5,
            "ip": "198.51.100.42",
            "user_id": "usr_victim_999",
            "payload_size": 256
        }
        resp = self.client.post(
            "/ingest",
            json=event_payload,
            headers={"Authorization": f"Bearer {key_b}"}
        )
        self.assertEqual(resp.status_code, 201)
        event_data = resp.get_json()
        event_id = event_data["id"]

        # Login as User B — User B CAN see this event
        self._login_user(user_b)
        resp = self.client.get(f"/events/recent?project_id={proj_b_id}")
        self.assertEqual(resp.status_code, 200)
        events_b = resp.get_json()
        self.assertTrue(any(e["id"] == event_id for e in events_b))

        # Login as User A — User A CANNOT see Project B's events
        self._login_user(user_a)
        resp = self.client.get(f"/events/recent?project_id={proj_b_id}")
        self.assertEqual(resp.status_code, 403)

        # User A cannot investigate Project B's alert
        resp = self.client.get(f"/api/investigate/{event_id}")
        self.assertEqual(resp.status_code, 403)

    def test_shared_organization_membership_access(self):
        """
        Verify that when User A invites User C to Org A,
        User C CAN legitimately view Org A's projects and telemetry.
        """
        user_a = self._register_user("startup")
        user_c = self._register_user("teammate")

        org_a_id = user_a["organization"]["id"]
        proj_a_id = user_a["project"]["id"]

        # User A invites User C as member
        self._login_user(user_a)
        self.client.post(f"/api/organizations/{org_a_id}/members", json={
            "email": user_c["email"],
            "role": "member"
        })

        # Login as User C
        self._login_user(user_c)

        # User C CAN list projects in Org A
        resp = self.client.get(f"/api/projects?organization_id={org_a_id}")
        self.assertEqual(resp.status_code, 200)
        projs = resp.get_json()["projects"]
        proj_ids = [p["id"] for p in projs]
        self.assertIn(proj_a_id, proj_ids)

        # User C CAN read telemetry for Project A
        resp = self.client.get(f"/events/recent?project_id={proj_a_id}")
        self.assertEqual(resp.status_code, 200)


if __name__ == "__main__":
    unittest.main()

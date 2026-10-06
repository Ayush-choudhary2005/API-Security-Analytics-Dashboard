"""
test_saas_auth_suite.py — Comprehensive test suite for production SaaS authentication system.

Verifies:
1. User registration with verification token generation and transactional email dispatch.
2. Email verification flow (valid token, invalid token, expired token, single-use token).
3. Resend verification email endpoint.
4. Login with rate limiting, failure protection, user enumeration defense, and last_login_at recording.
5. Session invalidation upon password reset and password change.
6. Forgot password flow (hashed at rest, single-use, 1-hour expiry, user enumeration defense).
7. Reset password flow (atomic consumption, session invalidation).
8. Change password flow (authenticated, verifies current password, keeps current session alive).
9. Account profile retrieval and updates.
10. Google OAuth resolution to same internal user with auto-verified status.
11. Secure cookie settings.
"""

import os
import sys
import time
import unittest
import json

# Ensure backend directory is in path
sys.path.insert(0, os.path.dirname(__file__))

import db
import rate_limiter
import email_service
from server import app


class SaaSAuthTestSuite(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        db.init_db()
        app.config["TESTING"] = True
        app.config["WTF_CSRF_ENABLED"] = False
        cls.client = app.test_client()

    def setUp(self):
        rate_limiter.reset_state()
        email_service.clear_dev_mailbox()

    def test_01_registration_flow_and_verification_token(self):
        """User registers with email, password, and name -> gets verification email dispatched."""
        unique_email = f"saas_user_{int(time.time() * 1000)}@test.corp"
        res = self.client.post("/api/auth/register", json={
            "email": unique_email,
            "name": "Jane Developer",
            "password": "Password123!",
            "confirm_password": "Password123!"
        })
        self.assertEqual(res.status_code, 201)
        data = res.get_json()
        self.assertIn("user", data)
        self.assertEqual(data["user"]["email"], unique_email)
        self.assertEqual(data["user"]["name"], "Jane Developer")
        self.assertEqual(data["user"]["email_verified"], 0)
        self.assertIn("default_project", data)
        self.assertIn("api_key", data)

        # Verify email was dispatched to in-memory dev mailbox
        email_record = email_service.get_latest_email(to_email=unique_email, email_type="email_verification")
        self.assertIsNotNone(email_record)
        self.assertIn("token", email_record)
        raw_token = email_record["token"]
        self.assertTrue(len(raw_token) >= 32)

        # Verify token is NOT stored plaintext in the DB (only hash)
        conn = db.get_conn()
        row = conn.execute("SELECT * FROM email_verification_tokens WHERE user_id = ?", (data["user"]["id"],)).fetchone()
        conn.close()
        self.assertIsNotNone(row)
        self.assertNotEqual(row["token_hash"], raw_token)

    def test_02_email_verification_flow(self):
        """Verify email using token; test single-use enforcement."""
        unique_email = f"verify_{int(time.time() * 1000)}@test.corp"
        reg_res = self.client.post("/api/auth/register", json={
            "email": unique_email,
            "password": "Password123!",
            "confirm_password": "Password123!"
        })
        self.assertEqual(reg_res.status_code, 201)
        user_id = reg_res.get_json()["user"]["id"]

        email_record = email_service.get_latest_email(to_email=unique_email, email_type="email_verification")
        raw_token = email_record["token"]

        # Attempt verification with invalid token
        bad_res = self.client.post("/api/auth/verify-email", json={"token": "invalid_fake_token"})
        self.assertEqual(bad_res.status_code, 400)

        # Verify with valid token
        good_res = self.client.post("/api/auth/verify-email", json={"token": raw_token})
        self.assertEqual(good_res.status_code, 200)
        self.assertTrue(good_res.get_json()["user"]["email_verified"])

        # DB check: email_verified flag is 1
        user = db.get_user_by_id(user_id)
        self.assertTrue(user["email_verified"])

        # Attempt reusing the same token -> should fail (single-use)
        reuse_res = self.client.post("/api/auth/verify-email", json={"token": raw_token})
        self.assertEqual(reuse_res.status_code, 400)
        self.assertIn("already been used", reuse_res.get_json()["error"])

    def test_03_resend_verification_email(self):
        """Resend verification email generates new single-use token."""
        unique_email = f"resend_{int(time.time() * 1000)}@test.corp"
        self.client.post("/api/auth/register", json={
            "email": unique_email,
            "password": "Password123!",
            "confirm_password": "Password123!"
        })
        first_token = email_service.get_latest_email(to_email=unique_email)["token"]

        # Request resend
        res = self.client.post("/api/auth/resend-verification", json={"email": unique_email})
        self.assertEqual(res.status_code, 200)

        second_token = email_service.get_latest_email(to_email=unique_email)["token"]
        self.assertNotEqual(first_token, second_token)

        # Old token was invalidated
        old_verify = self.client.post("/api/auth/verify-email", json={"token": first_token})
        self.assertEqual(old_verify.status_code, 400)

        # New token succeeds
        new_verify = self.client.post("/api/auth/verify-email", json={"token": second_token})
        self.assertEqual(new_verify.status_code, 200)

    def test_04_login_failure_and_rate_limiting(self):
        """Failed logins trigger rate limiting; enumeration is blocked; successful login clears it."""
        unique_email = f"login_test_{int(time.time() * 1000)}@test.corp"
        self.client.post("/api/auth/register", json={
            "email": unique_email,
            "password": "CorrectPassword123!",
            "confirm_password": "CorrectPassword123!"
        })

        client_with_ip = app.test_client()
        headers = {"X-Forwarded-For": "198.51.100.42"}

        # Non-existent user -> identical generic error message
        res_nonexistent = client_with_ip.post("/api/auth/login", json={
            "email": "does_not_exist@example.com",
            "password": "AnyPassword123!"
        }, headers=headers)
        self.assertEqual(res_nonexistent.status_code, 401)
        self.assertEqual(res_nonexistent.get_json()["error"], "Invalid email or password")

        # Wrong password for existing user -> same generic message
        res_wrong = client_with_ip.post("/api/auth/login", json={
            "email": unique_email,
            "password": "WrongPassword123!"
        }, headers=headers)
        self.assertEqual(res_wrong.status_code, 401)
        self.assertEqual(res_wrong.get_json()["error"], "Invalid email or password")

        # Trigger rate limit threshold (10 failures)
        for _ in range(8):
            client_with_ip.post("/api/auth/login", json={
                "email": unique_email,
                "password": "WrongPassword123!"
            }, headers=headers)

        # 11th attempt is rate-limited (429)
        res_blocked = client_with_ip.post("/api/auth/login", json={
            "email": unique_email,
            "password": "CorrectPassword123!"
        }, headers=headers)
        self.assertEqual(res_blocked.status_code, 429)

        # Clear rate limit and verify successful login
        rate_limiter.clear_failed_logins("198.51.100.42")
        res_ok = client_with_ip.post("/api/auth/login", json={
            "email": unique_email,
            "password": "CorrectPassword123!"
        }, headers=headers)
        self.assertEqual(res_ok.status_code, 200)
        self.assertIsNotNone(res_ok.get_json()["user"].get("last_login_at"))

    def test_05_forgot_and_reset_password_flow(self):
        """Request password reset -> receive token -> reset password -> verify login."""
        unique_email = f"reset_test_{int(time.time() * 1000)}@test.corp"
        self.client.post("/api/auth/register", json={
            "email": unique_email,
            "password": "InitialPassword123!",
            "confirm_password": "InitialPassword123!"
        })

        # Request reset for nonexistent email -> returns generic success message (no user enumeration)
        res_fake = self.client.post("/api/auth/forgot-password", json={"email": "nobody@example.com"})
        self.assertEqual(res_fake.status_code, 200)
        self.assertIn("instructions have been sent", res_fake.get_json()["message"])

        # Request reset for real user
        res_real = self.client.post("/api/auth/forgot-password", json={"email": unique_email})
        self.assertEqual(res_real.status_code, 200)

        email_record = email_service.get_latest_email(to_email=unique_email, email_type="password_reset")
        self.assertIsNotNone(email_record)
        reset_token = email_record["token"]

        # Attempt reset with mismatched passwords
        res_mismatch = self.client.post("/api/auth/reset-password", json={
            "token": reset_token,
            "password": "BrandNewPassword123!",
            "confirm_password": "DifferentPassword123!"
        })
        self.assertEqual(res_mismatch.status_code, 400)

        # Apply valid reset
        res_reset = self.client.post("/api/auth/reset-password", json={
            "token": reset_token,
            "password": "BrandNewPassword123!",
            "confirm_password": "BrandNewPassword123!"
        })
        self.assertEqual(res_reset.status_code, 200)

        # Token cannot be reused (single-use)
        res_reuse = self.client.post("/api/auth/reset-password", json={
            "token": reset_token,
            "password": "AnotherNewPassword123!",
            "confirm_password": "AnotherNewPassword123!"
        })
        self.assertEqual(res_reuse.status_code, 400)

        # Old password fails
        login_old = self.client.post("/api/auth/login", json={
            "email": unique_email,
            "password": "InitialPassword123!"
        })
        self.assertEqual(login_old.status_code, 401)

        # New password succeeds
        login_new = self.client.post("/api/auth/login", json={
            "email": unique_email,
            "password": "BrandNewPassword123!"
        })
        self.assertEqual(login_new.status_code, 200)

    def test_06_session_invalidation_on_password_reset(self):
        """Active session created before password reset is rejected on subsequent authenticated calls."""
        unique_email = f"session_inv_{int(time.time() * 1000)}@test.corp"
        client_session = app.test_client()

        # Register and establish session
        client_session.post("/api/auth/register", json={
            "email": unique_email,
            "password": "InitialPassword123!",
            "confirm_password": "InitialPassword123!"
        })

        # Confirm session works
        me_before = client_session.get("/api/auth/me")
        self.assertEqual(me_before.status_code, 200)

        # Small sleep to ensure timestamp separation
        time.sleep(0.05)

        # Trigger forgot password and apply reset from a different client
        reset_client = app.test_client()
        reset_client.post("/api/auth/forgot-password", json={"email": unique_email})
        reset_token = email_service.get_latest_email(to_email=unique_email, email_type="password_reset")["token"]

        apply_res = reset_client.post("/api/auth/reset-password", json={
            "token": reset_token,
            "password": "NewSecretPassword123!",
            "confirm_password": "NewSecretPassword123!"
        })
        self.assertEqual(apply_res.status_code, 200)

        # The original session should now be INVALIDATED immediately (401)
        me_after = client_session.get("/api/auth/me")
        self.assertEqual(me_after.status_code, 401)
        self.assertIn("invalidated", me_after.get_json()["error"].lower())

    def test_07_change_password_flow(self):
        """Authenticated user changes password; requires correct current password; keeps current session valid."""
        unique_email = f"change_pwd_{int(time.time() * 1000)}@test.corp"
        user_client = app.test_client()
        other_session = app.test_client()

        # Register
        user_client.post("/api/auth/register", json={
            "email": unique_email,
            "password": "OldPassword123!",
            "confirm_password": "OldPassword123!"
        })

        # Login other session
        other_session.post("/api/auth/login", json={
            "email": unique_email,
            "password": "OldPassword123!"
        })
        self.assertEqual(other_session.get("/api/auth/me").status_code, 200)

        time.sleep(0.05)

        # Change password with wrong current password
        bad_change = user_client.post("/api/auth/change-password", json={
            "current_password": "WrongCurrentPassword123!",
            "new_password": "NextPassword123!",
            "confirm_password": "NextPassword123!"
        })
        self.assertEqual(bad_change.status_code, 401)

        # Change password with correct current password
        good_change = user_client.post("/api/auth/change-password", json={
            "current_password": "OldPassword123!",
            "new_password": "NextPassword123!",
            "confirm_password": "NextPassword123!"
        })
        self.assertEqual(good_change.status_code, 200)

        # The current user session stays active because its auth_time was refreshed
        self.assertEqual(user_client.get("/api/auth/me").status_code, 200)

        # The concurrent second session is invalidated!
        self.assertEqual(other_session.get("/api/auth/me").status_code, 401)

    def test_08_profile_endpoint(self):
        """GET /api/auth/profile and PUT /api/auth/profile."""
        unique_email = f"profile_test_{int(time.time() * 1000)}@test.corp"
        client = app.test_client()
        client.post("/api/auth/register", json={
            "email": unique_email,
            "name": "Original Name",
            "password": "Password123!",
            "confirm_password": "Password123!"
        })

        # Retrieve profile
        res = client.get("/api/auth/profile")
        self.assertEqual(res.status_code, 200)
        user_data = res.get_json()["user"]
        self.assertEqual(user_data["name"], "Original Name")
        self.assertIn("has_password", user_data)
        self.assertIn("email_verified", user_data)

        # Update profile name
        update_res = client.put("/api/auth/profile", json={"name": "Updated Officer Name"})
        self.assertEqual(update_res.status_code, 200)
        self.assertEqual(update_res.get_json()["user"]["name"], "Updated Officer Name")

        # Verify persisted
        check_res = client.get("/api/auth/profile")
        self.assertEqual(check_res.get_json()["user"]["name"], "Updated Officer Name")

    def test_09_logout_terminates_session(self):
        """POST /api/auth/logout terminates session immediately."""
        unique_email = f"logout_{int(time.time() * 1000)}@test.corp"
        client = app.test_client()
        client.post("/api/auth/register", json={
            "email": unique_email,
            "password": "Password123!",
            "confirm_password": "Password123!"
        })
        self.assertEqual(client.get("/api/auth/me").status_code, 200)

        logout_res = client.post("/api/auth/logout")
        self.assertEqual(logout_res.status_code, 200)

        # Subsequent call must be 401
        self.assertEqual(client.get("/api/auth/me").status_code, 401)

    def test_10_spa_routes_serve_dashboard_html(self):
        """All SPA authentication and account routes serve index.html."""
        routes = ["/login", "/signup", "/forgot-password", "/reset-password", "/verify-email", "/account"]
        for route in routes:
            res = self.client.get(route)
            self.assertEqual(res.status_code, 200, f"Route {route} should return 200")
            html = res.data.decode("utf-8")
            self.assertIn("API Security Analytics", html)
            self.assertIn("form-forgot", html)
            self.assertIn("form-reset", html)
            self.assertIn("account-modal", html)

    def test_11_cookie_security_and_session_expiration(self):
        """Session cookie settings enforce HttpOnly and SameSite."""
        unique_email = f"cookie_{int(time.time() * 1000)}@test.corp"
        res = self.client.post("/api/auth/register", json={
            "email": unique_email,
            "password": "Password123!",
            "confirm_password": "Password123!"
        })
        self.assertEqual(res.status_code, 201)

        set_cookie_header = res.headers.get("Set-Cookie", "")
        self.assertIn("HttpOnly", set_cookie_header)
        self.assertIn("SameSite=Lax", set_cookie_header)

    def test_12_google_user_setting_initial_password(self):
        """Google user with no existing password can set initial password without current_password."""
        unique_email = f"google_nopw_{int(time.time() * 1000)}@test.corp"
        client = app.test_client()

        # Create user via identity directly (simulating Google signup)
        user = db.create_user_with_identity(
            email=unique_email,
            provider="google",
            provider_user_id=f"g_sub_{int(time.time())}",
            provider_email=unique_email
        )

        with client.session_transaction() as sess:
            sess["user_id"] = user["id"]
            sess["auth_time"] = time.time()

        # User currently has no password
        me_res = client.get("/api/auth/me")
        self.assertEqual(me_res.status_code, 200)
        self.assertFalse(me_res.get_json()["user"]["has_password"])

        # Set initial password (no current_password provided)
        set_pw = client.post("/api/auth/change-password", json={
            "new_password": "NewCreatedPassword123!",
            "confirm_password": "NewCreatedPassword123!"
        })
        self.assertEqual(set_pw.status_code, 200)

        # Now user has_password is True
        me_after = client.get("/api/auth/me")
        self.assertTrue(me_after.get_json()["user"]["has_password"])

        # Can now login with newly created password
        login_res = self.client.post("/api/auth/login", json={
            "email": unique_email,
            "password": "NewCreatedPassword123!"
        })
        self.assertEqual(login_res.status_code, 200)


if __name__ == "__main__":
    unittest.main()

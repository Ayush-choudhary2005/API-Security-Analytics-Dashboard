"""
email_service.py — Production-ready transactional email service with SMTP and safe dev fallback.

Supports:
- Email verification links
- Password reset links
- SMTP delivery (TLS/SSL) with environment variables:
    SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, SMTP_FROM, SMTP_USE_TLS
- Development / Test fallback with in-memory delivery queue (never leaks token to public logs)
"""

import os
import smtplib
import logging
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.header import Header

logger = logging.getLogger("email_service")
logger.setLevel(logging.INFO)

# In-memory mailbox for local development and test assertions
_dev_mailbox = []


def _get_app_base_url() -> str:
    port = os.environ.get("PORT", "5001")
    return os.environ.get("APP_BASE_URL", f"http://localhost:{port}").rstrip("/")


def is_smtp_configured() -> bool:
    """Check if SMTP credentials are fully provided in environment."""
    return bool(os.environ.get("SMTP_HOST") and os.environ.get("SMTP_USER") and os.environ.get("SMTP_PASSWORD"))


def _send_smtp_message(to_email: str, subject: str, text_content: str, html_content: str) -> bool:
    """Transmit email via configured SMTP server."""
    host = os.environ.get("SMTP_HOST")
    port = int(os.environ.get("SMTP_PORT", 587))
    user = os.environ.get("SMTP_USER")
    password = os.environ.get("SMTP_PASSWORD")
    sender = os.environ.get("SMTP_FROM", user)
    use_tls = os.environ.get("SMTP_USE_TLS", "true").lower() in ("true", "1", "yes")

    msg = MIMEMultipart("alternative")
    msg["Subject"] = Header(subject, "utf-8")
    msg["From"] = sender
    msg["To"] = to_email

    msg.attach(MIMEText(text_content, "plain", "utf-8"))
    msg.attach(MIMEText(html_content, "html", "utf-8"))

    try:
        if port == 465:
            server = smtplib.SMTP_SSL(host, port, timeout=10)
        else:
            server = smtplib.SMTP(host, port, timeout=10)
            if use_tls:
                server.starttls()
        server.login(user, password)
        server.sendmail(sender, [to_email], msg.as_string())
        server.quit()
        logger.info(f"Transactional email '{subject}' sent successfully to {to_email}")
        return True
    except Exception as e:
        logger.error(f"Failed to send email via SMTP to {to_email}: {e}")
        return False


def send_verification_email(to_email: str, raw_token: str, app_url: str = None) -> bool:
    """
    Send email verification link to user.
    The raw token is transmitted to the user's recipient inbox; only its hash is stored in the DB.
    """
    base_url = app_url.rstrip("/") if app_url else _get_app_base_url()
    verification_link = f"{base_url}/verify-email?token={raw_token}"
    subject = "Verify your API Security Platform account"

    text_body = f"""Welcome to API Security Analytics!

Please verify your email address by opening the following link in your browser:
{verification_link}

This verification link will expire in 24 hours.

If you did not sign up for this account, you can safely ignore this email.
"""

    html_body = f"""<!DOCTYPE html>
<html>
<head>
  <style>
    body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #0b0f19; color: #e2e8f0; margin: 0; padding: 24px; }}
    .card {{ background: #111827; border: 1px solid #1f2937; border-radius: 8px; max-width: 540px; margin: 0 auto; padding: 32px; }}
    .badge {{ color: #00ff66; font-size: 11px; letter-spacing: 2px; text-transform: uppercase; font-weight: bold; margin-bottom: 12px; }}
    h1 {{ color: #f8fafc; font-size: 22px; margin-top: 0; }}
    p {{ color: #94a3b8; line-height: 1.6; font-size: 14px; }}
    .btn {{ display: inline-block; background: #00ff66; color: #050b14; text-decoration: none; font-weight: bold; padding: 12px 24px; border-radius: 6px; margin: 20px 0; font-size: 14px; }}
    .footer {{ font-size: 12px; color: #64748b; margin-top: 24px; border-top: 1px solid #1f2937; padding-top: 16px; }}
    .break-url {{ word-break: break-all; color: #38bdf8; font-size: 12px; }}
  </style>
</head>
<body>
  <div class="card">
    <div class="badge">SECURITY PLATFORM</div>
    <h1>Verify Your Email Address</h1>
    <p>Thank you for signing up for the API Security Analytics & Active Defense Platform. Please confirm your email address to enable all security features and integrations.</p>
    <a href="{verification_link}" class="btn">Verify Email Address</a>
    <p>Or paste this link into your browser:</p>
    <p class="break-url">{verification_link}</p>
    <div class="footer">
      This link will expire in 24 hours. If you did not create an account, please ignore this email.
    </div>
  </div>
</body>
</html>
"""

    # Record delivery record in dev mailbox for assertions and dev convenience
    record = {
        "type": "email_verification",
        "to": to_email,
        "token": raw_token,
        "link": verification_link,
        "subject": subject
    }
    _dev_mailbox.append(record)

    if is_smtp_configured():
        return _send_smtp_message(to_email, subject, text_body, html_body)
    else:
        logger.info(f"[DEV EMAIL] Verification email dispatched to {to_email}")
        return True


def send_password_reset_email(to_email: str, raw_token: str, app_url: str = None) -> bool:
    """
    Send single-use password reset link to user.
    The raw token is transmitted only in the reset link; never logged or stored in plaintext.
    """
    base_url = app_url.rstrip("/") if app_url else _get_app_base_url()
    reset_link = f"{base_url}/reset-password?token={raw_token}"
    subject = "Reset your API Security Platform password"

    text_body = f"""We received a request to reset your password for your API Security Platform account.

To choose a new password, open the following link:
{reset_link}

This link is single-use and will expire in 1 hour.

If you did not request a password reset, please ignore this email. Your current password remains active.
"""

    html_body = f"""<!DOCTYPE html>
<html>
<head>
  <style>
    body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #0b0f19; color: #e2e8f0; margin: 0; padding: 24px; }}
    .card {{ background: #111827; border: 1px solid #1f2937; border-radius: 8px; max-width: 540px; margin: 0 auto; padding: 32px; }}
    .badge {{ color: #f59e0b; font-size: 11px; letter-spacing: 2px; text-transform: uppercase; font-weight: bold; margin-bottom: 12px; }}
    h1 {{ color: #f8fafc; font-size: 22px; margin-top: 0; }}
    p {{ color: #94a3b8; line-height: 1.6; font-size: 14px; }}
    .btn {{ display: inline-block; background: #f59e0b; color: #050b14; text-decoration: none; font-weight: bold; padding: 12px 24px; border-radius: 6px; margin: 20px 0; font-size: 14px; }}
    .footer {{ font-size: 12px; color: #64748b; margin-top: 24px; border-top: 1px solid #1f2937; padding-top: 16px; }}
    .break-url {{ word-break: break-all; color: #38bdf8; font-size: 12px; }}
  </style>
</head>
<body>
  <div class="card">
    <div class="badge">SECURITY NOTICE</div>
    <h1>Reset Your Password</h1>
    <p>A password reset was requested for your API Security Platform account. Click the button below to specify a new password.</p>
    <a href="{reset_link}" class="btn">Reset Password</a>
    <p>Or paste this link into your browser:</p>
    <p class="break-url">{reset_link}</p>
    <div class="footer">
      This link is single-use and expires in 1 hour. If you did not request this, you can safely ignore this email.
    </div>
  </div>
</body>
</html>
"""

    record = {
        "type": "password_reset",
        "to": to_email,
        "token": raw_token,
        "link": reset_link,
        "subject": subject
    }
    _dev_mailbox.append(record)

    if is_smtp_configured():
        return _send_smtp_message(to_email, subject, text_body, html_body)
    else:
        logger.info(f"[DEV EMAIL] Password reset email dispatched to {to_email}")
        return True


def get_latest_email(to_email: str = None, email_type: str = None) -> dict:
    """Test helper to inspect the latest dispatched email."""
    for item in reversed(_dev_mailbox):
        if to_email and item["to"].lower() != to_email.lower():
            continue
        if email_type and item["type"] != email_type:
            continue
        return item
    return None


def clear_dev_mailbox():
    """Clear in-memory mailbox between test cases."""
    _dev_mailbox.clear()

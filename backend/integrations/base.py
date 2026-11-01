"""
base.py — Abstract Base Class for Notification & Incident Integrations.
"""

import abc
import ipaddress
import requests
from urllib.parse import urlparse
from typing import Dict, Any, Tuple


class BaseNotificationProvider(abc.ABC):
    """
    Abstract interface for notification provider adapters (Slack, Discord, PagerDuty, etc.).
    Enforces secret masking, standardized testing, and resilient alert delivery.
    """

    @property
    @abc.abstractmethod
    def provider_id(self) -> str:
        """Machine identifier (e.g. 'slack', 'discord')."""
        pass

    @property
    @abc.abstractmethod
    def display_name(self) -> str:
        """Human-readable name (e.g. 'Slack Incoming Webhook')."""
        pass

    def validate_url(self, url: str) -> Tuple[bool, str]:
        """Validate destination URL format without making network requests."""
        if not url or not isinstance(url, str):
            return False, "Webhook URL is required"
        url = url.strip()
        try:
            parsed = urlparse(url)
        except Exception:
            return False, "Malformed webhook URL"

        if parsed.scheme.lower() != "https":
            return False, "Only HTTPS webhook URLs are supported"

        hostname = (parsed.hostname or "").strip().lower()
        if not hostname:
            return False, "Webhook URL must contain a valid host"

        disallowed_hosts = {"localhost", "127.0.0.1", "0.0.0.0", "::1"}
        if hostname in disallowed_hosts:
            return False, "Localhost and loopback destinations are not allowed"

        if hostname.endswith((".local", ".internal", ".localhost", ".lan")):
            return False, "Internal and private domains are not allowed"

        if hostname.startswith("169.254."):
            return False, "Link-local and cloud metadata destinations are not allowed"

        try:
            ip = ipaddress.ip_address(hostname)
            if ip.is_loopback or ip.is_private or ip.is_link_local or ip.is_reserved or ip.is_multicast:
                return False, "Private and internal IP destinations are not allowed"
        except ValueError:
            pass

        return True, ""

    def mask_url(self, url: str) -> str:
        """
        Mask sensitive tokens in the webhook URL so raw secrets
        are never logged or exposed to the frontend.
        """
        if not url:
            return ""
        try:
            parsed = urlparse(url)
            path = parsed.path
            parts = [p for p in path.split("/") if p]
            if len(parts) >= 2:
                masked_parts = [parts[0]] + ["****" for _ in parts[1:]]
                return f"{parsed.scheme}://{parsed.netloc}/{'/'.join(masked_parts)}"
            elif parts:
                return f"{parsed.scheme}://{parsed.netloc}/{parts[0]}/****"
            return f"{parsed.scheme}://{parsed.netloc}/****"
        except Exception:
            if len(url) > 20:
                return url[:12] + "****" + url[-4:]
            return "****"

    @abc.abstractmethod
    def format_alert(self, alert_data: Dict[str, Any]) -> Dict[str, Any]:
        """Transform canonical alert data into provider-specific payload."""
        pass

    @abc.abstractmethod
    def format_test_message(self, project_name: str) -> Dict[str, Any]:
        """Generate test verification payload."""
        pass

    def send_alert(self, alert_data: Dict[str, Any], webhook_url: str, timeout: int = 5) -> bool:
        """
        Deliver an alert payload to the provider endpoint.
        Never throws exceptions to caller; logs masked destination on failure.
        """
        if not webhook_url:
            return False

        valid, err = self.validate_url(webhook_url)
        if not valid:
            print(f"[INTEGRATION] Rejected delivery via {self.display_name} to invalid URL: {err}")
            return False

        masked = self.mask_url(webhook_url)
        payload = self.format_alert(alert_data)
        try:
            res = requests.post(
                webhook_url,
                json=payload,
                headers={"Content-Type": "application/json", "User-Agent": "ML-O11Y-Alert-Service/1.0"},
                timeout=timeout,
                allow_redirects=False
            )
            if res.status_code in (200, 204):
                return True
            print(f"[INTEGRATION] {self.display_name} returned HTTP {res.status_code} to {masked}")
            return False
        except Exception as e:
            print(f"[INTEGRATION] Failed to deliver alert via {self.display_name} to {masked}: {e}")
            return False

    def test_connection(self, webhook_url: str, project_name: str = "Project", timeout: int = 5) -> Tuple[bool, str]:
        """
        Send a test message to verify the webhook connection.
        Returns: (success: bool, message: str)
        """
        valid, err = self.validate_url(webhook_url)
        if not valid:
            return False, err

        masked = self.mask_url(webhook_url)
        payload = self.format_test_message(project_name)
        try:
            res = requests.post(
                webhook_url,
                json=payload,
                headers={"Content-Type": "application/json", "User-Agent": "ML-O11Y-Alert-Service/1.0"},
                timeout=timeout,
                allow_redirects=False
            )
            if res.status_code in (200, 204):
                return True, f"Verified connection to {self.display_name} successfully (HTTP {res.status_code})"
            return False, f"{self.display_name} returned HTTP {res.status_code}: {res.text[:120]}"
        except requests.Timeout:
            return False, f"Connection to {self.display_name} timed out after {timeout}s"
        except Exception as e:
            return False, f"Failed to connect to {self.display_name}: {str(e)}"

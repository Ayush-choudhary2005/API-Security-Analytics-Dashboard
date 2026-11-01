"""
base.py — Abstract Base Class for Notification & Incident Integrations.
"""

import abc
import ipaddress
import socket
import requests
from urllib.parse import urlparse
from typing import Dict, Any, Tuple

CGNAT_NET = ipaddress.ip_network("100.64.0.0/10")
AWS_IMDS_IPV6 = ipaddress.ip_address("fd00:ec2::254")


def is_prohibited_ip(ip_obj) -> Tuple[bool, str]:
    """
    Evaluate whether an IP address belongs to internal, private, loopback,
    link-local, cloud metadata, or carrier-grade NAT address spaces.
    """
    if isinstance(ip_obj, ipaddress.IPv6Address) and ip_obj.ipv4_mapped:
        return is_prohibited_ip(ip_obj.ipv4_mapped)

    if ip_obj.is_loopback:
        return True, f"Loopback address ({ip_obj}) is prohibited"
    if ip_obj.is_private:
        return True, f"Private network address ({ip_obj}) is prohibited"
    if ip_obj.is_link_local:
        return True, f"Link-local address ({ip_obj}) is prohibited"
    if ip_obj.is_multicast:
        return True, f"Multicast address ({ip_obj}) is prohibited"
    if ip_obj.is_reserved:
        return True, f"Reserved network address ({ip_obj}) is prohibited"
    if ip_obj.is_unspecified:
        return True, f"Unspecified address ({ip_obj}) is prohibited"
    if ip_obj.version == 4 and ip_obj in CGNAT_NET:
        return True, f"Carrier-grade NAT address ({ip_obj}) is prohibited"
    if ip_obj == AWS_IMDS_IPV6:
        return True, f"Cloud metadata address ({ip_obj}) is prohibited"

    return False, ""


MAX_RESPONSE_BYTES = 4096
DEFAULT_MAX_TIMEOUT = 3


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
        """
        Validate destination URL format and verify resolved IP addresses
        to block SSRF targeting private, internal, and cloud metadata infrastructure.
        """
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

        # 1. Direct IP Literal Validation
        try:
            ip = ipaddress.ip_address(hostname)
            is_bad, reason = is_prohibited_ip(ip)
            if is_bad:
                return False, f"Prohibited IP destination: {reason}"
            return True, ""
        except ValueError:
            pass

        # 2. DNS Resolution Filter: Verify all resolved IP addresses
        try:
            addr_info = socket.getaddrinfo(hostname, None, socket.AF_UNSPEC, socket.SOCK_STREAM)
            if not addr_info:
                return False, f"Unable to resolve webhook destination hostname '{hostname}'"

            for item in addr_info:
                sockaddr = item[4]
                ip_str = sockaddr[0]
                resolved_ip = ipaddress.ip_address(ip_str)
                is_bad, reason = is_prohibited_ip(resolved_ip)
                if is_bad:
                    return False, f"Webhook host '{hostname}' resolves to prohibited internal address: {reason}"
        except socket.gaierror:
            return False, f"DNS resolution failed for '{hostname}': host not found"
        except Exception as e:
            return False, f"DNS resolution verification failed for '{hostname}': {str(e)}"

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
        Enforces TOCTOU / DNS rebinding defenses, strict 3s timeout, and 4KB body cap.
        """
        if not webhook_url:
            return False

        valid, err = self.validate_url(webhook_url)
        if not valid:
            print(f"[INTEGRATION] Rejected delivery via {self.display_name} to invalid URL: {err}")
            return False

        effective_timeout = min(timeout, DEFAULT_MAX_TIMEOUT)
        masked = self.mask_url(webhook_url)
        payload = self.format_alert(alert_data)
        try:
            res = requests.post(
                webhook_url,
                json=payload,
                headers={"Content-Type": "application/json", "User-Agent": "ML-O11Y-Alert-Service/1.0"},
                timeout=effective_timeout,
                allow_redirects=False,
                stream=True
            )

            # TOCTOU & DNS Rebinding Defense: Verify connected socket peer IP
            try:
                raw_conn = getattr(res, "raw", None)
                sock = getattr(raw_conn, "_connection", None)
                sock_obj = getattr(sock, "sock", None)
                if sock_obj:
                    peer_ip_str = sock_obj.getpeername()[0]
                    is_bad, reason = is_prohibited_ip(ipaddress.ip_address(peer_ip_str))
                    if is_bad:
                        res.close()
                        print(f"[INTEGRATION] Terminated delivery: peer IP {peer_ip_str} is prohibited: {reason}")
                        return False
            except Exception:
                pass

            # Cap response body to prevent response-bomb memory exhaustion
            try:
                res.raw.read(MAX_RESPONSE_BYTES, decode_content=True)
            except Exception:
                pass

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
        Enforces TOCTOU / DNS rebinding defenses, strict 3s timeout, and 4KB body cap.
        """
        valid, err = self.validate_url(webhook_url)
        if not valid:
            return False, err

        effective_timeout = min(timeout, DEFAULT_MAX_TIMEOUT)
        masked = self.mask_url(webhook_url)
        payload = self.format_test_message(project_name)
        try:
            res = requests.post(
                webhook_url,
                json=payload,
                headers={"Content-Type": "application/json", "User-Agent": "ML-O11Y-Alert-Service/1.0"},
                timeout=effective_timeout,
                allow_redirects=False,
                stream=True
            )

            # TOCTOU & DNS Rebinding Defense: Verify connected socket peer IP
            try:
                raw_conn = getattr(res, "raw", None)
                sock = getattr(raw_conn, "_connection", None)
                sock_obj = getattr(sock, "sock", None)
                if sock_obj:
                    peer_ip_str = sock_obj.getpeername()[0]
                    is_bad, reason = is_prohibited_ip(ipaddress.ip_address(peer_ip_str))
                    if is_bad:
                        res.close()
                        return False, f"Connection terminated: peer IP resolved to prohibited address ({peer_ip_str})"
            except Exception:
                pass

            # Read capped response snippet
            snippet = ""
            try:
                body_bytes = res.raw.read(MAX_RESPONSE_BYTES, decode_content=True)
                snippet = body_bytes.decode("utf-8", errors="replace")[:120]
            except Exception:
                snippet = res.text[:120] if hasattr(res, "text") else ""

            if res.status_code in (200, 204):
                return True, f"Verified connection to {self.display_name} successfully (HTTP {res.status_code})"
            return False, f"{self.display_name} returned HTTP {res.status_code}: {snippet}"
        except requests.Timeout:
            return False, f"Connection to {self.display_name} timed out after {effective_timeout}s"
        except Exception as e:
            return False, f"Failed to connect to {self.display_name}: {str(e)}"

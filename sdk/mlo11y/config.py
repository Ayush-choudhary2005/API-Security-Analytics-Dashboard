"""
config.py — Configuration management for ML-O11Y Security SDK.
Safely loads configuration from constructor arguments or environment variables.
Never prints or logs unmasked SDK credentials.
"""

import os
from typing import Callable, Optional, Any


def mask_credential(key: Optional[str]) -> str:
    """Mask SDK credential for safe display and logging."""
    if not key:
        return "[NOT SET]"
    key_str = str(key).strip()
    if len(key_str) <= 8:
        return "****"
    return f"{key_str[:6]}...{key_str[-4:]}"


def _get_env_bool(name: str, default: bool) -> bool:
    val = os.environ.get(name)
    if val is None:
        return default
    return val.strip().lower() not in ("0", "false", "no", "off", "disabled")


def _get_env_float(name: str, default: float) -> float:
    val = os.environ.get(name)
    if val is None:
        return default
    try:
        return float(val.strip())
    except (ValueError, TypeError):
        return default


def _get_env_int(name: str, default: int) -> int:
    val = os.environ.get(name)
    if val is None:
        return default
    try:
        return int(val.strip())
    except (ValueError, TypeError):
        return default


class SecurityConfig:
    """
    Production configuration container for ML-O11Y Security SDK.

    Precedence:
    Explicit Constructor Argument > Environment Variable > Default
    """

    def __init__(
        self,
        api_key: Optional[str] = None,
        token: Optional[str] = None,
        collector_url: Optional[str] = None,
        enabled: Optional[bool] = None,
        timeout: Optional[float] = None,
        max_queue_size: Optional[int] = None,
        flush_interval: Optional[float] = None,
        app_name: Optional[str] = None,
        user_id_callback: Optional[Callable[[Any], Optional[str]]] = None,
        debug: Optional[bool] = None,
    ):
        # 1. API Key / SDK Credential
        resolved_key = (
            api_key
            or token
            or os.environ.get("SECURITY_SDK_API_KEY")
            or os.environ.get("MLO11Y_API_KEY")
            or os.environ.get("API_SECURITY_KEY")
            or ""
        )
        self.api_key: str = resolved_key.strip()

        # 2. Collector URL
        resolved_url = (
            collector_url
            or os.environ.get("SECURITY_SDK_COLLECTOR_URL")
            or os.environ.get("MLO11Y_COLLECTOR_URL")
            or os.environ.get("COLLECTOR_URL")
            or "http://localhost:5001"
        )
        self.collector_url: str = resolved_url.strip().rstrip("/")
        self.ingest_url: str = f"{self.collector_url}/ingest"

        # 3. Enabled Flag
        if enabled is not None:
            self.enabled: bool = bool(enabled)
        else:
            self.enabled = _get_env_bool("SECURITY_SDK_ENABLED", True) and _get_env_bool("MLO11Y_ENABLED", True)

        # 4. HTTP Request Timeout (seconds)
        if timeout is not None:
            self.timeout: float = float(timeout)
        else:
            self.timeout = _get_env_float("SECURITY_SDK_TIMEOUT", _get_env_float("MLO11Y_TIMEOUT", 2.0))

        # 5. In-Memory Queue Buffer Size (bounded to prevent OOM)
        if max_queue_size is not None:
            self.max_queue_size: int = int(max_queue_size)
        else:
            self.max_queue_size = _get_env_int("SECURITY_SDK_MAX_QUEUE_SIZE", 10000)

        # 6. Worker Flush Interval
        if flush_interval is not None:
            self.flush_interval: float = float(flush_interval)
        else:
            self.flush_interval = _get_env_float("SECURITY_SDK_FLUSH_INTERVAL", 0.5)

        # 7. Application Label
        self.app_name: str = (
            app_name
            or os.environ.get("SECURITY_SDK_APP_NAME")
            or os.environ.get("MLO11Y_APP_NAME")
            or "flask-app"
        ).strip()

        # 8. User ID Extraction Hook
        self.user_id_callback: Optional[Callable[[Any], Optional[str]]] = user_id_callback

        # 9. Debug Logging Flag
        if debug is not None:
            self.debug: bool = bool(debug)
        else:
            self.debug = _get_env_bool("SECURITY_SDK_DEBUG", False) or _get_env_bool("MLO11Y_DEBUG", False)

    def is_configured(self) -> bool:
        """Check if SDK has required credentials to operate."""
        return bool(self.api_key)

    def __repr__(self) -> str:
        return (
            f"SecurityConfig("
            f"collector_url='{self.collector_url}', "
            f"api_key='{mask_credential(self.api_key)}', "
            f"enabled={self.enabled}, "
            f"timeout={self.timeout}s, "
            f"max_queue_size={self.max_queue_size}, "
            f"app_name='{self.app_name}')"
        )

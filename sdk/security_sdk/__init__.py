"""
security_sdk — Developer-friendly alias for ML-O11Y Security & Observability SDK.

Allows intuitive integration:
    from security_sdk import SecurityMiddleware

    app = Flask(__name__)
    SecurityMiddleware(app, api_key="ask_...")
"""

from mlo11y import SecurityMiddleware, SecurityConfig, observe, mask_credential, __version__

__all__ = ["SecurityMiddleware", "SecurityConfig", "observe", "mask_credential", "__version__"]

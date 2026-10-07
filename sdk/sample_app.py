"""
sample_app.py — Ready-to-run demonstration Flask application using ML-O11Y Security SDK.
"""

import os
from flask import Flask, jsonify, request

try:
    from security_sdk import SecurityMiddleware
except ImportError:
    from middleware import SecurityMiddleware

app = Flask(__name__)

# Initialize SDK (reads SECURITY_SDK_API_KEY from environment or explicit argument)
api_key = os.environ.get("SECURITY_SDK_API_KEY", "ask_demo_credential_1234567890abcdef")
collector_url = os.environ.get("SECURITY_SDK_COLLECTOR_URL", "http://127.0.0.1:5001")

SecurityMiddleware(
    app,
    collector_url=collector_url,
    api_key=api_key,
    app_name="Sample-Payment-API",
)


@app.route("/")
def index():
    return jsonify({
        "status": "online",
        "service": "Sample Payment API",
        "protection": "ML-O11Y Active Defense Enabled",
    })


@app.route("/api/orders", methods=["GET", "POST"])
def orders():
    if request.method == "POST":
        return jsonify({"order_id": "ord_1001", "status": "created"}), 201
    return jsonify({"orders": [{"id": "ord_1001", "total": 49.99}]}), 200


@app.route("/api/login", methods=["POST"])
def mock_login():
    data = request.get_json(silent=True) or {}
    username = data.get("username", "")
    password = data.get("password", "")

    # Simulated authentication check
    if username == "admin" and password == "secret":
        return jsonify({"token": "jwt_token_sample", "user_id": "usr_admin"}), 200

    # Simulated authentication failure — captured by ML-O11Y for credential stuffing detection
    return jsonify({"error": "Unauthorized"}), 401


if __name__ == "__main__":
    print(f"Sample API running on http://127.0.0.1:5002")
    print(f"Forwarding telemetry to {collector_url}")
    app.run(port=5002, debug=False)

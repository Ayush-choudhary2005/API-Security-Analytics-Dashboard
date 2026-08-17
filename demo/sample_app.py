"""
sample_app.py — a tiny sample API that stands in for "a developer's app".
The traffic generators in demo/ hit this app, which is instrumented with
the ML-O11Y SDK in exactly 3 lines (see below).

Run with: python3 sample_app.py
Listens on port 5000. Collector must already be running on port 5001.
"""

import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "sdk"))

from flask import Flask, jsonify, request

# ---- SDK integration: 3 lines ----
from middleware import observe
app = Flask(__name__)
observe(app, collector_url="http://localhost:5001", token="phase1-demo-token")
# -----------------------------------

USERS = {"alice": "pw123", "bob": "hunter2"}


@app.route("/api/login", methods=["POST"])
def login():
    data = request.get_json(silent=True) or {}
    username = data.get("username")
    password = data.get("password")
    if USERS.get(username) == password:
        return jsonify({"status": "ok", "token": "fake-jwt-token"}), 200
    return jsonify({"status": "unauthorized"}), 401


@app.route("/api/users", methods=["GET"])
def list_users():
    return jsonify({"users": list(USERS.keys())}), 200


@app.route("/api/users/<username>", methods=["GET"])
def get_user(username):
    if username in USERS:
        return jsonify({"username": username}), 200
    return jsonify({"error": "not found"}), 404


@app.route("/api/orders", methods=["GET"])
def orders():
    return jsonify({"orders": []}), 200


@app.route("/api/products", methods=["GET"])
def products():
    return jsonify({"products": ["widget", "gadget", "gizmo"]}), 200


@app.route("/api/search", methods=["GET"])
def search():
    return jsonify({"results": []}), 200


if __name__ == "__main__":
    print("Sample app running on port 5000, instrumented -> collector on 5001")
    app.run(host="0.0.0.0", port=5000, debug=False, threaded=True)

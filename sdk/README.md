# 🛡️ ML-O11Y Security SDK for Flask

Production-grade, zero-latency API security observability and active defense middleware for Python Flask applications.

---

## ⚡ Quickstart

### 1. Install the SDK
```bash
pip install .
```
*(or install dependencies if using standalone files: `pip install flask requests`)*

---

### 2. Add to your Flask application

```python
from flask import Flask
from security_sdk import SecurityMiddleware

app = Flask(__name__)

# Attach zero-latency security observability
SecurityMiddleware(app, api_key="ask_your_project_sdk_key")

@app.route("/api/hello")
def hello():
    return {"status": "ok", "message": "Protected by ML-O11Y!"}

if __name__ == "__main__":
    app.run(port=5000)
```

*(You can also import via `from mlo11y import SecurityMiddleware`)*

---

## 🔒 Configuration via Environment Variables

To keep secrets out of your source code, configure the SDK via environment variables:

```bash
export SECURITY_SDK_API_KEY="ask_ecomm_a1b2c3d4e5f6..."
export SECURITY_SDK_COLLECTOR_URL="http://127.0.0.1:5001"
```

Then initialize without hardcoding credentials:

```python
SecurityMiddleware(app)
```

### Full Configuration Reference

| Option | Environment Variable | Default | Description |
|---|---|---|---|
| `api_key` | `SECURITY_SDK_API_KEY` | `""` | Project SDK credential (`ask_...`) |
| `collector_url` | `SECURITY_SDK_COLLECTOR_URL` | `http://localhost:5001` | URL of the ML-O11Y security ingestion collector |
| `enabled` | `SECURITY_SDK_ENABLED` | `true` | Set to `false` to disable telemetry capture (e.g. during local tests) |
| `timeout` | `SECURITY_SDK_TIMEOUT` | `2.0` | Timeout in seconds for background telemetry delivery |
| `max_queue_size` | `SECURITY_SDK_MAX_QUEUE_SIZE` | `10000` | In-memory buffer size before dropping telemetry |
| `app_name` | `SECURITY_SDK_APP_NAME` | `flask-app` | Descriptive application name |
| `user_id_callback` | — | `None` | Optional function `callback(request)` returning user ID |
| `debug` | `SECURITY_SDK_DEBUG` | `false` | Enable verbose worker debug output |

---

## 🛡️ Production Safety & Resilience

1. **Zero Added Latency:** Telemetry is queued in-memory (`queue.put_nowait`) in sub-milliseconds. No HTTP network requests occur in the Flask request thread.
2. **Fail-Safe Operation:** If the ML-O11Y collector is offline, experiencing downtime, or unreachable, your application **continues operating normally**. Telemetry is buffered or dropped safely without throwing exceptions or crashing your API.
3. **No Credential Logging:** SDK credentials are automatically masked in all log outputs and exception traces.
4. **Memory Protected:** Bounded queue prevents Out-Of-Memory (OOM) conditions during prolonged collector outages.
5. **Reverse Proxy / Cloudflare Aware:** Automatically resolves authentic client IP addresses across `X-Forwarded-For`, `CF-Connecting-IP`, and `X-Real-IP`.

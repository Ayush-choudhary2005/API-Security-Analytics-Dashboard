"""
train_model.py — Isolation Forest Model Training & Self-Learning Engine.
Supports continuous autonomous retraining across both SQLite & PostgreSQL.
"""

import os
import time
import logging
from collections import defaultdict, deque
import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import IsolationForest

import db
import detection

logger = logging.getLogger("api_security.train_model")
MODEL_PATH = os.path.join(os.path.dirname(__file__), "isolation_forest_model.joblib")
FEATURES = ['latency_ms', 'failed_auth_count', 'unique_endpoints', 'request_count_10s']


def extract_features(limit: int = 3000) -> pd.DataFrame:
    """Extract recent event features from database with rolling 60s window per IP."""
    conn = db.get_conn()
    rows = conn.execute("SELECT * FROM events ORDER BY timestamp DESC LIMIT ?", (limit,)).fetchall()
    events = [db._row_to_dict(r) for r in rows][::-1]
    conn.close()

    if len(events) < 15:
        # Synthesize baseline normal distribution if database has minimal traffic
        np.random.seed(42)
        n = 300
        latencies = np.clip(np.random.lognormal(mean=4.0, sigma=0.5, size=n), 10.0, 350.0)
        failed_auth = np.random.choice([0, 1], size=n, p=[0.98, 0.02])
        unique_endpoints = np.random.randint(1, 4, size=n)
        request_count_10s = np.random.randint(1, 6, size=n)
        return pd.DataFrame({
            "latency_ms": latencies,
            "failed_auth_count": failed_auth,
            "unique_endpoints": unique_endpoints,
            "request_count_10s": request_count_10s,
        })

    # Fast sliding window extraction per IP
    ip_windows = defaultdict(deque)
    feature_list = []

    for e in events:
        ip = e.get("ip") or e.get("source_ip", "127.0.0.1")
        now_ts = float(e.get("timestamp", time.time()))

        q = ip_windows[ip]
        q.append(e)
        while q and (now_ts - float(q[0].get("timestamp", 0))) > 60:
            q.popleft()

        history = list(q)[:-1]
        feats = detection.compute_features(ip, now_ts, history)
        feats["latency_ms"] = float(e.get("latency_ms", 25.0))
        feature_list.append(feats)

    return pd.DataFrame(feature_list)


def retrain_from_db(contamination: float = 0.04) -> dict:
    """Retrain the Isolation Forest model on latest database events and hot-reload."""
    df = extract_features(limit=3000)
    X = df[FEATURES]

    model = IsolationForest(n_estimators=100, contamination=contamination, random_state=42)
    model.fit(X)

    joblib.dump(model, MODEL_PATH)
    detection.reload_model()

    last_ts = os.path.getmtime(MODEL_PATH)
    logger.info(f"Model retrained with {len(df)} samples. Timestamp: {last_ts}")
    return {
        "success": True,
        "samples_trained": len(df),
        "timestamp": last_ts,
        "features": FEATURES
    }


if __name__ == "__main__":
    res = retrain_from_db()
    print(f"Retrain completed: {res}")

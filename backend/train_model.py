import os
import sqlite3
import pandas as pd
from sklearn.ensemble import IsolationForest
import joblib

# Import existing backend modules for feature engineering
import db
import detection

DB_PATH = os.path.join(os.path.dirname(__file__), "events.db")
MODEL_PATH = os.path.join(os.path.dirname(__file__), "isolation_forest_model.joblib")

def extract_features():
    print("1. Extracting raw events from the database...")
    conn = db.get_conn()
    
    # Fetch all events chronologically
    rows = conn.execute("SELECT * FROM events ORDER BY timestamp ASC").fetchall()
    events = [db._row_to_dict(r) for r in rows]
    conn.close()

    if len(events) < 10:
        print("Warning: Very little data found. Generating a model anyway, but you might want to run generators.py more.")

    print(f"2. Building feature set for {len(events)} events (this simulates the live feature extraction)...")
    feature_list = []
    
    # For every event, we calculate what its features looked like at the time it occurred.
    for i, event in enumerate(events):
        ip = event["ip"]
        now_ts = event["timestamp"]
        
        # A simple way to get history for this event: look at the events we've processed so far
        # that belong to the same IP and occurred within the last 60 seconds.
        history = [e for e in events[:i] if e["ip"] == ip and (now_ts - e["timestamp"] <= 60)]
        
        # Re-use your existing Phase 1 feature extraction logic!
        features = detection.compute_features(ip, now_ts, history)
        
        # Add latency as a feature
        features["latency_ms"] = event["latency_ms"]
        feature_list.append(features)

    # Convert to a Pandas DataFrame
    df = pd.DataFrame(feature_list)
    return df

def train_model(df):
    print("3. Training the Isolation Forest model...")
    # These are the exact features the model will use to isolate anomalies
    features = ['latency_ms', 'failed_auth_count', 'unique_endpoints', 'request_count_10s']
    X = df[features]
    
    # Initialize the model. 
    # 'contamination' is our expected percentage of attacks. We set it to 0.05 (5%).
    # Since you only generated "normal" traffic, the model will learn exactly what normal looks like.
    model = IsolationForest(n_estimators=100, contamination=0.05, random_state=42)
    
    # Train it!
    model.fit(X)
    
    # Save the trained model to a file
    joblib.dump(model, MODEL_PATH)
    print(f"4. Model trained successfully and saved to: {MODEL_PATH}")

if __name__ == "__main__":
    df = extract_features()
    
    print("\n--- Sample of the features extracted from 'normal' traffic ---")
    print(df.head())
    print("--------------------------------------------------------------\n")
    
    train_model(df)

#!/usr/bin/env bash
# Exit on error
set -o errexit

echo "=== [1/2] Installing Python backend dependencies ==="
pip install -r requirements.txt

echo "=== [2/2] Building React frontend SPA ==="
if [ -d "frontend/dashboard" ]; then
  cd frontend/dashboard
  npm install
  npm run build
  cd ../..
  echo "Frontend build completed successfully."
fi

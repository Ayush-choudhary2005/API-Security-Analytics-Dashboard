# =================================================================
# Production Dockerfile — API Security Analytics & Active Defense Platform
# =================================================================

# -------------------------------------------------------------
# Stage 1: Build React + Vite Production Frontend
# -------------------------------------------------------------
FROM node:20-alpine AS frontend-builder
WORKDIR /app/frontend/dashboard

COPY frontend/dashboard/package*.json ./
RUN npm ci || npm install

COPY frontend/dashboard/ ./
RUN npm run build

# -------------------------------------------------------------
# Stage 2: Production Python Runtime & Web Server
# -------------------------------------------------------------
FROM python:3.11-slim AS base

# Set environment variables
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONPATH=/app/backend \
    PORT=5001 \
    ENVIRONMENT=production

# Install essential system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Create unprivileged application user
RUN useradd -m -u 1001 -s /bin/bash appuser

WORKDIR /app

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application directories
COPY backend/ ./backend/
COPY --from=frontend-builder /app/frontend/dashboard/dist/ ./frontend/dashboard/dist/
COPY sdk/ ./sdk/
COPY gunicorn_config.py .

# Ensure appuser owns the app directory
RUN chown -R appuser:appuser /app

# Switch to non-root user for hardened container security
USER appuser

# Expose service port
EXPOSE 5001

# Container Healthcheck targeting the readiness probe
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD curl -f http://localhost:5001/ready || exit 1

# Start production server with Gunicorn
CMD ["gunicorn", "--config", "gunicorn_config.py", "server:app"]

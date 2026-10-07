# =================================================================
# Production Dockerfile — API Security Analytics & Active Defense Platform
# =================================================================
FROM python:3.11-slim as base

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
COPY frontend/dashboard/dist/ ./frontend/dashboard/dist/
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

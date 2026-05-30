#!/bin/bash
# /home/z/my-project/.zscripts/dev.sh
# Called by Z.ai platform -> tini -> /start.sh -> this script
# Supervises the CloudShell server, restarting it if it crashes.

cd /home/z/my-project

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    echo "[dev.sh] Installing dependencies..."
    bun install 2>&1 | tail -3
fi

# Ensure http-proxy is installed
if [ ! -d "node_modules/http-proxy" ]; then
    echo "[dev.sh] Installing http-proxy..."
    npm install http-proxy 2>&1 | tail -3
fi

# Environment
export HOME=/home/z
export PATH=/home/z/bin:/home/z/.local/bin:/home/z/openoutreach/.venv/bin:/home/z/.venv/bin:/usr/local/bin:/usr/bin:/bin
export PORT=3000
export LD_LIBRARY_PATH=/home/z/.local/lib

# Build Next.js for production
if [ ! -f .next/BUILD_ID ]; then
    echo "[dev.sh] Building Next.js (first time)..."
    npx next build 2>&1 | tail -5
fi

export NODE_ENV=production

# Clean any stale lock files
rm -f /home/z/my-project/.next/dev/lock

LOG=/home/z/my-project/server.log

echo "[dev.sh] Starting CloudShell supervisor (pid=$$)" | tee -a "$LOG"

# ─── Start OpenOutreach Services ────────────────────────────
start_openoutreach() {
    echo "[$(date)] Starting OpenOutreach services..." >> "$LOG"
    mkdir -p /home/z/openoutreach/logs

    # 1. Xvfb
    if [ ! -f /tmp/.X99-lock ]; then
        /usr/bin/Xvfb :99 -screen 0 1920x1080x24 &
        sleep 1
    fi

    # 2. x11vnc
    if ! ss -tlnp | grep -q ':5900'; then
        LD_LIBRARY_PATH=/home/z/.local/lib DISPLAY=:99 /home/z/.local/bin/x11vnc \
            -display :99 -forever -shared -nopw -rfbport 5900 \
            &>>/home/z/openoutreach/logs/x11vnc.log &
        sleep 1
    fi

    # 3. websockify (noVNC)
    if ! ss -tlnp | grep -q ':6080'; then
        /home/z/.venv/bin/websockify \
            --web /home/z/.local/share/noVNC-1.5.0 \
            6080 localhost:5900 \
            &>>/home/z/openoutreach/logs/websockify.log &
        sleep 1
    fi

    # 4. Django admin server (Real OpenOutreach)
    if ! ss -tlnp | grep -q ':8000'; then
        cd /home/z/openoutreach-source
        source .venv/bin/activate
        DISPLAY=:99 \
        python manage.py runserver --noreload 0.0.0.0:8000 \
            &>>/home/z/openoutreach-source/logs/admin.log &
        cd /home/z/my-project
        sleep 3
    fi
}

# Start OpenOutreach on boot
start_openoutreach

# ─── Supervisor Loop ────────────────────────────────────────
while true; do
    # Clean up old port if needed
    fuser -k 3000/tcp 2>/dev/null || true
    sleep 1

    echo "[$(date)] Starting CloudShell server..." >> "$LOG"
    
    # Start the server (foreground - supervisor waits for it)
    node --experimental-strip-types server.ts >> "$LOG" 2>&1
    EXIT_CODE=$?
    echo "[$(date)] Server exited with code $EXIT_CODE" >> "$LOG"

    # Exit code 0 means intentional shutdown
    if [ "$EXIT_CODE" -eq 0 ]; then
        echo "[$(date)] Intentional shutdown, waiting 10s before restart..." >> "$LOG"
        sleep 10
    fi

    # Wait before restarting
    sleep 3
    fuser -k 3000/tcp 2>/dev/null || true
    sleep 1
    
    # Restart OpenOutreach services if they died
    start_openoutreach
done

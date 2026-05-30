#!/bin/bash
# Keep-alive supervisor for CloudShell server + OpenOutreach services
# This script is designed to be started once and persist

cd /home/z/my-project
export HOME=/home/z
export PATH=/home/z/bin:/home/z/.local/bin:/home/z/openoutreach/.venv/bin:/home/z/.venv/bin:/usr/local/bin:/usr/bin:/bin
export PORT=3000
export NODE_ENV=production
export LD_LIBRARY_PATH=/home/z/.local/lib
export DISPLAY=:99

LOG=/home/z/my-project/server.log

echo "[$(date)] keep-alive supervisor started (pid=$$)" >> "$LOG"

# ─── Start OpenOutreach Services ────────────────────────────
start_openoutreach() {
    echo "[$(date)] Starting OpenOutreach services..." >> "$LOG"

    # 1. Xvfb
    if [ ! -f /tmp/.X99-lock ]; then
        /usr/bin/Xvfb :99 -screen 0 1920x1080x24 &
        sleep 1
        echo "[$(date)] Xvfb started" >> "$LOG"
    else
        echo "[$(date)] Xvfb already running" >> "$LOG"
    fi

    # 2. x11vnc
    if ! ss -tlnp | grep -q ':5900'; then
        LD_LIBRARY_PATH=/home/z/.local/lib DISPLAY=:99 /home/z/.local/bin/x11vnc \
            -display :99 -forever -shared -nopw -rfbport 5900 \
            &>>/home/z/openoutreach/logs/x11vnc.log &
        sleep 1
        echo "[$(date)] x11vnc started" >> "$LOG"
    fi

    # 3. websockify (noVNC)
    if ! ss -tlnp | grep -q ':6080'; then
        /home/z/.venv/bin/websockify \
            --web /home/z/.local/share/noVNC-1.5.0 \
            6080 localhost:5900 \
            &>>/home/z/openoutreach/logs/websockify.log &
        sleep 1
        echo "[$(date)] websockify started" >> "$LOG"
    fi

    # 4. Django admin server
    if ! ss -tlnp | grep -q ':8000'; then
        cd /home/z/openoutreach
        DJANGO_SETTINGS_MODULE=linkedin.django_settings \
        DISPLAY=:99 \
        /home/z/openoutreach/.venv/bin/python manage.py runserver 0.0.0.0:8000 \
            &>>/home/z/openoutreach/logs/django.log &
        cd /home/z/my-project
        sleep 2
        echo "[$(date)] Django started" >> "$LOG"
    fi
}

# Start OpenOutreach services on boot
mkdir -p /home/z/openoutreach/logs
start_openoutreach

# ─── Supervisor Loop for Node Server ────────────────────────
while true; do
    # Kill any existing server on port 3000
    fuser -k 3000/tcp 2>/dev/null || true
    sleep 1

    echo "[$(date)] Starting CloudShell server..." >> "$LOG"

    node --experimental-strip-types server.ts >> "$LOG" 2>&1
    EXIT_CODE=$?

    echo "[$(date)] Server exited with code $EXIT_CODE" >> "$LOG"

    # Clean exit
    if [ "$EXIT_CODE" -eq 0 ]; then
        echo "[keep-alive] Clean shutdown, not restarting" | tee -a "$LOG"
        break
    fi

    # Crash - wait and restart
    echo "[keep-alive] Server crashed (exit=$EXIT_CODE), restarting in 3s..." | tee -a "$LOG"
    sleep 3

    # Kill any stale processes on port 3000
    fuser -k 3000/tcp 2>/dev/null || true
    sleep 1

    # Restart OpenOutreach services if they died too
    start_openoutreach
done

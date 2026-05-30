#!/bin/bash
# Keep-alive supervisor for CloudShell server
# This script is designed to be started once and persist

cd /home/z/my-project
export HOME=/home/z
export PATH=/home/z/.local/bin:/home/z/openoutreach/.venv/bin:/home/z/.venv/bin:/usr/local/bin:/usr/bin:/bin
export PORT=3000
export NODE_ENV=production

LOG=/home/z/my-project/server.log

echo "[$(date)] keep-alive supervisor started (pid=$$)" >> "$LOG"

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
        break
    fi
    
    # Crash - wait and restart
    sleep 3
done

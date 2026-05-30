#!/bin/bash
# Keep-alive script for CloudShell server
# This script runs in a loop and restarts the server if it dies

cd /home/z/my-project
export HOME=/home/z
export PATH=/home/z/bin:/home/z/.local/bin:/home/z/openoutreach/.venv/bin:/home/z/.venv/bin:/usr/local/bin:/usr/bin:/bin
export PORT=3000
export LD_LIBRARY_PATH=/home/z/.local/lib
export NODE_ENV=production

LOG=/home/z/my-project/server.log

while true; do
    # Kill any stale processes on port 3000
    fuser -k 3000/tcp 2>/dev/null || true
    sleep 1
    
    echo "[$(date)] Starting server..." >> "$LOG"
    
    # Start the server (this blocks until the server exits)
    node --experimental-strip-types server.ts >> "$LOG" 2>&1
    EXIT_CODE=$?
    
    echo "[$(date)] Server exited with code $EXIT_CODE" >> "$LOG"
    
    # Wait before restarting (exit code 0 = intentional, wait longer)
    if [ "$EXIT_CODE" -eq 0 ]; then
        sleep 10
    else
        sleep 3
    fi
done

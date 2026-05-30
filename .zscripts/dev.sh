#!/bin/bash
# /home/z/my-project/.zscripts/dev.sh
# Called by Z.ai platform -> tini -> /start.sh -> this script
#
# This script is run as a background process by start.sh.
# It supervises the CloudShell server, restarting it if it crashes.

cd /home/z/my-project

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    echo "[dev.sh] Installing dependencies..."
    bun install 2>&1 | tail -3
fi

# Ensure http-proxy is installed (needed for Django/noVNC proxy)
if [ ! -d "node_modules/http-proxy" ]; then
    echo "[dev.sh] Installing http-proxy..."
    npm install http-proxy 2>&1 | tail -3
fi

# Environment
export HOME=/home/z
export PATH=/home/z/.local/bin:/home/z/openoutreach/.venv/bin:/home/z/.venv/bin:/usr/local/bin:/usr/bin:/bin
export PORT=3000

# Build Next.js for production (required for stable Caddy proxy)
if [ ! -f .next/BUILD_ID ]; then
    echo "[dev.sh] Building Next.js (first time)..."
    npx next build 2>&1 | tail -5
fi

# Use production mode - dev mode crashes through Caddy reverse proxy
export NODE_ENV=production

# Clean any stale lock files
rm -f /home/z/my-project/.next/dev/lock

LOG=/home/z/my-project/server.log

echo "[dev.sh] Starting CloudShell supervisor (pid=$$)" | tee -a "$LOG"

# Supervisor loop: keep the server running, restart on crash
while true; do
    # Kill any existing server on port 3000
    fuser -k 3000/tcp 2>/dev/null || true
    sleep 1

    echo "[$(date)] Starting CloudShell server..." >> "$LOG"

    node --experimental-strip-types server.ts >> "$LOG" 2>&1
    EXIT_CODE=$?

    echo "[$(date)] Server exited with code $EXIT_CODE" >> "$LOG"

    # Clean exit - don't restart
    if [ "$EXIT_CODE" -eq 0 ]; then
        echo "[dev.sh] Clean shutdown, not restarting" | tee -a "$LOG"
        break
    fi

    # Crash or signal - wait and restart
    echo "[dev.sh] Server crashed (exit=$EXIT_CODE), restarting in 3s..." | tee -a "$LOG"
    sleep 3

    # Kill any stale processes on port 3000
    fuser -k 3000/tcp 2>/dev/null || true
    sleep 1
done

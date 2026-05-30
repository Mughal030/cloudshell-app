#!/bin/bash
# /home/z/my-project/.zscripts/dev.sh
# Called by Z.ai platform -> tini -> /start.sh -> this script
# 'exec' replaces this process with node, so tini directly supervises node

set -euo pipefail
cd /home/z/my-project

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    echo "[dev.sh] Installing dependencies..."
    bun install
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

echo "[dev.sh] Starting CloudShell server in production mode (pid=$$)"

# exec: replaces shell with node - tini supervises node directly
exec node --experimental-strip-types server.ts

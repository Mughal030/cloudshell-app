#!/bin/bash
set -e

cd /home/z/my-project

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
  echo "[DEV] Installing main project dependencies..."
  bun install
fi

# Set up database
bun run db:push 2>/dev/null || true

# Start the integrated CloudShell server (Next.js + Terminal service in one process)
# This starts both the Next.js app on port 3000 and the terminal service on port 3003
echo "[DEV] Starting CloudShell integrated server..."
exec node --experimental-strip-types server.ts

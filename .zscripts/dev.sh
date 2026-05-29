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

# Start terminal service in background
echo "[DEV] Starting terminal service..."
cd /home/z/my-project/mini-services/terminal-service
if [ ! -d "node_modules" ]; then
  bun install
fi
bun run dev &
TS_PID=$!
echo "[DEV] Terminal service PID: $TS_PID"

# Wait a moment for terminal service to bind
sleep 2

# Start Next.js dev server (foreground - this keeps the script running)
cd /home/z/my-project
echo "[DEV] Starting Next.js dev server..."
exec bun run dev

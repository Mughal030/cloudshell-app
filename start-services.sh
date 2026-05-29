#!/bin/bash
set -e

# Start terminal service
echo "Starting terminal service..."
cd /home/z/my-project/mini-services/terminal-service
node --experimental-strip-types index.ts &
TS_PID=$!
echo "Terminal service PID: $TS_PID"

# Start Next.js dev server
echo "Starting Next.js dev server..."
cd /home/z/my-project
bun run dev &
NJ_PID=$!
echo "Next.js PID: $NJ_PID"

# Wait for either to exit
wait -n $TS_PID $NJ_PID 2>/dev/null || true
echo "A service exited, shutting down..."
kill $TS_PID $NJ_PID 2>/dev/null || true

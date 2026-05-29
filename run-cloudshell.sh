#!/bin/bash
set -e

echo "Starting CloudShell..."

# Kill any existing instances
pkill -f "server.ts" 2>/dev/null || true
sleep 1

# Start the integrated server (Next.js + Terminal service in one process)
cd /home/z/my-project
node --experimental-strip-types server.ts 2>&1 | tee /home/z/my-project/server.log

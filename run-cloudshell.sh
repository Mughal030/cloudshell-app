#!/bin/bash
# CloudShell startup script with daemon pattern
set -e

echo "Starting CloudShell..."

# Kill any existing instances
pkill -f "node.*server.ts" 2>/dev/null || true
sleep 2

cd /home/z/my-project

# Double-fork daemon pattern to survive shell session cleanup
(
    setsid node --experimental-strip-types server.ts >> /home/z/my-project/server.log 2>&1 &
    exit 0
) &

# Wait for server to start
sleep 5

# Verify it's running
if pgrep -f "server.ts" > /dev/null; then
    echo "CloudShell started successfully!"
    echo "  Next.js:     http://localhost:3000"
    echo "  Terminal:    http://localhost:3003"
    echo "  Workspace:  /home/z/my-project/workspace"
else
    echo "ERROR: CloudShell failed to start. Check server.log"
    exit 1
fi

#!/bin/bash
set -e

# Kill any existing instances
pkill -f "next dev -p 3000" 2>/dev/null || true
pkill -f "terminal-service.*index.ts" 2>/dev/null || true
sleep 1

# Start terminal service
cd /home/z/my-project/mini-services/terminal-service
node --experimental-strip-types index.ts &
TS_PID=$!
echo "Terminal service PID: $TS_PID"

# Start Next.js
cd /home/z/my-project
npx next dev -p 3000 &
NJ_PID=$!
echo "Next.js PID: $NJ_PID"

# Save PIDs
echo "$TS_PID" > /tmp/cloudshell-ts.pid
echo "$NJ_PID" > /tmp/cloudshell-nj.pid

# Wait for services
echo "Waiting for services to be ready..."
for i in $(seq 1 30); do
  if ss -tlnp 2>/dev/null | grep -q ":3000 " && ss -tlnp 2>/dev/null | grep -q ":3003 "; then
    echo "Both services ready!"
    break
  fi
  sleep 1
done

# Keep running
wait

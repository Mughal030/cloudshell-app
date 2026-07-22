#!/bin/bash
# Start CloudShell server - properly detached from parent shell
cd /home/z/my-project

# Kill any existing server
pkill -f "node.*server.ts" 2>/dev/null || true
sleep 1

# Start proxy (if not already running)
if ! curl -s http://localhost:8082/health 2>/dev/null | grep -q "healthy"; then
  nohup node scripts/fcc-model-discovery-proxy.cjs > /tmp/fcc-proxy.log 2>&1 &
  disown
  echo "Proxy started"
  sleep 2
fi

# Start main server - fully detached
nohup node --experimental-strip-types server.ts > /tmp/cloudshell-server.log 2>&1 &
disown

# Wait for startup
sleep 8

# Verify
echo "=== Server Status ==="
if pgrep -f "node.*server.ts" > /dev/null; then
  echo "Server: RUNNING"
  HEALTH=$(curl -s http://localhost:3000/api/health)
  echo "Health: $HEALTH"
else
  echo "Server: NOT RUNNING"
fi

if pgrep -f "fcc-model-discovery-proxy" > /dev/null; then
  echo "Proxy: RUNNING"
  curl -s http://localhost:8082/health | python3 -c "import json,sys; d=json.load(sys.stdin); print(f'Status: {d[\"status\"]}, Models: {d[\"models_available\"]}')"
else
  echo "Proxy: NOT RUNNING"
fi

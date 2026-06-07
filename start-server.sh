#!/bin/bash
cd /home/z/my-project
export HOME=/home/z
export PATH=/home/z/.local/bin:/home/z/openoutreach/.venv/bin:/home/z/.venv/bin:/usr/local/bin:/usr/bin:/bin
export PORT=3000
export NODE_ENV=production
rm -f .next/dev/lock

# Write PID file
echo $$ > /tmp/cs-server.pid

exec node --experimental-strip-types server.ts >> /tmp/cs-daemon.log 2>&1

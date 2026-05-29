#!/bin/bash
# Start terminal service
cd /home/z/my-project/mini-services/terminal-service
node --experimental-strip-types index.ts >> /home/z/my-project/terminal-service.log 2>&1 &
echo $! > /tmp/ts.pid

# Start Next.js dev server
cd /home/z/my-project
npx next dev -p 3000 >> /home/z/my-project/dev.log 2>&1 &
echo $! > /tmp/nj.pid

# Wait
wait

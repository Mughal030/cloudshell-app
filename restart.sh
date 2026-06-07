#!/bin/bash
# CloudShell Restart Script
echo "Restarting CloudShell..."

# Kill existing server
pkill -f "node.*server.ts" 2>/dev/null || true
sleep 2

# Clean up
rm -f /home/z/my-project/.next/dev/lock

# Start with double-fork daemon
cd /home/z/my-project
python3 -c "
import os, sys
pid = os.fork()
if pid > 0:
    print(f'Started daemon: {pid}')
    sys.exit(0)
os.setsid()
os.umask(0)
pid = os.fork()
if pid > 0:
    sys.exit(0)
sys.stdout.flush()
sys.stderr.flush()
si = open(os.devnull, 'r')
so = open('/tmp/cs-daemon.log', 'a+')
se = open('/tmp/cs-daemon.log', 'a+')
os.dup2(si.fileno(), sys.stdin.fileno())
os.dup2(so.fileno(), sys.stdout.fileno())
os.dup2(se.fileno(), sys.stderr.fileno())
os.execvp('node', ['node', '--experimental-strip-types', 'server.ts'])
"

sleep 8
echo "Server status:"
ps aux | grep "server.ts" | grep -v grep | head -1
curl -s -o /dev/null -w "HTTP: %{http_code}\n" http://127.0.0.1:3000/

#!/bin/bash
# CloudShell Launcher - keeps the server alive
cd /home/z/my-project

# Clean up old lock files
rm -f .next/dev/lock

# Trap signals to forward them
trap "" SIGHUP
trap "exit 0" SIGTERM SIGINT

# Start the server
node --experimental-strip-types server.ts 2>&1 | tee -a /tmp/cs-launch.log

# If we reach here, server died
echo "[Launcher] Server exited at $(date)"

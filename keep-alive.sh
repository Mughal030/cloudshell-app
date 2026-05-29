#!/bin/bash
# Keep-alive script for CloudShell server
while true; do
    cd /home/z/my-project
    node --experimental-strip-types server.ts 2>&1
    echo "[keep-alive] Server exited, restarting in 3s..."
    sleep 3
done

#!/bin/bash
# CloudShell watchdog - restarts the server if it dies
LOG=/home/z/my-project/server.log
PID_FILE=/home/z/my-project/server.pid

while true; do
    cd /home/z/my-project
    echo "[$(date)] Starting CloudShell server..." >> $LOG
    
    node --experimental-strip-types server.ts >> $LOG 2>&1 &
    SERVER_PID=$!
    echo $SERVER_PID > $PID_FILE
    
    # Wait for the process to exit
    wait $SERVER_PID 2>/dev/null
    EXIT_CODE=$?
    echo "[$(date)] Server exited with code $EXIT_CODE, restarting in 3 seconds..." >> $LOG
    sleep 3
done

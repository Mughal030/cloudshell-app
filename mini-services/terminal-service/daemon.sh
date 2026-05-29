#!/bin/bash
# Simple daemon that keeps the terminal service alive
LOGFILE=/home/z/my-project/terminal-service.log
cd /home/z/my-project/mini-services/terminal-service

while true; do
  echo "[$(date)] Starting terminal service..." >> "$LOGFILE"
  bun index.ts >> "$LOGFILE" 2>&1
  EXIT_CODE=$?
  echo "[$(date)] Terminal service exited with code $EXIT_CODE" >> "$LOGFILE"
  if [ $EXIT_CODE -ne 0 ]; then
    echo "[$(date)] Restarting in 3 seconds..." >> "$LOGFILE"
    sleep 3
  else
    echo "[$(date)] Clean exit, not restarting" >> "$LOGFILE"
    break
  fi
done

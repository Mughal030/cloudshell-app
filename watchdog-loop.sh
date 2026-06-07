#!/bin/bash
cd /home/z/my-project
while true; do
  rm -f .next/dev/lock
  echo "[$(date)] Starting CloudShell server..." >> /tmp/cs-watchdog.log
  node --experimental-strip-types server.ts >> /tmp/cs-daemon.log 2>&1
  EXIT=$?
  echo "[$(date)] Server exited with code $EXIT, restarting in 3s..." >> /tmp/cs-watchdog.log
  sleep 3
done

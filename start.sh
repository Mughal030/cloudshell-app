#!/bin/bash
cd /home/z/my-project
while true; do
  echo "[$(date)] Starting CloudShell..." >> /tmp/cloudshell-watchdog.log
  node --experimental-strip-types server.ts >> /tmp/cloudshell-output.log 2>&1
  EXIT=$?
  echo "[$(date)] Server exited with code $EXIT, restarting in 3s..." >> /tmp/cloudshell-watchdog.log
  sleep 3
done

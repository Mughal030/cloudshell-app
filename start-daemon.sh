#!/bin/bash
# Double-fork daemon pattern
cd /home/z/my-project

(
    # First fork
    setsid node --experimental-strip-types server.ts >> /home/z/my-project/server.log 2>&1 &
    exit 0
) &
# Second fork returns immediately

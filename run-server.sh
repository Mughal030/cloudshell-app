#!/bin/bash
cd /home/z/my-project
exec node --experimental-strip-types server.ts >> /tmp/cs-daemon.log 2>&1

#!/bin/bash
# Start the terminal service using Node.js (handles IPv4+IPv6 dual-stack better than bun)
cd /home/z/my-project/mini-services/terminal-service
exec node --experimental-strip-types index.ts

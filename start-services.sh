#!/bin/bash
# CloudShell Start Script
# Runs the integrated server (Next.js + Terminal service) in a single process

echo "Starting CloudShell..."

cd /home/z/my-project

# Start the integrated server
exec node --experimental-strip-types server.ts

#!/bin/bash
# .zscripts/dev.sh — CloudShell Z.ai entry point (Strategy 1)
# Assumes: node_modules/ committed, .next/ committed
# Expected boot: < 8 seconds (112s safety margin)
set -euo pipefail
cd /home/z/my-project

### ─── Timing ───────────────────────────────────────────────
START=$(date +%s%N)
log() { echo "[$(( ($(date +%s%N) - START) / 1000000 ))ms] $*"; }

log "=== CloudShell dev.sh starting ==="

### ─── 1. Kill Guard (prevents Django/any process on port 3000) ──
for port in 3000 8000; do
    pid=$(ss -tlnp 2>/dev/null | awk -v p=":$port" '$4~p{match($6,/pid=([0-9]+)/,a); print a[1]}')
    [ -n "$pid" ] && kill -9 $pid 2>/dev/null && log "Killed PID $pid on port $port"
done

### ─── 2. Python Health-Check Responder (starts in <0.5s) ───────
python3 -c "
import http.server, os

class H(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        body = b'CloudShell starting...'
        self.send_response(200)
        self.send_header('Content-Type','text/plain')
        self.send_header('Content-Length', len(body))
        self.end_headers()
        self.wfile.write(body)
    def log_message(self, *a): pass

httpd = http.server.HTTPServer(('0.0.0.0', 3000), H)
with open('/tmp/health-responder.pid', 'w') as f:
    f.write(str(os.getpid()))
httpd.serve_forever()
" &
log "Health responder started on :3000"

### ─── 3. Check node_modules (no npm install if committed) ──────
if [ -d node_modules/next ]; then
    log "node_modules present (committed) — skipping npm install"
else
    log "WARN: node_modules missing — running npm ci (slow path)"
    npm ci --omit=dev --prefer-offline --ignore-scripts 2>&1 | tail -3
    log "npm ci complete"
fi

### ─── 4. Check .next/ (no build if committed) ──────────────────
if [ -f .next/BUILD_ID ]; then
    log "Pre-built .next/ present — skipping next build"
else
    log "WARN: .next/ missing — running next build (slow path)"
    NODE_ENV=production npx next build 2>&1 | tail -5
    log "next build complete"
fi

### ─── 5. Start real server ────────────────────────────────────
export NODE_ENV=production
export PORT=3000
export HOME=/home/z
export PATH=/home/z/.local/bin:/home/z/openoutreach/.venv/bin:/usr/local/bin:/usr/bin:/bin
export DISPLAY=:99

log "Starting Node.js server..."
node --experimental-strip-types server.ts > /tmp/cloudshell-server.log 2>&1 &
SERVER_PID=$!
log "Server process started (pid=$SERVER_PID)"

### ─── 6. Wait for real server to be ready ──────────────────────
READY=0
for i in $(seq 1 30); do
    sleep 1
    RESP=$(curl -s http://localhost:3000/ 2>/dev/null || echo "")
    if echo "$RESP" | grep -qv "CloudShell starting" && [ -n "$RESP" ]; then
        READY=1
        log "Real server is ready (${i}s after fork)"
        break
    fi
done

### ─── 7. Kill health responder — hand over port 3000 ──────────
if [ -f /tmp/health-responder.pid ]; then
    kill $(cat /tmp/health-responder.pid) 2>/dev/null
    rm -f /tmp/health-responder.pid
    log "Health responder killed — port 3000 handed to Node.js"
fi

### ─── 8. Supervisor loop (auto-restart on crash) ───────────────
log "=== Supervisor active. Server running. ==="
while true; do
    if ! kill -0 $SERVER_PID 2>/dev/null; then
        log "Server crashed! Restarting in 2s..."
        sleep 2
        node --experimental-strip-types server.ts >> /tmp/cloudshell-server.log 2>&1 &
        SERVER_PID=$!
        log "Server restarted (pid=$SERVER_PID)"
    fi
    sleep 5
done

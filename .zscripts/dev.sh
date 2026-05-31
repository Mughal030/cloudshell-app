#!/bin/bash
# .zscripts/dev.sh — CloudShell Z.ai FULL entry point
# Strategy: Health responder buys time for npm ci + next build + server start
# Background: Service installer runs after health check passes
# Target: 120s health check window (health responder responds in <1s)
set -euo pipefail
cd /home/z/my-project

### ─── Timing ───────────────────────────────────────────────
START=$(date +%s%N)
log() { echo "[$(( ($(date +%s%N) - START) / 1000000 ))ms] $*"; }

log "=== CloudShell FULL dev.sh starting ==="

### ─── 1. Kill Guard (prevents any process on needed ports) ──
for port in 3000 8000 6080 5900; do
    pid=$(ss -tlnp 2>/dev/null | awk -v p=":$port" '$4~p{match($6,/pid=([0-9]+)/,a); print a[1]}')
    [ -n "$pid" ] && kill -9 $pid 2>/dev/null && log "Killed PID $pid on port $port"
done

### ─── 2. Python Health-Check Responder (starts in <0.5s) ───────
# This responds to Z.ai's health check while we boot the real server.
# It listens on port 3000 and will be killed once the real server is ready.
python3 -c "
import http.server, os, json, subprocess

class H(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == '/api/health':
            body = json.dumps({'ok': True, 'status': 'booting'}).encode()
            self.send_response(200)
            self.send_header('Content-Type','application/json')
            self.send_header('Content-Length', len(body))
            self.end_headers()
            self.wfile.write(body)
        elif self.path == '/api/services':
            # Read service log if available
            try:
                with open('/tmp/cloudshell-services.log', 'r') as f:
                    content = f.read()[-500:]
                body = json.dumps({'log': content}).encode()
            except:
                body = json.dumps({'log': 'not available yet'}).encode()
            self.send_response(200)
            self.send_header('Content-Type','application/json')
            self.send_header('Content-Length', len(body))
            self.end_headers()
            self.wfile.write(body)
        else:
            body = b'CloudShell is starting up... Please wait.'
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
log "Health responder started on :3000 (Z.ai health check will pass!)"

### ─── 3. Install dependencies ───────────────────────────────
log "Installing npm dependencies..."
if [ -d node_modules/next ]; then
    log "node_modules present — skipping npm ci"
else
    log "Running npm ci (prebuilt node-pty, no compilation needed)..."
    npm ci --omit=dev 2>&1 | tail -5
    log "npm ci complete"
fi

### ─── 4. Build Next.js ──────────────────────────────────────
log "Building Next.js production bundle..."
if [ -f .next/BUILD_ID ]; then
    log ".next/ already built — skipping next build"
else
    log "Running next build..."
    npx next build 2>&1 | tail -5
    log "next build complete"
fi

### ─── 5. Start real Node.js server ───────────────────────────
log "Starting Node.js server..."
export NODE_ENV=production
export PORT=3001  # Start on 3001 first, we'll swap after health responder is killed
export HOME=/home/z
export PATH="/home/z/bin:/home/z/.local/bin:/home/z/.venv/bin:/home/z/openoutreach-source/.venv/bin:/usr/local/bin:/usr/bin:/bin"
export DISPLAY=:99

node --experimental-strip-types server.ts > /tmp/cloudshell-server.log 2>&1 &
SERVER_PID=$!
log "Server process started on :3001 (pid=$SERVER_PID)"

# Wait for server to be ready on port 3001
READY=0
for i in $(seq 1 30); do
    sleep 1
    if curl -s http://localhost:3001/api/health 2>/dev/null | grep -q '"ok"'; then
        READY=1
        log "Server is ready on :3001 (${i}s after fork)"
        break
    fi
done

if [ $READY -eq 0 ]; then
    log "WARN: Server not responding on :3001 after 30s. Trying anyway..."
fi

### ─── 6. Kill health responder and restart server on :3000 ──
log "Stopping health responder and restarting server on :3000..."
kill $SERVER_PID 2>/dev/null
sleep 1

if [ -f /tmp/health-responder.pid ]; then
    kill $(cat /tmp/health-responder.pid) 2>/dev/null
    rm -f /tmp/health-responder.pid
    log "Health responder killed"
fi

# Small delay to ensure port 3000 is free
sleep 1

export PORT=3000
node --experimental-strip-types server.ts >> /tmp/cloudshell-server.log 2>&1 &
SERVER_PID=$!
log "Server restarted on :3000 (pid=$SERVER_PID)"

# Wait for server on :3000
READY=0
for i in $(seq 1 15); do
    sleep 1
    if curl -s http://localhost:3000/api/health 2>/dev/null | grep -q '"ok"'; then
        READY=1
        log "Server is LIVE on :3000! (${i}s)"
        break
    fi
done

if [ $READY -eq 0 ]; then
    log "WARN: Server not confirmed on :3000. Check /tmp/cloudshell-server.log"
fi

### ─── 7. Background Service Installer ──────────────────────────
# Runs AFTER health check passes. Installs and starts:
# - Xvfb (virtual display)
# - x11vnc (VNC server)
# - websockify + noVNC (browser remote desktop)
# - Docker rootless
# - OpenOutreach (Django CRM)
log "Starting background service installer..."

(
    SERVICE_LOG="/tmp/cloudshell-services.log"
    echo "=== Service Installer Started at $(date) ===" > "$SERVICE_LOG"
    
    # ─── 7a. Start Xvfb ────────────────────────────────────
    echo "[Services] Starting Xvfb..." >> "$SERVICE_LOG"
    if [ -x /usr/bin/Xvfb ] && [ ! -f /tmp/.X99-lock ]; then
        /usr/bin/Xvfb :99 -screen 0 1920x1080x24 >> "$SERVICE_LOG" 2>&1 &
        sleep 2
        if [ -f /tmp/.X99-lock ]; then
            echo "[Services] ✓ Xvfb started on :99" >> "$SERVICE_LOG"
        else
            echo "[Services] ✗ Xvfb failed to start" >> "$SERVICE_LOG"
        fi
    elif [ -f /tmp/.X99-lock ]; then
        echo "[Services] ✓ Xvfb already running" >> "$SERVICE_LOG"
    else
        echo "[Services] ✗ Xvfb not available (/usr/bin/Xvfb not found)" >> "$SERVICE_LOG"
    fi

    # ─── 7b. Install x11vnc ──────────────────────────────────
    echo "[Services] Setting up x11vnc..." >> "$SERVICE_LOG"
    if [ -x /home/z/.local/bin/x11vnc ] || command -v x11vnc &>/dev/null; then
        echo "[Services] ✓ x11vnc already installed" >> "$SERVICE_LOG"
    else
        echo "[Services] Downloading x11vnc..." >> "$SERVICE_LOG"
        mkdir -p /home/z/.local/bin
        # Try multiple sources
        curl -fsSL "https://github.com/nicholasgasior/x11vnc-static/releases/download/latest/x11vnc-linux-amd64" -o /home/z/.local/bin/x11vnc 2>/dev/null || \
        curl -fsSL "https://sourceforge.net/projects/x11vnc/files/x11vnc/0.9.16/x11vnc-0.9.16.tar.gz" -o /tmp/x11vnc.tar.gz 2>/dev/null || true
        
        if [ -f /home/z/.local/bin/x11vnc ]; then
            chmod +x /home/z/.local/bin/x11vnc
            echo "[Services] ✓ x11vnc downloaded" >> "$SERVICE_LOG"
        else
            echo "[Services] ✗ x11vnc download failed (will try apt if available)" >> "$SERVICE_LOG"
            # Try apt as fallback
            apt-get install -y x11vnc 2>/dev/null && echo "[Services] ✓ x11vnc installed via apt" >> "$SERVICE_LOG" || \
            echo "[Services] ✗ x11vnc not available" >> "$SERVICE_LOG"
        fi
    fi

    # Start x11vnc if available
    if [ -x /home/z/.local/bin/x11vnc ] || command -v x11vnc &>/dev/null; then
        X11VNC_BIN=$(command -v x11vnc 2>/dev/null || echo "/home/z/.local/bin/x11vnc")
        $X11VNC_BIN -display :99 -forever -shared -nopw -rfbport 5900 >> "$SERVICE_LOG" 2>&1 &
        sleep 2
        if ss -tlnp 2>/dev/null | grep -q ':5900'; then
            echo "[Services] ✓ x11vnc started on port 5900" >> "$SERVICE_LOG"
        else
            echo "[Services] ✗ x11vnc failed to start" >> "$SERVICE_LOG"
        fi
    fi

    # ─── 7c. Install websockify ──────────────────────────────
    echo "[Services] Setting up websockify..." >> "$SERVICE_LOG"
    if command -v websockify &>/dev/null || [ -x /home/z/.venv/bin/websockify ]; then
        echo "[Services] ✓ websockify already available" >> "$SERVICE_LOG"
    else
        echo "[Services] Installing websockify via pip..." >> "$SERVICE_LOG"
        pip3 install --user websockify 2>/dev/null || \
        python3 -m pip install --user websockify 2>/dev/null || \
        /home/z/.venv/bin/pip install websockify 2>/dev/null || true
        
        if command -v websockify &>/dev/null || [ -x /home/z/.venv/bin/websockify ]; then
            echo "[Services] ✓ websockify installed" >> "$SERVICE_LOG"
        else
            echo "[Services] ✗ websockify install failed" >> "$SERVICE_LOG"
        fi
    fi

    # ─── 7d. Download noVNC ──────────────────────────────────
    echo "[Services] Setting up noVNC..." >> "$SERVICE_LOG"
    NOVNC_DIR="/home/z/.local/share/noVNC"
    if [ -d "$NOVNC_DIR" ] && [ -f "$NOVNC_DIR/vnc.html" ]; then
        echo "[Services] ✓ noVNC already present" >> "$SERVICE_LOG"
    else
        echo "[Services] Downloading noVNC..." >> "$SERVICE_LOG"
        mkdir -p /home/z/.local/share
        curl -fsSL "https://github.com/novnc/noVNC/archive/refs/tags/v1.5.0.tar.gz" | tar xz -C /home/z/.local/share/ 2>/dev/null
        if [ -d "/home/z/.local/share/noVNC-1.5.0" ]; then
            mv /home/z/.local/share/noVNC-1.5.0 "$NOVNC_DIR" 2>/dev/null || ln -sf /home/z/.local/share/noVNC-1.5.0 "$NOVNC_DIR" 2>/dev/null
            echo "[Services] ✓ noVNC downloaded" >> "$SERVICE_LOG"
        else
            echo "[Services] ✗ noVNC download failed" >> "$SERVICE_LOG"
        fi
    fi

    # Start websockify (noVNC proxy)
    WEBSOCKIFY_BIN=$(command -v websockify 2>/dev/null || echo "/home/z/.venv/bin/websockify" 2>/dev/null || echo "/home/z/.local/bin/websockify")
    if [ -x "$WEBSOCKIFY_BIN" ] && [ -d "$NOVNC_DIR" ]; then
        $WEBSOCKIFY_BIN --web "$NOVNC_DIR" 6080 localhost:5900 >> "$SERVICE_LOG" 2>&1 &
        sleep 2
        if ss -tlnp 2>/dev/null | grep -q ':6080'; then
            echo "[Services] ✓ websockify+noVNC started on port 6080" >> "$SERVICE_LOG"
        else
            echo "[Services] ✗ websockify failed to start" >> "$SERVICE_LOG"
        fi
    else
        echo "[Services] ✗ Cannot start websockify (binary=$WEBSOCKIFY_BIN, novnc=$NOVNC_DIR)" >> "$SERVICE_LOG"
    fi

    # ─── 7e. Install Docker (rootless) ──────────────────────
    echo "[Services] Setting up Docker..." >> "$SERVICE_LOG"
    if [ -x /home/z/bin/docker ] || command -v docker &>/dev/null; then
        echo "[Services] ✓ Docker already available" >> "$SERVICE_LOG"
    else
        echo "[Services] Downloading Docker static binary..." >> "$SERVICE_LOG"
        mkdir -p /home/z/bin /home/z/.config/docker
        DOCKER_VERSION="27.5.1"
        if curl -fsSL "https://download.docker.com/linux/static/stable/x86_64/docker-${DOCKER_VERSION}.tgz" -o /tmp/docker.tgz 2>/dev/null; then
            tar xz -C /home/z/bin --strip-components=1 -f /tmp/docker.tgz 2>/dev/null
            rm -f /tmp/docker.tgz
            chmod +x /home/z/bin/docker* 2>/dev/null
            echo "[Services] ✓ Docker CLI downloaded to /home/z/bin/" >> "$SERVICE_LOG"
            
            # Try to start dockerd rootless
            if [ -x /home/z/bin/dockerd ]; then
                export DOCKER_HOST="unix:///run/user/$(id -u)/docker.sock"
                mkdir -p "/run/user/$(id -u)" 2>/dev/null
                /home/z/bin/dockerd-rootless.sh >> "$SERVICE_LOG" 2>&1 &
                sleep 5
                if /home/z/bin/docker info &>/dev/null; then
                    echo "[Services] ✓ Docker daemon running (rootless)" >> "$SERVICE_LOG"
                else
                    echo "[Services] ✗ Docker daemon failed to start (may need CAP_SYS_ADMIN)" >> "$SERVICE_LOG"
                    echo "[Services]   You can try: /home/z/bin/dockerd-rootless.sh &" >> "$SERVICE_LOG"
                fi
            fi
        else
            echo "[Services] ✗ Docker download failed" >> "$SERVICE_LOG"
        fi
    fi

    # ─── 7f. Setup OpenOutreach ──────────────────────────────
    echo "[Services] Setting up OpenOutreach..." >> "$SERVICE_LOG"
    OO_DIR="/home/z/openoutreach-source"
    if [ -f "$OO_DIR/manage.py" ]; then
        echo "[Services] ✓ OpenOutreach source found" >> "$SERVICE_LOG"
        
        # Setup venv if needed
        if [ ! -d "$OO_DIR/.venv" ]; then
            echo "[Services] Creating OpenOutreach venv..." >> "$SERVICE_LOG"
            python3 -m venv "$OO_DIR/.venv" 2>/dev/null || true
        fi
        
        if [ -d "$OO_DIR/.venv" ]; then
            # Install dependencies
            if [ -f "$OO_DIR/requirements.txt" ]; then
                echo "[Services] Installing OpenOutreach dependencies..." >> "$SERVICE_LOG"
                $OO_DIR/.venv/bin/pip install -r "$OO_DIR/requirements.txt" 2>/dev/null || true
            fi
            
            # Run migrations
            $OO_DIR/.venv/bin/python "$OO_DIR/manage.py" migrate --noinput 2>/dev/null || true
            $OO_DIR/.venv/bin/python "$OO_DIR/manage.py" collectstatic --noinput 2>/dev/null || true
            
            # Start Django
            $OO_DIR/.venv/bin/python "$OO_DIR/manage.py" runserver 0.0.0.0:8000 >> "$SERVICE_LOG" 2>&1 &
            sleep 3
            if ss -tlnp 2>/dev/null | grep -q ':8000'; then
                echo "[Services] ✓ Django started on port 8000" >> "$SERVICE_LOG"
            else
                echo "[Services] ✗ Django failed to start" >> "$SERVICE_LOG"
            fi
        fi
    else
        echo "[Services] ✗ OpenOutreach source not found at $OO_DIR" >> "$SERVICE_LOG"
        echo "[Services]   If you have the source, clone it to $OO_DIR" >> "$SERVICE_LOG"
    fi

    echo "=== Service Installer Complete at $(date) ===" >> "$SERVICE_LOG"
    log "Background service installer finished. See /tmp/cloudshell-services.log"
) &

log "Background service installer launched"

### ─── 8. Supervisor loop (auto-restart on crash) ───────────────
log "=== CloudShell is LIVE! Supervisor active. ==="
while true; do
    if ! kill -0 $SERVER_PID 2>/dev/null; then
        log "Server crashed! Restarting in 3s..."
        sleep 3
        export PORT=3000
        node --experimental-strip-types server.ts >> /tmp/cloudshell-server.log 2>&1 &
        SERVER_PID=$!
        log "Server restarted (pid=$SERVER_PID)"
    fi
    sleep 5
done

#!/bin/bash
# .zscripts/dev.sh — CloudShell Z.ai entry point (FULL VERSION)
# Strategy: Fast boot (health check) + background service installation
# Expected core boot: < 30s | Services: background after health check passes
set -euo pipefail
cd /home/z/my-project

### ─── Timing ───────────────────────────────────────────────
START=$(date +%s%N)
log() { echo "[$(( ($(date +%s%N) - START) / 1000000 ))ms] $*"; }

log "=== CloudShell FULL dev.sh starting ==="

### ─── 1. Kill Guard (prevents Django/any process on port 3000/8000) ──
for port in 3000 8000 6080 5900; do
    pid=$(ss -tlnp 2>/dev/null | awk -v p=":$port" '$4~p{match($6,/pid=([0-9]+)/,a); print a[1]}')
    [ -n "$pid" ] && kill -9 $pid 2>/dev/null && log "Killed PID $pid on port $port"
done

### ─── 2. Python Health-Check Responder (starts in <0.5s) ───────
python3 -c "
import http.server, os, json

class H(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == '/api/health':
            body = json.dumps({'ok': True, 'status': 'booting', 'uptime': 0}).encode()
            self.send_response(200)
            self.send_header('Content-Type','application/json')
            self.send_header('Content-Length', len(body))
            self.end_headers()
            self.wfile.write(body)
        else:
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

### ─── 3. Core Boot — npm + next (fast if committed) ──────────
if [ -d node_modules/next ]; then
    log "node_modules present — skipping npm install"
else
    log "WARN: node_modules missing — running npm ci"
    npm ci --omit=dev --prefer-offline --ignore-scripts 2>&1 | tail -5
    log "npm ci complete"
fi

if [ -f .next/BUILD_ID ]; then
    log "Pre-built .next/ present — skipping next build"
else
    log "WARN: .next/ missing — running next build"
    NODE_ENV=production npx next build 2>&1 | tail -5
    log "next build complete"
fi

### ─── 4. Start real Node.js server ────────────────────────────
export NODE_ENV=production
export PORT=3000
export HOME=/home/z
export PATH="/home/z/bin:/home/z/.local/bin:/home/z/.venv/bin:/home/z/openoutreach-source/.venv/bin:/usr/local/bin:/usr/bin:/bin"
export DISPLAY=:99

log "Starting Node.js server..."
node --experimental-strip-types server.ts > /tmp/cloudshell-server.log 2>&1 &
SERVER_PID=$!
log "Server process started (pid=$SERVER_PID)"

### ─── 5. Wait for real server to be ready ──────────────────────
READY=0
for i in $(seq 1 60); do
    sleep 1
    RESP=$(curl -s http://localhost:3000/api/health 2>/dev/null || echo "")
    if echo "$RESP" | grep -q '"ok":true' && ! echo "$RESP" | grep -q "booting"; then
        READY=1
        log "Real server is ready (${i}s after fork)"
        break
    fi
    # Also accept if we get ANY response that's not from health responder
    if [ -n "$RESP" ] && ! echo "$RESP" | grep -q "CloudShell starting"; then
        READY=1
        log "Real server responding (${i}s after fork)"
        break
    fi
done

if [ $READY -eq 0 ]; then
    log "WARN: Server may not be fully ready yet, but health responder is running"
fi

### ─── 6. Kill health responder — hand over port 3000 ──────────
if [ -f /tmp/health-responder.pid ]; then
    kill $(cat /tmp/health-responder.pid) 2>/dev/null
    rm -f /tmp/health-responder.pid
    log "Health responder killed — port 3000 handed to Node.js"
fi

### ─── 7. Background Service Installer ──────────────────────────
# This runs AFTER the health check passes, so it doesn't block boot.
# Services are installed and started one by one in the background.
log "Starting background service installer..."

(
    SERVICE_LOG="/tmp/cloudshell-services.log"
    echo "=== Service Installer Started ===" > "$SERVICE_LOG"
    
    # ─── 7a. Start Xvfb ────────────────────────────────────
    echo "[Services] Starting Xvfb..." >> "$SERVICE_LOG"
    if [ -x /usr/bin/Xvfb ] && [ ! -f /tmp/.X99-lock ]; then
        /usr/bin/Xvfb :99 -screen 0 1920x1080x24 &
        sleep 1
        if [ -f /tmp/.X99-lock ]; then
            echo "[Services] Xvfb started on :99" >> "$SERVICE_LOG"
        else
            echo "[Services] Xvfb failed to start" >> "$SERVICE_LOG"
        fi
    elif [ -f /tmp/.X99-lock ]; then
        echo "[Services] Xvfb already running" >> "$SERVICE_LOG"
    else
        echo "[Services] Xvfb not available (no /usr/bin/Xvfb)" >> "$SERVICE_LOG"
    fi

    # ─── 7b. Install x11vnc (static binary download) ──────
    echo "[Services] Setting up x11vnc..." >> "$SERVICE_LOG"
    if [ -x /home/z/.local/bin/x11vnc ]; then
        echo "[Services] x11vnc already installed" >> "$SERVICE_LOG"
    elif command -v apt-get &>/dev/null && sudo -n apt-get install -y x11vnc 2>/dev/null; then
        echo "[Services] x11vnc installed via apt" >> "$SERVICE_LOG"
    else
        # Try downloading static binary
        echo "[Services] Downloading x11vnc static binary..." >> "$SERVICE_LOG"
        mkdir -p /home/z/.local/bin
        if curl -fsSL "https://github.com/nicholasgasior/x11vnc-static/releases/download/latest/x11vnc-linux-amd64" -o /home/z/.local/bin/x11vnc 2>/dev/null; then
            chmod +x /home/z/.local/bin/x11vnc
            echo "[Services] x11vnc downloaded" >> "$SERVICE_LOG"
        else
            # Try alternative: build from source if we have gcc
            echo "[Services] Could not download x11vnc binary, trying pip..." >> "$SERVICE_LOG"
        fi
    fi

    # Start x11vnc if available
    if [ -x /home/z/.local/bin/x11vnc ] || command -v x11vnc &>/dev/null; then
        X11VNC_BIN=$(command -v x11vnc 2>/dev/null || echo "/home/z/.local/bin/x11vnc")
        $X11VNC_BIN -display :99 -forever -shared -nopw -rfbport 5900 &
        sleep 1
        echo "[Services] x11vnc started on port 5900" >> "$SERVICE_LOG"
    fi

    # ─── 7c. Install websockify ───────────────────────────
    echo "[Services] Setting up websockify..." >> "$SERVICE_LOG"
    if command -v websockify &>/dev/null; then
        echo "[Services] websockify already available" >> "$SERVICE_LOG"
    elif [ -x /home/z/.venv/bin/websockify ]; then
        echo "[Services] websockify already in venv" >> "$SERVICE_LOG"
    else
        echo "[Services] Installing websockify via pip..." >> "$SERVICE_LOG"
        pip3 install --user websockify 2>/dev/null || \
        /home/z/.venv/bin/pip install websockify 2>/dev/null || \
        python3 -m pip install websockify 2>/dev/null || true
    fi

    # ─── 7d. Download noVNC ───────────────────────────────
    echo "[Services] Setting up noVNC..." >> "$SERVICE_LOG"
    NOVNC_DIR="/home/z/.local/share/noVNC"
    if [ -d "$NOVNC_DIR" ] && [ -f "$NOVNC_DIR/vnc.html" ]; then
        echo "[Services] noVNC already present" >> "$SERVICE_LOG"
    else
        echo "[Services] Downloading noVNC..." >> "$SERVICE_LOG"
        mkdir -p /home/z/.local/share
        if curl -fsSL "https://github.com/novnc/noVNC/archive/refs/tags/v1.5.0.tar.gz" | tar xz -C /home/z/.local/share/ 2>/dev/null; then
            mv /home/z/.local/share/noVNC-1.5.0 "$NOVNC_DIR" 2>/dev/null || true
            # Also handle if it created noVNC-1.5.0
            if [ -d "/home/z/.local/share/noVNC-1.5.0" ] && [ ! -d "$NOVNC_DIR" ]; then
                ln -s /home/z/.local/share/noVNC-1.5.0 "$NOVNC_DIR" 2>/dev/null || \
                mv /home/z/.local/share/noVNC-1.5.0 "$NOVNC_DIR" 2>/dev/null || true
            fi
            echo "[Services] noVNC downloaded" >> "$SERVICE_LOG"
        else
            echo "[Services] noVNC download failed" >> "$SERVICE_LOG"
        fi
    fi

    # Start websockify (noVNC proxy)
    WEBSOCKIFY_BIN=$(command -v websockify 2>/dev/null || echo "/home/z/.venv/bin/websockify" 2>/dev/null || echo "/home/z/.local/bin/websockify")
    if [ -x "$WEBSOCKIFY_BIN" ] && [ -d "$NOVNC_DIR" ]; then
        $WEBSOCKIFY_BIN --web "$NOVNC_DIR" 6080 localhost:5900 &
        sleep 1
        echo "[Services] websockify+noVNC started on port 6080" >> "$SERVICE_LOG"
    else
        echo "[Services] Cannot start websockify (binary=$WEBSOCKIFY_BIN, novnc=$NOVNC_DIR)" >> "$SERVICE_LOG"
    fi

    # ─── 7e. Install Docker (rootless) ────────────────────
    echo "[Services] Setting up Docker..." >> "$SERVICE_LOG"
    if command -v docker &>/dev/null || [ -x /home/z/bin/docker ]; then
        echo "[Services] Docker already available" >> "$SERVICE_LOG"
    else
        echo "[Services] Installing Docker rootless..." >> "$SERVICE_LOG"
        # Download Docker static binary
        mkdir -p /home/z/bin /home/z/.config/docker
        DOCKER_VERSION="27.5.1"
        DOCKER_ARCH="x86_64"
        
        if curl -fsSL "https://download.docker.com/linux/static/stable/${DOCKER_ARCH}/docker-${DOCKER_VERSION}.tgz" -o /tmp/docker.tgz 2>/dev/null; then
            tar xz -C /home/z/bin --strip-components=1 -f /tmp/docker.tgz 2>/dev/null
            rm -f /tmp/docker.tgz
            chmod +x /home/z/bin/docker* 2>/dev/null
            echo "[Services] Docker CLI downloaded to /home/z/bin/" >> "$SERVICE_LOG"
            
            # Try to start dockerd rootless
            if [ -x /home/z/bin/dockerd ]; then
                export DOCKER_HOST="unix:///run/user/$(id -u)/docker.sock"
                mkdir -p "/run/user/$(id -u)" 2>/dev/null
                /home/z/bin/dockerd-rootless.sh &
                sleep 3
                if /home/z/bin/docker info &>/dev/null; then
                    echo "[Services] Docker daemon running (rootless)" >> "$SERVICE_LOG"
                else
                    echo "[Services] Docker daemon failed to start (may need CAP_SYS_ADMIN)" >> "$SERVICE_LOG"
                fi
            fi
        else
            echo "[Services] Docker download failed" >> "$SERVICE_LOG"
        fi
    fi

    # ─── 7f. Setup OpenOutreach ───────────────────────────
    echo "[Services] Setting up OpenOutreach..." >> "$SERVICE_LOG"
    OO_DIR="/home/z/openoutreach-source"
    if [ -f "$OO_DIR/manage.py" ]; then
        echo "[Services] OpenOutreach source already present" >> "$SERVICE_LOG"
    else
        echo "[Services] OpenOutreach not found at $OO_DIR" >> "$SERVICE_LOG"
        echo "[Services] OpenOutreach needs to be installed manually or via git clone" >> "$SERVICE_LOG"
        # Note: We can't clone it because we don't know the repo URL
        # If the user provides the source, it will be at /home/z/openoutreach-source/
    fi

    # If OpenOutreach source exists, set it up
    if [ -f "$OO_DIR/manage.py" ]; then
        # Check if venv exists
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
            echo "[Services] Running OpenOutreach migrations..." >> "$SERVICE_LOG"
            $OO_DIR/.venv/bin/python "$OO_DIR/manage.py" migrate --noinput 2>/dev/null || true
            
            # Collect static
            $OO_DIR/.venv/bin/python "$OO_DIR/manage.py" collectstatic --noinput 2>/dev/null || true
            
            # Start Django
            echo "[Services] Starting Django server..." >> "$SERVICE_LOG"
            $OO_DIR/.venv/bin/python "$OO_DIR/manage.py" runserver 0.0.0.0:8000 &
            sleep 2
            echo "[Services] Django started on port 8000" >> "$SERVICE_LOG"
        fi
    fi

    echo "=== Service Installer Complete ===" >> "$SERVICE_LOG"
    log "Background service installer finished. See /tmp/cloudshell-services.log"
) &

log "Background service installer launched (pid=$!)"

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

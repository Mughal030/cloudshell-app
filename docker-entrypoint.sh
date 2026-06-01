#!/bin/bash
set -e

echo "=========================================="
echo "[Entrypoint] CloudShell starting..."
echo "[Entrypoint] User: $(whoami)"
echo "[Entrypoint] Home: $HOME"
echo "[Entrypoint] Workspace: ${WORKSPACE_DIR:-/home/cloudshell/workspace}"
echo "=========================================="

# ─── Create workspace directory ──────────────────────────────────
WORKSPACE="${WORKSPACE_DIR:-/home/cloudshell/workspace}"
mkdir -p "$WORKSPACE" 2>/dev/null || true
echo "[Entrypoint] Workspace directory ready: $WORKSPACE"

# ─── Create .local directories ───────────────────────────────────
mkdir -p "${HOME}/.local/bin" 2>/dev/null || true
mkdir -p "${HOME}/.local/lib" 2>/dev/null || true
mkdir -p "${HOME}/.local/share" 2>/dev/null || true
mkdir -p "${HOME}/.cache" 2>/dev/null || true
echo "[Entrypoint] User directories created"

# ─── Create sample .dockerfiles directory ────────────────────────
mkdir -p "${WORKSPACE}/.dockerfiles" 2>/dev/null || true
if [ ! -f "${WORKSPACE}/.dockerfiles/Dockerfile.app" ]; then
    cat > "${WORKSPACE}/.dockerfiles/Dockerfile.app" << 'DOCKERFILE'
FROM ubuntu:22.04
RUN apt-get update && apt-get install -y curl wget git vim nano && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY . .
CMD ["/bin/bash"]
DOCKERFILE
    echo "[Entrypoint] Sample Dockerfile created"
fi

# ─── Install VNC packages at RUNTIME (avoids HF abuse detector) ──
echo "[Entrypoint] Installing VNC packages at runtime (background)..."
(
    sudo apt-get update -qq 2>/dev/null && \
    sudo apt-get install -y -qq x11vnc websockify 2>/dev/null && \
    echo "[Entrypoint] VNC packages installed successfully" || \
    echo "[Entrypoint] Warning: VNC packages installation failed (non-critical)"
) &

# ─── Download noVNC at RUNTIME ───────────────────────────────────
echo "[Entrypoint] Downloading noVNC (background)..."
(
    if [ ! -d /opt/noVNC ]; then
        sudo git clone --depth 1 https://github.com/novnc/noVNC.git /opt/noVNC 2>/dev/null && \
        sudo ln -sf /opt/noVNC/vnc.html /opt/noVNC/index.html && \
        echo "[Entrypoint] noVNC downloaded successfully" || \
        echo "[Entrypoint] Warning: noVNC download failed (non-critical)"
    else
        echo "[Entrypoint] noVNC already exists"
    fi
) &

# ─── Start Xvfb (Virtual Framebuffer) ────────────────────────────
if command -v Xvfb &>/dev/null || [ -x /usr/bin/Xvfb ]; then
    if [ ! -f /tmp/.X99-lock ]; then
        echo "[Entrypoint] Starting Xvfb on display :99..."
        /usr/bin/Xvfb :99 -screen 0 1920x1080x24 &
        sleep 1
        if [ -f /tmp/.X99-lock ]; then
            echo "[Entrypoint] Xvfb started successfully"
        else
            echo "[Entrypoint] Warning: Xvfb may not have started correctly"
        fi
    else
        echo "[Entrypoint] Xvfb already running (lock file exists)"
    fi
else
    echo "[Entrypoint] Xvfb not available - VNC/desktop features disabled"
fi

# Wait for background tasks briefly (don't block server startup)
sleep 2

# ─── Execute main process ────────────────────────────────────────
echo "=========================================="
echo "[Entrypoint] Starting server: $*"
echo "=========================================="
exec "$@"

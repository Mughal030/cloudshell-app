#!/bin/bash
set -e

echo "[Entrypoint] CloudShell starting..."
echo "[Entrypoint] User: $(whoami)"
echo "[Entrypoint] Home: $HOME"
echo "[Entrypoint] Workspace: ${WORKSPACE_DIR:-/home/cloudshell/workspace}"

# ─── Create workspace directory ──────────────────────────────────
WORKSPACE="${WORKSPACE_DIR:-/home/cloudshell/workspace}"
mkdir -p "$WORKSPACE"
echo "[Entrypoint] Workspace directory ready: $WORKSPACE"

# ─── Create .local directories ───────────────────────────────────
mkdir -p "${HOME}/.local/bin"
mkdir -p "${HOME}/.local/lib"
mkdir -p "${HOME}/.local/share"
mkdir -p "${HOME}/.cache"
echo "[Entrypoint] User directories created"

# ─── Create sample .dockerfiles directory ────────────────────────
mkdir -p "${WORKSPACE}/.dockerfiles"
if [ ! -f "${WORKSPACE}/.dockerfiles/Dockerfile.app" ]; then
    cat > "${WORKSPACE}/.dockerfiles/Dockerfile.app" << 'DOCKERFILE'
FROM ubuntu:22.04

# Install system packages
RUN apt-get update && apt-get install -y \
    curl \
    wget \
    git \
    vim \
    nano \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy application files
COPY . .

# Default command
CMD ["/bin/bash"]
DOCKERFILE
    echo "[Entrypoint] Sample Dockerfile created"
fi

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

# ─── Execute main process ────────────────────────────────────────
echo "[Entrypoint] Starting server: $*"
exec "$@"

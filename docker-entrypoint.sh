#!/bin/bash
set -e

echo "=========================================="
echo "[Entrypoint] CloudShell Terminal IDE starting..."
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
mkdir -p "${HOME}/bin" 2>/dev/null || true
echo "[Entrypoint] User directories created"

# ─── Setup Rootless Docker ──────────────────────────────────────
# Check if Docker CLI is available
if command -v docker &> /dev/null; then
    echo "[Entrypoint] Docker CLI found: $(docker --version 2>/dev/null || echo 'version unknown')"

    # Try to set up rootless Docker if not already set up
    if [ ! -d "${HOME}/.local/share/docker" ]; then
        echo "[Entrypoint] Setting up rootless Docker..."
        # dockerd-rootless-setuptool.sh may not work in all environments
        # but we try anyway - if it fails, Docker CLI still works for remote hosts
        dockerd-rootless-setuptool.sh install 2>/dev/null || {
            echo "[Entrypoint] Rootless Docker setup failed - Docker CLI available for remote use only"
        }
    fi

    # Try to start rootless Docker daemon in background (non-blocking)
    if [ -f "${HOME}/.local/share/docker" ] || [ -f /usr/bin/dockerd-rootless.sh ]; then
        echo "[Entrypoint] Attempting to start rootless Docker daemon..."
        (dockerd-rootless.sh --experimental &>/tmp/dockerd-rootless.log &) 2>/dev/null || {
            echo "[Entrypoint] Could not start rootless Docker daemon"
        }
        # Give Docker daemon a few seconds to start
        sleep 3
        if docker info &>/dev/null; then
            echo "[Entrypoint] Docker daemon is running!"
        else
            echo "[Entrypoint] Docker daemon not running - CLI available for remote connections"
        fi
    fi
else
    echo "[Entrypoint] Docker CLI not found - installing..."
    # Fallback: try to install Docker CLI at runtime if not in image
    if command -v sudo &> /dev/null; then
        sudo apt-get update -qq && sudo apt-get install -y -qq docker.io 2>/dev/null || {
            echo "[Entrypoint] Could not install Docker at runtime"
        }
    fi
fi

# ─── Create sample dockerfiles directory ────────────────────────
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

# ─── Create .bashrc with useful aliases ──────────────────────────
if [ ! -f "${HOME}/.bashrc_cloudshell" ]; then
    cat > "${HOME}/.bashrc_cloudshell" << 'BASHRC'
# CloudShell custom bashrc additions
export PATH="${HOME}/bin:${HOME}/.local/bin:${PATH}"
export EDITOR=vim

# Useful aliases
alias ll='ls -alF'
alias la='ls -A'
alias l='ls -CF'
alias ..='cd ..'
alias ...='cd ../..'

# Docker helpers (if Docker available)
if command -v docker &>/dev/null; then
    alias dps='docker ps'
    alias dimg='docker images'
fi

# Show tool status
cloudshell-tools() {
    echo "=== CloudShell Tool Status ==="
    for tool in git docker curl wget vim nano node npm python3 pip3 sudo; do
        if command -v "$tool" &>/dev/null; then
            version=$("$tool" --version 2>/dev/null | head -1)
            echo "  ✅ $tool: $version"
        else
            echo "  ❌ $tool: not found"
        fi
    done
}
BASHRC
    echo "[Entrypoint] Custom bashrc created"
fi

# Append to .bashrc if not already done
if ! grep -q "bashrc_cloudshell" "${HOME}/.bashrc" 2>/dev/null; then
    echo "" >> "${HOME}/.bashrc"
    echo "# CloudShell custom additions" >> "${HOME}/.bashrc"
    echo "[ -f \"${HOME}/.bashrc_cloudshell\" ] && source \"${HOME}/.bashrc_cloudshell\"" >> "${HOME}/.bashrc"
fi

# ─── Execute main process ────────────────────────────────────────
echo "=========================================="
echo "[Entrypoint] Starting server: $*"
echo "=========================================="
exec "$@"

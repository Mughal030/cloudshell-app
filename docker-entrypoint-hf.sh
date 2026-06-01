#!/bin/bash
set -e

echo "=========================================="
echo "[Entrypoint-HF] CloudShell Terminal IDE starting on HuggingFace Spaces..."
echo "[Entrypoint-HF] User: $(whoami)"
echo "[Entrypoint-HF] Home: $HOME"
echo "[Entrypoint-HF] Workspace: ${WORKSPACE_DIR:-/home/cloudshell/workspace}"
echo "=========================================="

# ─── Create workspace directory ──────────────────────────────────
WORKSPACE="${WORKSPACE_DIR:-/home/cloudshell/workspace}"
mkdir -p "$WORKSPACE" 2>/dev/null || true
echo "[Entrypoint-HF] Workspace directory ready: $WORKSPACE"

# ─── Create .local directories ───────────────────────────────────
mkdir -p "${HOME}/.local/bin" 2>/dev/null || true
mkdir -p "${HOME}/.local/lib" 2>/dev/null || true
mkdir -p "${HOME}/.local/share" 2>/dev/null || true
mkdir -p "${HOME}/.cache" 2>/dev/null || true
mkdir -p "${HOME}/bin" 2>/dev/null || true
echo "[Entrypoint-HF] User directories created"

# ─── Setup Rootless Docker ──────────────────────────────────────
if command -v docker &> /dev/null; then
    echo "[Entrypoint-HF] Docker CLI found: $(docker --version 2>/dev/null || echo 'version unknown')"

    # Try to set up rootless Docker if not already set up
    if [ ! -d "${HOME}/.local/share/docker" ]; then
        echo "[Entrypoint-HF] Setting up rootless Docker..."
        dockerd-rootless-setuptool.sh install 2>/dev/null || {
            echo "[Entrypoint-HF] Rootless Docker setup failed - Docker CLI available for remote use only"
        }
    fi

    # Try to start rootless Docker daemon in background (non-blocking)
    echo "[Entrypoint-HF] Attempting to start rootless Docker daemon..."
    (dockerd-rootless.sh --experimental &>/tmp/dockerd-rootless.log &) 2>/dev/null || {
        echo "[Entrypoint-HF] Could not start rootless Docker daemon"
    }
    # Give Docker daemon a few seconds to start
    sleep 3
    if docker info &>/dev/null; then
        echo "[Entrypoint-HF] Docker daemon is running!"
    else
        echo "[Entrypoint-HF] Docker daemon not running - CLI available for remote connections"
    fi
else
    echo "[Entrypoint-HF] Docker CLI not found - attempting runtime install..."
    if command -v sudo &> /dev/null; then
        sudo apt-get update -qq 2>/dev/null && sudo apt-get install -y -qq docker.io 2>/dev/null || {
            echo "[Entrypoint-HF] Could not install Docker at runtime"
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
    echo "[Entrypoint-HF] Sample Dockerfile created"
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
    echo "[Entrypoint-HF] Custom bashrc created"
fi

# Append to .bashrc if not already done
if ! grep -q "bashrc_cloudshell" "${HOME}/.bashrc" 2>/dev/null; then
    echo "" >> "${HOME}/.bashrc"
    echo "# CloudShell custom additions" >> "${HOME}/.bashrc"
    echo "[ -f \"${HOME}/.bashrc_cloudshell\" ] && source \"${HOME}/.bashrc_cloudshell\"" >> "${HOME}/.bashrc"
fi

# ─── Execute main process ────────────────────────────────────────
echo "=========================================="
echo "[Entrypoint-HF] Starting server: $*"
echo "=========================================="
exec "$@"

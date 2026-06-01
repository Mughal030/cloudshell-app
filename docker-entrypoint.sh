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
echo "[Entrypoint] User directories created"

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

# ─── Execute main process ────────────────────────────────────────
echo "=========================================="
echo "[Entrypoint] Starting server: $*"
echo "=========================================="
exec "$@"

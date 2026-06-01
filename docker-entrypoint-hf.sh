#!/bin/bash
set -e

echo "[Entrypoint] CloudShell starting..."
echo "[Entrypoint] User: $(whoami)"
echo "[Entrypoint] Home: $HOME"
echo "[Entrypoint] Workspace: ${WORKSPACE_DIR:-/home/z/my-project/workspace}"

# ─── Create workspace directory ──────────────────────────────────
WORKSPACE="${WORKSPACE_DIR:-/home/z/my-project/workspace}"
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

# ─── Execute main process ────────────────────────────────────────
echo "[Entrypoint] Starting server: $*"
exec "$@"

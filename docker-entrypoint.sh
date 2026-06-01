#!/bin/bash
# ────────────────────────────────────────────────────────────────────
# CloudShell Terminal IDE - Docker Entrypoint
# Starts as ROOT to fix permissions, then drops to cloudshell user.
# This is required for sudo apt-get and Docker to work properly.
# ────────────────────────────────────────────────────────────────────

echo "=========================================="
echo "[Entrypoint] CloudShell Terminal IDE starting..."
echo "[Entrypoint] Initial user: $(whoami)"
echo "[Entrypoint] Home: $HOME"
echo "[Entrypoint] Workspace: ${WORKSPACE_DIR:-/home/cloudshell/workspace}"
echo "=========================================="

# ─── Fix APT permissions (run as root) ─────────────────────────
echo "[Entrypoint] Fixing APT directory permissions..."
mkdir -p /var/lib/apt/lists/partial 2>/dev/null || true
chown -R root:root /var/lib/apt 2>/dev/null || true
chmod -R 755 /var/lib/apt 2>/dev/null || true
mkdir -p /var/cache/apt 2>/dev/null || true
chown -R root:root /var/cache/apt 2>/dev/null || true
chmod -R 755 /var/cache/apt 2>/dev/null || true
mkdir -p /var/lib/dpkg/lock-frontend 2>/dev/null || true
chown -R root:root /var/lib/dpkg 2>/dev/null || true
chmod -R 755 /var/lib/dpkg 2>/dev/null || true

# Fix /tmp permissions
chmod 1777 /tmp 2>/dev/null || true
chmod 1777 /var/tmp 2>/dev/null || true

# Ensure sudoers is correct
echo "cloudshell ALL=(ALL) NOPASSWD: ALL" > /etc/sudoers.d/cloudshell 2>/dev/null || true
chmod 440 /etc/sudoers.d/cloudshell 2>/dev/null || true
echo "[Entrypoint] APT directories and sudoers fixed"

# ─── Fix cloudshell home permissions ───────────────────────────
mkdir -p /home/cloudshell/workspace 2>/dev/null || true
mkdir -p /home/cloudshell/.local/bin 2>/dev/null || true
mkdir -p /home/cloudshell/.local/lib 2>/dev/null || true
mkdir -p /home/cloudshell/.local/share 2>/dev/null || true
mkdir -p /home/cloudshell/.cache 2>/dev/null || true
mkdir -p /home/cloudshell/bin 2>/dev/null || true
chown -R cloudshell:cloudshell /home/cloudshell 2>/dev/null || true
echo "[Entrypoint] Cloudshell home directory fixed"

# ─── Create effective sudo wrapper ──────────────────────────────
WRAPPER_DIR="/home/cloudshell/.local/bin"
mkdir -p "$WRAPPER_DIR" 2>/dev/null || true

cat > "${WRAPPER_DIR}/sudo" << 'SUDOWRAPPER'
#!/bin/bash
# CloudShell sudo wrapper v8 - handles apt and system commands properly
# First try real sudo (works when entrypoint runs as root)
if /usr/bin/sudo -n "$@" 2>/dev/null; then
    exit 0
fi

# For apt-get commands, fix permissions and retry
case "$1" in
    apt|apt-get)
        shift
        # Fix apt directories before running
        /usr/bin/sudo mkdir -p /var/lib/apt/lists/partial 2>/dev/null
        /usr/bin/sudo chmod -R 755 /var/lib/apt 2>/dev/null
        /usr/bin/sudo chown -R root:root /var/lib/apt 2>/dev/null
        /usr/bin/sudo mkdir -p /var/cache/apt 2>/dev/null
        /usr/bin/sudo chmod -R 755 /var/cache/apt 2>/dev/null
        /usr/bin/sudo chown -R root:root /var/cache/apt 2>/dev/null
        # Now try the apt command
        /usr/bin/sudo "$@" 2>/dev/null && exit 0
        # If real sudo still fails, try with unshare
        exec unshare --user --map-root-user "$@"
        ;;
    dpkg)
        shift
        /usr/bin/sudo "$@" 2>/dev/null && exit 0
        exec unshare --user --map-root-user "$@"
        ;;
    systemctl|service)
        shift
        echo "Warning: $1 requires real root access (not available in this container)"
        exec unshare --user --map-root-user "$@"
        ;;
    *)
        /usr/bin/sudo "$@" 2>/dev/null && exit 0
        exec unshare --user --map-root-user "$@"
        ;;
esac
SUDOWRAPPER
chown cloudshell:cloudshell "${WRAPPER_DIR}/sudo" 2>/dev/null || true
chmod +x "${WRAPPER_DIR}/sudo" 2>/dev/null || true
echo "[Entrypoint] Enhanced sudo wrapper created"

# ─── Setup Docker ──────────────────────────────────────────────
if command -v docker &> /dev/null; then
    echo "[Entrypoint] Docker CLI found: $(docker --version 2>/dev/null || echo 'version unknown')"
else
    echo "[Entrypoint] Docker CLI not found"
fi

# ─── Create sample dockerfiles directory ────────────────────────
WORKSPACE="${WORKSPACE_DIR:-/home/cloudshell/workspace}"
mkdir -p "${WORKSPACE}/.dockerfiles" 2>/dev/null || true
if [ ! -f "${WORKSPACE}/.dockerfiles/Dockerfile.app" ]; then
    cat > "${WORKSPACE}/.dockerfiles/Dockerfile.app" << 'DOCKERFILE'
FROM ubuntu:22.04
RUN apt-get update && apt-get install -y curl wget git vim nano && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY . .
CMD ["/bin/bash"]
DOCKERFILE
    chown -R cloudshell:cloudshell "${WORKSPACE}/.dockerfiles" 2>/dev/null || true
    echo "[Entrypoint] Sample Dockerfile created"
fi

# ─── Create .bashrc with useful aliases ──────────────────────────
if [ ! -f "/home/cloudshell/.bashrc_cloudshell" ]; then
    cat > "/home/cloudshell/.bashrc_cloudshell" << 'BASHRC'
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
    chown cloudshell:cloudshell "/home/cloudshell/.bashrc_cloudshell" 2>/dev/null || true
    echo "[Entrypoint] Custom bashrc created"
fi

# Append to .bashrc if not already done
if ! grep -q "bashrc_cloudshell" "/home/cloudshell/.bashrc" 2>/dev/null; then
    echo "" >> "/home/cloudshell/.bashrc"
    echo "# CloudShell custom additions" >> "/home/cloudshell/.bashrc"
    echo "[ -f \"\${HOME}/.bashrc_cloudshell\" ] && source \"\${HOME}/.bashrc_cloudshell\"" >> "/home/cloudshell/.bashrc"
fi

# ─── NOW DROP TO CLOUDSHELL USER AND START THE SERVER ──────────
echo "=========================================="
echo "[Entrypoint] Dropping to cloudshell user..."
echo "[Entrypoint] Starting server: $*"
echo "=========================================="

# Use gosu or su to drop privileges, then exec the CMD
if command -v gosu &> /dev/null; then
    exec gosu cloudshell "$@"
elif command -v su-exec &> /dev/null; then
    exec su-exec cloudshell "$@"
else
    # Fallback: use su
    exec su -c "export HOME=/home/cloudshell USER=cloudshell PATH=/home/cloudshell/bin:/home/cloudshell/.local/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin && cd /app && $*" cloudshell
fi

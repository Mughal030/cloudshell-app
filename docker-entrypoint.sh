#!/bin/bash
# ────────────────────────────────────────────────────────────────────
# CloudShell Terminal IDE - Docker Entrypoint
# Starts as ROOT to fix permissions, then drops to cloudshell user.
# ────────────────────────────────────────────────────────────────────

echo "=========================================="
echo "[Entrypoint] CloudShell Terminal IDE starting..."
echo "[Entrypoint] Initial user: $(whoami)"
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

# ─── Create smart sudo wrapper ──────────────────────────────────
# In HF Spaces, the container is UNPRIVILEGED - even with sudo,
# the kernel blocks operations like writing to /var/lib/apt/.
# This wrapper provides real functionality by using alternative methods.
WRAPPER_DIR="/home/cloudshell/.local/bin"
mkdir -p "$WRAPPER_DIR" 2>/dev/null || true

cat > "${WRAPPER_DIR}/sudo" << 'SUDOWRAPPER'
#!/bin/bash
# CloudShell sudo wrapper v9 - works in unprivileged containers
# Tries real sudo first, then provides smart alternatives

# First: try real sudo (works on some platforms)
/usr/bin/sudo -n "$@" 2>/dev/null && exit 0

# Second: for apt-get/apt commands, try with real sudo + permission fixes
case "$1" in
    apt|apt-get)
        CMD="$1"; shift
        case "$1" in
            update)
                # Try to update apt lists
                /usr/bin/sudo mkdir -p /var/lib/apt/lists/partial 2>/dev/null
                /usr/bin/sudo chmod -R 777 /var/lib/apt/lists 2>/dev/null
                /usr/bin/sudo apt-get update "$@" 2>/dev/null && exit 0
                # Fallback: tell user apt is not available
                echo "⚠ apt-get update not available in this container (unprivileged)"
                echo "  Most packages are pre-installed. For new packages, use:"
                echo "    npm install <pkg>     (Node.js packages)"
                echo "    pip3 install <pkg>    (Python packages)"
                exit 1
                ;;
            install)
                /usr/bin/sudo apt-get install -y "$@" 2>/dev/null && exit 0
                echo "⚠ apt-get install not available in this container (unprivileged)"
                echo "  Package '$*' could not be installed via apt."
                echo "  Try alternatives:"
                echo "    npm install <pkg>     (Node.js packages)"
                echo "    pip3 install <pkg>    (Python packages)"
                echo "    conda install <pkg>   (if conda available)"
                exit 1
                ;;
            *)
                /usr/bin/sudo "$CMD" "$@" 2>/dev/null && exit 0
                echo "⚠ apt command not available in this container (unprivileged)"
                exit 1
                ;;
        esac
        ;;
    docker|dockerd*)
        # Docker CLI works without sudo for most commands
        /usr/bin/sudo "$@" 2>/dev/null && exit 0
        "$@" 2>/dev/null && exit 0
        echo "⚠ Docker daemon not running in this container"
        echo "  Docker CLI is available but requires a running daemon."
        exit 1
        ;;
    systemctl|service)
        echo "⚠ systemctl/service not available in this container (unprivileged)"
        exit 1
        ;;
    *)
        # For other commands, try real sudo then unshare fallback
        /usr/bin/sudo "$@" 2>/dev/null && exit 0
        exec unshare --user --map-root-user "$@"
        ;;
esac
SUDOWRAPPER
chown cloudshell:cloudshell "${WRAPPER_DIR}/sudo" 2>/dev/null || true
chmod +x "${WRAPPER_DIR}/sudo" 2>/dev/null || true
echo "[Entrypoint] Smart sudo wrapper v9 created"

# ─── Setup Docker ──────────────────────────────────────────────
if command -v docker &> /dev/null; then
    echo "[Entrypoint] Docker CLI found: $(docker --version 2>/dev/null || echo 'unknown')"

    # Try to start rootless Docker daemon
    echo "[Entrypoint] Attempting to start rootless Docker daemon..."
    su -c "dockerd-rootless.sh --experimental &>/tmp/dockerd-rootless.log &" cloudshell 2>/dev/null || true
    sleep 3

    # Check if Docker is running
    if su -c "docker info &>/dev/null" cloudshell 2>/dev/null; then
        echo "[Entrypoint] Docker daemon is running!"
    else
        echo "[Entrypoint] Docker daemon not running - CLI available for remote use"
    fi
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
fi

# ─── Create .bashrc with useful aliases and functions ────────────
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

# Docker helpers
if command -v docker &>/dev/null; then
    alias dps='docker ps'
    alias dimg='docker images'
fi

# Quick install functions (work WITHOUT sudo apt)
npm-install() { npm install --prefix "${HOME}/.local" "$@" && export PATH="${HOME}/.local/node_modules/.bin:${PATH}"; }
pip-install() { pip3 install --user "$@" && export PATH="${HOME}/.local/bin:${PATH}"; }

# Show tool status
cloudshell-tools() {
    echo "=== CloudShell Tool Status ==="
    local ok=0 total=0
    for tool in git docker curl wget vim nano node npm python3 pip3 sudo; do
        total=$((total + 1))
        if command -v "$tool" &>/dev/null; then
            version=$("$tool" --version 2>/dev/null | head -1)
            echo "  ✅ $tool: $version"
            ok=$((ok + 1))
        else
            echo "  ❌ $tool: not found"
        fi
    done
    echo ""
    echo "  ${ok}/${total} tools installed"
}

# Test all tools
cloudshell-test() {
    echo "=== CloudShell Full Command Test ==="
    echo ""

    echo "--- Basic Tools ---"
    echo -n "  git: "; git --version 2>&1 | head -1
    echo -n "  curl: "; curl --version 2>&1 | head -1
    echo -n "  wget: "; wget --version 2>&1 | head -1
    echo -n "  vim: "; vim --version 2>&1 | head -1
    echo -n "  nano: "; nano --version 2>&1 | head -1
    echo ""

    echo "--- Development ---"
    echo -n "  node: "; node --version 2>&1
    echo -n "  npm: "; npm --version 2>&1
    echo -n "  python3: "; python3 --version 2>&1
    echo -n "  pip3: "; pip3 --version 2>&1 | head -1
    echo ""

    echo "--- Docker ---"
    echo -n "  docker: "; docker --version 2>&1
    echo -n "  docker info: "
    if docker info &>/dev/null 2>&1; then echo "RUNNING"; else echo "NOT RUNNING (CLI only)"; fi
    echo ""

    echo "--- Sudo ---"
    echo -n "  sudo: "; sudo --version 2>&1 | head -1
    echo -n "  sudo apt update: "
    if sudo apt update &>/dev/null 2>&1; then echo "WORKS"; else echo "NOT AVAILABLE (use npm/pip instead)"; fi
    echo ""

    echo "--- Extra Tools ---"
    echo -n "  htop: "; htop --version 2>&1 | head -1
    echo -n "  tree: "; tree --version 2>&1 | head -1
    echo -n "  jq: "; jq --version 2>&1
    echo -n "  zip: "; zip --version 2>&1 | head -2 | tail -1
    echo -n "  ssh: "; ssh -V 2>&1
    echo -n "  make: "; make --version 2>&1 | head -1
    echo -n "  cmake: "; cmake --version 2>&1 | head -1
    echo -n "  rsync: "; rsync --version 2>&1 | head -1
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

exec gosu cloudshell "$@"

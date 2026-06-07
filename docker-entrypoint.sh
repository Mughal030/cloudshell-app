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
mkdir -p /home/cloudshell/.npm-global 2>/dev/null || true
mkdir -p /home/cloudshell/.npm-global/lib 2>/dev/null || true
mkdir -p /home/cloudshell/.npm-global/bin 2>/dev/null || true
mkdir -p /home/cloudshell/.jasbol-users 2>/dev/null || true
chown -R cloudshell:cloudshell /home/cloudshell 2>/dev/null || true
echo "[Entrypoint] Cloudshell home directory fixed"

# ─── Configure npm global prefix for cloudshell user ────────────
# This fixes EACCES errors when running `npm install -g`
# Instead of /usr/lib/node_modules (root-only), packages go to ~/.npm-global/
echo "[Entrypoint] Configuring npm global prefix for cloudshell user..."
NPM_GLOBAL_DIR="/home/cloudshell/.npm-global"

# Create .npmrc for cloudshell user with global prefix
cat > /home/cloudshell/.npmrc << 'NPMRC'
prefix=/home/cloudshell/.npm-global
NPMRC
chown cloudshell:cloudshell /home/cloudshell/.npmrc 2>/dev/null || true

# Ensure the npm-global/bin is in PATH for all shells
echo "[Entrypoint] npm global prefix set to ${NPM_GLOBAL_DIR}"
echo "[Entrypoint] Users can now run: npm install -g <package>"

# ─── Create smart sudo wrapper ──────────────────────────────────
# In HF Spaces, the container is UNPRIVILEGED - even with sudo,
# the kernel blocks operations like writing to /var/lib/apt/.
# This wrapper provides real functionality by using alternative methods.
WRAPPER_DIR="/home/cloudshell/.local/bin"
mkdir -p "$WRAPPER_DIR" 2>/dev/null || true

cat > "${WRAPPER_DIR}/sudo" << 'SUDOWRAPPER'
#!/bin/bash
# CloudShell sudo wrapper v10 - works in unprivileged containers
# Tries real sudo first, then provides smart alternatives

# First: try real sudo (works on some platforms)
/usr/bin/sudo -n "$@" 2>/dev/null && exit 0

# Second: for apt-get/apt commands, try with real sudo + permission fixes
case "$1" in
    apt|apt-get)
        CMD="$1"; shift
        case "$1" in
            update)
                /usr/bin/sudo mkdir -p /var/lib/apt/lists/partial 2>/dev/null
                /usr/bin/sudo chmod -R 777 /var/lib/apt/lists 2>/dev/null
                /usr/bin/sudo apt-get update "$@" 2>/dev/null && exit 0
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
                exit 1
                ;;
            *)
                /usr/bin/sudo "$CMD" "$@" 2>/dev/null && exit 0
                echo "⚠ apt command not available in this container (unprivileged)"
                exit 1
                ;;
        esac
        ;;
    npm)
        # Handle 'sudo npm install -g' - redirect to user's npm-global
        shift
        if [[ "$1" == "install" ]] || [[ "$1" == "i" ]]; then
            shift
            # Remove -g flag if present and use npm with user prefix
            args=()
            for arg in "$@"; do
                [[ "$arg" != "-g" ]] && [[ "$arg" != "--global" ]] && args+=("$arg")
            done
            npm install -g "${args[@]}"
            exit $?
        fi
        npm "$@"
        exit $?
        ;;
    docker|dockerd*)
        /usr/bin/sudo "$@" 2>/dev/null && exit 0
        "$@" 2>/dev/null && exit 0
        echo "⚠ Docker daemon not running in this container"
        exit 1
        ;;
    systemctl|service)
        echo "⚠ systemctl/service not available in this container (unprivileged)"
        exit 1
        ;;
    *)
        /usr/bin/sudo "$@" 2>/dev/null && exit 0
        exec unshare --user --map-root-user "$@"
        ;;
esac
SUDOWRAPPER
chown cloudshell:cloudshell "${WRAPPER_DIR}/sudo" 2>/dev/null || true
chmod +x "${WRAPPER_DIR}/sudo" 2>/dev/null || true
echo "[Entrypoint] Smart sudo wrapper v10 created"

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
export PATH="${HOME}/bin:${HOME}/.local/bin:${HOME}/.npm-global/bin:${PATH}"
export EDITOR=vim
export NPM_CONFIG_PREFIX="${HOME}/.npm-global"

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
npm-install() { npm install -g "$@"; }
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

# Test all essential commands
cloudshell-test() {
    echo "=== CloudShell Full Command Test ==="
    echo ""

    echo "--- File & Directory Commands ---"
    for cmd in cat ls cp mv rm touch mkdir rmdir ln head tail less more grep wc sort uniq cd pwd find which whereis file du df; do
        total=$((total + 1))
        if command -v "$cmd" &>/dev/null; then
            echo "  ✅ $cmd: $(which $cmd 2>/dev/null)"
        else
            echo "  ❌ $cmd: NOT FOUND (may be shell builtin)"
        fi
    done
    echo ""

    echo "--- Process & System Commands ---"
    for cmd in ps top kill sudo su whoami who uptime uname chmod chown chgrp; do
        if command -v "$cmd" &>/dev/null; then
            echo "  ✅ $cmd: $(which $cmd 2>/dev/null)"
        else
            echo "  ❌ $cmd: NOT FOUND"
        fi
    done
    echo ""

    echo "--- Archive & Compression ---"
    for cmd in tar zip unzip gzip gunzip; do
        if command -v "$cmd" &>/dev/null; then
            echo "  ✅ $cmd: $(which $cmd 2>/dev/null)"
        else
            echo "  ❌ $cmd: NOT FOUND"
        fi
    done
    echo ""

    echo "--- Network Commands ---"
    for cmd in ping curl wget ssh scp netstat; do
        if command -v "$cmd" &>/dev/null; then
            echo "  ✅ $cmd: $(which $cmd 2>/dev/null)"
        else
            echo "  ❌ $cmd: NOT FOUND"
        fi
    done
    echo ""

    echo "--- Help & Info ---"
    for cmd in man info help echo printf history clear date cal sleep; do
        if command -v "$cmd" &>/dev/null; then
            echo "  ✅ $cmd: $(which $cmd 2>/dev/null)"
        else
            echo "  ⚠ $cmd: shell builtin (always available)"
        fi
    done
    echo ""

    echo "--- Development Tools ---"
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

    echo "--- npm global install test ---"
    echo -n "  npm prefix: "; npm config get prefix 2>&1
    echo "  To install global packages: npm install -g <package>"
    echo "  (Installs to ~/.npm-global/ - no sudo needed)"
}

# npm global install helper - shows how to install without sudo
npm-global-help() {
    echo "=== npm Global Install (No sudo needed!) ==="
    echo ""
    echo "  Your npm global prefix: $(npm config get prefix)"
    echo "  This is set in ~/.npmrc and ~/.bashrc"
    echo ""
    echo "  Usage:"
    echo "    npm install -g <package>      # Works without sudo!"
    echo "    npm install -g typescript     # Example"
    echo "    npm install -g @anthropic-ai/claude-code  # Example"
    echo ""
    echo "  Installed global packages:"
    npm list -g --depth=0 2>/dev/null || echo "  (none yet)"
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

# ─── Ensure .npmrc exists for cloudshell ───────────────────────
if [ ! -f "/home/cloudshell/.npmrc" ]; then
    echo "prefix=/home/cloudshell/.npm-global" > /home/cloudshell/.npmrc
    chown cloudshell:cloudshell /home/cloudshell/.npmrc 2>/dev/null || true
fi

# ─── Ensure auth users directory exists ─────────────────────────
mkdir -p /home/cloudshell/.jasbol-users 2>/dev/null || true
chown -R cloudshell:cloudshell /home/cloudshell/.jasbol-users 2>/dev/null || true

# ─── NOW DROP TO CLOUDSHELL USER AND START THE SERVER ──────────
echo "=========================================="
echo "[Entrypoint] Dropping to cloudshell user..."
echo "[Entrypoint] Starting server: $*"
echo "[Entrypoint] npm global prefix: /home/cloudshell/.npm-global"
echo "=========================================="

exec gosu cloudshell "$@"

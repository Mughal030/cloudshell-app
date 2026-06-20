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

# Also create system-wide npmrc as fallback
cat > /etc/npmrc << 'NPMRC'
prefix=/home/cloudshell/.npm-global
NPMRC
chmod 644 /etc/npmrc 2>/dev/null || true

# Ensure the npm-global/bin is in PATH for all shells
echo "[Entrypoint] npm global prefix set to ${NPM_GLOBAL_DIR}"
echo "[Entrypoint] Users can now run: npm install -g <package>"

# ─── Create smart sudo wrapper ──────────────────────────────────
# In HF Spaces, the container may be UNPRIVILEGED - even with sudo,
# the kernel blocks operations like writing to /var/lib/apt/.
# This wrapper provides real functionality by using alternative methods.
WRAPPER_DIR="/home/cloudshell/.local/bin"
mkdir -p "$WRAPPER_DIR" 2>/dev/null || true

cat > "${WRAPPER_DIR}/sudo" << 'SUDOWRAPPER'
#!/bin/bash
# CloudShell sudo wrapper v11 - works in unprivileged containers
# Tries real sudo first, then provides smart alternatives

# First: try real sudo (works on some platforms)
/usr/bin/sudo "$@" 2>/dev/null && exit 0

# Second: for apt-get/apt commands, try with real sudo + permission fixes
case "$1" in
    apt|apt-get)
        CMD="$1"; shift
        case "$1" in
            update)
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
    chown|chmod)
        # Try real sudo for file permissions
        /usr/bin/sudo "$@" 2>/dev/null && exit 0
        # If that fails, try the operation without sudo (may work for user-owned files)
        "$@" 2>/dev/null && exit 0
        echo "⚠ Permission change failed - may need root access"
        exit 1
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
echo "[Entrypoint] Smart sudo wrapper v11 created"

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

# ─── Create a visible README so 'ls' shows something (not just hidden .dockerfiles) ──
if [ ! -f "${WORKSPACE}/README.md" ]; then
    cat > "${WORKSPACE}/README.md" << 'READMEEOF'
# CloudShell Workspace

Welcome to your **Jasbol Hack CloudShell** workspace!

## Quick Start

```bash
# List files (including hidden)
ls -la

# Try Claude Code (pre-installed)
claude

# Install a global npm package (no sudo needed)
npm install -g typescript

# After running 'curl | bash' installers, refresh your PATH:
reload
# Or just open a new terminal tab
```

## Where do downloaded tools go?

Most `curl | bash` installers put binaries in:
- `~/.local/bin/`        (already in PATH)
- `~/.npm-global/bin/`   (already in PATH, for npm -g)
- `~/.cargo/bin/`        (Rust)
- `~/.bun/bin/`          (Bun)
- `~/.opencode/bin/`     (opencode)

These directories are OUTSIDE this workspace folder, so they won't
appear in the file sidebar. To use a freshly-installed tool, run:

```bash
reload
# or
source ~/.bashrc
```

To find where a tool was installed:
```bash
whereis-tool opencode
```

## Tips

- **Ctrl+Shift+C / Ctrl+Shift+V** = copy / paste in terminal
- **Ctrl+S** in the code editor = save
- Click the refresh button in the Files tab to re-scan
- Toggle "Show hidden" to see dotfiles like .bashrc
- File sidebar auto-refreshes every 4 seconds
READMEEOF
    chown cloudshell:cloudshell "${WORKSPACE}/README.md" 2>/dev/null || true
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

# ─── Reload PATH / source bashrc (after curl|bash installers) ────
# Most 'curl | bash' installers (opencode, bun, rust, deno, etc.)
# add a new PATH entry to ~/.bashrc but the change doesn't take
# effect in the current shell. Run `reload` to fix it instantly.
reload() {
    source "${HOME}/.bashrc" 2>/dev/null
    source "${HOME}/.bashrc_env" 2>/dev/null
    # Also pick up common installer directories that might have been
    # created since the shell started
    for d in "${HOME}/.opencode/bin" "${HOME}/.bun/bin" "${HOME}/.cargo/bin" \
             "${HOME}/.deno/bin" "${HOME}/.local/bin" "${HOME}/.npm-global/bin" \
             "${HOME}/.nvm/versions/node"/*/bin "${HOME}/go/bin" \
             "${HOME}/.local/go/bin" "${HOME}/.krew/bin"; do
        [ -d "$d" ] && case ":$PATH:" in
            *":$d:"*) ;;
            *) export PATH="$d:$PATH" ;;
        esac
    done
    echo "✓ Shell reloaded. PATH updated."
    echo "  PATH entries added: $(echo "$PATH" | tr ':' '\n' | wc -l) directories"
}
alias rl='reload'

# ─── Show what was just installed (where did the binary land?) ──
# Use after running a 'curl | bash' installer to find the new binary
whereis-tool() {
    if [ -z "$1" ]; then
        echo "Usage: whereis-tool <name>"
        echo "  Searches common install locations for the given tool"
        echo "  Example: whereis-tool opencode"
        return 1
    fi
    local name="$1"
    local found=0
    echo "Searching for '$name' in common install locations..."
    for d in "${HOME}/.local/bin" "${HOME}/.npm-global/bin" "${HOME}/bin" \
             "${HOME}/.opencode/bin" "${HOME}/.bun/bin" "${HOME}/.cargo/bin" \
             "${HOME}/.deno/bin" "${HOME}/go/bin" "${HOME}/.local/go/bin" \
             "/usr/local/bin" "/usr/bin"; do
        if [ -x "${d}/${name}" ]; then
            echo "  ✓ ${d}/${name}"
            found=1
        fi
    done
    if [ $found -eq 0 ]; then
        echo "  ✗ '$name' not found in any common location."
        echo "    Try: reload  (to refresh PATH after an installer ran)"
        echo "    Or:  find ~ -name '$name' -type f 2>/dev/null"
    else
        echo ""
        echo "  To use it: reload  (or open a new terminal tab)"
    fi
}

# ─── Claude Code CLI Setup ──────────────────────────────────
# Claude Code is PRE-INSTALLED in the Docker image.
# Just type 'claude' to start!
#
# Change settings individually:
#   claude-set-url "https://your-api-endpoint.com/"
#   claude-set-key "sk-your-new-api-key"
#   claude-set-model "claude-opus-4-7"
#   claude-show              (shows current config)
#
# Or set all at once:
#   setup-claude-env "https://your-endpoint/" "sk-your-key" "claude-opus-4-7"

# ─── Show current Claude Code configuration ─────────────────
claude-show() {
    echo "=== Claude Code Configuration ==="
    echo "  ANTHROPIC_BASE_URL    = ${ANTHROPIC_BASE_URL:-(not set)}"
    echo "  ANTHROPIC_AUTH_TOKEN   = ****${ANTHROPIC_AUTH_TOKEN: -4}"
    echo "  ANTHROPIC_MODEL       = ${ANTHROPIC_MODEL:-(not set)}"
    echo "  CLAUDE_CODE_USE_AUTH_TOKEN = ${CLAUDE_CODE_USE_AUTH_TOKEN:-(not set)}"
    echo ""
    if command -v claude &>/dev/null; then
        echo "  claude CLI: installed ($(which claude))"
    else
        echo "  claude CLI: NOT FOUND (run: setup-claude-code)"
    fi
}

# ─── Change Claude Code API Base URL only ────────────────────
claude-set-url() {
    if [ -z "$1" ]; then
        echo "Usage: claude-set-url <base_url>"
        echo "  Current: ${ANTHROPIC_BASE_URL}"
        echo ""
        echo "  Example:"
        echo "    claude-set-url \"https://agentrouter.org/\""
        echo "    claude-set-url \"https://api.anthropic.com/\""
        return 1
    fi
    export ANTHROPIC_BASE_URL="$1"
    # Update persisted env file
    _claude_update_env ANTHROPIC_BASE_URL "$1"
    echo "ANTHROPIC_BASE_URL updated to: $1"
    echo "  (Saved to ~/.bashrc_env for future sessions)"
}

# ─── Change Claude Code API Key only ────────────────────────
claude-set-key() {
    if [ -z "$1" ]; then
        echo "Usage: claude-set-key <api_key>"
        echo "  Current: ****${ANTHROPIC_AUTH_TOKEN: -4}"
        echo ""
        echo "  Example:"
        echo "    claude-set-key \"sk-ant-api03-xxxxx\""
        return 1
    fi
    export ANTHROPIC_AUTH_TOKEN="$1"
    export CLAUDE_CODE_USE_AUTH_TOKEN="true"
    # Update persisted env file
    _claude_update_env ANTHROPIC_AUTH_TOKEN "$1"
    _claude_update_env CLAUDE_CODE_USE_AUTH_TOKEN "true"
    echo "ANTHROPIC_AUTH_TOKEN updated to: ****${1: -4}"
    echo "  (Saved to ~/.bashrc_env for future sessions)"
}

# ─── Change Claude Code Model only ──────────────────────────
claude-set-model() {
    if [ -z "$1" ]; then
        echo "Usage: claude-set-model <model_name>"
        echo "  Current: ${ANTHROPIC_MODEL}"
        echo ""
        echo "  Available models:"
        echo "    claude-opus-4-7        (Most capable)"
        echo "    claude-sonnet-4-20250514 (Balanced)"
        echo "    claude-haiku-3-5-20241022 (Fast & cheap)"
        return 1
    fi
    export ANTHROPIC_MODEL="$1"
    # Update persisted env file
    _claude_update_env ANTHROPIC_MODEL "$1"
    echo "ANTHROPIC_MODEL updated to: $1"
    echo "  (Saved to ~/.bashrc_env for future sessions)"
}

# ─── Internal: update a single env var in ~/.bashrc_env ─────
_claude_update_env() {
    local VAR_NAME="$1"
    local VALUE="$2"
    local ENV_FILE="${HOME}/.bashrc_env"

    # Remove old line for this variable (if exists)
    if [ -f "$ENV_FILE" ]; then
        sed -i "/^export ${VAR_NAME}=/d" "$ENV_FILE" 2>/dev/null || true
    fi

    # Append new value
    echo "export ${VAR_NAME}=\"${VALUE}\"" >> "$ENV_FILE"
}

# ─── Install Claude Code (if not pre-installed) ──────────────
setup-claude-code() {
    echo "=== Installing Claude Code CLI ==="
    npm install -g @anthropic-ai/claude-code
    echo ""
    echo "=== Claude Code installed! ==="
    echo ""
    echo "Configure your API credentials with individual commands:"
    echo ""
    echo "  claude-set-url \"https://your-api-endpoint.com/\""
    echo "  claude-set-key \"sk-your-api-key-here\""
    echo "  claude-set-model \"claude-opus-4-7\""
    echo ""
    echo "Or set all at once:"
    echo "  setup-claude-env \"https://your-endpoint/\" \"sk-your-key\" \"claude-opus-4-7\""
    echo ""
    echo "Then just type: claude"
}

setup-claude-env() {
    local BASE_URL="${1:-}"
    local AUTH_TOKEN="${2:-}"
    local MODEL="${3:-claude-opus-4-7}"

    if [ -z "$BASE_URL" ] || [ -z "$AUTH_TOKEN" ]; then
        echo "Usage: setup-claude-env <base_url> <auth_token> [model]"
        echo ""
        echo "Example:"
        echo "  setup-claude-env \"https://agentrouter.org/\" \"sk-abc123\" \"claude-opus-4-7\""
        echo ""
        echo "Or change individually:"
        echo "  claude-set-url   (change API endpoint only)"
        echo "  claude-set-key   (change API key only)"
        echo "  claude-set-model (change model only)"
        echo "  claude-show      (show current config)"
        return 1
    fi

    # Set for current session
    export ANTHROPIC_BASE_URL="$BASE_URL"
    export ANTHROPIC_AUTH_TOKEN="$AUTH_TOKEN"
    export ANTHROPIC_MODEL="$MODEL"
    export CLAUDE_CODE_USE_AUTH_TOKEN="true"

    # Persist ALL claude vars to ~/.bashrc_env
    cat > "${HOME}/.bashrc_env" << ENVEOF
# Claude Code CLI Environment Variables
# Set on $(date)
export ANTHROPIC_BASE_URL="${BASE_URL}"
export ANTHROPIC_AUTH_TOKEN="${AUTH_TOKEN}"
export ANTHROPIC_MODEL="${MODEL}"
export CLAUDE_CODE_USE_AUTH_TOKEN="true"
ENVEOF

    echo "Claude Code environment configured!"
    echo "  ANTHROPIC_BASE_URL = $ANTHROPIC_BASE_URL"
    echo "  ANTHROPIC_MODEL    = $ANTHROPIC_MODEL"
    echo "  ANTHROPIC_AUTH_TOKEN = ****${AUTH_TOKEN: -4}"
    echo "  CLAUDE_CODE_USE_AUTH_TOKEN = true"
    echo ""
    echo "  Saved to ~/.bashrc_env (persists across sessions)"
    echo "  Run 'claude' to start!"
}

# ─── General env var helper ──────────────────────────────────
# On Linux, use 'export' instead of Windows 'setx'
# To persist an env var: add it to ~/.bashrc_env
setenv() {
    if [ -z "$1" ]; then
        echo "Usage: setenv <VAR_NAME> <value>"
        echo "  Sets environment variable for current session AND persists it"
        echo "  Example: setenv MY_VAR \"hello world\""
        return 1
    fi
    local VAR_NAME="$1"
    local VALUE="${2:-}"
    export "$VAR_NAME"="$VALUE"
    # Persist
    echo "export ${VAR_NAME}=\"${VALUE}\"" >> "${HOME}/.bashrc_env"
    echo "✓ ${VAR_NAME} set and saved to ~/.bashrc_env"
}

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
    echo -n "  npm prefix: "; npm config get prefix 2>&1
    echo -n "  python3: "; python3 --version 2>&1
    echo -n "  pip3: "; pip3 --version 2>&1 | head -1
    echo ""

    echo "--- npm Global Install Test ---"
    echo "  npm prefix: $(npm config get prefix 2>/dev/null)"
    echo "  npm global dir: ${HOME}/.npm-global"
    echo "  To install global packages: npm install -g <package>"
    echo "  (No sudo needed! Installs to ~/.npm-global/)"
    echo ""

    echo "--- Claude Code CLI ---"
    if command -v claude &>/dev/null; then
        echo "  ✅ claude: installed"
    else
        echo "  ⬜ claude: not installed (run: setup-claude-code)"
    fi
    echo ""
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
    echo "    npm install -g @anthropic-ai/claude-code  # Claude Code CLI"
    echo ""
    echo "  Installed global packages:"
    npm list -g --depth=0 2>/dev/null || echo "  (none yet)"
}
BASHRC
    chown cloudshell:cloudshell "/home/cloudshell/.bashrc_cloudshell" 2>/dev/null || true
    echo "[Entrypoint] Custom bashrc created"
fi

# ─── Ensure reload() and whereis-tool() helpers exist (even if .bashrc_cloudshell already existed) ──
if ! grep -q "^reload()" "/home/cloudshell/.bashrc_cloudshell" 2>/dev/null; then
    cat >> "/home/cloudshell/.bashrc_cloudshell" << 'BASHRC_APPEND'

# ─── Reload PATH / source bashrc (after curl|bash installers) ────
# Most 'curl | bash' installers (opencode, bun, rust, deno, etc.)
# add a new PATH entry to ~/.bashrc but the change doesn't take
# effect in the current shell. Run `reload` to fix it instantly.
reload() {
    source "${HOME}/.bashrc" 2>/dev/null
    source "${HOME}/.bashrc_env" 2>/dev/null
    for d in "${HOME}/.opencode/bin" "${HOME}/.bun/bin" "${HOME}/.cargo/bin" \
             "${HOME}/.deno/bin" "${HOME}/.local/bin" "${HOME}/.npm-global/bin" \
             "${HOME}/.nvm/versions/node"/*/bin "${HOME}/go/bin" \
             "${HOME}/.local/go/bin" "${HOME}/.krew/bin"; do
        [ -d "$d" ] && case ":$PATH:" in
            *":$d:"*) ;;
            *) export PATH="$d:$PATH" ;;
        esac
    done
    echo "✓ Shell reloaded. PATH updated."
    echo "  PATH entries: $(echo "$PATH" | tr ':' '\n' | wc -l) directories"
}
alias rl='reload'

whereis-tool() {
    if [ -z "$1" ]; then
        echo "Usage: whereis-tool <name>"
        echo "  Searches common install locations for the given tool"
        return 1
    fi
    local name="$1"
    local found=0
    echo "Searching for '$name' in common install locations..."
    for d in "${HOME}/.local/bin" "${HOME}/.npm-global/bin" "${HOME}/bin" \
             "${HOME}/.opencode/bin" "${HOME}/.bun/bin" "${HOME}/.cargo/bin" \
             "${HOME}/.deno/bin" "${HOME}/go/bin" "${HOME}/.local/go/bin" \
             "/usr/local/bin" "/usr/bin"; do
        if [ -x "${d}/${name}" ]; then
            echo "  ✓ ${d}/${name}"
            found=1
        fi
    done
    if [ $found -eq 0 ]; then
        echo "  ✗ '$name' not found in any common location."
        echo "    Try: reload  (to refresh PATH after an installer ran)"
        echo "    Or:  find ~ -name '$name' -type f 2>/dev/null"
    else
        echo ""
        echo "  To use it: reload  (or open a new terminal tab)"
    fi
}
BASHRC_APPEND
    chown cloudshell:cloudshell "/home/cloudshell/.bashrc_cloudshell" 2>/dev/null || true
    echo "[Entrypoint] reload() and whereis-tool() helpers appended"
fi

# Append to .bashrc if not already done
if ! grep -q "bashrc_cloudshell" "/home/cloudshell/.bashrc" 2>/dev/null; then
    echo "" >> "/home/cloudshell/.bashrc"
    echo "# CloudShell custom additions" >> "/home/cloudshell/.bashrc"
    echo "[ -f \"\${HOME}/.bashrc_cloudshell\" ] && source \"\${HOME}/.bashrc_cloudshell\"" >> "/home/cloudshell/.bashrc"
fi

# Source .bashrc_env if it exists (persistent env vars)
if ! grep -q "bashrc_env" "/home/cloudshell/.bashrc" 2>/dev/null; then
    echo "" >> "/home/cloudshell/.bashrc"
    echo "# Persistent environment variables" >> "/home/cloudshell/.bashrc"
    echo "[ -f \"\${HOME}/.bashrc_env\" ] && source \"\${HOME}/.bashrc_env\"" >> "/home/cloudshell/.bashrc"
fi

# ─── Ensure .npmrc exists for cloudshell ───────────────────────
if [ ! -f "/home/cloudshell/.npmrc" ]; then
    echo "prefix=/home/cloudshell/.npm-global" > /home/cloudshell/.npmrc
    chown cloudshell:cloudshell /home/cloudshell/.npmrc 2>/dev/null || true
fi

# ─── Ensure .bashrc_env exists ─────────────────────────────────
if [ ! -f "/home/cloudshell/.bashrc_env" ]; then
    touch /home/cloudshell/.bashrc_env
    chown cloudshell:cloudshell /home/cloudshell/.bashrc_env 2>/dev/null || true
fi

# ─── Ensure auth users directory exists ─────────────────────────
mkdir -p /home/cloudshell/.jasbol-users 2>/dev/null || true
chown -R cloudshell:cloudshell /home/cloudshell/.jasbol-users 2>/dev/null || true

# ─── Verify npm global prefix ──────────────────────────────────
echo "[Entrypoint] Verifying npm configuration..."
echo "[Entrypoint]   .npmrc content: $(cat /home/cloudshell/.npmrc 2>/dev/null)"
echo "[Entrypoint]   NPM_CONFIG_PREFIX: ${NPM_CONFIG_PREFIX}"
echo "[Entrypoint]   PATH: ${PATH}"

# ─── NOW DROP TO CLOUDSHELL USER AND START THE SERVER ──────────
echo "=========================================="
echo "[Entrypoint] Dropping to cloudshell user..."
echo "[Entrypoint] Starting server: $*"
echo "[Entrypoint] npm global prefix: /home/cloudshell/.npm-global"
echo "[Entrypoint] Claude Code: pre-installed! Just type 'claude' to start"
echo "=========================================="

exec gosu cloudshell "$@"

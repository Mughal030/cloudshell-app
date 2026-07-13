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

# Try OpenCode (pre-installed)
opencode

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

# ─── Auto-refresh PATH before each prompt ────────────────────────
# Most 'curl | bash' installers (opencode, bun, rust, deno, etc.) add a new
# PATH entry to ~/.bashrc but the running shell doesn't pick it up until you
# manually `source ~/.bashrc`. This PROMPT_COMMAND hook checks for any
# newly-created installer directories and adds them to PATH automatically,
# so tools work IMMEDIATELY after install — no `reload` needed.
__cloudshell_refresh_path() {
    local d
    for d in "${HOME}/.opencode/bin" "${HOME}/.bun/bin" "${HOME}/.cargo/bin" \
             "${HOME}/.deno/bin" "${HOME}/.local/bin" "${HOME}/.npm-global/bin" \
             "${HOME}/bin" "${HOME}/go/bin" "${HOME}/.local/go/bin" \
             "${HOME}/.krew/bin" "${HOME}/.yarn/bin"; do
        [ -d "$d" ] || continue
        case ":${PATH}:" in
            *":${d}:"*) ;;
            *) export PATH="${d}:${PATH}" ;;
        esac
    done
    # Also re-source bashrc_env if it changed (for newly-set env vars)
    if [ -f "${HOME}/.bashrc_env" ]; then
        local env_mtime=$(stat -c %Y "${HOME}/.bashrc_env" 2>/dev/null || echo 0)
        if [ -z "${__BASHRC_ENV_MTIME:-}" ] || [ "$env_mtime" -gt "$__BASHRC_ENV_MTIME" ]; then
            source "${HOME}/.bashrc_env" 2>/dev/null
            __BASHRC_ENV_MTIME="$env_mtime"
        fi
    fi
}
# Preserve any existing PROMPT_COMMAND and chain ours
if [ -n "${PROMPT_COMMAND:-}" ]; then
    PROMPT_COMMAND="__cloudshell_refresh_path; ${PROMPT_COMMAND}"
else
    PROMPT_COMMAND="__cloudshell_refresh_path"
fi
export PROMPT_COMMAND

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

# ─── Claude Code CLI Setup (via free-claude-code proxy) ─────
# Claude Code is PRE-INSTALLED and configured to use the
# free-claude-code proxy (fcc-server) on localhost:8082.
# The proxy translates Anthropic API requests to NVIDIA NIM.
#
# Architecture:
#   Claude Code → localhost:8082 (fcc-server proxy) → NVIDIA NIM API
#   ANTHROPIC_AUTH_TOKEN = "fcc-no-auth" (bypasses OAuth login prompt)
#   NVIDIA_NIM_API_KEY = your actual NVIDIA key (used by the proxy)
#
# IMPORTANT: Use "fcc-claude" to launch Claude Code (not "claude")
#   fcc-claude auto-sets env vars and skips the login prompt.
#   If you use "claude" directly, you may get a sign-in prompt.
#
# Commands:
#   fcc-claude             - Launch Claude Code via proxy (RECOMMENDED)
#   claude-models          - List all available NVIDIA models
#   claude-set-model       - Change the default model (supports short names!)
#   claude-set-nvidia-key  - Change your NVIDIA API key
#   claude-show            - Show current config
#   claude-test            - Test the proxy + NVIDIA API
#   fcc-start / fcc-stop   - Start/stop the proxy
#   fcc-status             - Check if proxy is running

# ─── Show current Claude Code configuration ─────────────────
claude-show() {
    echo "=== Claude Code Configuration (via free-claude-code proxy) ==="
    echo ""
    echo "  Architecture:"
    echo "    Claude Code → localhost:8082 (proxy) → NVIDIA NIM API"
    echo ""
    echo "  ANTHROPIC_BASE_URL    = ${ANTHROPIC_BASE_URL:-(not set)}"
    echo "  ANTHROPIC_AUTH_TOKEN   = ${ANTHROPIC_AUTH_TOKEN:-(not set)} (bypasses OAuth login)"
    echo "  ANTHROPIC_MODEL       = ${ANTHROPIC_MODEL:-(not set)}"
    echo "  CLAUDE_CODE_USE_AUTH_TOKEN = ${CLAUDE_CODE_USE_AUTH_TOKEN:-(not set)}"
    echo "  NVIDIA_NIM_API_KEY    = ****${NVIDIA_NIM_API_KEY: -4}"
    echo ""
    # Check proxy status
    if curl -s http://localhost:8082/health >/dev/null 2>&1; then
        echo "  Proxy (fcc-server): ✅ RUNNING on port 8082"
    else
        echo "  Proxy (fcc-server): ❌ NOT RUNNING (run: fcc-start)"
    fi
    echo ""
    if command -v claude &>/dev/null; then
        echo "  claude CLI: installed ($(which claude))"
    else
        echo "  claude CLI: NOT FOUND (run: setup-claude-code)"
    fi
    if command -v fcc-server &>/dev/null; then
        echo "  fcc-server: installed ($(which fcc-server))"
    else
        echo "  fcc-server: NOT FOUND (run: setup-fcc-proxy)"
    fi
}

# ─── Change NVIDIA NIM API Key ──────────────────────────────
# This is the key used by the proxy to talk to NVIDIA.
# ANTHROPIC_AUTH_TOKEN stays as "fcc-no-auth" — the proxy ignores it.
claude-set-nvidia-key() {
    if [ -z "$1" ]; then
        echo "Usage: claude-set-nvidia-key <nvidia_api_key>"
        echo "  Current: ****${NVIDIA_NIM_API_KEY: -4}"
        echo ""
        echo "  Get your key at: https://build.nvidia.com/ → Get API Key"
        echo ""
        echo "  Example:"
        echo "    claude-set-nvidia-key \"nvapi-xxxxxxxxxxxx\""
        return 1
    fi
    local NEW_KEY="$1"
    export NVIDIA_NIM_API_KEY="$NEW_KEY"
    # Update persisted env file
    _claude_update_env NVIDIA_NIM_API_KEY "$NEW_KEY"
    # Also update the fcc-server .env file
    _fcc_update_env NVIDIA_NIM_API_KEY "$NEW_KEY"
    echo "✅ NVIDIA_NIM_API_KEY updated to: ****${NEW_KEY: -4}"
    echo "  (Saved to ~/.bashrc_env AND fcc-server .env)"
    echo ""
    # Automatically restart the proxy with the new key
    echo "  Restarting proxy with new key..."
    fcc-stop
    sleep 1
    fcc-start
}

# ─── Change Claude Code API Base URL ────────────────────────
# WARNING: Only change this if you're NOT using the proxy anymore!
# If using the proxy, this should always be http://localhost:8082
claude-set-url() {
    if [ -z "$1" ]; then
        echo "Usage: claude-set-url <base_url>"
        echo "  Current: ${ANTHROPIC_BASE_URL}"
        echo ""
        echo "  ⚠ If using the NVIDIA proxy, keep this as http://localhost:8082"
        echo ""
        echo "  Example (with proxy):"
        echo "    claude-set-url \"http://localhost:8082\""
        echo ""
        echo "  Example (direct Anthropic API, no proxy):"
        echo "    claude-set-url \"https://api.anthropic.com/\""
        return 1
    fi
    export ANTHROPIC_BASE_URL="$1"
    _claude_update_env ANTHROPIC_BASE_URL "$1"
    echo "ANTHROPIC_BASE_URL updated to: $1"
    echo "  (Saved to ~/.bashrc_env for future sessions)"
}

# ─── Change Claude Code Model ──────────────────────────────
# The proxy maps model names to actual NVIDIA models.
claude-models() {
    echo "╔══════════════════════════════════════════════════════════════════╗"
    echo "║           Available NVIDIA NIM Models (via fcc proxy)           ║"
    echo "╠══════════════════════════════════════════════════════════════════╣"
    echo "║  #  │ Claude Code ID           │ Real NVIDIA Model              ║"
    echo "╠═════╪══════════════════════════╪═══════════════════════════════╣"
    echo "║  1  │ claude-opus-4-5          │ z-ai/glm-5.2                  ║"
    echo "║  2  │ claude-sonnet-4-5        │ nvidia/llama-3.3-nemotron-49b ║"
    echo "║  3  │ claude-sonnet-4-5-mini   │ nvidia/phi-4                  ║"
    echo "║  4  │ claude-opus-4            │ nvidia/nemotron-3-super-120b  ║"
    echo "║  5  │ claude-sonnet-4          │ nvidia/llama-3.1-nemotron-70b ║"
    echo "║  6  │ claude-deepseek-r1       │ deepseek-ai/deepseek-r1      ║"
    echo "║  7  │ anthropic-mistral-large  │ nvidia/mistral-large-2411    ║"
    echo "╚═════╧══════════════════════════╧═══════════════════════════════╝"
    echo ""
    echo "  Current default: ${ANTHROPIC_MODEL:-claude-opus-4-5}"
    echo ""
    echo "  To switch model (temporary, this session only):"
    echo "    Type /model inside Claude Code and pick from the list"
    echo ""
    echo "  To change the DEFAULT model (permanent):"
    echo "    claude-set-model <claude_code_id>"
    echo ""
    echo "  Examples:"
    echo "    claude-set-model claude-opus-4-5        # GLM 5.2 (default, best)"
    echo "    claude-set-model claude-deepseek-r1     # DeepSeek R1 (reasoning)"
    echo "    claude-set-model claude-sonnet-4-5      # Llama Nemotron (balanced)"
    echo "    claude-set-model claude-sonnet-4-5-mini # Phi-4 (fastest)"
}

claude-set-model() {
    if [ -z "$1" ]; then
        claude-models
        return 1
    fi

    # Map the input to a valid Claude Code model ID
    local MODEL_ID="$1"
    local NVIDIA_MODEL=""

    case "$MODEL_ID" in
        1|glm|glm5|glm-5|glm-5.2|z-ai/glm-5.2)
            MODEL_ID="claude-opus-4-5"
            NVIDIA_MODEL="z-ai/glm-5.2"
            ;;
        2|llama|llama49b|nemotron-49b|nvidia/llama-3.3-nemotron-super-49b-v1)
            MODEL_ID="claude-sonnet-4-5"
            NVIDIA_MODEL="nvidia/llama-3.3-nemotron-super-49b-v1"
            ;;
        3|phi|phi4|nvidia/phi-4)
            MODEL_ID="claude-sonnet-4-5-mini"
            NVIDIA_MODEL="nvidia/phi-4"
            ;;
        4|nemotron-120b|nvidia/nemotron-3-super-120b-a12b)
            MODEL_ID="claude-opus-4"
            NVIDIA_MODEL="nvidia/nemotron-3-super-120b-a12b"
            ;;
        5|nemotron-70b|nvidia/llama-3.1-nemotron-70b-instruct)
            MODEL_ID="claude-sonnet-4"
            NVIDIA_MODEL="nvidia/llama-3.1-nemotron-70b-instruct"
            ;;
        6|deepseek|deepseek-r1|deepseek-ai/deepseek-r1)
            MODEL_ID="claude-deepseek-r1"
            NVIDIA_MODEL="deepseek-ai/deepseek-r1"
            ;;
        7|mistral|mistral-large|nvidia/mistral-large-2411)
            MODEL_ID="anthropic-mistral-large"
            NVIDIA_MODEL="nvidia/mistral-large-2411"
            ;;
        claude-opus-4-5|claude-sonnet-4-5|claude-sonnet-4-5-mini|claude-opus-4|claude-sonnet-4|claude-deepseek-r1|anthropic-mistral-large)
            # Already a valid Claude Code ID — resolve it
            ;;
        *)
            echo "ERROR: Unknown model '$MODEL_ID'"
            echo ""
            claude-models
            return 1
            ;;
    esac

    # Resolve NVIDIA model name from the Claude ID
    case "$MODEL_ID" in
        claude-opus-4-5)         NVIDIA_MODEL="z-ai/glm-5.2" ;;
        claude-sonnet-4-5)       NVIDIA_MODEL="nvidia/llama-3.3-nemotron-super-49b-v1" ;;
        claude-sonnet-4-5-mini)  NVIDIA_MODEL="nvidia/phi-4" ;;
        claude-opus-4)           NVIDIA_MODEL="nvidia/nemotron-3-super-120b-a12b" ;;
        claude-sonnet-4)         NVIDIA_MODEL="nvidia/llama-3.1-nemotron-70b-instruct" ;;
        claude-deepseek-r1)      NVIDIA_MODEL="deepseek-ai/deepseek-r1" ;;
        anthropic-mistral-large) NVIDIA_MODEL="nvidia/mistral-large-2411" ;;
    esac

    export ANTHROPIC_MODEL="$MODEL_ID"
    _claude_update_env ANTHROPIC_MODEL "$MODEL_ID"
    echo "✅ Model changed successfully!"
    echo ""
    echo "  Claude Code shows: $MODEL_ID"
    echo "  Actually uses:     $NVIDIA_MODEL (on NVIDIA NIM)"
    echo ""
    echo "  Saved to ~/.bashrc_env (permanent across sessions)"
    echo ""
    echo "  Restart the proxy for changes to take effect:"
    echo "    fcc-stop && fcc-start"
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

# ─── Internal: update a single env var in fcc-server .env ──
_fcc_update_env() {
    local VAR_NAME="$1"
    local VALUE="$2"
    local FCC_ENV=""

    # Find the fcc-server .env file (could be in several locations)
    for dir in "$HOME/.fcc" "$HOME/.config/free-claude-code" "/app"; do
        if [ -f "${dir}/.env" ]; then
            FCC_ENV="${dir}/.env"
            break
        fi
    done

    if [ -z "$FCC_ENV" ]; then
        # Try to find it via fcc-server's config path
        if command -v fcc-server &>/dev/null; then
            local CONFIG_DIR
            CONFIG_DIR=$(python3 -c "
from config.paths import config_dir_path
print(config_dir_path())
" 2>/dev/null || echo "")
            if [ -n "$CONFIG_DIR" ] && [ -f "${CONFIG_DIR}/.env" ]; then
                FCC_ENV="${CONFIG_DIR}/.env"
            fi
        fi
    fi

    if [ -z "$FCC_ENV" ]; then
        # Create .env in the standard config location
        FCC_ENV="$HOME/.fcc/.env"
        mkdir -p "$(dirname "$FCC_ENV")" 2>/dev/null || true
    fi

    # Remove old line and add new
    if [ -f "$FCC_ENV" ]; then
        sed -i "/^${VAR_NAME}=/d" "$FCC_ENV" 2>/dev/null || true
    fi
    echo "${VAR_NAME}=\"${VALUE}\"" >> "$FCC_ENV"
}

# ─── Install Claude Code CLI (if not pre-installed) ────────
setup-claude-code() {
    echo "=== Installing Claude Code CLI ==="
    npm install -g @anthropic-ai/claude-code
    echo ""
    echo "=== Claude Code installed! ==="
    echo ""
    echo "  It's pre-configured to use the free-claude-code proxy."
    echo "  Just type: claude"
    echo ""
    echo "  To change your NVIDIA API key:"
    echo "    claude-set-nvidia-key \"nvapi-your-key-here\""
    echo ""
    echo "  To check the setup:"
    echo "    claude-show"
}

# ─── Install/setup free-claude-code proxy ──────────────────
setup-fcc-proxy() {
    echo "=== Setting up free-claude-code proxy ==="
    echo ""
    if command -v fcc-server &>/dev/null; then
        echo "  fcc-server is already installed: $(which fcc-server)"
    else
        echo "  Installing free-claude-code via uv..."
        export PATH="$HOME/.local/bin:/root/.local/bin:$PATH"
        uv python install 3.14 2>&1 | tail -2
        uv tool install --force "free-claude-code @ git+https://github.com/Alishahryar1/free-claude-code.git" 2>&1 | tail -5
        # Symlink to system path (fcc-claude gets a PORT-unset wrapper)
        ln -sf /home/cloudshell/.local/bin/fcc-server /usr/local/bin/fcc-server 2>/dev/null || true
        ln -sf /home/cloudshell/.local/bin/free-claude-code /usr/local/bin/free-claude-code 2>/dev/null || true
        # Install fcc-claude wrapper that unsets PORT (fixes HF Spaces PORT=7860 collision)
        ln -sf /home/cloudshell/.local/bin/fcc-claude /usr/local/bin/fcc-claude-real 2>/dev/null || true
        cat > /usr/local/bin/fcc-claude << 'WRAPPEREOF'
#!/bin/bash
# fcc-claude wrapper: unsets PORT so pydantic-settings reads 8082 from ~/.fcc/.env
# instead of picking up PORT=7860 from the HF Spaces runtime environment.
unset PORT
exec /usr/local/bin/fcc-claude-real "$@"
WRAPPEREOF
        chmod +x /usr/local/bin/fcc-claude
        echo "  fcc-server installed (with PORT-unset wrapper for fcc-claude)!"
    fi
    echo ""
    echo "  Creating .env with your NVIDIA key..."
    _fcc_update_env PORT "8083"
    _fcc_update_env NVIDIA_NIM_API_KEY "${NVIDIA_NIM_API_KEY:-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}"
    _fcc_update_env MODEL "nvidia_nim/z-ai/glm-5.2"
    _fcc_update_env ANTHROPIC_AUTH_TOKEN "fcc-no-auth"
    echo ""
    echo "  Starting proxy..."
    fcc-start
}

# ─── Start the free-claude-code proxy ──────────────────────
fcc-start() {
    if curl -s http://localhost:8082/health >/dev/null 2>&1; then
        echo "Proxy (fcc-server + model discovery) is already running on port 8082"
        return 0
    fi

    echo "Starting free-claude-code proxy..."

    # Update .env with current settings
    _fcc_update_env NVIDIA_NIM_API_KEY "${NVIDIA_NIM_API_KEY:-}"
    _fcc_update_env ANTHROPIC_AUTH_TOKEN "fcc-no-auth"

    # Read key from .env file if not in environment
    local FCC_NVIDIA_KEY="${NVIDIA_NIM_API_KEY:-}"
    if [ -z "$FCC_NVIDIA_KEY" ] && [ -f "${HOME}/.fcc/.env" ]; then
        FCC_NVIDIA_KEY=$(grep '^NVIDIA_NIM_API_KEY=' "${HOME}/.fcc/.env" 2>/dev/null | head -1 | sed 's/^NVIDIA_NIM_API_KEY="//;s/"$//')
    fi
    # Hardcoded fallback — ensures proxy always has a valid key
    if [ -z "$FCC_NVIDIA_KEY" ]; then
        FCC_NVIDIA_KEY="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"
    fi

    # Start the direct-to-NVIDIA proxy on port 8082
    # (v3 proxy: no fcc-server needed — goes directly to NVIDIA NIM API)
    if [ -f /home/cloudshell/scripts/fcc-model-discovery-proxy.cjs ]; then
        NVIDIA_NIM_API_KEY="$FCC_NVIDIA_KEY" \
        ANTHROPIC_MODEL="${ANTHROPIC_MODEL:-claude-opus-4-5}" \
        FCC_PROXY_PORT=8082 \
        nohup node /home/cloudshell/scripts/fcc-model-discovery-proxy.cjs > /tmp/fcc-model-proxy.log 2>&1 &
        local PROXY_PID=$!
        echo "$PROXY_PID" > "${HOME}/.fcc/proxy.pid"
        echo "  Direct-to-NVIDIA proxy started with PID $PROXY_PID on port 8082"
        sleep 2
        if curl -s http://localhost:8082/health >/dev/null 2>&1; then
            echo "  ✅ Proxy running — Claude-compatible models available in /model picker"
            echo "  Default model: ${ANTHROPIC_MODEL:-claude-opus-4-5} → z-ai/glm-5.2"
        else
            echo "  ⚠ Proxy may still be starting"
        fi
    else
        echo "  ⚠ fcc-model-discovery-proxy.cjs not found — /model picker may show Anthropic models only"
    fi

    # Final check
    if curl -s http://localhost:8082/health >/dev/null 2>&1; then
        echo "  ✅ Full proxy stack is running on http://localhost:8082"
        echo "  ✅ Admin UI at http://localhost:8083/admin (internal)"
        echo ""
        echo "  Now just type: fcc-claude"
        return 0
    fi

    echo "  ⚠ Proxy may still be starting. Check: fcc-status"
    echo "  Logs: tail -f /tmp/fcc-server.log /tmp/fcc-model-proxy.log"
}

# ─── Stop the free-claude-code proxy ───────────────────────
fcc-stop() {
    echo "Stopping free-claude-code proxy..."

    # Kill model-discovery proxy on port 8082
    pkill -f fcc-model-discovery-proxy 2>/dev/null || true
    fuser -k 8082/tcp 2>/dev/null || true

    # Kill fcc-server on port 8083
    local PID=""
    if [ -f "${HOME}/.fcc/fcc-server.pid" ]; then
        PID=$(cat "${HOME}/.fcc/fcc-server.pid" 2>/dev/null | tr -d '[:space:]')
    fi
    if [ -z "$PID" ] || ! kill -0 "$PID" 2>/dev/null; then
        PID=$(lsof -ti:8083 2>/dev/null || true)
    fi

    if [ -n "$PID" ]; then
        for P in $PID; do kill "$P" 2>/dev/null || true; done
        sleep 1
        for P in $PID; do
            if kill -0 "$P" 2>/dev/null; then kill -9 "$P" 2>/dev/null || true; fi
        done
    fi

    # Force kill anything left on both ports
    fuser -k 8082/tcp 2>/dev/null || true
    fuser -k 8083/tcp 2>/dev/null || true
    pkill -9 -f fcc-server 2>/dev/null || true
    pkill -9 -f fcc-model-discovery-proxy 2>/dev/null || true

    # Wait for ports to be free (up to 5s)
    local WAITED=0
    while [ $WAITED -lt 10 ]; do
        if ! lsof -ti:8082 2>/dev/null && ! lsof -ti:8083 2>/dev/null; then
            break
        fi
        sleep 0.5
        WAITED=$((WAITED + 1))
    done

    rm -f "${HOME}/.fcc/fcc-server.pid" 2>/dev/null || true
    echo "  Proxy stopped (both fcc-server and model-discovery proxy)"
}

# ─── Check proxy status ───────────────────────────────────
fcc-status() {
    echo "=== Free-Claude-Code Proxy Status ==="
    echo ""

    # Check model-discovery proxy on port 8082
    if curl -s http://localhost:8082/health >/dev/null 2>&1; then
        echo "✅ Model Discovery Proxy: RUNNING on port 8082"
        # Check if /v1/models works
        local MODEL_COUNT=$(curl -s http://localhost:8082/v1/models 2>/dev/null | python3 -c "import sys,json; print(len(json.load(sys.stdin).get('data',[])))" 2>/dev/null || echo "?")
        echo "   Models available: $MODEL_COUNT"
    else
        echo "❌ Model Discovery Proxy: NOT running on port 8082"
    fi

    # Check fcc-server on port 8083
    if curl -s http://localhost:8083/health >/dev/null 2>&1; then
        echo "✅ fcc-server: RUNNING on port 8083 (internal)"
        echo "   Admin UI: http://localhost:8083/admin"
    else
        echo "❌ fcc-server: NOT running on port 8083"
    fi

    local PID=""
    if [ -f "${HOME}/.fcc/fcc-server.pid" ]; then
        PID=$(cat "${HOME}/.fcc/fcc-server.pid" 2>/dev/null | tr -d '[:space:]')
        echo "   fcc-server PID: $PID"
    fi

    # Show NVIDIA key status
    if [ -n "$NVIDIA_NIM_API_KEY" ]; then
        echo "   NVIDIA key: ****${NVIDIA_NIM_API_KEY: -4}"
    else
        echo "   NVIDIA key: NOT SET (set via: claude-set-nvidia-key <key>)"
    fi

    echo ""
    if ! curl -s http://localhost:8082/health >/dev/null 2>&1; then
        echo "Start both with: fcc-start"
    fi
}

# ─── Test Claude Code API connection (via proxy) ─────────────
claude-test() {
    echo "=== Testing Claude Code + free-claude-code Proxy ==="
    echo ""

    # Step 1: Check if proxy is running
    echo "  Step 1: Checking proxy status..."
    if curl -s http://localhost:8082/health >/dev/null 2>&1; then
        echo "  ✅ Proxy is RUNNING on http://localhost:8082"
    else
        echo "  ❌ Proxy is NOT running! Starting it..."
        fcc-start
        if ! curl -s http://localhost:8082/health >/dev/null 2>&1; then
            echo "  ❌ Proxy failed to start. Check: tail -f /tmp/fcc-server.log"
            return 1
        fi
    fi

    # Step 2: Check NVIDIA key (check both shell env AND .env file)
    echo ""
    echo "  Step 2: Checking NVIDIA API key..."
    local TEST_NVIDIA_KEY="${NVIDIA_NIM_API_KEY:-}"
    if [ -z "$TEST_NVIDIA_KEY" ] && [ -f "${HOME}/.fcc/.env" ]; then
        TEST_NVIDIA_KEY=$(grep '^NVIDIA_NIM_API_KEY=' "${HOME}/.fcc/.env" 2>/dev/null | head -1 | sed 's/^NVIDIA_NIM_API_KEY="//;s/"$//')
    fi
    if [ -z "$TEST_NVIDIA_KEY" ]; then
        echo "  ❌ NVIDIA_NIM_API_KEY is not set in environment or ~/.fcc/.env!"
        echo "     Run: claude-set-nvidia-key \"nvapi-your-key-here\""
        echo "     Or set it in the Settings panel of the web UI"
        return 1
    fi
    echo "  ✅ NVIDIA key: ****${TEST_NVIDIA_KEY: -4}"
    # Also verify the running proxy process has the key
    local PROXY_PID=""
    if [ -f "${HOME}/.fcc/fcc-server.pid" ]; then
        PROXY_PID=$(cat "${HOME}/.fcc/fcc-server.pid" 2>/dev/null | tr -d '[:space:]')
    fi
    if [ -z "$PROXY_PID" ]; then
        PROXY_PID=$(lsof -ti:8083 2>/dev/null | head -1 || true)
    fi
    if [ -n "$PROXY_PID" ] && [ -d "/proc/$PROXY_PID" ]; then
        local PROXY_KEY_IN_ENV
        PROXY_KEY_IN_ENV=$(tr '\0' '\n' < "/proc/$PROXY_PID/environ" 2>/dev/null | grep '^NVIDIA_NIM_API_KEY=' | sed 's/^NVIDIA_NIM_API_KEY=//' || true)
        if [ -n "$PROXY_KEY_IN_ENV" ]; then
            echo "  ✅ Proxy process (PID $PROXY_PID) has NVIDIA key: ****${PROXY_KEY_IN_ENV: -4}"
        else
            echo "  ⚠️ Proxy process (PID $PROXY_PID) does NOT have NVIDIA_NIM_API_KEY in its environment!"
            echo "     This means the proxy was started WITHOUT the key. Restarting proxy..."
            fcc-stop
            sleep 1
            # Re-export the key for fcc-start
            export NVIDIA_NIM_API_KEY="$TEST_NVIDIA_KEY"
            fcc-start
            echo ""
            echo "  Proxy restarted with key. Re-testing..."
            sleep 2
        fi
    fi

    # Step 3: Test the proxy's /health endpoint
    echo ""
    echo "  Step 3: Testing proxy health endpoint..."
    local HEALTH
    HEALTH=$(curl -s http://localhost:8082/health 2>&1 || echo "failed")
    echo "  Health response: $HEALTH"

    # Step 4: Send a test message through the proxy (Anthropic format)
    echo ""
    echo "  Step 4: Sending test message through proxy..."
    local RESPONSE
    RESPONSE=$(curl -s -w "\n%{http_code}" \
        "http://localhost:8082/v1/messages" \
        -H "Content-Type: application/json" \
        -H "x-api-key: fcc-no-auth" \
        -H "anthropic-version: 2023-06-01" \
        -d "{
            \"model\": \"${ANTHROPIC_MODEL:-z-ai/glm-5.2}\",
            \"messages\": [{\"role\": \"user\", \"content\": \"Say hello in one word\"}],
            \"max_tokens\": 32,
            \"stream\": false
        }" \
        --connect-timeout 10 \
        --max-time 60 2>&1)

    local HTTP_CODE
    HTTP_CODE=$(echo "$RESPONSE" | tail -1)
    local BODY
    BODY=$(echo "$RESPONSE" | sed '$d')

    if [ "$HTTP_CODE" = "200" ]; then
        echo ""
        echo "  ✅ Proxy + NVIDIA API SUCCESS! (HTTP $HTTP_CODE)"
        # Extract the response
        local CONTENT
        CONTENT=$(echo "$BODY" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    # Anthropic format
    blocks = data.get('content', [])
    if blocks:
        print(blocks[0].get('text', 'N/A')[:200])
    else:
        print('(empty response)')
except Exception as e:
    print(f'(Could not parse: {e})')
" 2>/dev/null || echo "(Could not parse response)")
        echo "  AI Response: $CONTENT"
        echo ""
        echo "  🎉 Your Claude Code is ready! Just type: claude"
    elif [ "$HTTP_CODE" = "000" ]; then
        echo ""
        echo "  ❌ Could not reach proxy on localhost:8082"
        echo "     Make sure fcc-server is running: fcc-start"
    else
        echo ""
        echo "  ❌ Proxy returned HTTP $HTTP_CODE"
        echo "     Response: $(echo "$BODY" | head -c 500)"
        echo ""
        echo "  Common fixes:"
        echo "    - Update NVIDIA key: claude-set-nvidia-key \"nvapi-...\""
        echo "    - Restart proxy: fcc-stop && fcc-start"
        echo "    - Check logs: tail -f /tmp/fcc-server.log"
        echo "    - Open admin UI: http://localhost:8082/admin"
    fi
}

# ─── Test Claude Code API with Python (detailed) ────────────
claude-test-py() {
    echo "=== Running Python NVIDIA API Test ==="
    echo ""
    pip3 install --user openai -q 2>/dev/null
    python3 /home/cloudshell/workspace/scripts/test-nvidia-api.py
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

# ─── Ensure PROMPT_COMMAND auto-refresh hook is present ──────────
# This makes freshly-installed tools (opencode, bun, etc.) available
# in the current shell WITHOUT requiring the user to run `reload`.
if ! grep -q "__cloudshell_refresh_path" "/home/cloudshell/.bashrc_cloudshell" 2>/dev/null; then
    cat >> "/home/cloudshell/.bashrc_cloudshell" << 'BASHRC_PROMPT'

# ─── Auto-refresh PATH before each prompt ────────────────────────
# Catches newly-installed tools (from curl|bash installers) without
# requiring the user to manually `source ~/.bashrc` or `reload`.
__cloudshell_refresh_path() {
    local d
    for d in "${HOME}/.opencode/bin" "${HOME}/.bun/bin" "${HOME}/.cargo/bin" \
             "${HOME}/.deno/bin" "${HOME}/.local/bin" "${HOME}/.npm-global/bin" \
             "${HOME}/bin" "${HOME}/go/bin" "${HOME}/.local/go/bin" \
             "${HOME}/.krew/bin" "${HOME}/.yarn/bin"; do
        [ -d "$d" ] || continue
        case ":${PATH}:" in
            *":${d}:"*) ;;
            *) export PATH="${d}:${PATH}" ;;
        esac
    done
    if [ -f "${HOME}/.bashrc_env" ]; then
        local env_mtime=$(stat -c %Y "${HOME}/.bashrc_env" 2>/dev/null || echo 0)
        if [ -z "${__BASHRC_ENV_MTIME:-}" ] || [ "$env_mtime" -gt "$__BASHRC_ENV_MTIME" ]; then
            source "${HOME}/.bashrc_env" 2>/dev/null
            __BASHRC_ENV_MTIME="$env_mtime"
        fi
    fi
}
if [ -n "${PROMPT_COMMAND:-}" ]; then
    PROMPT_COMMAND="__cloudshell_refresh_path; ${PROMPT_COMMAND}"
else
    PROMPT_COMMAND="__cloudshell_refresh_path"
fi
export PROMPT_COMMAND
BASHRC_PROMPT
    chown cloudshell:cloudshell "/home/cloudshell/.bashrc_cloudshell" 2>/dev/null || true
    echo "[Entrypoint] PROMPT_COMMAND auto-refresh hook appended"
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

# ─── Ensure .bashrc_env exists with Claude Code proxy vars ──────
if [ ! -f "/home/cloudshell/.bashrc_env" ]; then
    cat > /home/cloudshell/.bashrc_env << BASHEOF
# Claude Code proxy environment (auto-generated)
export ANTHROPIC_BASE_URL="http://localhost:8082"
export ANTHROPIC_AUTH_TOKEN="fcc-no-auth"
export ANTHROPIC_MODEL="claude-opus-4-5"
export CLAUDE_CODE_USE_AUTH_TOKEN="true"
export CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY="1"
export CLAUDE_CODE_AUTO_COMPACT_WINDOW="190000"
# NVIDIA NIM API key — used by the proxy as fallback when no per-user key is set
# Overridden per-user by the server when creating terminal sessions.
export NVIDIA_NIM_API_KEY="${NVIDIA_NIM_API_KEY:-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}"
export FCC_PORT="8082"
BASHEOF
    chown cloudshell:cloudshell /home/cloudshell/.bashrc_env 2>/dev/null || true
else
    # .bashrc_env already exists — ensure ANTHROPIC_MODEL is set
    if ! grep -q '^export ANTHROPIC_MODEL=' /home/cloudshell/.bashrc_env 2>/dev/null; then
        echo 'export ANTHROPIC_MODEL="claude-opus-4-5"' >> /home/cloudshell/.bashrc_env
        echo "[Entrypoint] Added ANTHROPIC_MODEL to existing ~/.bashrc_env"
    fi
fi

# ─── Ensure auth users directory exists ─────────────────────────
mkdir -p /home/cloudshell/.jasbol-users 2>/dev/null || true
chown -R cloudshell:cloudshell /home/cloudshell/.jasbol-users 2>/dev/null || true

# ─── Verify npm global prefix ──────────────────────────────────
echo "[Entrypoint] Verifying npm configuration..."
echo "[Entrypoint]   .npmrc content: $(cat /home/cloudshell/.npmrc 2>/dev/null)"
echo "[Entrypoint]   NPM_CONFIG_PREFIX: ${NPM_CONFIG_PREFIX}"
echo "[Entrypoint]   PATH: ${PATH}"

# ─── Start free-claude-code proxy (NVIDIA NIM → Anthropic API) ──
# The proxy must start BEFORE Claude Code is used. It translates
# Anthropic API format requests to NVIDIA NIM format.
# Runs on localhost:8082 in the background.
#
# NOTE: fcc-server is installed at RUNTIME (not build time) to
# keep Docker build fast and avoid HF Spaces build timeout.
# On first boot, it installs via uv (~10 seconds). On subsequent
# boots, it starts instantly since uv caches the tool.

echo "[Entrypoint] Setting up free-claude-code proxy..."

# Ensure .env file exists with NVIDIA key for fcc-server
# IMPORTANT: Do NOT overwrite if the file already exists with a key set
# by the user via the Settings panel. Only create a new file if missing.
mkdir -p /home/cloudshell/.fcc 2>/dev/null
if [ ! -f /home/cloudshell/.fcc/.env ]; then
    cat > /home/cloudshell/.fcc/.env << FCCEOF
NVIDIA_NIM_API_KEY="${NVIDIA_NIM_API_KEY:-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}"
MODEL="nvidia_nim/z-ai/glm-5.2"
ANTHROPIC_AUTH_TOKEN="fcc-no-auth"
PORT="8083"
FCC_OPEN_BROWSER="false"
MESSAGING_PLATFORM="none"
ENABLE_MODEL_THINKING="true"
FCCEOF
    echo "[Entrypoint] Created new ~/.fcc/.env"
else
    # .env already exists — update individual keys without overwriting NVIDIA key
    # This preserves keys set by the user via the Settings panel
    echo "[Entrypoint] ~/.fcc/.env already exists — preserving user settings"
    # Only set NVIDIA key from env var if the .env doesn't have one already
    if ! grep -q 'NVIDIA_NIM_API_KEY=".\+"' /home/cloudshell/.fcc/.env 2>/dev/null; then
        # No non-empty key in .env — set from env var if available
        if [ -n "${NVIDIA_NIM_API_KEY:-}" ]; then
            _fcc_update_env NVIDIA_NIM_API_KEY "${NVIDIA_NIM_API_KEY}"
        fi
    fi
    # Always ensure these are set correctly
    _fcc_update_env PORT "8083"
    _fcc_update_env MODEL "nvidia_nim/z-ai/glm-5.2"
    _fcc_update_env ANTHROPIC_AUTH_TOKEN "fcc-no-auth"
    _fcc_update_env FCC_OPEN_BROWSER "false"
    _fcc_update_env MESSAGING_PLATFORM "none"
    _fcc_update_env ENABLE_MODEL_THINKING "true"
fi
chown -R cloudshell:cloudshell /home/cloudshell/.fcc 2>/dev/null || true

# Install fcc-server on first boot if not already installed
if ! command -v fcc-server &>/dev/null; then
    echo "[Entrypoint] fcc-server not found. Installing via uv (first boot, ~10s)..."
    gosu cloudshell bash -c '
        export PATH="/home/cloudshell/.local/bin:/root/.local/bin:$PATH"
        if ! command -v uv &>/dev/null; then
            curl -fsSL https://astral.sh/uv/install.sh | sh 2>&1 | tail -3
        fi
        uv python install 3.14 2>&1 | tail -2
        uv tool install --force "free-claude-code @ git+https://github.com/Alishahryar1/free-claude-code.git" 2>&1 | tail -5
    ' 2>/dev/null || true
    # Symlink to system path so fcc-server is findable
    ln -sf /home/cloudshell/.local/bin/fcc-server /usr/local/bin/fcc-server 2>/dev/null || true
    ln -sf /home/cloudshell/.local/bin/fcc-claude /usr/local/bin/fcc-claude 2>/dev/null || true
    ln -sf /home/cloudshell/.local/bin/free-claude-code /usr/local/bin/free-claude-code 2>/dev/null || true
    echo "[Entrypoint] fcc-server installation complete."
fi

# ─── CRITICAL: Fix PORT collision for fcc-claude ──────────────────
# Hugging Face Spaces runtime sets PORT=7860 at container start,
# overriding our Dockerfile's PORT=8082. The free-claude-code
# Settings class (pydantic-settings) reads PORT from the process
# environment with HIGHER priority than ~/.fcc/.env, so fcc-claude
# tries to connect to port 7860 (Next.js) instead of 8082 (proxy).
#
# Fix: Create a wrapper script that unsets PORT before calling the
# real fcc-claude, forcing pydantic-settings to read PORT=8082
# from ~/.fcc/.env instead.
if [ -f /usr/local/bin/fcc-claude ] && [ ! -f /usr/local/bin/fcc-claude-real ]; then
    mv /usr/local/bin/fcc-claude /usr/local/bin/fcc-claude-real 2>/dev/null || true
    cat > /usr/local/bin/fcc-claude << 'WRAPPEREOF'
#!/bin/bash
# fcc-claude wrapper: unsets PORT so pydantic-settings reads 8082 from ~/.fcc/.env
# instead of picking up PORT=7860 from the HF Spaces runtime environment.
unset PORT
exec /usr/local/bin/fcc-claude-real "$@"
WRAPPEREOF
    chmod +x /usr/local/bin/fcc-claude
    echo "[Entrypoint] fcc-claude wrapper installed (unsets PORT to fix 7860→8082)"
fi

# Start fcc-server in background as cloudshell user
# IMPORTANT: Explicitly set PORT=8083 because we now run a model-discovery
# proxy on port 8082 that adds /v1/models endpoint for Claude Code's
# model picker. The real fcc-server runs on 8083 (internal only).
# HF Spaces sets PORT=7860 in the runtime environment, and pydantic-settings
# reads env vars with higher priority than ~/.fcc/.env. Without explicitly
# setting PORT=8083, fcc-server would bind to 7860 (clashing with Next.js).
#
# We also save the PID to ~/.fcc/fcc-server.pid so the Next.js API
# can reliably kill and restart the proxy when the user updates their
# NVIDIA API key via the Settings panel.
#
# ARCHITECTURE (v2 — Per-User Key Isolation):
#   Claude Code → localhost:8082 (full proxy) → NVIDIA NIM API (direct)
#
# The proxy on port 8082 is now a FULL Anthropic→NVIDIA API translator.
# It extracts per-user NVIDIA keys from request headers, ensuring
# complete key isolation between user profiles. No fcc-server needed.
# ─── Resolve NVIDIA API key from multiple sources ──────────────
# Priority: 1) Docker env var / HF Spaces Secret  2) ~/.fcc/.env file  3) hardcoded default
# This key is passed to the proxy as a fallback for users without personal keys.
RESOLVED_NVIDIA_KEY="${NVIDIA_NIM_API_KEY:-}"
if [ -z "$RESOLVED_NVIDIA_KEY" ] && [ -f /home/cloudshell/.fcc/.env ]; then
    RESOLVED_NVIDIA_KEY=$(grep '^NVIDIA_NIM_API_KEY=' /home/cloudshell/.fcc/.env 2>/dev/null | head -1 | sed 's/^NVIDIA_NIM_API_KEY="//;s/"$//')
fi
# Hardcoded fallback — ensures proxy always has a valid key even on first boot
if [ -z "$RESOLVED_NVIDIA_KEY" ]; then
    RESOLVED_NVIDIA_KEY="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"
fi
echo "[Entrypoint] NVIDIA key resolved: $([ -n "$RESOLVED_NVIDIA_KEY" ] && echo '****'${RESOLVED_NVIDIA_KEY: -4} || echo 'NOT SET')"

# ─── Ensure .bashrc_env has NVIDIA_NIM_API_KEY ─────────────────
if ! grep -q '^export NVIDIA_NIM_API_KEY=' /home/cloudshell/.bashrc_env 2>/dev/null; then
    echo "export NVIDIA_NIM_API_KEY=\"${RESOLVED_NVIDIA_KEY}\"" >> /home/cloudshell/.bashrc_env
    echo "[Entrypoint] Added NVIDIA_NIM_API_KEY to ~/.bashrc_env"
else
    # Update existing value with resolved key
    sed -i "s|^export NVIDIA_NIM_API_KEY=.*|export NVIDIA_NIM_API_KEY=\"${RESOLVED_NVIDIA_KEY}\"|" /home/cloudshell/.bashrc_env 2>/dev/null || true
fi

# Ensure ANTHROPIC_DEFAULT model env vars are in .bashrc_env
for VAR in ANTHROPIC_DEFAULT_OPUS_MODEL ANTHROPIC_DEFAULT_SONNET_MODEL ANTHROPIC_DEFAULT_HAIKU_MODEL CLAUDE_CODE_SUBAGENT_MODEL CLAUDE_CODE_DISABLE_ADAPTIVE_THINKING; do
    if ! grep -q "^export ${VAR}=" /home/cloudshell/.bashrc_env 2>/dev/null; then
        echo "export ${VAR}=\"${!VAR:-}\"" >> /home/cloudshell/.bashrc_env
    fi
done

chown cloudshell:cloudshell /home/cloudshell/.bashrc_env 2>/dev/null || true

# Start the direct-to-NVIDIA proxy on port 8082
# (v3 proxy: no fcc-server needed — goes directly to NVIDIA NIM API)
if [ -f /home/cloudshell/scripts/fcc-model-discovery-proxy.cjs ]; then
    # Start the full proxy on port 8082
    # Pass the RESOLVED NVIDIA_NIM_API_KEY as fallback key for users without personal keys
    export NVIDIA_NIM_API_KEY="$RESOLVED_NVIDIA_KEY"
    gosu cloudshell bash -c '
        source /home/cloudshell/.bashrc_env 2>/dev/null || true
        NVIDIA_NIM_API_KEY="'"$RESOLVED_NVIDIA_KEY"'" FCC_PROXY_PORT=8082 nohup node /home/cloudshell/scripts/fcc-model-discovery-proxy.cjs > /tmp/fcc-model-proxy.log 2>&1 &
        echo "Full proxy PID: $!"
        echo $! > /home/cloudshell/.fcc/proxy.pid
    ' 2>/dev/null || true
    sleep 2

    # Verify proxy started and check health
    if curl -s http://localhost:8082/health >/dev/null 2>&1; then
        PROXY_HEALTH=$(curl -s http://localhost:8082/health 2>&1)
        echo "[Entrypoint] ✅ Full NVIDIA NIM proxy running on http://localhost:8082"
        echo "[Entrypoint]    Per-user key isolation: ENABLED"
        echo "[Entrypoint]    Fallback key: $([ -n "$RESOLVED_NVIDIA_KEY" ] && echo '****'${RESOLVED_NVIDIA_KEY: -4} || echo 'NONE')"
        echo "[Entrypoint]    Models: z-ai/glm-5.2, nemotron, llama, deepseek-r1, phi-4, etc."
    else
        echo "[Entrypoint] ⚠ Proxy still starting... Check: tail -f /tmp/fcc-model-proxy.log"
    fi
elif command -v fcc-server &>/dev/null; then
    # Fallback: start fcc-server on 8082 if the full proxy script is missing
    echo "[Entrypoint] ⚠ Full proxy script not found — using fcc-server fallback"
    _fcc_update_env PORT "8082"
    gosu cloudshell bash -c '
        source /home/cloudshell/.bashrc_env 2>/dev/null || true
        PORT=8082 NVIDIA_NIM_API_KEY="${NVIDIA_NIM_API_KEY:-}" nohup fcc-server > /tmp/fcc-server.log 2>&1 &
        PID=$!
        echo "$PID" > /home/cloudshell/.fcc/fcc-server.pid
    ' 2>/dev/null || true
    sleep 3
    echo "[Entrypoint] ✅ fcc-server fallback running on http://localhost:8082"
else
    echo "[Entrypoint] ⚠ No proxy available. Run manually: setup-fcc-proxy"
fi

# ─── NOW DROP TO CLOUDSHELL USER AND START THE SERVER ──────────
echo "=========================================="
echo "[Entrypoint] Dropping to cloudshell user..."
echo "[Entrypoint] Starting server: $*"
echo "[Entrypoint] npm global prefix: /home/cloudshell/.npm-global"
echo "[Entrypoint] Claude Code: type 'fcc-claude' to start (via proxy)"
echo "[Entrypoint] Free-Claude-Code proxy: localhost:8082"
echo "=========================================="

exec gosu cloudshell "$@"

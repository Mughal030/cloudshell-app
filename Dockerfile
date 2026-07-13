# ─── CloudShell Terminal IDE - OPTIMIZED for HF Spaces free tier ───
# Build time budget: ~5 min max on cpu-basic
# Strategy: minimal build-time deps, heavy tools install at RUNTIME
# ────────────────────────────────────────────────────────────────────

FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive

# ─── MINIMAL System Dependencies (single layer, smallest possible) ──
RUN apt-get update && apt-get install -y --no-install-recommends \
    coreutils curl wget git \
    bash sudo gosu locales \
    ca-certificates gnupg lsb-release \
    python3 python3-pip python3-venv \
    procps \
    && rm -rf /var/lib/apt/lists/* \
    && locale-gen en_US.UTF-8

ENV LANG=en_US.UTF-8 LANGUAGE=en_US:en LC_ALL=en_US.UTF-8

# ─── Node.js 22.x via NodeSource ─────────────────────────────────
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/* \
    && node --version && npm --version

# ─── Non-root User + npm global prefix ───────────────────────────
RUN useradd -m -s /bin/bash cloudshell && \
    echo "cloudshell ALL=(ALL) NOPASSWD: ALL" > /etc/sudoers.d/cloudshell && \
    chmod 440 /etc/sudoers.d/cloudshell && \
    usermod -aG sudo cloudshell && \
    mkdir -p /home/cloudshell/.npm-global/lib /home/cloudshell/.npm-global/bin \
    /home/cloudshell/.local/bin /home/cloudshell/.local/lib /home/cloudshell/.local/share \
    /home/cloudshell/.cache /home/cloudshell/bin /home/cloudshell/workspace \
    /home/cloudshell/workspace/scripts /home/cloudshell/.jasbol-users \
    /home/cloudshell/.fcc \
    && echo "prefix=/home/cloudshell/.npm-global" > /home/cloudshell/.npmrc \
    && chown -R cloudshell:cloudshell /home/cloudshell

# ─── Application ──────────────────────────────────────────────────
WORKDIR /app

COPY package*.json ./
RUN npm ci --legacy-peer-deps 2>&1 | tail -5

COPY . .
RUN npx next build 2>&1 | tail -20
RUN npm prune --omit=dev 2>/dev/null || true

# ─── Permissions (only chown what's needed, NOT entire /home) ────
RUN chown -R cloudshell:cloudshell /app \
    && mkdir -p /var/lib/apt/lists/partial /var/cache/apt \
    && chown -R root:root /var/lib/apt /var/cache/apt \
    && chmod -R 755 /var/lib/apt /var/cache/apt

# ─── Pre-install Claude Code CLI (fast, ~3s) ─────────────────────
RUN su -c "npm install -g @anthropic-ai/claude-code 2>&1 | tail -5" cloudshell && \
    ln -sf /home/cloudshell/.npm-global/bin/claude /usr/local/bin/claude 2>/dev/null || true

# ─── Install uv (for free-claude-code proxy, installed at runtime) ──
RUN curl -fsSL https://astral.sh/uv/install.sh | sh \
    && ln -sf /root/.local/bin/uv /usr/local/bin/uv \
    && ln -sf /root/.local/bin/uvx /usr/local/bin/uvx

# ─── Entrypoint & Scripts ────────────────────────────────────────
COPY docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh

COPY scripts/test-nvidia-api.py /home/cloudshell/workspace/scripts/test-nvidia-api.py
RUN chmod +x /home/cloudshell/workspace/scripts/test-nvidia-api.py && \
    chown cloudshell:cloudshell /home/cloudshell/workspace/scripts/test-nvidia-api.py

# ─── Model Discovery Proxy ───────────────────────────────────
# Lightweight Node.js proxy that adds /v1/models endpoint for Claude Code's
# model picker. Sits between Claude Code (port 8082) and fcc-server (port 8083).
COPY scripts/fcc-model-discovery-proxy.js /home/cloudshell/scripts/fcc-model-discovery-proxy.js
RUN chmod +x /home/cloudshell/scripts/fcc-model-discovery-proxy.js && \
    chown cloudshell:cloudshell /home/cloudshell/scripts/fcc-model-discovery-proxy.js

# ─── Claude Code default environment (via free-claude-code proxy) ───
# Architecture:
#   Claude Code → localhost:8082 (model-discovery proxy) → localhost:8083 (fcc-server) → NVIDIA NIM API
# The model-discovery proxy adds /v1/models endpoint for Claude Code's model picker.
# The fcc-server translates Anthropic API requests to NVIDIA NIM format.
#
# KEY: Use "fcc-claude" (not "claude") to launch Claude Code.
# fcc-claude auto-sets all env vars and skips the login prompt.
#
# ENV VARS EXPLAINED:
#   ANTHROPIC_BASE_URL  → proxy endpoint (not Anthropic's real API)
#   ANTHROPIC_AUTH_TOKEN → "fcc-no-auth" bypasses OAuth login prompt
#   CLAUDE_CODE_USE_AUTH_TOKEN → tells Claude Code to use the token, not OAuth
#   CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY → enables /model picker
#   CLAUDE_CODE_AUTO_COMPACT_WINDOW → auto-compaction for long sessions
#   ANTHROPIC_MODEL → default model for Claude Code (NVIDIA NIM model ID)
# SECURITY: NVIDIA_NIM_API_KEY is NO LONGER set here. Each user configures
# their own key via the Settings panel. The admin can set a default key
# via the NVIDIA_NIM_API_KEY env var at deployment time if desired.
#
# Model IDs use "claude-" prefix so Claude Code's model discovery
# filter doesn't reject them. The proxy maps them to real NVIDIA models:
#   claude-opus-4-5   → z-ai/glm-5.2 (most capable)
#   claude-sonnet-4-5 → nvidia/llama-3.3-nemotron-super-49b-v1 (balanced)
#   claude-sonnet-4-5-mini → nvidia/phi-4 (fast)
ENV ANTHROPIC_BASE_URL="http://localhost:8082" \
    ANTHROPIC_AUTH_TOKEN="fcc-no-auth" \
    ANTHROPIC_MODEL="claude-opus-4-5" \
    CLAUDE_CODE_USE_AUTH_TOKEN="true" \
    CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY="1" \
    CLAUDE_CODE_AUTO_COMPACT_WINDOW="190000" \
    ANTHROPIC_DEFAULT_OPUS_MODEL="claude-opus-4-5" \
    ANTHROPIC_DEFAULT_SONNET_MODEL="claude-sonnet-4-5" \
    ANTHROPIC_DEFAULT_HAIKU_MODEL="claude-sonnet-4-5-mini" \
    CLAUDE_CODE_SUBAGENT_MODEL="claude-sonnet-4-5" \
    CLAUDE_CODE_DISABLE_ADAPTIVE_THINKING="1"

# ─── Environment Variables ───────────────────────────────────────
# IMPORTANT: PORT=8082 is for fcc-server proxy. The Next.js web server
# uses APP_PORT=7860 instead, to avoid conflicting with fcc-server.
ENV PORT=8082 \
    APP_PORT=7860 \
    NODE_ENV=production \
    HOME=/home/cloudshell \
    USER=cloudshell \
    WORKSPACE_DIR=/home/cloudshell/workspace \
    SHELL=/bin/bash \
    APP_HOME=/home/cloudshell \
    NPM_CONFIG_PREFIX=/home/cloudshell/.npm-global \
    PATH=/home/cloudshell/bin:/home/cloudshell/.local/bin:/home/cloudshell/.npm-global/bin:/root/.local/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

# Expose default port
EXPOSE 7860

# NOTE: Do NOT use USER directive - entrypoint starts as root,
# fixes permissions, then drops to cloudshell via gosu.

# Health check
HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
    CMD curl -f http://localhost:7860/api/health || exit 1

ENTRYPOINT ["/app/docker-entrypoint.sh"]
CMD ["node", "--experimental-strip-types", "server.ts"]

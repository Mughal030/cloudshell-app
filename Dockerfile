# ─── CloudShell Terminal IDE - Docker Image for Cloud Hosting ──────
# Base: Ubuntu 22.04 (glibc compat for node-pty)
# Node: 22.x (required for --experimental-strip-types)
# ────────────────────────────────────────────────────────────────────
#
# BUILD SPEED OPTIMIZATIONS for HF Spaces free tier:
#   1. Single apt layer (combined system deps)
#   2. deadsnakes PPA for Python 3.14 (pre-built .deb, NOT uv compile)
#   3. Removed Docker CLI + rootless Docker (doesn't work in HF anyway)
#   4. Removed OpenCode preinstall (user can install at runtime)
#   5. Combined RUN layers to reduce image overhead
# ────────────────────────────────────────────────────────────────────

FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive

# ─── System Dependencies + Python 3.14 (SINGLE LAYER for speed) ──
# deadsnakes PPA provides pre-built Python 3.14 .deb packages
# This is MUCH faster than "uv python install 3.14" which compiles from source
RUN apt-get update && apt-get install -y \
    software-properties-common apt-utils \
    && add-apt-repository -y ppa:deadsnakes/ppa \
    && apt-get update && apt-get install -y \
    # ── Core ──
    coreutils curl wget git \
    # ── Build tools ──
    build-essential make cmake autoconf automake libtool pkg-config patch \
    # ── Python 3.10 (system default) + Python 3.14 (for free-claude-code) ──
    python3 python3-pip python3-venv python3-dev \
    python3.14 python3.14-venv python3.14-dev \
    # ── Shell & system ──
    bash sudo gosu locales \
    # ── Editors ──
    vim nano \
    # ── Security & certs ──
    ca-certificates gnupg gpg gpg-agent lsb-release \
    # ── Monitoring ──
    procps htop \
    # ── Text processing ──
    tree less jq file diffutils \
    # ── Archiving ──
    zip unzip gzip bzip2 xz-utils tar \
    # ── Network ──
    net-tools iputils-ping openssh-client rsync netcat dnsutils \
    # ── Misc ──
    psmisc whois time \
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
    /home/cloudshell/.free-claude-code \
    && echo "prefix=/home/cloudshell/.npm-global" > /home/cloudshell/.npmrc \
    && chown -R cloudshell:cloudshell /home/cloudshell

# ─── Application ──────────────────────────────────────────────────
WORKDIR /app

COPY package*.json ./
RUN npm ci --legacy-peer-deps 2>&1 | tail -5

COPY . .
RUN npx next build 2>&1 | tail -20
RUN npm prune --omit=dev 2>/dev/null || true

# ─── Permissions ─────────────────────────────────────────────────
RUN chown -R cloudshell:cloudshell /app \
    && mkdir -p /var/lib/apt/lists/partial /var/cache/apt \
    && chown -R root:root /var/lib/apt /var/cache/apt \
    && chmod -R 755 /var/lib/apt /var/cache/apt

# ─── Pre-install Claude Code CLI ──────────────────────────────────
RUN su -c "npm install -g @anthropic-ai/claude-code 2>&1 | tail -5" cloudshell && \
    ln -sf /home/cloudshell/.npm-global/bin/claude /usr/local/bin/claude 2>/dev/null || true

# ─── Install free-claude-code proxy (NVIDIA NIM → Anthropic API) ───
# This proxy lets Claude Code work with NVIDIA's free NIM API.
# It runs on localhost:8082 and translates Anthropic-format requests
# to NVIDIA NIM format using the NVIDIA_NIM_API_KEY.
#
# SPEED: Uses deadsnakes Python 3.14 (already installed above via apt)
# so uv doesn't need to compile from source. Only uv + the tool itself.
RUN curl -fsSL https://astral.sh/uv/install.sh | sh \
    && export PATH="/root/.local/bin:$PATH" \
    && uv tool install --force --python /usr/bin/python3.14 \
        "free-claude-code @ git+https://github.com/Alishahryar1/free-claude-code.git" \
    && ln -sf /root/.local/bin/fcc-server /usr/local/bin/fcc-server \
    && ln -sf /root/.local/bin/fcc-claude /usr/local/bin/fcc-claude \
    && ln -sf /root/.local/bin/free-claude-code /usr/local/bin/free-claude-code \
    && ln -sf /root/.local/bin/fcc-init /usr/local/bin/fcc-init 2>/dev/null || true

# ─── Entrypoint & Scripts ────────────────────────────────────────
COPY docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh

COPY scripts/test-nvidia-api.py /home/cloudshell/workspace/scripts/test-nvidia-api.py
RUN chmod +x /home/cloudshell/workspace/scripts/test-nvidia-api.py && \
    chown -R cloudshell:cloudshell /home/cloudshell/workspace /home/cloudshell/.free-claude-code

# ─── Claude Code default environment (via free-claude-code proxy) ───
# The proxy (fcc-server) runs on localhost:8082 and translates
# Anthropic API requests to NVIDIA NIM format using the NVIDIA key.
# Claude Code connects to the proxy, NOT directly to NVIDIA.
# Users can change the NVIDIA key at runtime with: claude-set-nvidia-key
ENV ANTHROPIC_BASE_URL="http://localhost:8082" \
    ANTHROPIC_AUTH_TOKEN="freecc" \
    ANTHROPIC_MODEL="nvidia/nemotron-3-super-120b-a12b" \
    CLAUDE_CODE_USE_AUTH_TOKEN="true" \
    NVIDIA_NIM_API_KEY="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"

# ─── Environment Variables ───────────────────────────────────────
ENV PORT=7860 \
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

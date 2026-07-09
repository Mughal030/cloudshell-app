# ─── CloudShell Terminal IDE - Docker Image for Cloud Hosting ──────
# Base: Ubuntu 22.04 (glibc compat for node-pty)
# Node: 22.x (required for --experimental-strip-types)
# ────────────────────────────────────────────────────────────────────

FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive

# ─── System Dependencies (SINGLE LAYER for speed) ────────────────
RUN apt-get update && apt-get install -y \
    coreutils curl wget git \
    build-essential make cmake autoconf automake libtool pkg-config patch \
    python3 python3-pip python3-venv python3-dev \
    bash sudo gosu locales \
    vim nano \
    ca-certificates gnupg gpg gpg-agent lsb-release \
    procps htop \
    tree less jq file diffutils \
    zip unzip gzip bzip2 xz-utils tar \
    net-tools iputils-ping openssh-client rsync netcat dnsutils \
    software-properties-common apt-utils \
    psmisc whois time \
    && rm -rf /var/lib/apt/lists/* \
    && locale-gen en_US.UTF-8

ENV LANG=en_US.UTF-8 LANGUAGE=en_US:en LC_ALL=en_US.UTF-8

# ─── Node.js 22.x + Docker CLI (COMBINED for speed) ──────────────
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
# OPTIMIZED: Install uv + Python 3.14 + free-claude-code in ONE layer
# to minimize Docker build time. Python 3.14 is required by free-claude-code.
RUN curl -fsSL https://astral.sh/uv/install.sh | sh \
    && export PATH="/root/.local/bin:$PATH" \
    && uv python install 3.14 \
    && uv tool install --force "free-claude-code @ git+https://github.com/Alishahryar1/free-claude-code.git" \
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

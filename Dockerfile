# ─── CloudShell Terminal IDE - Docker Image for Cloud Hosting ──────
# Base: Ubuntu 22.04 (glibc compat for node-pty)
# Node: 22.x (required for --experimental-strip-types)
# ────────────────────────────────────────────────────────────────────

FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive

# ─── System Dependencies (COMPREHENSIVE - ALL essential terminal commands) ──
RUN apt-get update && apt-get install -y \
    # ── Core file & directory commands ──
    coreutils \
    # ── Package managers & download ──
    curl \
    wget \
    # ── Version control ──
    git \
    # ── Build tools ──
    build-essential \
    make \
    cmake \
    autoconf \
    automake \
    libtool \
    pkg-config \
    patch \
    # ── Language runtimes ──
    python3 \
    python3-pip \
    python3-venv \
    python3-dev \
    # ── Shell & system ──
    bash \
    sudo \
    gosu \
    locales \
    # ── Text editors ──
    vim \
    nano \
    # ── Security & certs ──
    ca-certificates \
    gnupg \
    gpg \
    gpg-agent \
    lsb-release \
    # ── Docker deps ──
    iptables \
    uidmap \
    dbus-user-session \
    # ── Process & system monitoring ──
    htop \
    procps \
    # ── File viewing & text processing ──
    tree \
    less \
    jq \
    file \
    diffutils \
    # ── Compression & archiving ──
    zip \
    unzip \
    gzip \
    bzip2 \
    xz-utils \
    tar \
    # ── Network tools ──
    net-tools \
    iputils-ping \
    openssh-client \
    openssh-server \
    rsync \
    netcat \
    dnsutils \
    # ── System admin ──
    strace \
    ltrace \
    software-properties-common \
    apt-utils \
    # ── Man pages & help ──
    man-db \
    manpages \
    info \
    # ── Additional utilities ──
    psmisc \
    whois \
    time \
    && rm -rf /var/lib/apt/lists/*

# Generate UTF-8 locale
RUN locale-gen en_US.UTF-8
ENV LANG=en_US.UTF-8 \
    LANGUAGE=en_US:en \
    LC_ALL=en_US.UTF-8

# ─── Node.js 22.x via NodeSource ─────────────────────────────────
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

# Verify Node.js version
RUN node --version && npm --version

# ─── Docker CLI + Rootless Docker ─────────────────────────────────
RUN install -m 0755 -d /etc/apt/keyrings \
    && curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg \
    && chmod a+r /etc/apt/keyrings/docker.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" > /etc/apt/sources.list.d/docker.list \
    && apt-get update \
    && apt-get install -y docker-ce-cli docker-ce-rootless-extras \
    && rm -rf /var/lib/apt/lists/*

# ─── Non-root User with npm global prefix ───────────────────────────
RUN useradd -m -s /bin/bash cloudshell && \
    echo "cloudshell ALL=(ALL) NOPASSWD: ALL" > /etc/sudoers.d/cloudshell && \
    chmod 440 /etc/sudoers.d/cloudshell && \
    usermod -aG sudo cloudshell

# ─── Configure npm global directory for cloudshell user ─────────────
# This fixes EACCES errors when running `npm install -g` as non-root user
# Instead of writing to /usr/lib/node_modules (root-only), npm will
# install global packages to ~/.npm-global/ which the user owns
RUN mkdir -p /home/cloudshell/.npm-global \
    && mkdir -p /home/cloudshell/.npm-global/lib \
    && mkdir -p /home/cloudshell/.npm-global/bin \
    && chown -R cloudshell:cloudshell /home/cloudshell/.npm-global

# ─── Create .npmrc for cloudshell user at BUILD TIME ────────────────
# This ensures npm uses the user-writable global prefix even before
# the entrypoint runs. Critical for `npm install -g` to work.
RUN echo "prefix=/home/cloudshell/.npm-global" > /home/cloudshell/.npmrc \
    && chown cloudshell:cloudshell /home/cloudshell/.npmrc

# ─── Application ──────────────────────────────────────────────────
WORKDIR /app

# Copy package files first for better Docker layer caching
COPY package*.json ./

# Install ALL dependencies (dev needed for build step)
RUN npm ci --legacy-peer-deps 2>&1 | tail -5

# Copy application code
COPY . .

# Build Next.js (typescript errors ignored per next.config.ts)
RUN npx next build 2>&1 | tail -20

# Prune dev dependencies to reduce image size
RUN npm prune --omit=dev 2>/dev/null || true

# ─── Workspace & Permissions ─────────────────────────────────────
RUN mkdir -p /home/cloudshell/workspace \
    /home/cloudshell/.local/bin \
    /home/cloudshell/.local/lib \
    /home/cloudshell/.local/share \
    /home/cloudshell/.cache \
    /home/cloudshell/bin \
    /home/cloudshell/.npm-global \
    /home/cloudshell/.npm-global/lib \
    /home/cloudshell/.npm-global/bin \
    /home/cloudshell/.jasbol-users \
    && chown -R cloudshell:cloudshell /home/cloudshell \
    && chown -R cloudshell:cloudshell /app

# ─── Fix APT directories at build time ──────────────────────────
RUN mkdir -p /var/lib/apt/lists/partial \
    && chown -R root:root /var/lib/apt \
    && chmod -R 755 /var/lib/apt \
    && mkdir -p /var/cache/apt \
    && chown -R root:root /var/cache/apt \
    && chmod -R 755 /var/cache/apt

# ─── Pre-install Claude Code CLI ──────────────────────────────────
# Install as cloudshell user so it lands in ~/.npm-global/bin/claude
RUN su -c "npm install -g @anthropic-ai/claude-code 2>&1 | tail -5" cloudshell && \
    ln -sf /home/cloudshell/.npm-global/bin/claude /usr/local/bin/claude 2>/dev/null || true

# ─── Pre-install OpenCode CLI ─────────────────────────────────────
# User explicitly requested the simple official installer:
#   curl -fsSL https://opencode.ai/install | bash
# OpenCode installs to ~/.opencode/bin/opencode. We:
#   1. Run the official installer as cloudshell user (correct HOME)
#   2. Symlink to /usr/local/bin so `opencode` works for all users
#   3. FAIL the build if the binary doesn't actually run
RUN su cloudshell -c "curl -fsSL https://opencode.ai/install | bash" && \
    ln -sf /home/cloudshell/.opencode/bin/opencode /usr/local/bin/opencode && \
    chown -R cloudshell:cloudshell /home/cloudshell/.opencode && \
    opencode --version && \
    su cloudshell -c "opencode --version"

# ─── Claude Code default environment ──────────────────────────────
# Users can change these at runtime with: claude-set-url, claude-set-key, claude-set-model
# Or all at once: setup-claude-env <url> <key> <model>
ENV ANTHROPIC_BASE_URL="https://your-endpoint.com/" \
    ANTHROPIC_AUTH_TOKEN="sk-u4Onmsh8NZgtYJ0SArL8UIMrJB78m62b2FgGUz7tWWR7sJYV" \
    ANTHROPIC_MODEL="claude-opus-4-7" \
    CLAUDE_CODE_USE_AUTH_TOKEN="true"

# ─── Environment Variables ───────────────────────────────────────
ENV PORT=7860 \
    NODE_ENV=production \
    HOME=/home/cloudshell \
    USER=cloudshell \
    WORKSPACE_DIR=/home/cloudshell/workspace \
    SHELL=/bin/bash \
    APP_HOME=/home/cloudshell \
    NPM_CONFIG_PREFIX=/home/cloudshell/.npm-global \
    PATH=/home/cloudshell/bin:/home/cloudshell/.local/bin:/home/cloudshell/.npm-global/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

# ─── Entrypoint ──────────────────────────────────────────────────
COPY docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh

# Expose default port
EXPOSE 7860

# NOTE: Do NOT use USER directive - entrypoint starts as root,
# fixes permissions, then drops to cloudshell via gosu.

# Health check
HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
    CMD curl -f http://localhost:7860/api/health || exit 1

ENTRYPOINT ["/app/docker-entrypoint.sh"]
CMD ["node", "--experimental-strip-types", "server.ts"]

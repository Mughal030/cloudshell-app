# ─── CloudShell Terminal IDE - Docker Image for Cloud Hosting ──────
# Base: Ubuntu 22.04 (glibc compat for node-pty)
# Node: 22.x (required for --experimental-strip-types)
# ────────────────────────────────────────────────────────────────────

FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive

# ─── System Dependencies (COMPREHENSIVE - everything a dev needs) ─
RUN apt-get update && apt-get install -y \
    curl \
    wget \
    git \
    build-essential \
    python3 \
    python3-pip \
    python3-venv \
    bash \
    sudo \
    locales \
    vim \
    nano \
    ca-certificates \
    gnupg \
    lsb-release \
    iptables \
    uidmap \
    dbus-user-session \
    gosu \
    # Additional dev tools pre-installed so sudo apt rarely needed
    htop \
    tree \
    less \
    zip \
    unzip \
    net-tools \
    iputils-ping \
    openssh-client \
    rsync \
    strace \
    ltrace \
    jq \
    file \
    diffutils \
    patch \
    make \
    cmake \
    autoconf \
    automake \
    libtool \
    pkg-config \
    software-properties-common \
    apt-utils \
    gpg \
    gpg-agent \
    # Language runtimes
    python3-dev \
    # Network tools
    netcat \
    dnsutils \
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

# ─── Non-root User ───────────────────────────────────────────────
RUN useradd -m -s /bin/bash cloudshell && \
    echo "cloudshell ALL=(ALL) NOPASSWD: ALL" > /etc/sudoers.d/cloudshell && \
    chmod 440 /etc/sudoers.d/cloudshell && \
    usermod -aG sudo cloudshell

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
    && chown -R cloudshell:cloudshell /home/cloudshell \
    && chown -R cloudshell:cloudshell /app

# ─── Fix APT directories at build time ──────────────────────────
RUN mkdir -p /var/lib/apt/lists/partial \
    && chown -R root:root /var/lib/apt \
    && chmod -R 755 /var/lib/apt \
    && mkdir -p /var/cache/apt \
    && chown -R root:root /var/cache/apt \
    && chmod -R 755 /var/cache/apt

# ─── Environment Variables ───────────────────────────────────────
ENV PORT=7860 \
    NODE_ENV=production \
    HOME=/home/cloudshell \
    USER=cloudshell \
    WORKSPACE_DIR=/home/cloudshell/workspace \
    SHELL=/bin/bash \
    APP_HOME=/home/cloudshell

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

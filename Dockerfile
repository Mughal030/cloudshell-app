# ─── CloudShell Terminal - Docker Image ────────────────────────────
# Targets: HuggingFace Spaces (free Docker hosting) + Koyeb
# Base: Ubuntu 22.04 (required for glibc compatibility with node-pty)
# Node: 22.x (required for --experimental-strip-types flag)
# ────────────────────────────────────────────────────────────────────

FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive

# ─── System Dependencies ──────────────────────────────────────────
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
    x11vnc \
    xvfb \
    websockify \
    locales \
    && rm -rf /var/lib/apt/lists/*

# Generate UTF-8 locale
RUN locale-gen en_US.UTF-8
ENV LANG=en_US.UTF-8 \
    LANGUAGE=en_US:en \
    LC_ALL=en_US.UTF-8

# ─── Node.js 22.x via NodeSource ─────────────────────────────────
# NOTE: Node.js 22+ is required for --experimental-strip-types
# (Node.js 20.x does not support this flag)
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

# ─── noVNC from GitHub Release ───────────────────────────────────
RUN cd /opt && \
    curl -fsSL https://github.com/novnc/noVNC/archive/refs/tags/v1.5.0.tar.gz | tar xz && \
    mv noVNC-1.5.0 /opt/noVNC && \
    ln -sf /opt/noVNC/vnc.html /opt/noVNC/index.html

# ─── Non-root User (HuggingFace Spaces Requirement) ──────────────
RUN useradd -m -s /bin/bash cloudshell && \
    echo "cloudshell ALL=(ALL) NOPASSWD: ALL" > /etc/sudoers.d/cloudshell && \
    chmod 440 /etc/sudoers.d/cloudshell

# ─── Application ──────────────────────────────────────────────────
WORKDIR /app

# Copy package files first for better Docker layer caching
COPY package*.json ./

# Install ALL dependencies (dev needed for build)
RUN npm ci

# Copy application code
COPY . .

# Build Next.js (typescript errors ignored per next.config.ts)
RUN npx next build

# Prune dev dependencies to reduce image size
RUN npm prune --omit=dev 2>/dev/null || true

# ─── Workspace & Permissions ─────────────────────────────────────
RUN mkdir -p /home/cloudshell/workspace \
    /home/cloudshell/.local/bin \
    /home/cloudshell/.local/lib \
    /home/cloudshell/.local/share \
    /home/cloudshell/.cache \
    && chown -R cloudshell:cloudshell /home/cloudshell \
    && chown -R cloudshell:cloudshell /app

# ─── Environment Variables ───────────────────────────────────────
ENV PORT=7860 \
    NODE_ENV=production \
    HOME=/home/cloudshell \
    USER=cloudshell \
    WORKSPACE_DIR=/home/cloudshell/workspace \
    SHELL=/bin/bash \
    APP_HOME=/home/cloudshell \
    NOVNC_DIR=/opt/noVNC \
    DISPLAY=:99

# ─── Entrypoint ──────────────────────────────────────────────────
COPY docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh

# Expose HuggingFace Spaces default port
EXPOSE 7860

# Switch to non-root user
USER cloudshell

# Health check
HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
    CMD curl -f http://localhost:7860/api/health || exit 1

ENTRYPOINT ["/app/docker-entrypoint.sh"]
CMD ["node", "--experimental-strip-types", "server.ts"]

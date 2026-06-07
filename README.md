---
title: Jasbol Hack CloudShell IDE
emoji: ☁
colorFrom: green
colorTo: blue
sdk: docker
app_port: 7860
pinned: false
---

# Jasbol Hack CloudShell IDE

A full-featured web-based terminal and development environment with authentication, user isolation, and professional tooling.

## Features

- **Web Terminal** — Full bash terminal powered by xterm.js and node-pty with real-time I/O via Socket.IO
- **Authentication** — Professional 3D login/signup pages with JWT auth and user workspace isolation
- **File Manager** — Browse, read, and write files in the workspace directly from the browser
- **Code Editor** — Edit files with syntax highlighting
- **Tool Management** — Check availability and install common dev tools
- **Quick Install** — One-click install for Claude Code, TypeScript, Vercel, AWS CLI, and more
- **npm Global** — `npm install -g` works without sudo (prefix: ~/.npm-global)
- **Docker CLI** — Docker command-line interface available (daemon may not run in sandbox)

## Tech Stack

- **Frontend**: Next.js 16, React, shadcn/ui, xterm.js, Tailwind CSS
- **Backend**: Custom Node.js server, Socket.IO, node-pty
- **Auth**: JWT + bcryptjs, per-user workspace isolation
- **Container**: Ubuntu 22.04 + Node.js 22

## Claude Code CLI Setup

In the terminal, run:
```bash
npm install -g @anthropic-ai/claude-code
export ANTHROPIC_BASE_URL="https://your-endpoint.com/"
export ANTHROPIC_AUTH_TOKEN="sk-your-key"
export ANTHROPIC_MODEL="claude-opus-4-6"
export CLAUDE_CODE_USE_AUTH_TOKEN="true"
claude
```

Or use the helper: `setup-claude-env "https://your-endpoint/" "sk-your-key" "claude-opus-4-6"`

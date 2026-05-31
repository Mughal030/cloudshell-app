---
title: CloudShell Terminal
emoji: 💻
colorFrom: green
colorTo: blue
sdk: docker
app_port: 7860
pinned: false
---

# CloudShell Terminal

A full-featured web-based terminal and development environment.

## Features

- **Web Terminal** — Full bash terminal powered by xterm.js and node-pty with real-time I/O via Socket.IO
- **File Manager** — Browse, read, and write files in the workspace directly from the browser
- **Tool Management** — Check availability and get install commands for common dev tools
- **noVNC Desktop** — Optional graphical desktop access via VNC through the browser
- **Docker Support** — Run and manage Docker containers (when Docker is available)
- **OpenOutreach Integration** — Django admin interface and browser automation (when source is available)

## Tech Stack

- **Frontend**: Next.js 16, React, shadcn/ui, xterm.js, Tailwind CSS
- **Backend**: Custom Node.js server (server.ts), Socket.IO, node-pty, http-proxy
- **Infrastructure**: Xvfb + x11vnc + websockify for VNC, Django for OpenOutreach

## Ports

| Service | Port | Path |
|---------|------|------|
| Main App | 7860 | `/` |
| Socket.IO | 7860 | `/socket.io/` |
| noVNC | 7860 | `/novnc/` |
| Django Admin | 7860 | `/admin/` |

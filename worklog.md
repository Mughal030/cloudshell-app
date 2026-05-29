---
Task ID: 1
Agent: Main Agent
Task: Fix all bugs in CloudShell terminal application

Work Log:
- Diagnosed root cause of terminal not working: socket.io path mismatch (server had `path: '/'`, client defaults to `/socket.io`)
- Fixed terminal-service/index.ts: removed `path: '/'` from socket.io config
- Fixed page.tsx: added `mounted` state to prevent hydration mismatch with Sun/Moon theme toggle
- Fixed docker-panel.tsx: improved Dockerfile filter to match `Dockerfile.*` pattern (was missing `Dockerfile.app`)
- Discovered Caddy proxy issue: `localhost` resolves to IPv6 `::1`, but terminal service was only listening on IPv4 `0.0.0.0`
- Fixed terminal service to use Node.js instead of Bun (Node.js handles IPv4+IPv6 dual-stack properly)
- Updated use-socket.ts: implemented dual connection strategy (direct to port 3003 + Caddy proxy fallback)
- Added socket.io and node-pty to main package.json dependencies
- Verified all connections work: IPv4, IPv6, and Caddy proxy all return valid socket.io responses

Stage Summary:
- All 4 bugs fixed: terminal input, hydration mismatch, Docker filter, Caddy routing
- Terminal service must be started with Node.js (not Bun) for proper IPv6 support
- Caddy proxy now correctly routes socket.io traffic to the terminal service
- Services verified working: Next.js on :3000, Terminal service on :3003, Caddy on :81

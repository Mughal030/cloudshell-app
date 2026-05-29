---
Task ID: 1
Agent: Main Agent
Task: Fix CloudShell application - app not starting, multiple bugs

Work Log:
- Diagnosed blank screen issue from user screenshot - app showing only Z logo (chat platform loading screen)
- Found services not running - terminal service (port 3003) and Next.js (port 3000) both dead
- Discovered that background processes were being killed when bash sessions ended
- Integrated terminal service into Next.js custom server (server.ts) to avoid multi-process issues
- Fixed React Hydration mismatch in page.tsx - removed conditional theme icon rendering, always show Sun icon
- Removed framer-motion animations that could cause rendering issues
- Fixed xterm-terminal.tsx - properly handle input forwarding via refs
- Fixed socket connection in use-socket.ts - singleton pattern, proper cleanup, longer timeouts
- Updated package.json dev script to use integrated server.ts instead of separate next dev
- Updated .zscripts/dev.sh to use integrated server
- Removed output: standalone from next.config.ts (incompatible with custom server)
- Fixed URL handling in server.ts - simplified to just pass request to Next.js handler
- Added ErrorBoundary component for better error handling
- Verified all services running: Next.js on 3000, Terminal on 3003, Caddy proxy on 81
- All endpoints tested and working: HTTP 200 for page, socket.io polling works through Caddy proxy
- Lint check passes with no errors

Stage Summary:
- Application now starts correctly with integrated server (single process)
- Both Next.js and terminal service running and accessible through Caddy proxy
- Fixed hydration mismatch, terminal input, socket connection issues
- App renders full CloudShell UI with sidebar, terminal area, code editor, and status bar

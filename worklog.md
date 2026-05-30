---
Task ID: 1
Agent: main
Task: Fix Socket.IO disconnect and server persistence issues for CloudShell app

Work Log:
- Analyzed screenshot showing "Disconnected" status and "Checking installed tools..." stuck state
- Identified root cause 1: Socket.IO client sending XTransformPort=3003 query parameter, which tells Caddy to route to port 3003 instead of 3000 where server actually runs
- Identified root cause 2: Socket.IO client using only 'websocket' transport, but proxy needs polling first for compatibility
- Identified root cause 3: Server process dying when shell session changes (killed by agent session management)
- Fixed use-socket.ts: removed XTransformPort, changed transports to ['polling', 'websocket'], added explicit path
- Fixed server.ts: updated CORS to reflect origin, increased timeouts for proxy, added cookie:false
- Fixed next.config.ts: removed "output: standalone" which conflicts with custom server
- Created keep-alive.sh supervisor script with double-fork technique for process persistence
- Updated dev.sh with supervisor loop for auto-restart on crash
- Verified: Socket.IO polling works through Caddy proxy (port 81)
- Verified: HTTP pages work through Caddy proxy
- Verified: Server stays alive across shell session changes using double-fork technique

Stage Summary:
- Socket.IO disconnect root cause: XTransformPort=3003 routing to wrong port + websocket-only transport
- Server persistence: double-fork technique (setsid + double-fork) makes process independent of shell session
- All endpoints tested and working: HTTP pages (200), Socket.IO polling (returns sid), Caddy proxy (200)

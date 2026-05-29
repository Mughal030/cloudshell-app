# Task 2: Terminal Backend Builder

## Summary
Built the terminal backend mini-service at `/home/z/my-project/mini-services/terminal-service/`.

## Key Files
- `/home/z/my-project/mini-services/terminal-service/package.json` - Project config with socket.io, node-pty, uuid
- `/home/z/my-project/mini-services/terminal-service/index.ts` - Main service file with all socket event handlers
- `/home/z/my-project/workspace/` - Workspace directory for terminal sessions
- `/home/z/my-project/workspace/.dockerfiles/` - Subdirectory for Dockerfile storage

## Service Details
- Port: 3003
- Socket.io path: `/` (for Caddy compatibility)
- Dev command: `bun run dev` (which runs `bun --hot index.ts`)
- Process PID: 2773 (as of last check)

## Socket Events Implemented
1. `terminal:create` → `terminal:created`
2. `terminal:input` → writes to PTY
3. `terminal:resize` → resizes PTY
4. `terminal:destroy` → `terminal:destroyed`
5. PTY data → `terminal:output`
6. `file:read` → `file:content`
7. `file:write` → `file:written`
8. `file:list` → `file:listing`
9. `tools:check` → `tools:status`
10. `tools:install` → `tools:install-command`

## Frontend Integration
- Frontend should connect with: `io('/?XTransformPort=3003')`
- Caddy gateway handles routing via `XTransformPort` query parameter

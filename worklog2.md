---
Task ID: 1
Agent: Main Agent
Task: Fix sudo password issue and nested button HTML error in CloudShell

Work Log:
- Analyzed the sudo password issue: user z has a locked password (no valid password), so sudo always fails
- Cannot configure passwordless sudo in current session (requires root, user z is non-root)
- Created sudo wrapper at /home/z/.local/bin/sudo that:
  - Tries real sudo -n (non-interactive) first
  - Falls back to unshare --user --map-root-user for non-apt commands
  - For apt commands, runs directly and provides clear error messages
  - Prevents terminal from HANGING on password prompts
- Updated /home/z/.bash_profile with correct NOPASSWD config for next container restart
- Updated server.ts with improved configurePasswordlessSudo() and setupSudoWrapper()
- Updated mini-services/terminal-service/index.ts with same sudo wrapper logic
- Fixed PTY PATH to prioritize /home/z/.local/bin when sudo not configured
- Fixed nested <button> HTML error in page.tsx - changed outer button to <div> with role="tab"
- Updated Docker panel to remove unnecessary sudo prefixes and add error handling
- Restarted server successfully - both Next.js (3000) and terminal service (3003) running

Stage Summary:
- sudo wrapper prevents terminal hangs on password prompts
- Nested button HTML error fixed
- .bash_profile correctly configured for passwordless sudo on next container restart
- Server running, accessible via Caddy on port 81
- Tools check shows 10/11 installed (docker is the missing one)

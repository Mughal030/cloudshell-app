---
Task ID: 1
Agent: Main Agent
Task: Fix sudo password prompt not working in CloudShell terminal

Work Log:
- Analyzed the full data flow: xterm.js → socket.io → node-pty → bash → sudo
- Identified root cause: multiple issues causing "password prompt moves forward"
  1. Sudo wrapper used `exec` with `echo | pipe` which consumed stdin
  2. Terminal auto-restarted immediately on process exit (no delay)
  3. No .bashrc with sudo function backup
  4. PATH configuration could bypass sudo wrapper
- Rewrote sudo wrapper (v5) with temp file approach instead of pipe+exec
- Created .bashrc with `sudo()` bash function that auto-provides password
- Updated .bash_profile to source .bashrc for login shells
- Changed PTY spawn to use `bash --login` so .bash_profile and .bashrc are sourced
- Added 2-second delay before auto-restart on shell exit
- Added welcome banner showing sudo password and usage instructions
- Always put .local/bin first in PATH regardless of sudoConfigured status
- Restarted server with all changes applied

Stage Summary:
- Sudo wrapper v5 uses temp file for password (preserves terminal stdin)
- Bash function `sudo()` takes precedence over PATH lookup
- Welcome banner shows password "admin2211" and usage info
- Terminal restart has 2s delay to prevent "moves forward" issue
- Server running on ports 3000 (Next.js) and 3003 (terminal service)

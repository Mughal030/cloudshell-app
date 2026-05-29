import { createServer } from 'http'
import next from 'next'
import { Server as SocketIOServer } from 'socket.io'
import { spawn } from 'node-pty'
import { v4 as uuidv4 } from 'uuid'
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, statSync } from 'fs'
import { join, resolve, relative } from 'path'
import { execSync } from 'child_process'

// ─── Global Error Handlers ───────────────────────────────────────
process.on('uncaughtException', (err) => {
  console.error('[Server] Uncaught Exception:', err)
})

process.on('unhandledRejection', (reason) => {
  console.error('[Server] Unhandled Rejection:', reason)
})

// ─── Signal Handlers (debug why process keeps dying) ──────────────
process.on('SIGTERM', () => {
  console.log('[Server] Received SIGTERM - shutting down gracefully')
  process.exit(0)
})
process.on('SIGINT', () => {
  console.log('[Server] Received SIGINT')
  process.exit(0)
})
process.on('SIGHUP', () => {
  console.log('[Server] Received SIGHUP - ignoring')
})
process.on('exit', (code) => {
  console.log(`[Server] Process exiting with code: ${code}`)
})

// ─── Configuration ───────────────────────────────────────────────
const PORT = parseInt(process.env.PORT || '3000', 10)
const TERMINAL_PORT = 3003
const WORKSPACE_DIR = '/home/z/my-project/workspace'
const SHELL = process.env.SHELL || '/bin/bash'
const dev = process.env.NODE_ENV !== 'production'

// ─── Ensure workspace directories exist ──────────────────────────
function ensureWorkspaceDirs() {
  if (!existsSync(WORKSPACE_DIR)) {
    mkdirSync(WORKSPACE_DIR, { recursive: true })
    console.log(`[Server] Created workspace directory: ${WORKSPACE_DIR}`)
  }
  const dockerfilesDir = join(WORKSPACE_DIR, '.dockerfiles')
  if (!existsSync(dockerfilesDir)) {
    mkdirSync(dockerfilesDir, { recursive: true })
    console.log(`[Server] Created .dockerfiles directory: ${dockerfilesDir}`)
  }
  const sampleDockerfile = join(dockerfilesDir, 'Dockerfile.app')
  if (!existsSync(sampleDockerfile)) {
    const template = `FROM ubuntu:22.04

# Install system packages
RUN apt-get update && apt-get install -y \\
    curl \\
    wget \\
    git \\
    vim \\
    nano \\
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy application files
COPY . .

# Default command
CMD ["/bin/bash"]
`
    writeFileSync(sampleDockerfile, template, 'utf-8')
    console.log(`[Server] Created sample Dockerfile: ${sampleDockerfile}`)
  }
}

ensureWorkspaceDirs()

// ─── Configure Passwordless Sudo ────────────────────────────────
function configurePasswordlessSudo() {
  // First check if passwordless sudo is already working
  try {
    execSync('sudo -n true 2>/dev/null', { encoding: 'utf-8', timeout: 5000 })
    console.log('[Server] Passwordless sudo already configured')
    return true
  } catch {
    // Passwordless sudo not working, try to set it up
  }

  try {
    // Try to create sudoers file for user z (requires root)
    execSync('echo "z ALL=(ALL) NOPASSWD: ALL" > /etc/sudoers.d/z-user && chmod 440 /etc/sudoers.d/z-user && chown root:root /etc/sudoers.d/z-user', {
      encoding: 'utf-8',
      timeout: 5000,
    })
    // Verify it worked
    execSync('sudo -n true', { encoding: 'utf-8', timeout: 5000 })
    console.log('[Server] Passwordless sudo configured successfully')
    return true
  } catch {
    console.log('[Server] Cannot configure passwordless sudo (running as non-root). Trying alternative approaches...')
    
    // Try alternative: write sudoers via tee and pkexec
    try {
      execSync('echo "z ALL=(ALL) NOPASSWD: ALL" | pkexec tee /etc/sudoers.d/z-user && pkexec chmod 440 /etc/sudoers.d/z-user', {
        encoding: 'utf-8',
        timeout: 5000,
      })
      execSync('sudo -n true', { encoding: 'utf-8', timeout: 5000 })
      console.log('[Server] Passwordless sudo configured via pkexec')
      return true
    } catch {
      // pkexec also failed
    }

    // Ensure .bash_profile has the setup for next container restart
    try {
      const bashProfile = `# CloudShell User Profile
# This file is sourced by /start.sh during container startup (as root)

# Configure passwordless sudo for user z
if [ ! -f /etc/sudoers.d/z-user ]; then
    echo 'z ALL=(ALL) NOPASSWD: ALL' > /etc/sudoers.d/z-user 2>/dev/null
    chmod 440 /etc/sudoers.d/z-user 2>/dev/null
    chown root:root /etc/sudoers.d/z-user 2>/dev/null
fi

# Set up PATH
export PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/usr/games:/usr/local/games:/home/z/.local/bin:/home/z/.bun/bin:/home/z/.npm-global/bin:$PATH"
export HOME="/home/z"
export EDITOR="vim"
`
      const profilePath = '/home/z/.bash_profile'
      writeFileSync(profilePath, bashProfile, 'utf-8')
      console.log('[Server] Updated /home/z/.bash_profile with sudoers setup for next container restart')
    } catch (err) {
      console.warn('[Server] Could not update .bash_profile:', err)
    }
    return false
  }
}

const sudoConfigured = configurePasswordlessSudo()

// ─── Create sudo wrapper for current session ────────────────────
// If passwordless sudo is not configured, we create a wrapper that uses
// unshare --user --map-root-user for root-like operations
function setupSudoWrapper() {
  if (sudoConfigured) return

  const wrapperDir = '/home/z/.local/bin'
  const wrapperPath = `${wrapperDir}/sudo`

  try {
    if (!existsSync(wrapperDir)) {
      mkdirSync(wrapperDir, { recursive: true })
    }

    // Create a sudo wrapper that tries real sudo first, then falls back to unshare
    const wrapperScript = `#!/bin/bash
# CloudShell sudo wrapper
# Tries real sudo with -n (non-interactive) flag first, then falls back to unshare

# Try real passwordless sudo first
if /usr/bin/sudo -n "$@" 2>/dev/null; then
    exit 0
fi

# If that fails, check if we're in a situation where we can use unshare
# unshare --user --map-root-user gives us a root-like environment in a user namespace
# Note: This has limitations - filesystem changes are visible but some system calls may fail
SUDO_CMD=""
SUDO_ARGS=""

# Parse sudo flags
while [[ $# -gt 0 ]]; do
    case "$1" in
        -*) SUDO_ARGS="$SUDO_ARGS $1"; shift ;;
        *) SUDO_CMD="$1"; shift; break ;;
    esac
done

if [ -z "$SUDO_CMD" ]; then
    echo "sudo: no command specified" >&2
    exit 1
fi

# For apt-get operations, try without sudo first (user may have permissions)
# For other operations, use unshare as fallback
case "$SUDO_CMD" in
    apt-get|apt)
        # Try running apt directly (sometimes works in containers)
        "$SUDO_CMD" "$@" 2>&1
        exit $?
        ;;
    *)
        # Use unshare for user namespace root
        exec unshare --user --map-root-user "$SUDO_CMD" "$@"
        ;;
esac
`
    writeFileSync(wrapperPath, wrapperScript, 'utf-8')
    execSync(`chmod +x ${wrapperPath}`, { encoding: 'utf-8' })
    console.log('[Server] Created sudo wrapper at', wrapperPath)
  } catch (err) {
    console.warn('[Server] Could not create sudo wrapper:', err)
  }
}

setupSudoWrapper()

// ─── Tool definitions ────────────────────────────────────────────
const TOOLS = ['git', 'docker', 'curl', 'wget', 'vim', 'nano', 'node', 'npm', 'python3', 'pip3', 'sudo']

const TOOL_INSTALL_COMMANDS: Record<string, string> = {
  git: 'sudo apt-get update && sudo apt-get install -y git',
  docker: 'sudo apt-get update && sudo apt-get install -y docker.io && sudo systemctl start docker 2>/dev/null; echo "Docker installation complete"',
  curl: 'sudo apt-get update && sudo apt-get install -y curl',
  wget: 'sudo apt-get update && sudo apt-get install -y wget',
  vim: 'sudo apt-get update && sudo apt-get install -y vim',
  nano: 'sudo apt-get update && sudo apt-get install -y nano',
  node: 'curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash - && sudo apt-get install -y nodejs',
  npm: 'curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash - && sudo apt-get install -y nodejs',
  python3: 'sudo apt-get update && sudo apt-get install -y python3',
  pip3: 'sudo apt-get update && sudo apt-get install -y python3-pip',
  sudo: 'sudo apt-get update && sudo apt-get install -y sudo',
}

// ─── Helper: check if a tool is installed ────────────────────────
function checkTool(name: string): { name: string; installed: boolean; version: string } {
  try {
    const whichOutput = execSync(`which ${name} 2>/dev/null || echo "not-found"`, {
      encoding: 'utf-8',
      timeout: 5000,
    }).trim()

    if (whichOutput.includes('not-found')) {
      return { name, installed: false, version: '' }
    }

    try {
      const versionOutput = execSync(`${name} --version 2>&1`, {
        encoding: 'utf-8',
        timeout: 5000,
      }).trim()
      const firstLine = versionOutput.split('\n')[0]
      return { name, installed: true, version: firstLine.trim() }
    } catch {
      return { name, installed: true, version: 'installed' }
    }
  } catch {
    return { name, installed: false, version: '' }
  }
}

// ─── Helper: safely resolve path within workspace ────────────────
function resolveWorkspacePath(inputPath: string): string | null {
  const target = inputPath
    ? resolve(WORKSPACE_DIR, inputPath)
    : WORKSPACE_DIR

  const rel = relative(WORKSPACE_DIR, target)
  if (rel.startsWith('..') || resolve(WORKSPACE_DIR, inputPath) !== target) {
    return null
  }
  return target
}

// ─── Helper: list files in a directory ───────────────────────────
function listDirectory(dirPath: string): { name: string; type: 'file' | 'directory'; size: number; modified: string }[] {
  try {
    const entries = readdirSync(dirPath, { withFileTypes: true })
    return entries
      .filter((entry) => {
        if (entry.name.startsWith('.') && entry.name !== '.dockerfiles') return false
        return true
      })
      .map((entry) => {
        const fullPath = join(dirPath, entry.name)
        try {
          const stats = statSync(fullPath)
          return {
            name: entry.name,
            type: entry.isDirectory() ? ('directory' as const) : ('file' as const),
            size: stats.size,
            modified: stats.mtime.toISOString(),
          }
        } catch {
          return {
            name: entry.name,
            type: (entry.isDirectory() ? 'directory' : 'file') as 'file' | 'directory',
            size: 0,
            modified: '',
          }
        }
      })
  } catch (err) {
    return []
  }
}

// ─── Session Storage ─────────────────────────────────────────────
interface TerminalSession {
  id: string
  pty: any
  socketId: string
  cols: number
  rows: number
}

const sessions = new Map<string, TerminalSession>()
const socketSessions = new Map<string, Set<string>>()

function cleanupSocketSessions(socketId: string) {
  const sessionIds = socketSessions.get(socketId)
  if (sessionIds) {
    for (const sessionId of sessionIds) {
      const session = sessions.get(sessionId)
      if (session) {
        try { session.pty.kill() } catch {}
        sessions.delete(sessionId)
      }
    }
    socketSessions.delete(socketId)
  }
}

function createPtySession(sessionId: string, socketId: string, cols: number, rows: number, socket: any) {
  console.log(`[Terminal] Creating PTY session ${sessionId} (${cols}x${rows})`)

  // Put /home/z/.local/bin first in PATH so our sudo wrapper takes priority
  const ptyPath = sudoConfigured
    ? '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/usr/games:/usr/local/games:/home/z/.local/bin:/home/z/.bun/bin:/home/z/.npm-global/bin'
    : '/home/z/.local/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/usr/games:/usr/local/games:/home/z/.bun/bin:/home/z/.npm-global/bin'

  const pty = spawn(SHELL, [], {
    name: 'xterm-256color',
    cols,
    rows,
    cwd: WORKSPACE_DIR,
    env: {
      ...process.env,
      TERM: 'xterm-256color',
      PATH: ptyPath,
      HOME: '/home/z',
      USER: 'z',
      LANG: 'en_US.UTF-8',
      EDITOR: 'vim',
    },
  })

  const session: TerminalSession = { id: sessionId, pty, socketId, cols, rows }
  sessions.set(sessionId, session)
  socketSessions.get(socketId)?.add(sessionId)

  // Send welcome message with system info
  const sudoStatus = sudoConfigured
    ? '\x1b[32m✓ Passwordless sudo configured\x1b[0m'
    : '\x1b[33m⚠ Sudo wrapper active (passwordless on next restart)\x1b[0m'
  const welcomeMsg = `\r\n\x1b[1;32m☁ CloudShell Terminal\x1b[0m\r\n\x1b[2;37m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\x1b[0m\r\n\x1b[2;37mWorkspace:\x1b[0m ${WORKSPACE_DIR}\r\n\x1b[2;37mShell:\x1b[0m     ${SHELL}\r\n${sudoStatus}\r\n\x1b[2;37m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\x1b[0m\r\n`
  try {
    socket.emit('terminal:output', { sessionId, data: welcomeMsg })
  } catch {}

  // PTY data output -> send to client
  pty.onData((data: string) => {
    try {
      socket.emit('terminal:output', { sessionId, data })
    } catch (err) {
      console.error(`[Terminal] Error emitting output for session ${sessionId}:`, err)
    }
  })

  // PTY exit - auto restart
  pty.onExit(({ exitCode }: { exitCode: number }) => {
    console.log(`[Terminal] PTY exited for session ${sessionId} with code ${exitCode}`)
    socket.emit('terminal:output', {
      sessionId,
      data: `\r\n\x1b[33m[Process exited with code ${exitCode}. Starting new shell...]\x1b[0m\r\n`,
    })

    sessions.delete(sessionId)
    socketSessions.get(socketId)?.delete(sessionId)

    // Auto-create a new shell
    try {
      createPtySession(sessionId, socketId, cols, rows, socket)
      console.log(`[Terminal] Restarted PTY for session ${sessionId}`)
    } catch (restartErr) {
      console.error(`[Terminal] Failed to restart PTY:`, restartErr)
    }
  })
}

// ─── Start Next.js ───────────────────────────────────────────────
console.log(`[Server] Starting CloudShell in ${dev ? 'development' : 'production'} mode...`)

const app = next({ dev })
const handle = app.getRequestHandler()

app.prepare().then(() => {
  console.log('[Server] Next.js prepared')

  // Create separate HTTP server for terminal service (port 3003)
  const terminalHttpServer = createServer()
  const io = new SocketIOServer(terminalHttpServer, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
    },
    pingTimeout: 60000,
    pingInterval: 25000,
    maxHttpBufferSize: 1e6,
    connectTimeout: 10000,
    allowEIO3: true,
    transports: ['websocket', 'polling'],
  })

  // ─── Socket.io Connection Handler ────────────────────────────────
  io.on('connection', (socket) => {
    console.log(`[Terminal] Client connected: ${socket.id}`)
    socketSessions.set(socket.id, new Set())

    // Send connection confirmation
    socket.emit('terminal:connected', { sudoConfigured })

    // Terminal: Create
    socket.on('terminal:create', (data?: { cols?: number; rows?: number }) => {
      try {
        const sessionId = uuidv4()
        const cols = data?.cols || 80
        const rows = data?.rows || 24

        createPtySession(sessionId, socket.id, cols, rows, socket)

        socket.emit('terminal:created', { sessionId })
        console.log(`[Terminal] Session created: ${sessionId}`)
      } catch (err) {
        console.error('[Terminal] Error creating session:', err)
        socket.emit('terminal:created', { sessionId: null, error: String(err) })
      }
    })

    // Terminal: Input
    socket.on('terminal:input', (data: { sessionId: string; data: string }) => {
      const { sessionId, data: inputData } = data
      const session = sessions.get(sessionId)
      if (session) {
        try {
          session.pty.write(inputData)
        } catch (err) {
          console.error(`[Terminal] Error writing to PTY:`, err)
        }
      } else {
        console.warn(`[Terminal] Received input for unknown session: ${sessionId}`)
      }
    })

    // Terminal: Resize
    socket.on('terminal:resize', (data: { sessionId: string; cols: number; rows: number }) => {
      const { sessionId, cols, rows } = data
      const session = sessions.get(sessionId)
      if (session) {
        try {
          session.pty.resize(cols, rows)
        } catch (err) {
          console.warn(`[Terminal] Error resizing PTY:`, err)
        }
      }
    })

    // Terminal: Destroy
    socket.on('terminal:destroy', (data: { sessionId: string }) => {
      const { sessionId } = data
      const session = sessions.get(sessionId)
      if (session) {
        try {
          session.pty.kill()
          sessions.delete(sessionId)
          socketSessions.get(socket.id)?.delete(sessionId)
          socket.emit('terminal:destroyed', { sessionId })
        } catch (err) {
          socket.emit('terminal:destroyed', { sessionId, error: String(err) })
        }
      }
    })

    // File: Read
    socket.on('file:read', (data: { path: string }) => {
      const { path: inputPath } = data
      const resolvedPath = resolveWorkspacePath(inputPath)
      if (!resolvedPath) {
        socket.emit('file:content', { path: inputPath, content: null, error: 'Path traversal not allowed' })
        return
      }
      try {
        if (!existsSync(resolvedPath)) {
          socket.emit('file:content', { path: inputPath, content: null, error: 'File not found' })
          return
        }
        const stat = statSync(resolvedPath)
        if (stat.isDirectory()) {
          socket.emit('file:content', { path: inputPath, content: null, error: 'Path is a directory' })
          return
        }
        const content = readFileSync(resolvedPath, 'utf-8')
        socket.emit('file:content', { path: inputPath, content, error: null })
      } catch (err) {
        socket.emit('file:content', { path: inputPath, content: null, error: String(err) })
      }
    })

    // File: Write
    socket.on('file:write', (data: { path: string; content: string }) => {
      const { path: inputPath, content } = data
      const resolvedPath = resolveWorkspacePath(inputPath)
      if (!resolvedPath) {
        socket.emit('file:written', { path: inputPath, error: 'Path traversal not allowed' })
        return
      }
      try {
        const parentDir = resolve(resolvedPath, '..')
        if (!existsSync(parentDir)) mkdirSync(parentDir, { recursive: true })
        writeFileSync(resolvedPath, content, 'utf-8')
        socket.emit('file:written', { path: inputPath, error: null })
        console.log(`[File] Written: ${inputPath}`)
      } catch (err) {
        socket.emit('file:written', { path: inputPath, error: String(err) })
      }
    })

    // File: List
    socket.on('file:list', (data?: { path?: string }) => {
      const inputPath = data?.path || ''
      const resolvedPath = resolveWorkspacePath(inputPath)
      if (!resolvedPath) {
        socket.emit('file:listing', { path: inputPath, files: [], error: 'Path traversal not allowed' })
        return
      }
      try {
        if (!existsSync(resolvedPath)) {
          socket.emit('file:listing', { path: inputPath, files: [], error: 'Directory not found' })
          return
        }
        const stat = statSync(resolvedPath)
        if (!stat.isDirectory()) {
          socket.emit('file:listing', { path: inputPath, files: [], error: 'Not a directory' })
          return
        }
        const files = listDirectory(resolvedPath)
        socket.emit('file:listing', { path: inputPath, files, error: null })
      } catch (err) {
        socket.emit('file:listing', { path: inputPath, files: [], error: String(err) })
      }
    })

    // Tools: Check
    socket.on('tools:check', () => {
      try {
        const toolsStatus = TOOLS.map(checkTool)
        socket.emit('tools:status', toolsStatus)
        console.log(`[Tools] Check completed: ${toolsStatus.filter(t => t.installed).length}/${toolsStatus.length} installed`)
      } catch (err) {
        console.error('[Tools] Error checking tools:', err)
        socket.emit('tools:status', [])
      }
    })

    // Tools: Install
    socket.on('tools:install', (data: { tool: string }) => {
      const { tool } = data
      const command = TOOL_INSTALL_COMMANDS[tool] || `sudo apt-get update && sudo apt-get install -y ${tool}`
      socket.emit('tools:install-command', { tool, command })
    })

    // Ping (for latency measurement)
    socket.on('ping', (callback) => {
      if (typeof callback === 'function') callback()
    })

    // Disconnect
    socket.on('disconnect', (reason) => {
      console.log(`[Terminal] Client disconnected: ${socket.id} (${reason})`)
      cleanupSocketSessions(socket.id)
    })

    socket.on('error', (error) => {
      console.error(`[Terminal] Socket error (${socket.id}):`, error)
    })
  })

  // Start terminal service on port 3003
  terminalHttpServer.listen(TERMINAL_PORT, () => {
    console.log(`[Terminal] Terminal service running on port ${TERMINAL_PORT}`)
  }).on('error', (err: any) => {
    if (err.code === 'EADDRINUSE') {
      console.log(`[Terminal] Port ${TERMINAL_PORT} already in use, skipping terminal service start`)
    } else {
      console.error(`[Terminal] Error starting terminal service:`, err)
    }
  })

  // Start Next.js on main port
  const mainServer = createServer((req, res) => {
    handle(req, res)
  })

  mainServer.listen(PORT, () => {
    console.log(`[Server] CloudShell ready!`)
    console.log(`[Server]   Next.js:     http://localhost:${PORT}`)
    console.log(`[Server]   Terminal:    http://localhost:${TERMINAL_PORT}`)
    console.log(`[Server]   Workspace:  ${WORKSPACE_DIR}`)
  })

  mainServer.on('error', (err: any) => {
    console.error(`[Server] Error starting Next.js:`, err)
  })
}).catch((err) => {
  console.error('[Server] Failed to prepare Next.js:', err)
  process.exit(1)
})

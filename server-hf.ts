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

// ─── Signal Handlers ──────────────────────────────────────────────
process.on('SIGTERM', () => {
  console.log('[Server] Received SIGTERM - ignoring (keeping alive)')
})
process.on('SIGINT', () => {
  console.log('[Server] Received SIGINT - shutting down')
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
const WORKSPACE_DIR = process.env.WORKSPACE_DIR || '/home/z/my-project/workspace'
const SHELL = process.env.SHELL || '/bin/bash'
const dev = process.env.NODE_ENV !== 'production'

// ─── Path Configuration (portable: works on Z.ai and Docker) ─────
const APP_HOME = process.env.APP_HOME || process.env.HOME || '/home/z'
const APP_USER = process.env.USER || 'z'
const LOCAL_BIN = `${APP_HOME}/.local/bin`
const LOCAL_LIB = `${APP_HOME}/.local/lib`
const LOCAL_SHARE = `${APP_HOME}/.local/share`
const VENV_BIN = process.env.VENV_BIN || `${APP_HOME}/.venv/bin`
const BIN_DIR = `${APP_HOME}/bin`
const CACHE_DIR = `${APP_HOME}/.cache`

// ─── Service Installation Status ────────────────────────────────
interface ServiceInstallStatus {
  name: string
  installed: boolean
  running: boolean
  installing: boolean
  error: string | null
}
const serviceInstallStatus: Record<string, ServiceInstallStatus> = {
  docker: { name: 'Docker', installed: false, running: false, installing: false, error: null },
}

function updateServiceStatus() {
  // Docker - check both system Docker and rootless Docker
  const dockerInPath = checkCommand('docker')
  const dockerInBin = existsSync(`${BIN_DIR}/docker`)
  const dockerUsr = existsSync('/usr/bin/docker')
  serviceInstallStatus.docker.installed = dockerInPath || dockerInBin || dockerUsr
  try {
    execSync('docker info 2>/dev/null', { encoding: 'utf-8', timeout: 5000 })
    serviceInstallStatus.docker.running = true
  } catch { serviceInstallStatus.docker.running = false }
  console.log(`[Docker] installed=${serviceInstallStatus.docker.installed} running=${serviceInstallStatus.docker.running} inPath=${dockerInPath} inUsr=${dockerUsr}`)
}

function checkCommand(cmd: string): boolean {
  try {
    execSync(`which ${cmd} 2>/dev/null`, { encoding: 'utf-8', timeout: 3000 })
    return true
  } catch {
    return false
  }
}

// ─── Ensure workspace directories exist ──────────────────────────
function ensureWorkspaceDirs() {
  if (!existsSync(WORKSPACE_DIR)) {
    mkdirSync(WORKSPACE_DIR, { recursive: true })
  }
  const dockerfilesDir = join(WORKSPACE_DIR, '.dockerfiles')
  if (!existsSync(dockerfilesDir)) {
    mkdirSync(dockerfilesDir, { recursive: true })
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
  }
}

ensureWorkspaceDirs()

// ─── Configure Sudo ─────────────────────────────────────────────
function configureSudo() {
  try {
    execSync('/usr/bin/sudo -n true 2>/dev/null', { encoding: 'utf-8', timeout: 5000 })
    console.log('[Server] Passwordless sudo already configured')
    return 'passwordless' as const
  } catch {}

  try {
    execSync(`echo "${APP_USER} ALL=(ALL) NOPASSWD: ALL" > /etc/sudoers.d/${APP_USER}-user && chmod 440 /etc/sudoers.d/${APP_USER}-user && chown root:root /etc/sudoers.d/${APP_USER}-user`, {
      encoding: 'utf-8',
      timeout: 5000,
    })
    execSync('/usr/bin/sudo -n true', { encoding: 'utf-8', timeout: 5000 })
    console.log('[Server] Passwordless sudo configured successfully')
    return 'passwordless' as const
  } catch {}

  console.log('[Server] No real sudo access. Using unshare-based sudo wrapper.')
  return 'wrapper' as const
}

const sudoMode = configureSudo()

// ─── Create sudo wrapper ────────────────────────────────────────
function setupSudoWrapper() {
  const wrapperDir = LOCAL_BIN
  const wrapperPath = `${wrapperDir}/sudo`

  try {
    if (!existsSync(wrapperDir)) {
      mkdirSync(wrapperDir, { recursive: true })
    }

    if (existsSync(wrapperPath)) {
      const content = readFileSync(wrapperPath, 'utf-8')
      if (content.includes('CloudShell sudo wrapper')) {
        execSync(`chmod +x ${wrapperPath}`, { encoding: 'utf-8' })
        return
      }
    }

    const wrapperScript = [
      '#!/bin/bash',
      '# CloudShell sudo wrapper v6',
      'if /usr/bin/sudo -n "$@" 2>/dev/null; then exit 0; fi',
      'exec unshare --user --map-root-user "$@"',
    ].join('\n')
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
  git: 'echo "git is pre-installed in the container"',
  docker: 'echo "Docker CLI is pre-installed. Try: docker ps" || echo "To start daemon: dockerd-rootless.sh &"',
  curl: 'echo "curl is pre-installed in the container"',
  wget: 'echo "wget is pre-installed in the container"',
  vim: 'echo "vim is pre-installed in the container"',
  nano: 'echo "nano is pre-installed in the container"',
  node: 'echo "Node.js is pre-installed in the container"',
  npm: 'echo "npm is pre-installed in the container"',
  python3: 'echo "python3 is pre-installed in the container"',
  pip3: 'echo "pip3 is pre-installed in the container"',
  sudo: 'echo "sudo is pre-installed with passwordless access"',
}

// ─── Helper: check if a tool is installed ────────────────────────
function checkTool(name: string): { name: string; installed: boolean; version: string; displayName?: string } {
  try {
    if (name === 'docker') {
      // Check multiple possible Docker locations
      const dockerPaths = [`${BIN_DIR}/docker`, '/usr/bin/docker', '/usr/local/bin/docker']
      const dockerFound = dockerPaths.some(p => existsSync(p)) || checkCommand('docker')
      if (dockerFound) {
        try {
          const v = execSync('docker --version 2>&1', { encoding: 'utf-8', timeout: 5000 }).trim()
          return { name, installed: true, version: v, displayName: 'Docker' }
        } catch {
          return { name, installed: true, version: 'Docker CLI', displayName: 'Docker' }
        }
      }
      return { name, installed: false, version: '' }
    }

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
      return { name, installed: true, version: versionOutput.split('\n')[0].trim() }
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
  } catch {
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

  const HARDENED_PATH = [
    BIN_DIR,                            // Rootless Docker binaries
    LOCAL_BIN,                          // sudo wrapper, user tools
    VENV_BIN,                           // python tools
    `${APP_HOME}/.npm-global/bin`,
    `${APP_HOME}/.bun/bin`,
    '/usr/local/sbin', '/usr/local/bin',
    '/usr/sbin', '/usr/bin', '/sbin', '/bin',
  ].join(':')

  const pty = spawn(SHELL, ['--login', '-i'], {
    name: 'xterm-256color',
    cols,
    rows,
    cwd: WORKSPACE_DIR,
    env: {
      ...process.env,
      PATH: HARDENED_PATH,
      HOME: APP_HOME,
      USER: APP_USER,
      TERM: 'xterm-256color',
      LANG: 'en_US.UTF-8',
      EDITOR: 'vim',
      CLOUDSHELL: '1',
      SUDO_MODE: sudoMode,
      DOCKER_HOST: `unix:///run/user/${process.getuid()}/docker.sock`,
      PIP_BREAK_SYSTEM_PACKAGES: '1',
      LD_LIBRARY_PATH: LOCAL_LIB,
    },
  })

  const session: TerminalSession = { id: sessionId, pty, socketId, cols, rows }
  sessions.set(sessionId, session)
  socketSessions.get(socketId)?.add(sessionId)

  let sudoInfo: string[]
  if (sudoMode === 'passwordless') {
    sudoInfo = [
      '\x1b[32m║\x1b[0m  \x1b[1;32mSudo: Full access (passwordless)\x1b[0m                    \x1b[32m║\x1b[0m',
      '\x1b[32m║\x1b[0m  Type: \x1b[1;36msudo <command>\x1b[0m to run as root              \x1b[32m║\x1b[0m',
    ]
  } else {
    sudoInfo = [
      '\x1b[32m║\x1b[0m  \x1b[1;33mSudo: Limited (user-namespace mode)\x1b[0m               \x1b[32m║\x1b[0m',
      '\x1b[32m║\x1b[0m  \x1b[1;36msudo <cmd>\x1b[0m runs in user namespace (fake root)  \x1b[32m║\x1b[0m',
      '\x1b[32m║\x1b[0m  \x1b[1;33mapt/systemctl\x1b[0m: Not available (no real root) \x1b[32m║\x1b[0m',
      '\x1b[32m║\x1b[0m  Use \x1b[1;36mnpm/pip3/bun\x1b[0m to install packages instead     \x1b[32m║\x1b[0m',
    ]
  }

  const welcomeBanner = [
    '',
    '\x1b[32m╔══════════════════════════════════════════════════════════════╗\x1b[0m',
    '\x1b[32m║\x1b[0m  \x1b[1;32m☁ CloudShell\x1b[0m                                             \x1b[32m║\x1b[0m',
    '\x1b[32m╠══════════════════════════════════════════════════════════════╣\x1b[0m',
    ...sudoInfo,
    '\x1b[32m╚══════════════════════════════════════════════════════════════╝\x1b[0m',
    '',
  ].join('\r\n')
  try {
    socket.emit('terminal:output', { sessionId, data: welcomeBanner + '\r\n' })
  } catch {}

  pty.onData((data: string) => {
    try {
      socket.emit('terminal:output', { sessionId, data })
    } catch (err) {
      console.error(`[Terminal] Error emitting output for session ${sessionId}:`, err)
    }
  })

  pty.onExit(({ exitCode }: { exitCode: number }) => {
    console.log(`[Terminal] PTY exited for session ${sessionId} with code ${exitCode}`)
    sessions.delete(sessionId)
    socketSessions.get(socketId)?.delete(sessionId)
    socket.emit('clear-input-buffer', { sessionId })
    socket.emit('terminal:output', {
      sessionId,
      data: `\r\n\x1b[33m[Shell exited with code ${exitCode}. Restarting in 2s...]\x1b[0m\r\n`,
    })
    setTimeout(() => {
      if (!socket.connected) return
      try {
        createPtySession(sessionId, socketId, cols, rows, socket)
        console.log(`[Terminal] Restarted PTY for session ${sessionId}`)
      } catch (restartErr) {
        console.error(`[Terminal] Failed to restart PTY:`, restartErr)
      }
    }, 2000)
  })
}

// ─── Start Next.js ───────────────────────────────────────────────
console.log(`[Server] Starting CloudShell in ${dev ? 'development' : 'production'} mode...`)

const app = next({ dev })
const handle = app.getRequestHandler()

app.prepare().then(() => {
  console.log('[Server] Next.js prepared')

  // Update service install status
  updateServiceStatus()

  // Periodically update service status (every 15s)
  setInterval(() => {
    updateServiceStatus()
  }, 15000)

  // ─── Main HTTP Server (Next.js + Socket.IO on SAME port) ────────
  // CRITICAL: Socket.IO MUST be on the same port as Next.js (3000)
  // because Caddy reverse proxy only forwards to port 3000.
  // The client connects to /socket.io/ which Socket.IO handles internally.
  const mainServer = createServer((req, res) => {
    const url = req.url || '/'

    // Health check endpoint
    if (url === '/api/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: true, uptime: process.uptime() }))
      return
    }

    // Service installation status endpoint
    if (url === '/api/services') {
      updateServiceStatus()
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(serviceInstallStatus))
      return
    }

    // Default: Next.js handler
    handle(req, res)
  })

  // ─── Attach Socket.IO to the SAME server as Next.js ───────────
  // This is the key fix: Socket.IO must be on port 3000 (same as Next.js)
  // so that Caddy reverse proxy can reach both web and terminal connections.
  const io = new SocketIOServer(mainServer, {
    cors: {
      origin: true,           // Reflect the requesting origin (works with any proxy)
      methods: ['GET', 'POST'],
      credentials: true,
    },
    path: '/socket.io/',
    pingInterval: 15000,      // Slightly longer for proxy overhead
    pingTimeout: 30000,       // Longer timeout for proxy environments
    upgradeTimeout: 15000,    // More time for WebSocket upgrade through proxy
    maxHttpBufferSize: 1e7,
    connectTimeout: 30000,    // Longer connect timeout for proxy
    allowEIO3: true,          // Support older clients
    transports: ['polling', 'websocket'],  // POLLING FIRST for proxy compatibility
    allowUpgrades: true,      // Allow upgrade from polling to websocket
    cookie: false,            // Don't set cookies (avoids CORS issues with proxy)
  })

  // ─── Socket.io Connection Handler ────────────────────────────────
  io.on('connection', (socket) => {
    const transport = socket.conn.transport.name
    console.log(`[Terminal] Client connected: ${socket.id} via ${transport}`)
    socketSessions.set(socket.id, new Set())

    // Log transport upgrades for debugging
    socket.conn.on('upgrade', (newTransport) => {
      console.log(`[Terminal] Transport upgrade for ${socket.id}: ${transport} -> ${newTransport.name}`)
    })

    socket.emit('terminal:connected', { sudoMode })

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
      } catch (err) {
        console.error('[Tools] Error checking tools:', err)
        socket.emit('tools:status', [])
      }
    })

    // Tools: Install
    socket.on('tools:install', (data: { tool: string }) => {
      const { tool } = data
      const command = TOOL_INSTALL_COMMANDS[tool] || `echo "Install ${tool}: use npm/pip3/bun"`
      socket.emit('tools:install-command', { tool, command })
    })

    // Session Restore
    socket.on('restore-session', (data: { sessionId: string }) => {
      const { sessionId } = data
      const session = sessions.get(sessionId)
      if (session) {
        session.socketId = socket.id
        socketSessions.get(socket.id)?.add(sessionId)
        socket.emit('terminal:restored', { sessionId, success: true })
      } else {
        socket.emit('terminal:restored', { sessionId, success: false })
      }
    })

    socket.on('ping', (callback) => {
      if (typeof callback === 'function') callback()
    })

    socket.on('disconnect', (reason) => {
      console.log(`[Terminal] Client disconnected: ${socket.id} (${reason}, transport was: ${socket.conn.transport.name})`)
      // Don't immediately clean up sessions - let them persist for reconnect
      // cleanupSocketSessions(socket.id)
    })

    socket.on('error', (error) => {
      console.error(`[Terminal] Socket error (${socket.id}):`, error)
    })
  })

  // ─── Start unified server on port 3000 ─────────────────────────
  mainServer.listen(PORT, () => {
    console.log(`[Server] CloudShell ready!`)
    console.log(`[Server]   Next.js + Terminal: http://localhost:${PORT}`)
    console.log(`[Server]   Socket.IO path:     /socket.io/`)
    console.log(`[Server]   Workspace:          ${WORKSPACE_DIR}`)
  })

  mainServer.on('error', (err: any) => {
    console.error(`[Server] Error starting server:`, err)
  })
}).catch((err) => {
  console.error('[Server] Failed to prepare Next.js:', err)
  process.exit(1)
})

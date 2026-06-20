import { createServer } from 'http'
import next from 'next'
import { Server as SocketIOServer } from 'socket.io'
import { spawn } from 'node-pty'
import { v4 as uuidv4 } from 'uuid'
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, statSync } from 'fs'
import { join, resolve, relative } from 'path'
import { execSync } from 'child_process'
import { verifyToken, getUserById, getUserWorkspaceDir } from './src/lib/auth.ts'

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
const PORT = parseInt(process.env.PORT || '7860', 10)
const DEFAULT_WORKSPACE_DIR = process.env.WORKSPACE_DIR || '/home/cloudshell/workspace'
const SHELL = process.env.SHELL || '/bin/bash'
const dev = process.env.NODE_ENV !== 'production'

// ─── Path Configuration ──────────────────────────────────────────
const APP_HOME = process.env.APP_HOME || process.env.HOME || '/home/cloudshell'
const APP_USER = process.env.USER || 'cloudshell'
const LOCAL_BIN = `${APP_HOME}/.local/bin`
const LOCAL_LIB = `${APP_HOME}/.local/lib`
const BIN_DIR = `${APP_HOME}/bin`
const CACHE_DIR = `${APP_HOME}/.cache`

// ─── Per-User Workspace ──────────────────────────────────────────
const WORKSPACE_BASE = process.env.WORKSPACE_BASE || join(APP_HOME, 'workspaces')

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
  const dockerInPath = checkCommand('docker')
  const dockerInBin = existsSync(`${BIN_DIR}/docker`)
  const dockerUsr = existsSync('/usr/bin/docker')
  serviceInstallStatus.docker.installed = dockerInPath || dockerInBin || dockerUsr
  try {
    execSync('docker info 2>/dev/null', { encoding: 'utf-8', timeout: 5000 })
    serviceInstallStatus.docker.running = true
  } catch { serviceInstallStatus.docker.running = false }
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
  if (!existsSync(DEFAULT_WORKSPACE_DIR)) {
    mkdirSync(DEFAULT_WORKSPACE_DIR, { recursive: true })
  }
  if (!existsSync(WORKSPACE_BASE)) {
    mkdirSync(WORKSPACE_BASE, { recursive: true })
  }
}

ensureWorkspaceDirs()

// ─── Fix APT directories ────────────────────────────────────────
function fixAptDirectories() {
  try {
    for (const dir of ['/var/lib/apt/lists', '/var/lib/apt/lists/partial', '/var/cache/apt', '/var/lib/dpkg']) {
      try {
        if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
        execSync(`chown -R root:root ${dir} 2>/dev/null && chmod -R 755 ${dir} 2>/dev/null`, { encoding: 'utf-8', timeout: 3000 })
      } catch {}
    }
  } catch {}
}

fixAptDirectories()

// ─── Configure Sudo ─────────────────────────────────────────────
const sudoMode = (() => {
  try {
    execSync('/usr/bin/sudo -n true 2>/dev/null', { encoding: 'utf-8', timeout: 5000 })
    return 'passwordless' as const
  } catch {}
  try {
    execSync(`echo "${APP_USER} ALL=(ALL) NOPASSWD: ALL" > /etc/sudoers.d/${APP_USER}-user && chmod 440 /etc/sudoers.d/${APP_USER}-user`, { encoding: 'utf-8', timeout: 5000 })
    execSync('/usr/bin/sudo -n true', { encoding: 'utf-8', timeout: 5000 })
    return 'passwordless' as const
  } catch {}
  return 'wrapper' as const
})()

// ─── Tool definitions ────────────────────────────────────────────
const TOOLS = ['git', 'docker', 'curl', 'wget', 'vim', 'nano', 'node', 'npm', 'python3', 'pip3', 'sudo']

const TOOL_INSTALL_COMMANDS: Record<string, string> = {
  git: 'echo "git is pre-installed"',
  docker: 'echo "Docker CLI is pre-installed"',
  curl: 'echo "curl is pre-installed"',
  wget: 'echo "wget is pre-installed"',
  vim: 'echo "vim is pre-installed"',
  nano: 'echo "nano is pre-installed"',
  node: 'echo "Node.js is pre-installed"',
  npm: 'echo "npm is pre-installed (global prefix: ~/.npm-global)"',
  python3: 'echo "python3 is pre-installed"',
  pip3: 'echo "pip3 is pre-installed"',
  sudo: 'echo "sudo is available"',
}

function checkTool(name: string): { name: string; installed: boolean; version: string; displayName?: string } {
  try {
    if (name === 'docker') {
      const dockerPaths = [`${BIN_DIR}/docker`, '/usr/bin/docker', '/usr/local/bin/docker']
      const dockerFound = dockerPaths.some(p => existsSync(p)) || checkCommand('docker')
      if (dockerFound) {
        try {
          return { name, installed: true, version: execSync('docker --version 2>&1', { encoding: 'utf-8', timeout: 5000 }).trim(), displayName: 'Docker' }
        } catch {
          return { name, installed: true, version: 'Docker CLI', displayName: 'Docker' }
        }
      }
      return { name, installed: false, version: '' }
    }
    const whichOutput = execSync(`which ${name} 2>/dev/null || echo "not-found"`, { encoding: 'utf-8', timeout: 5000 }).trim()
    if (whichOutput.includes('not-found')) return { name, installed: false, version: '' }
    try {
      return { name, installed: true, version: execSync(`${name} --version 2>&1`, { encoding: 'utf-8', timeout: 5000 }).trim().split('\n')[0].trim() }
    } catch {
      return { name, installed: true, version: 'installed' }
    }
  } catch {
    return { name, installed: false, version: '' }
  }
}

// ─── Helper: safely resolve path within workspace ────────────────
function resolveWorkspacePath(inputPath: string, workspaceDir: string): string | null {
  const target = inputPath ? resolve(workspaceDir, inputPath) : workspaceDir
  const rel = relative(workspaceDir, target)
  if (rel.startsWith('..') || resolve(workspaceDir, inputPath) !== target) return null
  return target
}

// ─── Helper: list files in a directory ───────────────────────────
function listDirectory(dirPath: string): { name: string; type: 'file' | 'directory'; size: number; modified: string }[] {
  try {
    return readdirSync(dirPath, { withFileTypes: true })
      .filter((entry) => !entry.name.startsWith('.') || entry.name === '.dockerfiles')
      .map((entry) => {
        const fullPath = join(dirPath, entry.name)
        try {
          const stats = statSync(fullPath)
          return { name: entry.name, type: (entry.isDirectory() ? 'directory' : 'file') as 'file' | 'directory', size: stats.size, modified: stats.mtime.toISOString() }
        } catch {
          return { name: entry.name, type: (entry.isDirectory() ? 'directory' : 'file') as 'file' | 'directory', size: 0, modified: '' }
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
  userId: string | null
  workspaceDir: string
}

const sessions = new Map<string, TerminalSession>()
const socketSessions = new Map<string, Set<string>>()

function createPtySession(sessionId: string, socketId: string, cols: number, rows: number, socket: any, userWorkspace: string, userId: string | null) {
  console.log(`[Terminal] Creating PTY session ${sessionId} (${cols}x${rows}) workspace=${userWorkspace}`)

  const NPM_GLOBAL = join(APP_HOME, '.npm-global')

  const HARDENED_PATH = [
    BIN_DIR,
    LOCAL_BIN,
    `${NPM_GLOBAL}/bin`,
    '/usr/local/sbin', '/usr/local/bin',
    '/usr/sbin', '/usr/bin', '/sbin', '/bin',
  ].join(':')

  const pty = spawn(SHELL, ['--login', '-i'], {
    name: 'xterm-256color',
    cols,
    rows,
    cwd: userWorkspace,
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
      NPM_CONFIG_PREFIX: NPM_GLOBAL,
      WORKSPACE_DIR: userWorkspace,
      // Pass through Claude/Anthropic env vars if set
      ...(process.env.ANTHROPIC_BASE_URL ? { ANTHROPIC_BASE_URL: process.env.ANTHROPIC_BASE_URL } : {}),
      ...(process.env.ANTHROPIC_AUTH_TOKEN ? { ANTHROPIC_AUTH_TOKEN: process.env.ANTHROPIC_AUTH_TOKEN } : {}),
      ...(process.env.ANTHROPIC_MODEL ? { ANTHROPIC_MODEL: process.env.ANTHROPIC_MODEL } : {}),
      ...(process.env.CLAUDE_CODE_USE_AUTH_TOKEN ? { CLAUDE_CODE_USE_AUTH_TOKEN: process.env.CLAUDE_CODE_USE_AUTH_TOKEN } : {}),
      ...(process.env.ANTHROPIC_API_KEY ? { ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY } : {}),
    },
  })

  const session: TerminalSession = { id: sessionId, pty, socketId, cols, rows, userId, workspaceDir: userWorkspace }
  sessions.set(sessionId, session)
  socketSessions.get(socketId)?.add(sessionId)

  const welcomeBanner = [
    '',
    '\x1b[32m╔══════════════════════════════════════════════════════════════════╗\x1b[0m',
    '\x1b[32m║\x1b[0m  \x1b[1;32m☁ CloudShell by Jasbol Hack\x1b[0m                                \x1b[32m║\x1b[0m',
    '\x1b[32m╠══════════════════════════════════════════════════════════════════╣\x1b[0m',
    `\x1b[32m║\x1b[0m  \x1b[1;36mWorkspace:\x1b[0m ${userWorkspace}`.padEnd(66) + '\x1b[32m║\x1b[0m',
    '\x1b[32m║\x1b[0m  \x1b[1;33mnpm install -g\x1b[0m works without sudo!                       \x1b[32m║\x1b[0m',
    '\x1b[32m║\x1b[0m  \x1b[1;36msetup-claude-code\x1b[0m  - Install Claude Code CLI           \x1b[32m║\x1b[0m',
    '\x1b[32m║\x1b[0m  \x1b[1;36msetup-claude-env\x1b[0m   - Set Claude API credentials       \x1b[32m║\x1b[0m',
    '\x1b[32m║\x1b[0m  \x1b[1;36mcloudshell-test\x1b[0m    - Test all commands                  \x1b[32m║\x1b[0m',
    '\x1b[32m║\x1b[0m  \x1b[1;36mnpm-global-help\x1b[0m    - npm install -g help                \x1b[32m║\x1b[0m',
    '\x1b[32m╚══════════════════════════════════════════════════════════════════╝\x1b[0m',
    '',
    '\x1b[33m  Claude Code CLI Quick Setup (Linux - use export, NOT setx):\x1b[0m',
    '\x1b[2m  1. npm install -g @anthropic-ai/claude-code\x1b[0m',
    '\x1b[2m  2. export ANTHROPIC_BASE_URL="https://your-endpoint.com/"\x1b[0m',
    '\x1b[2m  3. export ANTHROPIC_AUTH_TOKEN="sk-your-key"\x1b[0m',
    '\x1b[2m  4. export ANTHROPIC_MODEL="claude-opus-4-6"\x1b[0m',
    '\x1b[2m  5. export CLAUDE_CODE_USE_AUTH_TOKEN="true"\x1b[0m',
    '\x1b[2m  6. claude\x1b[0m',
    '\x1b[2m  Or: setup-claude-env "https://your-endpoint/" "sk-your-key" "claude-opus-4-6"\x1b[0m',
    '',
  ].join('\r\n')

  try { socket.emit('terminal:output', { sessionId, data: welcomeBanner + '\r\n' }) } catch {}

  pty.onData((data: string) => {
    try { socket.emit('terminal:output', { sessionId, data }) } catch {}
  })

  pty.onExit(({ exitCode }: { exitCode: number }) => {
    sessions.delete(sessionId)
    socketSessions.get(socketId)?.delete(sessionId)
    socket.emit('clear-input-buffer', { sessionId })
    socket.emit('terminal:output', {
      sessionId,
      data: `\r\n\x1b[33m[Shell exited with code ${exitCode}. Restarting in 2s...]\x1b[0m\r\n`,
    })
    setTimeout(() => {
      if (!socket.connected) return
      try { createPtySession(sessionId, socketId, cols, rows, socket, userWorkspace, userId) } catch {}
    }, 2000)
  })
}

// ─── Start Next.js ───────────────────────────────────────────────
console.log(`[Server] Starting CloudShell in ${dev ? 'development' : 'production'} mode...`)

const app = next({ dev })
const handle = app.getRequestHandler()

app.prepare().then(() => {
  console.log('[Server] Next.js prepared')
  updateServiceStatus()
  setInterval(updateServiceStatus, 15000)

  const mainServer = createServer((req, res) => {
    const url = req.url || '/'

    if (url === '/api/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: true, uptime: process.uptime() }))
      return
    }

    if (url === '/api/services') {
      updateServiceStatus()
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(serviceInstallStatus))
      return
    }

    handle(req, res)
  })

  const io = new SocketIOServer(mainServer, {
    cors: { origin: true, methods: ['GET', 'POST'], credentials: true },
    path: '/socket.io/',
    pingInterval: 15000,
    pingTimeout: 30000,
    upgradeTimeout: 15000,
    maxHttpBufferSize: 1e7,
    connectTimeout: 30000,
    allowEIO3: true,
    transports: ['polling', 'websocket'],
    allowUpgrades: true,
    cookie: false,
  })

  // ─── Socket.IO Auth Middleware ────────────────────────────────
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.query?.token as string || socket.handshake.headers?.cookie

    if (!token) {
      socket.data.authenticated = false
      socket.data.user = null
      socket.data.workspaceDir = DEFAULT_WORKSPACE_DIR
      console.log(`[Auth] Socket ${socket.id} - no auth token, using default workspace`)
      return next()
    }

    let authToken = token
    if (token.includes('jasbol-token=')) {
      const match = token.match(/jasbol-token=([^;]+)/)
      if (match) authToken = match[1]
    }

    const decoded = verifyToken(authToken)
    if (!decoded) {
      socket.data.authenticated = false
      socket.data.user = null
      socket.data.workspaceDir = DEFAULT_WORKSPACE_DIR
      console.log(`[Auth] Socket ${socket.id} - invalid token`)
      return next()
    }

    const user = getUserById(decoded.userId)
    const workspaceDir = user ? getUserWorkspaceDir(user) : DEFAULT_WORKSPACE_DIR

    socket.data.authenticated = true
    socket.data.user = decoded
    socket.data.workspaceDir = workspaceDir
    console.log(`[Auth] Socket ${socket.id} authenticated as ${decoded.username} (${decoded.role}) workspace=${workspaceDir}`)
    next()
  })

  // ─── Socket.io Connection Handler ────────────────────────────
  io.on('connection', (socket) => {
    const transport = socket.conn.transport.name
    console.log(`[Terminal] Client connected: ${socket.id} via ${transport}`)
    socketSessions.set(socket.id, new Set())

    const userInfo = socket.data.authenticated && socket.data.user
      ? { userId: socket.data.user.userId, username: socket.data.user.username, role: socket.data.user.role, workspaceDir: socket.data.workspaceDir }
      : null

    // Determine workspace for this connection (per-user isolation)
    const userWorkspace = socket.data.workspaceDir || DEFAULT_WORKSPACE_DIR
    if (!existsSync(userWorkspace)) {
      mkdirSync(userWorkspace, { recursive: true })
    }

    socket.emit('terminal:connected', { sudoMode, workspace: userWorkspace })

    // Terminal: Create
    socket.on('terminal:create', (data?: { cols?: number; rows?: number }) => {
      try {
        const sessionId = uuidv4()
        const cols = data?.cols || 80
        const rows = data?.rows || 24
        createPtySession(sessionId, socket.id, cols, rows, socket, userWorkspace, userInfo?.userId || null)
        socket.emit('terminal:created', { sessionId, workspace: userWorkspace })
      } catch (err) {
        console.error('[Terminal] Error creating session:', err)
        socket.emit('terminal:created', { sessionId: null, error: String(err) })
      }
    })

    // Terminal: Input
    socket.on('terminal:input', (data: { sessionId: string; data: string }) => {
      const session = sessions.get(data.sessionId)
      if (session) {
        try { session.pty.write(data.data) } catch {}
      }
    })

    // Terminal: Resize
    socket.on('terminal:resize', (data: { sessionId: string; cols: number; rows: number }) => {
      const session = sessions.get(data.sessionId)
      if (session) {
        try { session.pty.resize(data.cols, data.rows) } catch {}
      }
    })

    // Terminal: Destroy
    socket.on('terminal:destroy', (data: { sessionId: string }) => {
      const session = sessions.get(data.sessionId)
      if (session) {
        try {
          session.pty.kill()
          sessions.delete(data.sessionId)
          socketSessions.get(socket.id)?.delete(data.sessionId)
          socket.emit('terminal:destroyed', { sessionId: data.sessionId })
        } catch (err) {
          socket.emit('terminal:destroyed', { sessionId: data.sessionId, error: String(err) })
        }
      }
    })

    // File: Read (scoped to user workspace)
    socket.on('file:read', (data: { path: string }) => {
      const resolvedPath = resolveWorkspacePath(data.path, userWorkspace)
      if (!resolvedPath) {
        socket.emit('file:content', { path: data.path, content: null, error: 'Path traversal not allowed' })
        return
      }
      try {
        if (!existsSync(resolvedPath)) { socket.emit('file:content', { path: data.path, content: null, error: 'File not found' }); return }
        const stat = statSync(resolvedPath)
        if (stat.isDirectory()) { socket.emit('file:content', { path: data.path, content: null, error: 'Path is a directory' }); return }
        socket.emit('file:content', { path: data.path, content: readFileSync(resolvedPath, 'utf-8'), error: null })
      } catch (err) {
        socket.emit('file:content', { path: data.path, content: null, error: String(err) })
      }
    })

    // File: Write (scoped to user workspace)
    socket.on('file:write', (data: { path: string; content: string }) => {
      const resolvedPath = resolveWorkspacePath(data.path, userWorkspace)
      if (!resolvedPath) {
        socket.emit('file:written', { path: data.path, error: 'Path traversal not allowed' })
        return
      }
      try {
        const parentDir = resolve(resolvedPath, '..')
        if (!existsSync(parentDir)) mkdirSync(parentDir, { recursive: true })
        writeFileSync(resolvedPath, data.content, 'utf-8')
        socket.emit('file:written', { path: data.path, error: null })
      } catch (err) {
        socket.emit('file:written', { path: data.path, error: String(err) })
      }
    })

    // File: List (scoped to user workspace)
    socket.on('file:list', (data?: { path?: string }) => {
      const inputPath = data?.path || ''
      const resolvedPath = resolveWorkspacePath(inputPath, userWorkspace)
      if (!resolvedPath) {
        socket.emit('file:listing', { path: inputPath, files: [], error: 'Path traversal not allowed' })
        return
      }
      try {
        if (!existsSync(resolvedPath)) { socket.emit('file:listing', { path: inputPath, files: [], error: 'Directory not found' }); return }
        const stat = statSync(resolvedPath)
        if (!stat.isDirectory()) { socket.emit('file:listing', { path: inputPath, files: [], error: 'Not a directory' }); return }
        socket.emit('file:listing', { path: inputPath, files: listDirectory(resolvedPath), error: null })
      } catch (err) {
        socket.emit('file:listing', { path: inputPath, files: [], error: String(err) })
      }
    })

    // Folder: Create (scoped to user workspace)
    socket.on('folder:create', (data: { path: string }) => {
      const resolvedPath = resolveWorkspacePath(data.path, userWorkspace)
      if (!resolvedPath) { socket.emit('folder:created', { path: data.path, error: 'Path traversal not allowed' }); return }
      try {
        if (existsSync(resolvedPath)) { socket.emit('folder:created', { path: data.path, error: 'Already exists' }); return }
        mkdirSync(resolvedPath, { recursive: true })
        socket.emit('folder:created', { path: data.path, error: null })
      } catch (err) {
        socket.emit('folder:created', { path: data.path, error: String(err) })
      }
    })

    // File: Delete (scoped to user workspace)
    socket.on('file:delete', (data: { path: string }) => {
      const resolvedPath = resolveWorkspacePath(data.path, userWorkspace)
      if (!resolvedPath) { socket.emit('file:deleted', { path: data.path, error: 'Path traversal not allowed' }); return }
      try {
        if (!existsSync(resolvedPath)) { socket.emit('file:deleted', { path: data.path, error: 'Not found' }); return }
        const stat = statSync(resolvedPath)
        const { rmSync, unlinkSync } = require('fs')
        if (stat.isDirectory()) { rmSync(resolvedPath, { recursive: true, force: true }) } else { unlinkSync(resolvedPath) }
        socket.emit('file:deleted', { path: data.path, error: null })
      } catch (err) {
        socket.emit('file:deleted', { path: data.path, error: String(err) })
      }
    })

    // Tools: Check
    socket.on('tools:check', () => {
      try { socket.emit('tools:status', TOOLS.map(checkTool)) } catch { socket.emit('tools:status', []) }
    })

    // Tools: Install
    socket.on('tools:install', (data: { tool: string }) => {
      socket.emit('tools:install-command', { tool: data.tool, command: TOOL_INSTALL_COMMANDS[data.tool] || `echo "Install ${data.tool}: use npm/pip3"` })
    })

    // Session Restore
    socket.on('restore-session', (data: { sessionId: string }) => {
      const session = sessions.get(data.sessionId)
      if (session) {
        session.socketId = socket.id
        socketSessions.get(socket.id)?.add(data.sessionId)
        socket.emit('terminal:restored', { sessionId: data.sessionId, success: true })
      } else {
        socket.emit('terminal:restored', { sessionId: data.sessionId, success: false })
      }
    })

    socket.on('ping', (callback) => {
      if (typeof callback === 'function') callback()
    })

    socket.on('disconnect', (reason) => {
      console.log(`[Terminal] Client disconnected: ${socket.id} (${reason})`)
    })

    socket.on('error', (error) => {
      console.error(`[Terminal] Socket error (${socket.id}):`, error)
    })
  })

  // ─── Start server ───────────────────────────────────────────
  mainServer.listen(PORT, () => {
    console.log(`[Server] CloudShell ready!`)
    console.log(`[Server]   Web + Terminal: http://localhost:${PORT}`)
    console.log(`[Server]   Socket.IO path: /socket.io/`)
    console.log(`[Server]   Default Workspace: ${DEFAULT_WORKSPACE_DIR}`)
    console.log(`[Server]   User Workspaces: ${WORKSPACE_BASE}`)
    console.log(`[Server]   npm global prefix: ${APP_HOME}/.npm-global`)
  })

  mainServer.on('error', (err: any) => {
    console.error(`[Server] Error starting server:`, err)
  })
}).catch((err) => {
  console.error('[Server] Failed to prepare Next.js:', err)
  process.exit(1)
})

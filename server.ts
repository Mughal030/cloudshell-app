import { createServer } from 'http'
import next from 'next'
import { Server as SocketIOServer } from 'socket.io'
import { spawn } from 'node-pty'
import { v4 as uuidv4 } from 'uuid'
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, statSync } from 'fs'
import { join, resolve, relative } from 'path'
import { execSync, spawn as childSpawn, ChildProcess } from 'child_process'
import httpProxy from 'http-proxy'

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
  stopOpenOutreach()
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
const WORKSPACE_DIR = '/home/z/my-project/workspace'
const SHELL = process.env.SHELL || '/bin/bash'
const dev = process.env.NODE_ENV !== 'production'
let ooStarted = false

// ─── Open Outreach Service Management ────────────────────────────
const OO_DIR = '/home/z/openoutreach'
const OO_VENV = `${OO_DIR}/.venv`
const OO_LOGS = `${OO_DIR}/logs`
const OO_PIDS = `${OO_DIR}/pids`
const OO_VNC_PORT = 5900
const OO_NOVNC_PORT = 6080
const OO_DJANGO_PORT = 8000

const ooProcesses: { name: string; process: ChildProcess }[] = []

function startOpenOutreach() {
  mkdirSync(OO_LOGS, { recursive: true })
  mkdirSync(OO_PIDS, { recursive: true })
  mkdirSync(`${OO_DIR}/data`, { recursive: true })

  // 1. Start Xvfb if not running
  if (!existsSync('/tmp/.X99-lock')) {
    const xvfb = childSpawn('/usr/bin/Xvfb', [':99', '-screen', '0', '1920x1080x24'], {
      detached: true,
      stdio: 'ignore',
    })
    xvfb.unref()
    console.log('[OpenOutreach] Started Xvfb')
    ooProcesses.push({ name: 'xvfb', process: xvfb })
  } else {
    console.log('[OpenOutreach] Xvfb already running')
  }

  // 2. Start x11vnc
  const x11vnc = childSpawn('/home/z/.local/bin/x11vnc', [
    '-display', ':99', '-forever', '-shared', '-nopw', '-rfbport', String(OO_VNC_PORT)
  ], {
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, LD_LIBRARY_PATH: '/home/z/.local/lib', DISPLAY: ':99' },
  })
  x11vnc.unref()
  console.log('[OpenOutreach] Started x11vnc')
  ooProcesses.push({ name: 'x11vnc', process: x11vnc })

  // 3. Start websockify (noVNC proxy)
  const websockify = childSpawn('/home/z/.venv/bin/websockify', [
    '--web', '/home/z/.local/share/noVNC-1.5.0',
    String(OO_NOVNC_PORT), `localhost:${OO_VNC_PORT}`
  ], {
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, LD_LIBRARY_PATH: '/home/z/.local/lib' },
  })
  websockify.unref()
  console.log('[OpenOutreach] Started websockify (noVNC)')
  ooProcesses.push({ name: 'websockify', process: websockify })

  // 4. Run migrations
  try {
    execSync(`${OO_VENV}/bin/python ${OO_DIR}/manage.py migrate --noinput`, {
      encoding: 'utf-8',
      timeout: 30000,
      env: { ...process.env, DISPLAY: ':99', DJANGO_SETTINGS_MODULE: 'linkedin.django_settings' },
    })
    console.log('[OpenOutreach] Migrations complete')
  } catch (err) {
    console.warn('[OpenOutreach] Migration warning:', String(err).slice(0, 200))
  }

  // 5. Collect static files
  try {
    execSync(`${OO_VENV}/bin/python ${OO_DIR}/manage.py collectstatic --noinput`, {
      encoding: 'utf-8',
      timeout: 30000,
      env: { ...process.env, DISPLAY: ':99', DJANGO_SETTINGS_MODULE: 'linkedin.django_settings' },
    })
    console.log('[OpenOutreach] Static files collected')
  } catch (err) {
    console.warn('[OpenOutreach] Collectstatic warning:', String(err).slice(0, 200))
  }

  // 6. Start Django admin server
  const django = childSpawn(`${OO_VENV}/bin/python`, [
    'manage.py', 'runserver', `0.0.0.0:${OO_DJANGO_PORT}`
  ], {
    cwd: OO_DIR,
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      DISPLAY: ':99',
      DJANGO_SETTINGS_MODULE: 'linkedin.django_settings',
      PLAYWRIGHT_BROWSERS_PATH: '/home/z/.cache/ms-playwright',
      PATH: `${OO_VENV}/bin:/home/z/.local/bin:/usr/local/bin:/usr/bin:/bin`,
    },
  })
  django.unref()
  console.log('[OpenOutreach] Started Django admin')
  ooProcesses.push({ name: 'django', process: django })

  console.log('[OpenOutreach] All services started!')
  console.log(`[OpenOutreach]   Django Admin: http://localhost:${OO_DJANGO_PORT}/admin/`)
  console.log(`[OpenOutreach]   noVNC:        http://localhost:${OO_NOVNC_PORT}/vnc.html`)
}

function stopOpenOutreach() {
  for (const { name, process: proc } of ooProcesses) {
    try {
      proc.kill()
      console.log(`[OpenOutreach] Stopped ${name}`)
    } catch {}
  }
  ooProcesses.length = 0
}

function getOpenOutreachStatus(): Record<string, boolean> {
  const status: Record<string, boolean> = {}
  for (const { name, process: proc } of ooProcesses) {
    try {
      process.kill(proc.pid!, 0)
      status[name] = true
    } catch {
      status[name] = false
    }
  }
  return status
}

// ─── HTTP Proxy for Open Outreach ────────────────────────────────
const proxy = httpProxy.createProxyServer({
  ws: true,
})

proxy.on('error', (err, _req, _res) => {
  // Silently ignore proxy errors
})

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
    execSync('echo "z ALL=(ALL) NOPASSWD: ALL" > /etc/sudoers.d/z-user && chmod 440 /etc/sudoers.d/z-user && chown root:root /etc/sudoers.d/z-user', {
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
  const wrapperDir = '/home/z/.local/bin'
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
  git: 'which git 2>/dev/null && echo "git already installed" || echo "git: already available"',
  docker: 'echo "Docker: Rootless Docker available at /home/z/bin/docker - run: dockerd-rootless & then docker ps"',
  curl: 'which curl 2>/dev/null && echo "curl already installed" || echo "curl: available"',
  wget: 'which wget 2>/dev/null && echo "wget already installed" || echo "wget: available"',
  vim: 'which vim 2>/dev/null && echo "vim already installed" || echo "vim: available"',
  nano: 'which nano 2>/dev/null && echo "nano already installed" || echo "nano: available"',
  node: 'which node 2>/dev/null && echo "node already installed" || echo "Install via nvm"',
  npm: 'which npm 2>/dev/null && echo "npm already installed" || echo "Install via nvm"',
  python3: 'which python3 2>/dev/null && echo "python3 already installed" || echo "python3: available"',
  pip3: 'which pip3 2>/dev/null && echo "pip3 already installed" || echo "pip3: available"',
  sudo: 'which sudo 2>/dev/null && echo "sudo wrapper already installed" || echo "sudo wrapper: available"',
}

// ─── Helper: check if a tool is installed ────────────────────────
function checkTool(name: string): { name: string; installed: boolean; version: string; displayName?: string } {
  try {
    if (name === 'docker') {
      if (existsSync('/home/z/bin/docker')) {
        try {
          const v = execSync('/home/z/bin/docker --version 2>&1', { encoding: 'utf-8', timeout: 5000 }).trim()
          return { name, installed: true, version: v, displayName: 'Docker (Rootless)' }
        } catch {
          return { name, installed: true, version: 'Rootless Docker', displayName: 'Docker (Rootless)' }
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
    '/home/z/bin',                   // Rootless Docker binaries
    '/home/z/.local/bin',            // x11vnc, sudo wrapper, etc.
    '/home/z/.venv/bin',             // websockify, python tools
    '/home/z/openoutreach/.venv/bin',// Django venv
    '/home/z/.npm-global/bin',
    '/home/z/.bun/bin',
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
      HOME: '/home/z',
      USER: 'z',
      TERM: 'xterm-256color',
      LANG: 'en_US.UTF-8',
      EDITOR: 'vim',
      CLOUDSHELL: '1',
      SUDO_MODE: sudoMode,
      DOCKER_HOST: `unix:///run/user/${process.getuid()}/docker.sock`,
      VIRTUAL_ENV: '/home/z/openoutreach/.venv',
      PYTHONPATH: '/home/z/openoutreach:/home/z/.venv/lib/python3.12/site-packages',
      PIP_BREAK_SYSTEM_PACKAGES: '1',
      LD_LIBRARY_PATH: '/home/z/.local/lib',
      DISPLAY: ':99',
      PLAYWRIGHT_BROWSERS_PATH: '/home/z/.cache/ms-playwright',
      DJANGO_SETTINGS_MODULE: 'linkedin.django_settings',
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

  const ooStatus = getOpenOutreachStatus()
  const ooRunning = Object.values(ooStatus).some(v => v)

  const ooInfo = ooRunning
    ? ['\x1b[32m║\x1b[0m  \x1b[1;32mOpenOutreach: Running\x1b[0m                                  \x1b[32m║\x1b[0m']
    : ['\x1b[32m║\x1b[0m  \x1b[1;33mOpenOutreach: Not started\x1b[0m                              \x1b[32m║\x1b[0m',
       '\x1b[32m║\x1b[0m  Type: \x1b[1;36mopenoutreach start\x1b[0m to launch                   \x1b[32m║\x1b[0m']

  const welcomeBanner = [
    '',
    '\x1b[32m╔══════════════════════════════════════════════════════════════╗\x1b[0m',
    '\x1b[32m║\x1b[0m  \x1b[1;32m☁ CloudShell\x1b[0m                                             \x1b[32m║\x1b[0m',
    '\x1b[32m╠══════════════════════════════════════════════════════════════╣\x1b[0m',
    ...sudoInfo,
    '\x1b[32m╠══════════════════════════════════════════════════════════════╣\x1b[0m',
    ...ooInfo,
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

  // Auto-start Xvfb so it's always ready for Playwright/noVNC
  if (!existsSync('/tmp/.X99-lock')) {
    try {
      const xvfb = childSpawn('/usr/bin/Xvfb', [':99', '-screen', '0', '1920x1080x24'], {
        detached: true,
        stdio: 'ignore',
      })
      xvfb.unref()
      console.log('[Server] Xvfb started on display :99')
    } catch (err) {
      console.warn('[Server] Failed to auto-start Xvfb:', err)
    }
  } else {
    console.log('[Server] Xvfb already running')
  }

  // ─── Main HTTP Server (Next.js + Socket.IO + Proxy on SAME port) ────
  // CRITICAL: Socket.IO MUST be on the same port as Next.js (3000)
  // because Caddy reverse proxy only forwards to port 3000.
  // The client connects to /socket.io/ which Socket.IO handles internally.
  const mainServer = createServer((req, res) => {
    const url = req.url || '/'

    // Health check endpoint
    if (url === '/api/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: true, uptime: process.uptime(), ooStarted }))
      return
    }

    // Proxy: noVNC
    if (url.startsWith('/novnc') || url.startsWith('/vnc')) {
      let targetPath: string
      if (url.startsWith('/novnc')) {
        targetPath = url.slice('/novnc'.length) || '/vnc.html'
      } else {
        targetPath = url.slice('/vnc'.length) || '/vnc.html'
      }
      if (!targetPath.startsWith('/')) targetPath = '/' + targetPath
      console.log(`[Proxy] noVNC: ${url} -> ${targetPath}`)
      req.url = targetPath
      proxy.web(req, res, { target: `http://127.0.0.1:${OO_NOVNC_PORT}` })
      return
    }

    // Proxy: Django Admin
    if (url.startsWith('/admin') || url.startsWith('/django') || url.startsWith('/openoutreach/api')) {
      const targetUrl = url.replace(/^\/django/, '').replace(/^\/openoutreach\/api/, '')
      req.url = targetUrl
      proxy.web(req, res, { target: `http://127.0.0.1:${OO_DJANGO_PORT}` })
      return
    }

    // Proxy: Django static files
    if (url.startsWith('/static/')) {
      proxy.web(req, res, { target: `http://127.0.0.1:${OO_DJANGO_PORT}` })
      return
    }

    // Proxy: Django media files
    if (url.startsWith('/media/')) {
      proxy.web(req, res, { target: `http://127.0.0.1:${OO_DJANGO_PORT}` })
      return
    }

    // Default: Next.js handler
    handle(req, res)
  })

  // ─── WebSocket Upgrade Handler ────────────────────────────────
  // Socket.IO handles its own /socket.io/ upgrades internally.
  // We only need to proxy noVNC WebSocket upgrades here.
  mainServer.on('upgrade', (req, socket, head) => {
    const url = req.url || ''

    // Forward noVNC WebSocket connections to websockify
    if (url.startsWith('/novnc') || url.startsWith('/vnc')) {
      console.log(`[Proxy] WebSocket upgrade for noVNC: ${url}`)
      proxy.ws(req, socket, head, {
        target: `http://127.0.0.1:${OO_NOVNC_PORT}`
      })
    }
    // /socket.io/ upgrades are handled by Socket.IO automatically
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
    console.log(`[Terminal] Client connected: ${socket.id}`)
    socketSessions.set(socket.id, new Set())

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

    // OpenOutreach: Status
    socket.on('openoutreach:status', () => {
      socket.emit('openoutreach:status', { ...getOpenOutreachStatus(), started: ooStarted })
    })

    // OpenOutreach: Start
    socket.on('openoutreach:start', async () => {
      if (!ooStarted) {
        socket.emit('openoutreach:status', { state: 'starting', msg: 'Starting services...' })
        try {
          startOpenOutreach()
          ooStarted = true
          console.log('[OpenOutreach] Services started lazily via UI')
        } catch (err) {
          console.error('[OpenOutreach] Failed to start services:', err)
          socket.emit('openoutreach:status', { state: 'error', msg: String(err) })
          return
        }
      }
      socket.emit('openoutreach:status', { ...getOpenOutreachStatus(), started: ooStarted, state: 'running' })
    })

    // OpenOutreach: Start daemon
    socket.on('openoutreach:start-daemon', () => {
      if (!ooStarted) {
        try {
          startOpenOutreach()
          ooStarted = true
        } catch (err) {
          console.error('[OpenOutreach] Failed to start base services:', err)
        }
      }
      try {
        const daemon = childSpawn(`${OO_VENV}/bin/python`, [
          'manage.py', 'rundaemon'
        ], {
          cwd: OO_DIR,
          detached: true,
          stdio: ['ignore', 'pipe', 'pipe'],
          env: {
            ...process.env,
            DISPLAY: ':99',
            DJANGO_SETTINGS_MODULE: 'linkedin.django_settings',
            PLAYWRIGHT_BROWSERS_PATH: '/home/z/.cache/ms-playwright',
            PATH: `${OO_VENV}/bin:/home/z/.local/bin:/usr/local/bin:/usr/bin:/bin`,
          },
        })
        daemon.unref()
        ooProcesses.push({ name: 'daemon', process: daemon })
        socket.emit('openoutreach:status', { ...getOpenOutreachStatus(), started: ooStarted })
        console.log('[OpenOutreach] Daemon started')
      } catch (err) {
        console.error('[OpenOutreach] Failed to start daemon:', err)
      }
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
      console.log(`[Terminal] Client disconnected: ${socket.id} (${reason})`)
      cleanupSocketSessions(socket.id)
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
    console.log(`[Server]   noVNC:              http://localhost:${PORT}/novnc/`)
    console.log(`[Server]   Django Admin:       http://localhost:${PORT}/admin/`)
    console.log(`[Server]   Workspace:          ${WORKSPACE_DIR}`)
  })

  mainServer.on('error', (err: any) => {
    console.error(`[Server] Error starting server:`, err)
  })
}).catch((err) => {
  console.error('[Server] Failed to prepare Next.js:', err)
  process.exit(1)
})

// This won't work as patch - let me add console.log inline instead

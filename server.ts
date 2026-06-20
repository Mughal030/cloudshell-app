import { createServer } from 'http'
import next from 'next'
import { Server as SocketIOServer } from 'socket.io'
import { spawn } from 'node-pty'
import { v4 as uuidv4 } from 'uuid'
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, statSync, watch } from 'fs'
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
const PORT = parseInt(process.env.PORT || '3000', 10)
const DEFAULT_WORKSPACE_DIR = process.env.WORKSPACE_DIR || '/home/z/my-project/workspace'
const SHELL = process.env.SHELL || '/bin/bash'
const dev = process.env.NODE_ENV !== 'production'

// ─── Path Configuration (portable: works on Z.ai and Docker) ─────
const APP_HOME = process.env.APP_HOME || process.env.HOME || '/home/z'
const APP_USER = process.env.USER || 'z'
const LOCAL_BIN = `${APP_HOME}/.local/bin`
const LOCAL_LIB = `${APP_HOME}/.local/lib`
const VENV_BIN = process.env.VENV_BIN || `${APP_HOME}/.venv/bin`
const BIN_DIR = `${APP_HOME}/bin`
const CACHE_DIR = `${APP_HOME}/.cache`

// ─── Per-User Workspace ──────────────────────────────────────────
// Each user gets their own workspace directory under WORKSPACE_BASE
const WORKSPACE_BASE = process.env.WORKSPACE_BASE || join(APP_HOME, 'workspaces')

function getUserWorkspace(userId: string, username: string): string {
  const userDir = join(WORKSPACE_BASE, username.toLowerCase())
  if (!existsSync(userDir)) {
    mkdirSync(userDir, { recursive: true })
    console.log(`[Workspace] Created workspace for user ${username}: ${userDir}`)
  }
  return userDir
}

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
  const dockerfilesDir = join(DEFAULT_WORKSPACE_DIR, '.dockerfiles')
  if (!existsSync(dockerfilesDir)) {
    mkdirSync(dockerfilesDir, { recursive: true })
  }
  const sampleDockerfile = join(dockerfilesDir, 'Dockerfile.app')
  if (!existsSync(sampleDockerfile)) {
    writeFileSync(sampleDockerfile, `FROM ubuntu:22.04
RUN apt-get update && apt-get install -y curl wget git vim nano && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY . .
CMD ["/bin/bash"]
`, 'utf-8')
  }
  // Create a visible README so 'ls' shows something (not just hidden .dockerfiles)
  const readme = join(DEFAULT_WORKSPACE_DIR, 'README.md')
  if (!existsSync(readme)) {
    writeFileSync(readme, `# CloudShell Workspace

Welcome to your **Jasbol Hack CloudShell** workspace!

## Quick Start

\`\`\`bash
# List files (including hidden)
ls -la

# Try Claude Code (pre-installed)
claude

# Install a global npm package (no sudo needed)
npm install -g typescript

# After running 'curl | bash' installers, refresh your PATH:
source ~/.bashrc
# Or just open a new terminal tab
\`\`\`

## Where do downloaded tools go?

Most 'curl | bash' installers put binaries in:
- \`~/.local/bin/\`        (already in PATH)
- \`~/.npm-global/bin/\`   (already in PATH, for npm -g)
- \`~/.cargo/bin/\`        (Rust)
- \`~/.bun/bin/\`          (Bun)
- \`~/.opencode/bin/\`     (opencode)

These directories are OUTSIDE this workspace folder, so they won't
appear in the file sidebar. To use a freshly-installed tool, run:

\`\`\`bash
source ~/.bashrc
\`\`\`

Or just open a new terminal tab — the new tool will be on your PATH.

## Tips

- **Ctrl+Shift+C / Ctrl+Shift+V** = copy / paste in terminal
- **Ctrl+S** in the code editor = save
- Click the refresh button in the Files tab to re-scan
- Toggle "Show hidden" to see dotfiles like .bashrc
`, 'utf-8')
  }
}

ensureWorkspaceDirs()

// ─── Fix APT directories for sudo apt-get ───────────────────────
function fixAptDirectories() {
  try {
    const aptDirs = ['/var/lib/apt/lists', '/var/lib/apt/lists/partial', '/var/cache/apt', '/var/lib/dpkg']
    for (const dir of aptDirs) {
      try {
        if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
        execSync(`chown -R root:root ${dir} 2>/dev/null && chmod -R 755 ${dir} 2>/dev/null`, { encoding: 'utf-8', timeout: 3000 })
      } catch {}
    }
  } catch (err) {
    console.warn('[Server] Could not fix APT directories:', err)
  }
}

fixAptDirectories()

// ─── Configure Sudo ─────────────────────────────────────────────
function configureSudo() {
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
}

const sudoMode = configureSudo()

// ─── Create sudo wrapper ────────────────────────────────────────
function setupSudoWrapper() {
  const wrapperDir = LOCAL_BIN
  const wrapperPath = `${wrapperDir}/sudo`

  try {
    if (!existsSync(wrapperDir)) mkdirSync(wrapperDir, { recursive: true })
    if (existsSync(wrapperPath)) {
      const content = readFileSync(wrapperPath, 'utf-8')
      if (content.includes('CloudShell sudo wrapper')) return
    }

    writeFileSync(wrapperPath, `#!/bin/bash
# CloudShell sudo wrapper - handles npm install -g specially
/usr/bin/sudo -n "$@" 2>/dev/null && exit 0
case "$1" in
  npm)
    shift
    if [[ "$1" == "install" ]] || [[ "$1" == "i" ]]; then
      shift
      args=()
      for arg in "$@"; do [[ "$arg" != "-g" ]] && [[ "$arg" != "--global" ]] && args+=("$arg"); done
      npm install -g "\${args[@]}"
      exit $?
    fi
    npm "$@"
    exit $?
    ;;
  apt|apt-get)
    shift
    /usr/bin/sudo "$@" 2>/dev/null && exit 0
    echo "⚠ apt not available. Use npm/pip3 instead."
    exit 1
    ;;
  *)
    /usr/bin/sudo "$@" 2>/dev/null && exit 0
    exec unshare --user --map-root-user "$@"
    ;;
esac
`, 'utf-8')
    execSync(`chmod +x ${wrapperPath}`, { encoding: 'utf-8' })
    console.log('[Server] Created sudo wrapper at', wrapperPath)
  } catch (err) {
    console.warn('[Server] Could not create sudo wrapper:', err)
  }
}

setupSudoWrapper()

// ─── 24/7 Keep-Alive ────────────────────────────────────────────
const KEEP_ALIVE_INTERVAL = 5 * 60 * 1000
const SELF_PING_URL = `http://localhost:${PORT}/api/health`

function startKeepAlive() {
  console.log('[KeepAlive] Starting 24/7 self-ping...')
  const pingSelf = () => {
    try {
      const http = require('http')
      http.get(SELF_PING_URL, (res: any) => {
        console.log(`[KeepAlive] OK (uptime: ${Math.floor(process.uptime())}s, status: ${res.statusCode})`)
      }).on('error', () => {})
    } catch {}
  }
  setTimeout(() => {
    pingSelf()
    setInterval(pingSelf, KEEP_ALIVE_INTERVAL)
  }, 30000)
}

startKeepAlive()

// ─── Tool definitions ────────────────────────────────────────────
const TOOLS = ['git', 'docker', 'curl', 'wget', 'vim', 'nano', 'node', 'npm', 'python3', 'pip3', 'sudo']

const TOOL_INSTALL_COMMANDS: Record<string, string> = {
  git: 'echo "git is pre-installed"',
  docker: 'echo "Docker CLI is pre-installed. Try: docker ps"',
  curl: 'echo "curl is pre-installed"',
  wget: 'echo "wget is pre-installed"',
  vim: 'echo "vim is pre-installed"',
  nano: 'echo "nano is pre-installed"',
  node: 'echo "Node.js is pre-installed"',
  npm: 'echo "npm is pre-installed (global prefix: ~/.npm-global)"',
  python3: 'echo "python3 is pre-installed"',
  pip3: 'echo "pip3 is pre-installed"',
  sudo: 'echo "sudo is available (passwordless)"',
}

function checkTool(name: string): { name: string; installed: boolean; version: string; displayName?: string } {
  try {
    if (name === 'docker') {
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
    const whichOutput = execSync(`which ${name} 2>/dev/null || echo "not-found"`, { encoding: 'utf-8', timeout: 5000 }).trim()
    if (whichOutput.includes('not-found')) return { name, installed: false, version: '' }
    try {
      const versionOutput = execSync(`${name} --version 2>&1`, { encoding: 'utf-8', timeout: 5000 }).trim()
      return { name, installed: true, version: versionOutput.split('\n')[0].trim() }
    } catch {
      return { name, installed: true, version: 'installed' }
    }
  } catch {
    return { name, installed: false, version: '' }
  }
}

// ─── Helper: safely resolve path within a workspace ──────────────
function resolveWorkspacePath(inputPath: string, workspaceDir: string): string | null {
  const target = inputPath ? resolve(workspaceDir, inputPath) : workspaceDir
  const rel = relative(workspaceDir, target)
  if (rel.startsWith('..') || resolve(workspaceDir, inputPath) !== target) {
    return null
  }
  return target
}

// ─── Helper: list files in a directory ───────────────────────────
function listDirectory(dirPath: string, showHidden: boolean = false): { name: string; type: 'file' | 'directory'; size: number; modified: string }[] {
  try {
    const entries = readdirSync(dirPath, { withFileTypes: true })
    return entries
      .filter((entry) => {
        if (showHidden) return true
        // Hide dotfiles by default, but always show .dockerfiles (legacy)
        if (!entry.name.startsWith('.')) return true
        return entry.name === '.dockerfiles'
      })
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
// Track authenticated user per socket
const socketUsers = new Map<string, { userId: string; username: string; role: string; workspaceDir: string } | null>()

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
  socketUsers.delete(socketId)
}

function createPtySession(sessionId: string, socketId: string, cols: number, rows: number, socket: any, userWorkspace: string, userId: string | null) {
  console.log(`[Terminal] Creating PTY session ${sessionId} (${cols}x${rows}) workspace=${userWorkspace}`)

  const NPM_GLOBAL = join(APP_HOME, '.npm-global')

  // Comprehensive PATH that includes ALL common curl|bash installer destinations.
  // This ensures that when a user runs `curl ... | bash` (e.g. opencode, bun, rust, deno),
  // the installed binary is IMMEDIATELY available — no need to `source ~/.bashrc` first.
  // Non-existent directories are silently ignored by bash, so including them is harmless.
  const HARDENED_PATH = [
    BIN_DIR,
    LOCAL_BIN,
    `${NPM_GLOBAL}/bin`,
    VENV_BIN,
    // Common curl|bash installer destinations
    `${APP_HOME}/.opencode/bin`,
    `${APP_HOME}/.bun/bin`,
    `${APP_HOME}/.cargo/bin`,
    `${APP_HOME}/.deno/bin`,
    `${APP_HOME}/.local/go/bin`,
    `${APP_HOME}/go/bin`,
    `${APP_HOME}/.krew/bin`,
    `${APP_HOME}/.nvm/versions/node/v22/bin`,
    `${APP_HOME}/.nvm/versions/node/v20/bin`,
    `${APP_HOME}/.nvm/versions/node/v18/bin`,
    `${APP_HOME}/.local/share/npm/bin`,
    `${APP_HOME}/.yarn/bin`,
    `${APP_HOME}/.pnpm`,
    // System paths (last priority)
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
      // Pass through Claude/Anthropic env vars if set in server env or .bashrc_env
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
    userId ? `\x1b[32m║\x1b[0m  \x1b[1;36mUser:\x1b[0m ${userId.split('-')[0]}...  \x1b[1;36mWorkspace:\x1b[0m ${userWorkspace}`.padEnd(66) + '\x1b[32m║\x1b[0m' : '',
    '\x1b[32m║\x1b[0m  \x1b[1;33mnpm install -g\x1b[0m works without sudo!                       \x1b[32m║\x1b[0m',
    '\x1b[32m║\x1b[0m  \x1b[1;32mclaude\x1b[0m              - Claude Code CLI (pre-installed!)  \x1b[32m║\x1b[0m',
    '\x1b[32m║\x1b[0m  \x1b[1;36mclaude-show\x1b[0m        - Show current Claude config         \x1b[32m║\x1b[0m',
    '\x1b[32m║\x1b[0m  \x1b[1;36mclaude-set-url\x1b[0m     - Change API endpoint only          \x1b[32m║\x1b[0m',
    '\x1b[32m║\x1b[0m  \x1b[1;36mclaude-set-key\x1b[0m     - Change API key only               \x1b[32m║\x1b[0m',
    '\x1b[32m║\x1b[0m  \x1b[1;36mclaude-set-model\x1b[0m   - Change model only                 \x1b[32m║\x1b[0m',
    '\x1b[32m║\x1b[0m  \x1b[1;36msetup-claude-env\x1b[0m   - Set all Claude env vars at once   \x1b[32m║\x1b[0m',
    '\x1b[32m║\x1b[0m  \x1b[1;36mreload\x1b[0m              - Refresh PATH after curl|bash      \x1b[32m║\x1b[0m',
    '\x1b[32m║\x1b[0m  \x1b[1;36mwhereis-tool\x1b[0m       - Find a freshly-installed tool     \x1b[32m║\x1b[0m',
    '\x1b[32m║\x1b[0m  \x1b[1;36mcloudshell-test\x1b[0m    - Test all commands                  \x1b[32m║\x1b[0m',
    '\x1b[32m║\x1b[0m  \x1b[1;36mnpm-global-help\x1b[0m    - npm install -g help                \x1b[32m║\x1b[0m',
    '\x1b[32m╚══════════════════════════════════════════════════════════════════╝\x1b[0m',
    '',
    '\x1b[33m  Claude Code CLI is pre-installed! Just type: claude\x1b[0m',
    '\x1b[2m  Change settings individually:\x1b[0m',
    '\x1b[2m    claude-set-url "https://your-endpoint.com/"     (change API endpoint)\x1b[0m',
    '\x1b[2m    claude-set-key "sk-your-key"                    (change API key)\x1b[0m',
    '\x1b[2m    claude-set-model "claude-opus-4-7"              (change model)\x1b[0m',
    '\x1b[2m    claude-show                                     (show current config)\x1b[0m',
    '\x1b[2m  Or set all at once:\x1b[0m',
    '\x1b[2m    setup-claude-env "https://your-endpoint/" "sk-your-key" "claude-opus-4-7"\x1b[0m',
    '\x1b[2m  Copy/Paste: Ctrl+Shift+C = Copy, Ctrl+Shift+V = Paste\x1b[0m',
    '\x1b[2m  Tools like opencode/bun/deno work right after install — PATH auto-refreshes.\x1b[0m',
    '',
  ].filter(Boolean).join('\r\n')

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
        createPtySession(sessionId, socketId, cols, rows, socket, userWorkspace, userId)
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
      console.log(`[Auth] Socket ${socket.id} connected without auth token - using default workspace`)
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

    // Get user's workspace directory
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
    console.log(`[Terminal] Client connected: ${socket.id} via ${socket.conn.transport.name}`)
    socketSessions.set(socket.id, new Set())

    // Store user info for this socket
    const userInfo = socket.data.authenticated && socket.data.user
      ? { userId: socket.data.user.userId, username: socket.data.user.username, role: socket.data.user.role, workspaceDir: socket.data.workspaceDir }
      : null
    socketUsers.set(socket.id, userInfo)

    // Determine workspace for this connection
    const userWorkspace = socket.data.workspaceDir || DEFAULT_WORKSPACE_DIR

    // Ensure user workspace exists
    if (!existsSync(userWorkspace)) {
      mkdirSync(userWorkspace, { recursive: true })
    }

    socket.emit('terminal:connected', { sudoMode, workspace: userWorkspace })
    // Send workspace info immediately so the file manager can display the absolute path
    socket.emit('workspace:info', { workspace: userWorkspace, defaultWorkspace: DEFAULT_WORKSPACE_DIR })

    // ─── File Watcher: Broadcast files:changed when workspace changes ───
    // This catches files created/modified/deleted by TERMINAL commands (wget, curl, npm install, etc.)
    // so the sidebar file manager auto-refreshes without waiting for the 4s polling interval.
    let workspaceWatcher: any = null
    let watcherDebounce: ReturnType<typeof setTimeout> | null = null
    try {
      if (existsSync(userWorkspace)) {
        workspaceWatcher = watch(userWorkspace, { recursive: true }, (eventType, filename) => {
          // Debounce — many events fire in rapid succession for a single operation
          if (watcherDebounce) clearTimeout(watcherDebounce)
          watcherDebounce = setTimeout(() => {
            try {
              socket.emit('files:changed', { path: filename || '', workspace: userWorkspace, eventType })
            } catch {}
          }, 300)
        })
        // Clean up watcher on disconnect
        socket.on('disconnect', () => {
          if (workspaceWatcher) {
            try { workspaceWatcher.close() } catch {}
            workspaceWatcher = null
          }
          if (watcherDebounce) {
            clearTimeout(watcherDebounce)
            watcherDebounce = null
          }
        })
      }
    } catch (watchErr) {
      console.warn('[FileWatcher] Could not watch workspace:', watchErr)
    }

    // Terminal: Create (with user-specific workspace)
    socket.on('terminal:create', (data?: { cols?: number; rows?: number }) => {
      try {
        const sessionId = uuidv4()
        const cols = data?.cols || 80
        const rows = data?.rows || 24
        createPtySession(sessionId, socket.id, cols, rows, socket, userWorkspace, userInfo?.userId || null)
        socket.emit('terminal:created', { sessionId, workspace: userWorkspace })
        console.log(`[Terminal] Session created: ${sessionId} in workspace: ${userWorkspace}`)
      } catch (err) {
        console.error('[Terminal] Error creating session:', err)
        socket.emit('terminal:created', { sessionId: null, error: String(err) })
      }
    })

    // Terminal: Input
    socket.on('terminal:input', (data: { sessionId: string; data: string }) => {
      const session = sessions.get(data.sessionId)
      if (session) {
        try { session.pty.write(data.data) } catch (err) { console.error('[Terminal] Error writing to PTY:', err) }
      }
    })

    // Terminal: Resize
    socket.on('terminal:resize', (data: { sessionId: string; cols: number; rows: number }) => {
      const session = sessions.get(data.sessionId)
      if (session) {
        try { session.pty.resize(data.cols, data.rows) } catch (err) { console.warn('[Terminal] Error resizing PTY:', err) }
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
        if (!existsSync(resolvedPath)) {
          socket.emit('file:content', { path: data.path, content: null, error: 'File not found' })
          return
        }
        const stat = statSync(resolvedPath)
        if (stat.isDirectory()) {
          socket.emit('file:content', { path: data.path, content: null, error: 'Path is a directory' })
          return
        }
        const content = readFileSync(resolvedPath, 'utf-8')
        socket.emit('file:content', { path: data.path, content, error: null })
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
        // Broadcast change so file manager auto-refreshes
        socket.emit('files:changed', { path: data.path, workspace: userWorkspace })
      } catch (err) {
        socket.emit('file:written', { path: data.path, error: String(err) })
      }
    })

    // File: List (scoped to user workspace)
    socket.on('file:list', (data?: { path?: string; showHidden?: boolean }) => {
      const inputPath = data?.path || ''
      const showHidden = data?.showHidden === true
      const resolvedPath = resolveWorkspacePath(inputPath, userWorkspace)
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
        const files = listDirectory(resolvedPath, showHidden)
        socket.emit('file:listing', { path: inputPath, files, error: null })
      } catch (err) {
        socket.emit('file:listing', { path: inputPath, files: [], error: String(err) })
      }
    })

    // Folder: Create (scoped to user workspace)
    socket.on('folder:create', (data: { path: string }) => {
      const resolvedPath = resolveWorkspacePath(data.path, userWorkspace)
      if (!resolvedPath) {
        socket.emit('folder:created', { path: data.path, error: 'Path traversal not allowed' })
        return
      }
      try {
        if (existsSync(resolvedPath)) {
          socket.emit('folder:created', { path: data.path, error: 'Already exists' })
          return
        }
        mkdirSync(resolvedPath, { recursive: true })
        socket.emit('folder:created', { path: data.path, error: null })
        socket.emit('files:changed', { path: data.path, workspace: userWorkspace })
      } catch (err) {
        socket.emit('folder:created', { path: data.path, error: String(err) })
      }
    })

    // File: Delete (scoped to user workspace)
    socket.on('file:delete', (data: { path: string }) => {
      const resolvedPath = resolveWorkspacePath(data.path, userWorkspace)
      if (!resolvedPath) {
        socket.emit('file:deleted', { path: data.path, error: 'Path traversal not allowed' })
        return
      }
      try {
        if (!existsSync(resolvedPath)) {
          socket.emit('file:deleted', { path: data.path, error: 'Not found' })
          return
        }
        const stat = statSync(resolvedPath)
        if (stat.isDirectory()) {
          const { rmSync } = require('fs')
          rmSync(resolvedPath, { recursive: true, force: true })
        } else {
          const { unlinkSync } = require('fs')
          unlinkSync(resolvedPath)
        }
        socket.emit('file:deleted', { path: data.path, error: null })
        socket.emit('files:changed', { path: data.path, workspace: userWorkspace })
      } catch (err) {
        socket.emit('file:deleted', { path: data.path, error: String(err) })
      }
    })

    // File: Rename (scoped to user workspace)
    socket.on('file:rename', (data: { oldPath: string; newPath: string }) => {
      const resolvedOld = resolveWorkspacePath(data.oldPath, userWorkspace)
      const resolvedNew = resolveWorkspacePath(data.newPath, userWorkspace)
      if (!resolvedOld || !resolvedNew) {
        socket.emit('file:renamed', { path: data.oldPath, error: 'Path traversal not allowed' })
        return
      }
      try {
        const { renameSync } = require('fs')
        renameSync(resolvedOld, resolvedNew)
        socket.emit('file:renamed', { path: data.oldPath, error: null })
        socket.emit('files:changed', { path: data.newPath, workspace: userWorkspace })
      } catch (err) {
        socket.emit('file:renamed', { path: data.oldPath, error: String(err) })
      }
    })

    // Workspace: Info — returns absolute workspace path so the file manager can display it
    socket.on('workspace:info', () => {
      socket.emit('workspace:info', { workspace: userWorkspace, defaultWorkspace: DEFAULT_WORKSPACE_DIR })
    })

    // Tools: Check
    socket.on('tools:check', () => {
      try {
        socket.emit('tools:status', TOOLS.map(checkTool))
      } catch (err) {
        console.error('[Tools] Error checking tools:', err)
        socket.emit('tools:status', [])
      }
    })

    // Tools: Install
    socket.on('tools:install', (data: { tool: string }) => {
      const command = TOOL_INSTALL_COMMANDS[data.tool] || `echo "Install ${data.tool}: use npm/pip3"`
      socket.emit('tools:install-command', { tool: data.tool, command })
    })

    // Services: Status
    socket.on('openoutreach:status', () => {
      updateServiceStatus()
      socket.emit('openoutreach:status', { started: false, services: serviceInstallStatus })
    })

    socket.on('openoutreach:start', async () => {
      socket.emit('openoutreach:status', { started: false, services: serviceInstallStatus })
    })

    socket.on('openoutreach:start-daemon', () => {
      socket.emit('openoutreach:status', { started: false, services: serviceInstallStatus })
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
  })

  mainServer.on('error', (err: any) => {
    console.error(`[Server] Error starting server:`, err)
  })
}).catch((err) => {
  console.error('[Server] Failed to prepare Next.js:', err)
  process.exit(1)
})

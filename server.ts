import { createServer, get as httpGet } from 'http'
import next from 'next'
import { Server as SocketIOServer } from 'socket.io'
import { spawn } from 'node-pty'
import { v4 as uuidv4 } from 'uuid'
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, statSync, lstatSync, watch, createReadStream, createWriteStream, unlinkSync, rmSync, renameSync } from 'fs'
import { join, resolve, relative, basename, sep } from 'path'
import { execSync, exec } from 'child_process'
import * as archiver from 'archiver'
import * as Busboy from 'busboy'
import { verifyTokenBasic, getUserById, getUserWorkspaceDir, ensureToolSymlinks, getUserApiKeys } from './src/lib/auth.ts'
import { s3UploadWorkspaceFile, s3DownloadWorkspaceFile, s3DeleteWorkspaceFile, s3RenameWorkspaceFile, s3UploadStream, workspacePathToS3Key, startPeriodicDbBackup, s3TestConnection } from './src/lib/s3-storage.ts'

// ─── Global Error Handlers ───────────────────────────────────────
process.on('uncaughtException', (err) => {
  console.error('[Server] Uncaught Exception:', err)
  // If the proxy died, try to restart it
  if (err.message?.includes('ECONNREFUSED') || err.message?.includes('socket hang up')) {
    console.log('[Server] Connection-related error detected — proxy may be down, attempting restart')
    ensureProxyRunning()
  }
})

process.on('unhandledRejection', (reason) => {
  console.error('[Server] Unhandled Rejection:', reason)
})

// ─── Signal Handlers ──────────────────────────────────────────────
// On HF Spaces, SIGTERM means the container is shutting down.
// We keep alive to avoid premature termination, but log the signal.
process.on('SIGTERM', () => {
  console.log('[Server] Received SIGTERM - keeping alive (HF Spaces lifecycle)')
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

// ─── Proxy Watchdog ─────────────────────────────────────────────
// Ensures the FCC model-discovery proxy on port 8082 stays running.
// Checks every 30 seconds and auto-restarts if the proxy is down.
// Uses async exec() to avoid blocking the event loop.
const PROXY_PORT = 8082
let proxyCheckInterval: NodeJS.Timeout | null = null
let lastProxyCheckOk = false

async function ensureProxyRunning(): Promise<void> {
  try {
    const result = await new Promise<string>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('timeout')), 4000)
      exec(`curl -s --max-time 3 http://localhost:${PROXY_PORT}/health`, { timeout: 5000 }, (err, stdout) => {
        clearTimeout(timeout)
        if (err) reject(err)
        else resolve(stdout)
      })
    })
    if (result.includes('healthy')) {
      lastProxyCheckOk = true
      return // Proxy is running fine
    }
  } catch {
    // Proxy is not responding — restart it
  }
  if (!lastProxyCheckOk) {
    console.log('[Server] Proxy health check failed — attempting restart')
  }
  lastProxyCheckOk = false
  await startProxy()
}

async function startProxy(): Promise<void> {
  const APP_HOME_LOCAL = process.env.APP_HOME || process.env.HOME || '/home/z'
  const proxyScriptDocker = '/home/cloudshell/scripts/fcc-model-discovery-proxy.js'
  const proxyScriptLocal = join(process.cwd(), 'scripts', 'fcc-model-discovery-proxy.cjs')
  const proxyPath = existsSync(proxyScriptDocker) ? proxyScriptDocker : (existsSync(proxyScriptLocal) ? proxyScriptLocal : '')

  if (!proxyPath) {
    console.warn('[Server] No proxy script found — proxy watchdog disabled')
    return
  }

  // Kill existing proxy on port (use fuser instead of pkill to avoid killing other processes)
  try {
    await new Promise<void>((resolve) => {
      exec(`fuser -k ${PROXY_PORT}/tcp 2>/dev/null; sleep 0.5`, { timeout: 5000 }, () => resolve())
    })
  } catch {}

  const keyEnv = process.env.NVIDIA_NIM_API_KEY ? `NVIDIA_NIM_API_KEY="${process.env.NVIDIA_NIM_API_KEY}" ` : ''
  const modelEnv = `ANTHROPIC_MODEL="${process.env.ANTHROPIC_MODEL || 'claude-opus-4-5'}" `

  try {
    await new Promise<void>((resolve, reject) => {
      exec(
        `cd ${APP_HOME_LOCAL} && ${keyEnv}${modelEnv}FCC_PROXY_PORT=${PROXY_PORT} nohup node ${proxyPath} > /tmp/fcc-model-proxy.log 2>&1 &`,
        { timeout: 5000, shell: '/bin/bash' },
        (err) => {
          if (err) reject(err)
          else resolve()
        }
      )
    })
    console.log('[Server] Proxy restart initiated')
    // Wait a bit for proxy to start before next health check
    await new Promise(r => setTimeout(r, 3000))
  } catch (err) {
    console.error('[Server] Proxy restart failed:', err)
  }
}

function startProxyWatchdog(): void {
  // Initial check after 5 seconds (give proxy time to start from entrypoint)
  setTimeout(() => {
    ensureProxyRunning().catch(err => console.error('[Server] Initial proxy check error:', err))
  }, 5000)

  // Periodic check every 30 seconds (async, non-blocking)
  proxyCheckInterval = setInterval(() => {
    ensureProxyRunning().catch(err => console.error('[Server] Proxy watchdog error:', err))
  }, 30 * 1000)

  console.log('[Server] Proxy watchdog started (check interval: 30s)')
}

// ─── Configuration ───────────────────────────────────────────────
const PORT = parseInt(process.env.APP_PORT || process.env.PORT || '3000', 10)
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
  // Use async execFile via child_process to avoid blocking the event loop.
  // We just set running=false optimistically and let the callback update it.
  try {
    exec('docker info 2>/dev/null', { timeout: 5000 }, (err: any) => {
      serviceInstallStatus.docker.running = !err
    })
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
      httpGet(SELF_PING_URL, (res: any) => {
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
const TOOLS = ['git', 'docker', 'curl', 'wget', 'vim', 'nano', 'node', 'npm', 'python3', 'pip3', 'sudo', 'claude', 'opencode']

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
  claude: 'echo "Claude Code: type fcc-claude (via proxy) or claude (raw, may ask login)"',
  opencode: 'echo "OpenCode CLI is pre-installed. Just type: opencode"',
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

// ─── Tool status cache (performance: avoid 13 execSync calls per tools:check event) ──
// Refreshed in the background every 60s. Serves all clients from cache so they
// get an instant response instead of triggering 13 `which` + 13 `<tool> --version`
// shell spawns on every page load.
let toolsStatusCache: { name: string; installed: boolean; version: string; displayName?: string }[] = []
let toolsStatusCacheTime = 0
const TOOLS_CACHE_TTL = 60_000  // 60 seconds

function refreshToolsStatusCache() {
  try {
    toolsStatusCache = TOOLS.map(checkTool)
    toolsStatusCacheTime = Date.now()
  } catch (err) {
    console.error('[Tools] Error refreshing cache:', err)
  }
}

// Initial population
refreshToolsStatusCache()
// Background refresh — never blocks the event loop on client requests
setInterval(refreshToolsStatusCache, TOOLS_CACHE_TTL)

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
        // Hide dotfiles by default, but always show .tools (symlinked
        // install dirs) and .dockerfiles (legacy) so users can browse
        // their manually-installed tools without toggling hidden files.
        if (!entry.name.startsWith('.')) return true
        return entry.name === '.tools' || entry.name === '.dockerfiles'
      })
      .map((entry) => {
        const fullPath = join(dirPath, entry.name)
        try {
          const stats = statSync(fullPath)
          // Use lstat to detect symlinks — entry.isDirectory() returns
          // false for symlinks to directories, so we need to check both.
          let isDir = entry.isDirectory()
          try {
            const lstats = lstatSync(fullPath)
            if (lstats.isSymbolicLink()) {
              // Follow the symlink to determine if it points to a dir
              isDir = stats.isDirectory()
            }
          } catch {}
          return { name: entry.name, type: (isDir ? 'directory' : 'file') as 'file' | 'directory', size: stats.size, modified: stats.mtime.toISOString() }
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
      // SECURITY: Per-user API keys take priority over global env vars.
      // Each user configures their own key via Settings panel — no shared keys.
      ...(process.env.ANTHROPIC_BASE_URL ? { ANTHROPIC_BASE_URL: process.env.ANTHROPIC_BASE_URL } : {}),
      ...(process.env.ANTHROPIC_MODEL ? { ANTHROPIC_MODEL: process.env.ANTHROPIC_MODEL } : {}),
      ...(process.env.CLAUDE_CODE_USE_AUTH_TOKEN ? { CLAUDE_CODE_USE_AUTH_TOKEN: process.env.CLAUDE_CODE_USE_AUTH_TOKEN } : {}),
      ...(process.env.CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY ? { CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY: process.env.CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY } : {}),
      ...(process.env.CLAUDE_CODE_AUTO_COMPACT_WINDOW ? { CLAUDE_CODE_AUTO_COMPACT_WINDOW: process.env.CLAUDE_CODE_AUTO_COMPACT_WINDOW } : {}),
      ...(process.env.ANTHROPIC_API_KEY ? { ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY } : {}),
      // Claude Code alias env vars — route built-in opus/sonnet/haiku shorthands
      // to our Claude-compatible proxy model IDs. These ensure the /model picker
      // and tier-based routing work correctly with the NVIDIA NIM proxy.
      ...(process.env.ANTHROPIC_DEFAULT_OPUS_MODEL ? { ANTHROPIC_DEFAULT_OPUS_MODEL: process.env.ANTHROPIC_DEFAULT_OPUS_MODEL } : { ANTHROPIC_DEFAULT_OPUS_MODEL: 'claude-opus-4-5' }),
      ...(process.env.ANTHROPIC_DEFAULT_SONNET_MODEL ? { ANTHROPIC_DEFAULT_SONNET_MODEL: process.env.ANTHROPIC_DEFAULT_SONNET_MODEL } : { ANTHROPIC_DEFAULT_SONNET_MODEL: 'claude-sonnet-4-5' }),
      ...(process.env.ANTHROPIC_DEFAULT_HAIKU_MODEL ? { ANTHROPIC_DEFAULT_HAIKU_MODEL: process.env.ANTHROPIC_DEFAULT_HAIKU_MODEL } : { ANTHROPIC_DEFAULT_HAIKU_MODEL: 'claude-sonnet-4-5-mini' }),
      ...(process.env.CLAUDE_CODE_SUBAGENT_MODEL ? { CLAUDE_CODE_SUBAGENT_MODEL: process.env.CLAUDE_CODE_SUBAGENT_MODEL } : { CLAUDE_CODE_SUBAGENT_MODEL: 'claude-sonnet-4-5' }),
      ...(process.env.CLAUDE_CODE_DISABLE_ADAPTIVE_THINKING ? { CLAUDE_CODE_DISABLE_ADAPTIVE_THINKING: process.env.CLAUDE_CODE_DISABLE_ADAPTIVE_THINKING } : { CLAUDE_CODE_DISABLE_ADAPTIVE_THINKING: '1' }),
      // Per-user NVIDIA key isolation:
      // - Each user's NVIDIA key is injected as NVIDIA_NIM_API_KEY in their terminal
      // - ANTHROPIC_AUTH_TOKEN is set to the user's NVIDIA key so the proxy can use it
      //   (Claude Code sends ANTHROPIC_AUTH_TOKEN as x-api-key header)
      // - If user has no personal key, fall back to global env var
      // - This ensures NO key leakage between user profiles
      ...(userId ? (() => { 
        const keys = getUserApiKeys(userId)
        if (keys.nvidiaApiKey) {
          return {
            NVIDIA_NIM_API_KEY: keys.nvidiaApiKey,
            // Set ANTHROPIC_AUTH_TOKEN to user's NVIDIA key so the proxy
            // can extract it from the x-api-key header for per-user isolation
            ANTHROPIC_AUTH_TOKEN: keys.nvidiaApiKey,
          }
        }
        // No personal key — fall back to global key if available
        const fallback = process.env.NVIDIA_NIM_API_KEY
        return fallback
          ? { NVIDIA_NIM_API_KEY: fallback, ANTHROPIC_AUTH_TOKEN: fallback }
          : { ANTHROPIC_AUTH_TOKEN: 'fcc-no-auth' }
      })() : (() => {
        const fallback = process.env.NVIDIA_NIM_API_KEY
        return fallback
          ? { NVIDIA_NIM_API_KEY: fallback, ANTHROPIC_AUTH_TOKEN: fallback }
          : { ANTHROPIC_AUTH_TOKEN: process.env.ANTHROPIC_AUTH_TOKEN || 'fcc-no-auth' }
      })()),
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
    '\x1b[32m║\x1b[0m  \x1b[1;32mfcc-claude\x1b[0m           - Launch Claude Code via proxy (rec!)  \x1b[32m║\x1b[0m',
    '\x1b[32m║\x1b[0m  \x1b[1;32mclaude\x1b[0m              - Claude Code CLI (raw, may ask login)\x1b[32m║\x1b[0m',
    '\x1b[32m║\x1b[0m  \x1b[1;36mclaude-show\x1b[0m        - Show current Claude config         \x1b[32m║\x1b[0m',
    '\x1b[32m║\x1b[0m  \x1b[1;36mclaude-set-nvidia-key\x1b[0m - Change NVIDIA API key           \x1b[32m║\x1b[0m',
    '\x1b[32m║\x1b[0m  \x1b[1;36mclaude-set-model\x1b[0m   - Change model only                 \x1b[32m║\x1b[0m',
    '\x1b[32m║\x1b[0m  \x1b[1;36mclaude-test\x1b[0m        - Test proxy + NVIDIA API           \x1b[32m║\x1b[0m',
    '\x1b[32m║\x1b[0m  \x1b[1;36mfcc-start/stop/status\x1b[0m - Manage FCC proxy               \x1b[32m║\x1b[0m',
    '\x1b[32m║\x1b[0m  \x1b[1;36mreload\x1b[0m              - Refresh PATH after curl|bash      \x1b[32m║\x1b[0m',
    '\x1b[32m║\x1b[0m  \x1b[1;36mwhereis-tool\x1b[0m       - Find a freshly-installed tool     \x1b[32m║\x1b[0m',
    '\x1b[32m║\x1b[0m  \x1b[1;36mcloudshell-test\x1b[0m    - Test all commands                  \x1b[32m║\x1b[0m',
    '\x1b[32m║\x1b[0m  \x1b[1;36mnpm-global-help\x1b[0m    - npm install -g help                \x1b[32m║\x1b[0m',
    '\x1b[32m╚══════════════════════════════════════════════════════════════════╝\x1b[0m',
    '',
    '\x1b[33m  Claude Code: type \x1b[1mfcc-claude\x1b[0m to start (via NVIDIA NIM proxy)\x1b[0m',
    '\x1b[33m  Free-Claude-Code proxy is running on localhost:8082\x1b[0m',
    '\x1b[2m  Architecture: Claude Code → localhost:8082 (proxy) → NVIDIA NIM\x1b[0m',
    '\x1b[2m  ⚠ Do NOT use raw "claude" — use "fcc-claude" to skip login prompt\x1b[0m',
    '\x1b[2m  Default model: claude-opus-4-5 → z-ai/glm-5.2 (via proxy mapping)\x1b[0m',
    '\x1b[2m  Use /model inside Claude Code to see all available NVIDIA models\x1b[0m',
    '\x1b[2m  Change your NVIDIA API key:\x1b[0m',
    '\x1b[2m    claude-set-nvidia-key "nvapi-your-key"   (change NVIDIA key)\x1b[0m',
    '\x1b[2m    claude-set-model "claude-opus-4-5"       (change model)\x1b[0m',
    '\x1b[2m    claude-show                              (show current config)\x1b[0m',
    '\x1b[2m    claude-test                              (test proxy + NVIDIA API)\x1b[0m',
    '\x1b[2m    fcc-start / fcc-stop / fcc-status        (manage proxy)\x1b[0m',
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
  setInterval(updateServiceStatus, 60000)  // 60s — was 15s (too aggressive, blocks event loop)

  const mainServer = createServer(async (req, res) => {
    const url = req.url || '/'

    if (url === '/api/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: true, uptime: process.uptime() }))
      return
    }

    // B2 connectivity diagnostic endpoint — check if B2 storage is working
    if (url === '/api/b2-status') {
      try {
        const result = await s3TestConnection()
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(result))
      } catch (err: any) {
        res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: false, error: err.message }))
      }
      return
    }

    if (url === '/api/services') {
      // Don't call updateServiceStatus() here — it would block the event loop
      // with execSync. The background interval keeps status fresh enough.
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(serviceInstallStatus))
      return
    }

    // ─── File Download API ──────────────────────────────────────────
    if (url.startsWith('/api/files/download')) {
      try {
        const parsedUrl = new URL(url, `http://${req.headers.host || 'localhost'}`)
        const token = parsedUrl.searchParams.get('token')
        const filePath = parsedUrl.searchParams.get('path') || ''

        if (!token) {
          res.writeHead(403, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'Authentication required' }))
          return
        }

        // Authenticate via JWT token
        let authToken = token
        if (token.includes('jasbol-token=')) {
          const match = token.match(/jasbol-token=([^;]+)/)
          if (match) authToken = match[1]
        }
        const decoded = verifyTokenBasic(authToken)
        if (!decoded) {
          res.writeHead(403, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'Invalid or expired token' }))
          return
        }

        // Resolve user's workspace
        const user = getUserById(decoded.userId)
        const workspaceDir = user ? getUserWorkspaceDir(user) : DEFAULT_WORKSPACE_DIR
        const resolvedPath = resolveWorkspacePath(filePath, workspaceDir)
        if (!resolvedPath) {
          res.writeHead(403, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'Path traversal not allowed' }))
          return
        }

        if (!existsSync(resolvedPath)) {
          res.writeHead(404, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'Path not found' }))
          return
        }

        const fileStat = statSync(resolvedPath)

        if (fileStat.isDirectory()) {
          // Stream as ZIP
          const dirName = basename(resolvedPath)
          res.writeHead(200, {
            'Content-Type': 'application/zip',
            'Content-Disposition': `attachment; filename="${dirName}.zip"; filename*=UTF-8''${encodeURIComponent(dirName)}.zip`,
          })
          const archive = archiver('zip', { zlib: { level: 6 } })
          archive.directory(resolvedPath, dirName)
          archive.pipe(res)
          archive.on('error', (err: any) => {
            console.error('[Download] Archive error:', err)
            res.end()
          })
          archive.finalize()
        } else {
          // Stream individual file with proper MIME type
          const fileName = basename(resolvedPath)
          const ext = fileName.split('.').pop()?.toLowerCase() || ''
          const mimeMap: Record<string, string> = {
            // Documents
            'pdf': 'application/pdf', 'doc': 'application/msword', 'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'xls': 'application/vnd.ms-excel', 'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'ppt': 'application/vnd.ms-powerpoint', 'pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
            'odt': 'application/vnd.oasis.opendocument.text', 'ods': 'application/vnd.oasis.opendocument.spreadsheet',
            'rtf': 'application/rtf', 'epub': 'application/epub+zip',
            // Images
            'png': 'image/png', 'jpg': 'image/jpeg', 'jpeg': 'image/jpeg', 'gif': 'image/gif',
            'svg': 'image/svg+xml', 'webp': 'image/webp', 'ico': 'image/x-icon', 'bmp': 'image/bmp',
            'tiff': 'image/tiff', 'tif': 'image/tiff', 'avif': 'image/avif',
            // Audio
            'mp3': 'audio/mpeg', 'wav': 'audio/wav', 'ogg': 'audio/ogg', 'flac': 'audio/flac', 'aac': 'audio/aac',
            // Video
            'mp4': 'video/mp4', 'webm': 'video/webm', 'avi': 'video/x-msvideo', 'mkv': 'video/x-matroska',
            'mov': 'video/quicktime', 'wmv': 'video/x-ms-wmv',
            // Archives
            'zip': 'application/zip', 'tar': 'application/x-tar', 'gz': 'application/gzip',
            '7z': 'application/x-7z-compressed', 'rar': 'application/vnd.rar', 'bz2': 'application/x-bzip2',
            // Code
            'js': 'text/javascript', 'ts': 'text/typescript', 'tsx': 'text/typescript', 'jsx': 'text/javascript',
            'py': 'text/x-python', 'rb': 'text/x-ruby', 'go': 'text/x-go', 'rs': 'text/x-rust',
            'java': 'text/x-java', 'c': 'text/x-c', 'cpp': 'text/x-c++', 'h': 'text/x-c',
            'html': 'text/html', 'css': 'text/css', 'scss': 'text/x-scss', 'less': 'text/x-less',
            'json': 'application/json', 'xml': 'application/xml', 'yaml': 'text/yaml', 'yml': 'text/yaml',
            'toml': 'text/x-toml', 'ini': 'text/x-ini', 'conf': 'text/plain', 'sh': 'text/x-shellscript',
            'bash': 'text/x-shellscript', 'zsh': 'text/x-shellscript', 'fish': 'text/x-shellscript',
            'sql': 'text/x-sql', 'graphql': 'text/x-graphql',
            // Text
            'md': 'text/markdown', 'txt': 'text/plain', 'csv': 'text/csv', 'log': 'text/plain',
            'env': 'text/plain', 'gitignore': 'text/plain', 'dockerignore': 'text/plain',
            // Fonts
            'woff': 'font/woff', 'woff2': 'font/woff2', 'ttf': 'font/ttf', 'otf': 'font/otf', 'eot': 'application/vnd.ms-fontobject',
          }
          const contentType = mimeMap[ext] || 'application/octet-stream'
          // Allow inline viewing for viewable types (PDF, images, text, video, audio)
          const isInlineViewable = contentType.startsWith('text/') || contentType === 'application/json' ||
            contentType === 'image/svg+xml' || contentType === 'application/pdf' ||
            contentType.startsWith('image/') || contentType.startsWith('video/') || contentType.startsWith('audio/')
          // Check if preview mode is requested
          const isPreview = parsedUrl.searchParams.get('preview') === 'true'
          const disposition = (isPreview && isInlineViewable) ? 'inline' : 'attachment'
          res.writeHead(200, {
            'Content-Type': contentType,
            'Content-Disposition': `${disposition}; filename="${fileName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
            'Content-Length': fileStat.size,
            // Allow CORS for preview mode
            ...(isPreview ? { 'Access-Control-Allow-Origin': '*' } : {}),
          })
          const stream = createReadStream(resolvedPath)
          stream.pipe(res)
          stream.on('error', (err: any) => {
            console.error('[Download] Stream error:', err)
            res.end()
          })
        }
      } catch (err) {
        console.error('[Download] Error:', err)
        res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Internal server error' }))
      }
      return
    }

    // ─── File Upload API ─────────────────────────────────────────────
    if (url === '/api/files/upload' && req.method === 'POST') {
      try {
        // Authenticate via Authorization header
        const authHeader = req.headers.authorization || ''
        let authToken = authHeader.replace(/^Bearer\s+/i, '')
        if (!authToken) {
          // Try cookie
          const cookie = req.headers.cookie || ''
          const match = cookie.match(/(?:__Host-)?jasbol-token=([^;]+)/)
          if (match) authToken = match[1]
        }
        if (!authToken) {
          res.writeHead(403, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'Authentication required' }))
          return
        }

        const decoded = verifyTokenBasic(authToken)
        if (!decoded) {
          res.writeHead(403, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'Invalid or expired token' }))
          return
        }

        const user = getUserById(decoded.userId)
        const workspaceDir = user ? getUserWorkspaceDir(user) : DEFAULT_WORKSPACE_DIR

        // Parse target path from query
        const parsedUrl = new URL(url, `http://${req.headers.host || 'localhost'}`)
        const targetPath = parsedUrl.searchParams.get('path') || ''
        const resolvedTarget = resolveWorkspacePath(targetPath, workspaceDir)
        if (!resolvedTarget) {
          res.writeHead(403, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'Path traversal not allowed' }))
          return
        }

        // Ensure target directory exists
        const targetDir = existsSync(resolvedTarget) && statSync(resolvedTarget).isDirectory()
          ? resolvedTarget
          : resolve(resolvedTarget, '..')
        if (!existsSync(targetDir)) {
          mkdirSync(targetDir, { recursive: true })
        }

        const savedFiles: string[] = []
        const busboy = Busboy({
          headers: req.headers,
          limits: { fileSize: 100 * 1024 * 1024 }, // 100MB limit per file
        })

        busboy.on('file', (fieldname: string, file: any, info: { filename: string; encoding: string; mimeType: string }) => {
          const { filename } = info
          if (!filename) { file.resume(); return }
          // Sanitize filename - remove path separators
          const safeName = filename.replace(/[/\\\\]/g, '_')
          const savePath = join(targetDir, safeName)
          const writeStream = createWriteStream(savePath)
          // Collect buffer for S3 upload (need the full content to upload to B2)
          const chunks: Buffer[] = []
          file.on('data', (chunk: Buffer) => chunks.push(chunk))
          file.pipe(writeStream)
          writeStream.on('finish', () => {
            savedFiles.push(safeName)
            // Persist uploaded file to B2 asynchronously
            const fileBuffer = Buffer.concat(chunks)
            const mimeType = info.mimeType || 'application/octet-stream'
            s3UploadWorkspaceFile(savePath, fileBuffer, workspaceDir, mimeType).catch(err =>
              console.error('[S3] Failed to persist uploaded file:', err)
            )
          })
          writeStream.on('error', (err: any) => {
            console.error('[Upload] Write error for', safeName, err)
          })
        })

        busboy.on('finish', () => {
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ success: true, files: savedFiles, count: savedFiles.length }))
        })

        busboy.on('error', (err: any) => {
          console.error('[Upload] Busboy error:', err)
          res.writeHead(500, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'Upload parse error' }))
        })

        req.pipe(busboy)
      } catch (err) {
        console.error('[Upload] Error:', err)
        res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Internal server error' }))
      }
      return
    }

    handle(req, res)
  })

  const io = new SocketIOServer(mainServer, {
    cors: { origin: true, methods: ['GET', 'POST'], credentials: true },
    path: '/socket.io/',
    pingInterval: 25000,  // 25s — was 15s (less polling overhead on slow links)
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

    const decoded = verifyTokenBasic(authToken)
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
    socket.on('file:read', async (data: { path: string }) => {
      const resolvedPath = resolveWorkspacePath(data.path, userWorkspace)
      if (!resolvedPath) {
        socket.emit('file:content', { path: data.path, content: null, error: 'Path traversal not allowed' })
        return
      }
      try {
        if (!existsSync(resolvedPath)) {
          // Local file missing — try to download from B2 (ephemeral container recovery)
          const b2Content = await s3DownloadWorkspaceFile(resolvedPath, userWorkspace)
          if (b2Content !== null) {
            // Save to local disk for future fast reads, then return content
            const parentDir = resolve(resolvedPath, '..')
            if (!existsSync(parentDir)) mkdirSync(parentDir, { recursive: true })
            writeFileSync(resolvedPath, b2Content, 'utf-8')
            console.log(`[S3] Restored missing file from B2: ${resolvedPath}`)
            socket.emit('file:content', { path: data.path, content: b2Content, error: null })
            return
          }
          socket.emit('file:content', { path: data.path, content: null, error: 'File not found (neither local nor in B2)' })
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
        // Persist to B2 asynchronously
        s3UploadWorkspaceFile(resolvedPath, data.content, userWorkspace, 'text/plain').catch(err =>
          console.error('[S3] Failed to persist file:write:', err)
        )
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
        // Auto-create the workspace directory if it doesn't exist yet.
        // This happens on first login for a brand-new user, or after a
        // container restart if the workspace volume was wiped.
        if (!existsSync(resolvedPath)) {
          try {
            mkdirSync(resolvedPath, { recursive: true })
          } catch (mkdirErr) {
            // If mkdir fails (e.g. permission denied on parent), report it
            // clearly instead of returning a confusing "Directory not found".
            socket.emit('file:listing', { path: inputPath, files: [], error: `Cannot create workspace directory: ${mkdirErr}` })
            return
          }
        }
        // When listing the workspace root, ensure tool symlinks exist so
        // manually-installed tools (~/.local/bin, ~/.npm-global/bin,
        // ~/.cargo/bin, ~/.opencode/bin, etc.) are visible inside the
        // workspace under the .tools/ directory. This runs on every root
        // listing so newly-installed tools appear immediately.
        if (inputPath === '') {
          try { ensureToolSymlinks(userWorkspace) } catch { /* best-effort */ }
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
          rmSync(resolvedPath, { recursive: true, force: true })
        } else {
          unlinkSync(resolvedPath)
        }
        socket.emit('file:deleted', { path: data.path, error: null })
        socket.emit('files:changed', { path: data.path, workspace: userWorkspace })
        // Remove from B2 asynchronously
        s3DeleteWorkspaceFile(resolvedPath, userWorkspace).catch(err =>
          console.error('[S3] Failed to delete file from B2:', err)
        )
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
        renameSync(resolvedOld, resolvedNew)
        socket.emit('file:renamed', { path: data.oldPath, error: null })
        socket.emit('files:changed', { path: data.newPath, workspace: userWorkspace })
        // Rename in B2 asynchronously
        s3RenameWorkspaceFile(resolvedOld, resolvedNew, userWorkspace).catch(err =>
          console.error('[S3] Failed to rename file in B2:', err)
        )
      } catch (err) {
        socket.emit('file:renamed', { path: data.oldPath, error: String(err) })
      }
    })

    // Workspace: Info — returns absolute workspace path so the file manager can display it
    socket.on('workspace:info', () => {
      socket.emit('workspace:info', { workspace: userWorkspace, defaultWorkspace: DEFAULT_WORKSPACE_DIR })
    })

    // Tools: Check — serves from cache (refreshed every 60s in background).
    // `forceRefresh=true` opts out of cache for the manual "refresh" button.
    socket.on('tools:check', (data?: { forceRefresh?: boolean }) => {
      try {
        if (data?.forceRefresh || Date.now() - toolsStatusCacheTime > TOOLS_CACHE_TTL) {
          refreshToolsStatusCache()
        }
        socket.emit('tools:status', toolsStatusCache)
      } catch (err) {
        console.error('[Tools] Error checking tools:', err)
        socket.emit('tools:status', toolsStatusCache || [])
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
    console.log(`[Server]   HOME=${process.env.HOME} APP_HOME=${process.env.APP_HOME} USERS_DIR=${process.env.USERS_DIR || '(default)'} cwd=${process.cwd()}`)

    // ── Start proxy watchdog ──
    startProxyWatchdog()

    // ── Start periodic SQLite backup to B2 ──
    const dbPath = process.env.DATABASE_URL?.replace('file:', '') || join(process.cwd(), 'db', 'custom.db')
    startPeriodicDbBackup(dbPath)
  })

  mainServer.on('error', (err: any) => {
    console.error(`[Server] Error starting server:`, err)
  })
}).catch((err) => {
  console.error('[Server] Failed to prepare Next.js:', err)
  process.exit(1)
})

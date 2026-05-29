import { createServer } from 'http'
import { Server } from 'socket.io'
import { spawn } from 'node-pty'
import { v4 as uuidv4 } from 'uuid'
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, statSync } from 'fs'
import { join, resolve, relative } from 'path'
import { execSync } from 'child_process'

// ─── Global Error Handlers ───────────────────────────────────────
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err)
})

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Rejection:', reason)
})

// ─── Configuration ───────────────────────────────────────────────
const PORT = 3003
const WORKSPACE_DIR = '/home/z/my-project/workspace'
const SHELL = '/bin/bash'

// ─── Ensure workspace directories exist ──────────────────────────
function ensureWorkspaceDirs() {
  if (!existsSync(WORKSPACE_DIR)) {
    mkdirSync(WORKSPACE_DIR, { recursive: true })
    console.log(`Created workspace directory: ${WORKSPACE_DIR}`)
  }
  const dockerfilesDir = join(WORKSPACE_DIR, '.dockerfiles')
  if (!existsSync(dockerfilesDir)) {
    mkdirSync(dockerfilesDir, { recursive: true })
    console.log(`Created .dockerfiles directory: ${dockerfilesDir}`)
  }
  // Create a sample Dockerfile
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
    console.log(`Created sample Dockerfile: ${sampleDockerfile}`)
  }
}

ensureWorkspaceDirs()

// ─── HTTP + Socket.io Server ─────────────────────────────────────
const httpServer = createServer()
const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
  pingTimeout: 60000,
  pingInterval: 25000,
  maxHttpBufferSize: 1e6, // 1MB
  connectTimeout: 10000,
})

// ─── Session Storage ─────────────────────────────────────────────
interface TerminalSession {
  id: string
  pty: any
  socketId: string
}

const sessions = new Map<string, TerminalSession>()
const socketSessions = new Map<string, Set<string>>() // socketId -> Set of sessionIds

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
    // First check if the command exists
    const whichOutput = execSync(`which ${name} 2>/dev/null || echo "not-found"`, {
      encoding: 'utf-8',
      timeout: 5000,
    }).trim()

    if (whichOutput.includes('not-found')) {
      return { name, installed: false, version: '' }
    }

    // Get version - use different flags for different tools
    let versionArg = '--version'
    if (name === 'docker') versionArg = '--version'

    try {
      const versionOutput = execSync(`${name} ${versionArg} 2>&1`, {
        encoding: 'utf-8',
        timeout: 5000,
      }).trim()

      const firstLine = versionOutput.split('\n')[0]
      return { name, installed: true, version: firstLine.trim() }
    } catch {
      // which found it but version failed - still count as installed
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

  // Security check: ensure the resolved path is within workspace
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
        // Show .dockerfiles directory, hide other dotfiles
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

// ─── Cleanup sessions for a socket ───────────────────────────────
function cleanupSocketSessions(socketId: string) {
  const sessionIds = socketSessions.get(socketId)
  if (sessionIds) {
    for (const sessionId of sessionIds) {
      const session = sessions.get(sessionId)
      if (session) {
        try {
          session.pty.kill()
        } catch (err) {
          console.error(`Error killing PTY for session ${sessionId}:`, err)
        }
        sessions.delete(sessionId)
        console.log(`Cleaned up session ${sessionId} for disconnected socket ${socketId}`)
      }
    }
    socketSessions.delete(socketId)
  }
}

// ─── Socket.io Connection Handler ────────────────────────────────
io.on('connection', (socket) => {
  console.log(`Client connected: ${socket.id}`)
  socketSessions.set(socket.id, new Set())

  // ── Terminal: Create ─────────────────────────────────────────
  socket.on('terminal:create', (data?: { cols?: number; rows?: number }) => {
    try {
      const sessionId = uuidv4()
      const cols = data?.cols || 80
      const rows = data?.rows || 24

      console.log(`Creating PTY session ${sessionId} (${cols}x${rows})`)

      const pty = spawn(SHELL, [], {
        name: 'xterm-256color',
        cols,
        rows,
        cwd: WORKSPACE_DIR,
        env: {
          ...process.env,
          TERM: 'xterm-256color',
          PATH: '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/usr/games:/usr/local/games:/home/z/.local/bin',
          HOME: '/home/z',
          USER: 'z',
          LANG: 'en_US.UTF-8',
          EDITOR: 'vim',
        },
      })

      const session: TerminalSession = {
        id: sessionId,
        pty,
        socketId: socket.id,
      }

      sessions.set(sessionId, session)
      socketSessions.get(socket.id)?.add(sessionId)

      // PTY data output -> send to client
      pty.onData((data: string) => {
        socket.emit('terminal:output', { sessionId, data })
      })

      // PTY exit - auto restart
      pty.onExit(({ exitCode }: { exitCode: number }) => {
        console.log(`PTY exited for session ${sessionId} with code ${exitCode}`)
        socket.emit('terminal:output', {
          sessionId,
          data: `\r\n\x1b[33m[Process exited with code ${exitCode}. Starting new shell...]\x1b[0m\r\n`,
        })

        // Clean up old session
        sessions.delete(sessionId)
        socketSessions.get(socket.id)?.delete(sessionId)

        // Auto-create a new shell
        try {
          const newPty = spawn(SHELL, [], {
            name: 'xterm-256color',
            cols,
            rows,
            cwd: WORKSPACE_DIR,
            env: {
              ...process.env,
              TERM: 'xterm-256color',
              PATH: '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/usr/games:/usr/local/games:/home/z/.local/bin',
              HOME: '/home/z',
              USER: 'z',
              LANG: 'en_US.UTF-8',
              EDITOR: 'vim',
            },
          })

          const newSession: TerminalSession = {
            id: sessionId,
            pty: newPty,
            socketId: socket.id,
          }

          sessions.set(sessionId, newSession)
          socketSessions.get(socket.id)?.add(sessionId)

          newPty.onData((data: string) => {
            socket.emit('terminal:output', { sessionId, data })
          })

          newPty.onExit(({ exitCode: exitCode2 }: { exitCode: number }) => {
            console.log(`Restarted PTY also exited for session ${sessionId} with code ${exitCode2}`)
            socket.emit('terminal:output', {
              sessionId,
              data: `\r\n\x1b[31m[Process exited with code ${exitCode2}]\x1b[0m\r\n`,
            })
            sessions.delete(sessionId)
            socketSessions.get(socket.id)?.delete(sessionId)
          })

          console.log(`Restarted PTY for session ${sessionId}`)
        } catch (restartErr) {
          console.error(`Failed to restart PTY for session ${sessionId}:`, restartErr)
        }
      })

      socket.emit('terminal:created', { sessionId })
      console.log(`Terminal session created: ${sessionId} for socket ${socket.id}`)
    } catch (err) {
      console.error('Error creating terminal session:', err)
      socket.emit('terminal:created', { sessionId: null, error: String(err) })
    }
  })

  // ── Terminal: Input ──────────────────────────────────────────
  socket.on('terminal:input', (data: { sessionId: string; data: string }) => {
    const { sessionId, data: inputData } = data
    const session = sessions.get(sessionId)

    if (session) {
      try {
        session.pty.write(inputData)
      } catch (err) {
        console.error(`Error writing to PTY for session ${sessionId}:`, err)
      }
    } else {
      console.warn(`Received input for unknown session: ${sessionId}`)
    }
  })

  // ── Terminal: Resize ─────────────────────────────────────────
  socket.on('terminal:resize', (data: { sessionId: string; cols: number; rows: number }) => {
    const { sessionId, cols, rows } = data
    const session = sessions.get(sessionId)

    if (session) {
      try {
        session.pty.resize(cols, rows)
      } catch (err) {
        console.error(`Error resizing PTY for session ${sessionId}:`, err)
      }
    }
  })

  // ── Terminal: Destroy ────────────────────────────────────────
  socket.on('terminal:destroy', (data: { sessionId: string }) => {
    const { sessionId } = data
    const session = sessions.get(sessionId)

    if (session) {
      try {
        session.pty.kill()
        sessions.delete(sessionId)
        socketSessions.get(socket.id)?.delete(sessionId)
        console.log(`Terminal session destroyed: ${sessionId}`)
        socket.emit('terminal:destroyed', { sessionId })
      } catch (err) {
        console.error(`Error destroying PTY for session ${sessionId}:`, err)
        socket.emit('terminal:destroyed', { sessionId, error: String(err) })
      }
    } else {
      socket.emit('terminal:destroyed', { sessionId, error: 'Session not found' })
    }
  })

  // ── File: Read ───────────────────────────────────────────────
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
        socket.emit('file:content', { path: inputPath, content: null, error: 'Path is a directory, not a file' })
        return
      }

      const content = readFileSync(resolvedPath, 'utf-8')
      socket.emit('file:content', { path: inputPath, content, error: null })
    } catch (err) {
      console.error(`Error reading file ${inputPath}:`, err)
      socket.emit('file:content', { path: inputPath, content: null, error: String(err) })
    }
  })

  // ── File: Write ──────────────────────────────────────────────
  socket.on('file:write', (data: { path: string; content: string }) => {
    const { path: inputPath, content } = data
    const resolvedPath = resolveWorkspacePath(inputPath)

    if (!resolvedPath) {
      socket.emit('file:written', { path: inputPath, error: 'Path traversal not allowed' })
      return
    }

    try {
      const parentDir = resolve(resolvedPath, '..')
      if (!existsSync(parentDir)) {
        mkdirSync(parentDir, { recursive: true })
      }

      writeFileSync(resolvedPath, content, 'utf-8')
      socket.emit('file:written', { path: inputPath, error: null })
      console.log(`File written: ${inputPath}`)
    } catch (err) {
      console.error(`Error writing file ${inputPath}:`, err)
      socket.emit('file:written', { path: inputPath, error: String(err) })
    }
  })

  // ── File: List ───────────────────────────────────────────────
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
        socket.emit('file:listing', { path: inputPath, files: [], error: 'Path is not a directory' })
        return
      }

      const files = listDirectory(resolvedPath)
      socket.emit('file:listing', { path: inputPath, files, error: null })
    } catch (err) {
      console.error(`Error listing directory ${inputPath}:`, err)
      socket.emit('file:listing', { path: inputPath, files: [], error: String(err) })
    }
  })

  // ── Tools: Check ─────────────────────────────────────────────
  socket.on('tools:check', () => {
    try {
      const toolsStatus = TOOLS.map(checkTool)
      socket.emit('tools:status', toolsStatus)
      console.log(`Tools check completed for socket ${socket.id}`)
    } catch (err) {
      console.error('Error checking tools:', err)
      socket.emit('tools:status', [])
    }
  })

  // ── Tools: Install ───────────────────────────────────────────
  socket.on('tools:install', (data: { tool: string }) => {
    const { tool } = data
    const command = TOOL_INSTALL_COMMANDS[tool]

    if (command) {
      socket.emit('tools:install-command', { tool, command })
    } else {
      socket.emit('tools:install-command', {
        tool,
        command: `sudo apt-get update && sudo apt-get install -y ${tool}`,
      })
    }
  })

  // ── Ping (for latency measurement) ──────────────────────────
  socket.on('ping', (callback) => {
    if (typeof callback === 'function') {
      callback()
    }
  })

  // ── Disconnect ───────────────────────────────────────────────
  socket.on('disconnect', (reason) => {
    console.log(`Client disconnected: ${socket.id} (reason: ${reason})`)
    cleanupSocketSessions(socket.id)
  })

  // ── Error ────────────────────────────────────────────────────
  socket.on('error', (error) => {
    console.error(`Socket error (${socket.id}):`, error)
  })
})

// ─── Start Server ────────────────────────────────────────────────
httpServer.listen(PORT, '::', () => {
  console.log(`Terminal service running on port ${PORT}`)
  console.log(`Workspace directory: ${WORKSPACE_DIR}`)
  console.log(`Shell: ${SHELL}`)
})

// ─── Graceful Shutdown ───────────────────────────────────────────
function gracefulShutdown(signal: string) {
  console.log(`Received ${signal}, shutting down terminal service...`)

  for (const [sessionId, session] of sessions) {
    try {
      session.pty.kill()
      console.log(`Killed PTY session: ${sessionId}`)
    } catch (err) {
      console.error(`Error killing PTY session ${sessionId}:`, err)
    }
  }
  sessions.clear()
  socketSessions.clear()

  httpServer.close(() => {
    console.log('Terminal service shut down')
    process.exit(0)
  })

  setTimeout(() => {
    console.error('Forcing exit after timeout')
    process.exit(1)
  }, 5000)
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'))
process.on('SIGINT', () => gracefulShutdown('SIGINT'))

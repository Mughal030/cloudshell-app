'use client'

import { useEffect, useRef, useCallback } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import '@xterm/xterm/css/xterm.css'

interface XtermTerminalProps {
  sessionId: string
  onOutput: (sessionId: string, handler: (data: string) => void) => () => void
  onClearBuffer: (sessionId: string, handler: () => void) => () => void
  sendInput: (sessionId: string, data: string) => void
  resizeTerminal: (sessionId: string, cols: number, rows: number) => void
  isActive: boolean
}

// ============================================
// Package Name Detection & Highlighting
// ============================================

// Known package manager commands (the word after this triggers package detection)
const PKG_COMMANDS = new Set([
  'npm', 'npx', 'yarn', 'pnpm', 'bun', 'deno',
  'pip', 'pip3', 'pipx', 'conda', 'mamba',
  'gem', 'cargo', 'go', 'apt', 'apt-get', 'dnf', 'yum', 'pacman', 'snap', 'flatpak',
  'brew', 'port',
  'gh', 'vercel', 'netlify',
])

// Sub-commands that precede a package name
const INSTALL_SUBCOMMANDS = new Set([
  'install', 'i', 'add', 'ci', 'update', 'upgrade',
  'uninstall', 'remove', 'rm', 'un',
  'install-package', 'get', 'require',
])

// Pre-installed packages (known to exist in the Docker image)
const PREINSTALLED_PACKAGES = new Set([
  // System tools
  'bash', 'sh', 'zsh', 'dash', 'curl', 'wget', 'git', 'ssh', 'scp', 'rsync',
  'nano', 'vim', 'vi', 'emacs', 'sed', 'awk', 'grep', 'find', 'tar', 'gzip',
  'unzip', 'zip', 'cat', 'less', 'more', 'head', 'tail', 'sort', 'uniq',
  'wc', 'diff', 'patch', 'make', 'cmake', 'gcc', 'g++', 'python3', 'python',
  'pip3', 'pip', 'node', 'npm', 'npx', 'yarn', 'pnpm',
  'jq', 'htop', 'top', 'ps', 'kill', 'nohup', 'screen', 'tmux',
  'ls', 'cp', 'mv', 'rm', 'mkdir', 'rmdir', 'chmod', 'chown', 'ln',
  'echo', 'printf', 'tee', 'xargs', 'env', 'export', 'source',
  'docker', 'docker-compose', 'kubectl',
  // Python packages (commonly pre-installed)
  'setuptools', 'wheel', 'pip', 'virtualenv', 'requests', 'flask', 'django',
  'numpy', 'pandas', 'scipy', 'matplotlib', 'pillow', 'openai', 'anthropic',
  'httpx', 'aiohttp', 'fastapi', 'uvicorn', 'pydantic', 'click', 'rich',
  'boto3', 'google-cloud', 'azure', 'sqlalchemy', 'redis', 'celery',
  // Node.js packages (commonly installed globally)
  'typescript', 'ts-node', 'eslint', 'prettier', 'webpack', 'vite', 'next',
  'react', 'vue', 'svelte', 'express', 'fastify', 'prisma',
  '@anthropic-ai/claude-code', '@vercel/cli', 'netlify-cli',
  'create-react-app', 'create-next-app', 'nodemon', 'pm2',
  'tailwindcss', 'postcss', 'autoprefixer',
  // Languages & Runtimes
  'go', 'rust', 'cargo', 'ruby', 'gem', 'java', 'javac',
  'bun', 'deno', 'clang', 'swift',
  // DevOps & Cloud
  'terraform', 'ansible', 'vault', 'consul', 'helm',
  'aws', 'gcloud', 'az',
  // Databases
  'mysql', 'psql', 'postgres', 'mongosh', 'redis-cli', 'sqlite3',
  // Build tools
  'gradle', 'maven', 'ant', 'bazel', 'ninja',
])

// ANSI color codes for highlighting
const ANSI = {
  cyan:     '\x1b[38;5;51m',   // Bright cyan for known packages
  gold:     '\x1b[38;5;220m',  // Gold for manually-installed packages
  green:    '\x1b[38;5;82m',   // Green for package commands
  magenta:  '\x1b[38;5;213m',  // Magenta for install sub-commands
  blue:     '\x1b[38;5;117m',  // Blue for flags/options
  dim:      '\x1b[38;5;60m',   // Dim blue for unknown packages
  reset:    '\x1b[0m',
  bold:     '\x1b[1m',
}

// Parse a command line and detect package names
function detectPackageSegments(line: string): Array<{ text: string; type: 'normal' | 'pkgcmd' | 'subcmd' | 'known-pkg' | 'unknown-pkg' | 'flag' }> {
  const tokens = line.trim().split(/\s+/)
  if (tokens.length === 0) return [{ text: line, type: 'normal' }]

  const segments: Array<{ text: string; type: 'normal' | 'pkgcmd' | 'subcmd' | 'known-pkg' | 'unknown-pkg' | 'flag' }> = []

  let isPackageContext = false
  let pastSubcommand = false
  let pos = 0

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]
    const startIdx = line.indexOf(token, pos)
    // Add whitespace before this token
    if (startIdx > pos) {
      segments.push({ text: line.substring(pos, startIdx), type: 'normal' })
    }

    if (i === 0) {
      // First token — check if it's a package manager
      if (PKG_COMMANDS.has(token)) {
        segments.push({ text: token, type: 'pkgcmd' })
        isPackageContext = true
      } else {
        segments.push({ text: token, type: 'normal' })
      }
    } else if (isPackageContext && !pastSubcommand && INSTALL_SUBCOMMANDS.has(token)) {
      // Install sub-command
      segments.push({ text: token, type: 'subcmd' })
      pastSubcommand = true
    } else if (isPackageContext && pastSubcommand) {
      // After subcommand — these are package names or flags
      if (token.startsWith('-')) {
        segments.push({ text: token, type: 'flag' })
      } else if (token.startsWith('@') || /^[a-zA-Z0-9@._\-/]+$/.test(token)) {
        // Looks like a package name
        const pkgName = token.startsWith('@') ? token : token.replace(/[=<>].*$/, '').split('@')[0]
        if (PREINSTALLED_PACKAGES.has(pkgName) || PREINSTALLED_PACKAGES.has(token)) {
          segments.push({ text: token, type: 'known-pkg' })
        } else {
          segments.push({ text: token, type: 'unknown-pkg' })
        }
      } else {
        segments.push({ text: token, type: 'normal' })
      }
    } else if (isPackageContext && !pastSubcommand) {
      // Before subcommand (e.g., npm run, npm test)
      if (INSTALL_SUBCOMMANDS.has(token)) {
        segments.push({ text: token, type: 'subcmd' })
        pastSubcommand = true
      } else if (token.startsWith('-')) {
        segments.push({ text: token, type: 'flag' })
      } else {
        // npm <command> without install — treat subsequent tokens as package-like
        pastSubcommand = true
        if (token.startsWith('-')) {
          segments.push({ text: token, type: 'flag' })
        } else {
          const pkgName = token.replace(/[=<>].*$/, '').split('@')[0]
          if (PREINSTALLED_PACKAGES.has(pkgName) || PREINSTALLED_PACKAGES.has(token)) {
            segments.push({ text: token, type: 'known-pkg' })
          } else {
            segments.push({ text: token, type: 'unknown-pkg' })
          }
        }
      }
    } else {
      segments.push({ text: token, type: 'normal' })
    }

    pos = startIdx + token.length
  }

  // Add any trailing whitespace
  if (pos < line.length) {
    segments.push({ text: line.substring(pos), type: 'normal' })
  }

  return segments
}

// Color a detected command line with ANSI codes for the PTY to render
function colorizeLine(line: string): string {
  const segments = detectPackageSegments(line)
  return segments.map(seg => {
    switch (seg.type) {
      case 'pkgcmd':
        return `${ANSI.green}${ANSI.bold}${seg.text}${ANSI.reset}`
      case 'subcmd':
        return `${ANSI.magenta}${seg.text}${ANSI.reset}`
      case 'known-pkg':
        return `${ANSI.cyan}${ANSI.bold}${seg.text}${ANSI.reset}`
      case 'unknown-pkg':
        return `${ANSI.gold}${seg.text}${ANSI.reset}`
      case 'flag':
        return `${ANSI.blue}${seg.text}${ANSI.reset}`
      default:
        return seg.text
    }
  }).join('')
}

export function XtermTerminal({
  sessionId,
  onOutput,
  onClearBuffer,
  sendInput,
  resizeTerminal,
  isActive,
}: XtermTerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const sessionIdRef = useRef(sessionId)
  const sendInputRef = useRef(sendInput)
  const resizeTerminalRef = useRef(resizeTerminal)
  const initDoneRef = useRef(false)

  // Input line tracking for package highlighting
  const currentLineRef = useRef('')
  const cursorPosRef = useRef(0)

  // Keep refs updated without triggering re-renders or effect re-runs
  useEffect(() => {
    sessionIdRef.current = sessionId
    sendInputRef.current = sendInput
    resizeTerminalRef.current = resizeTerminal
  })

  // Initialize terminal ONCE per sessionId
  useEffect(() => {
    if (!containerRef.current) return
    if (initDoneRef.current) return
    initDoneRef.current = true

    console.log('[XtermTerminal] Initializing terminal for session:', sessionId)

    const term = new Terminal({
      cursorBlink: true,
      cursorStyle: 'block',
      fontSize: 14,
      fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', 'Consolas', monospace",
      theme: {
        // Classic Modern Theme - Midnight Cyan
        background: '#0a0e23',
        foreground: '#c8d6e5',
        cursor: '#00d4ff',
        cursorAccent: '#0a0e23',
        selectionBackground: '#1a3a6a',
        selectionForeground: '#ffffff',
        // ANSI 16-color palette — refined for the new theme
        black: '#0a0e23',
        red: '#ff5252',
        green: '#00e676',
        yellow: '#ffc107',
        blue: '#448aff',
        magenta: '#a855f7',
        cyan: '#00d4ff',
        white: '#c8d6e5',
        brightBlack: '#3d4a6e',
        brightRed: '#ff8a80',
        brightGreen: '#69f0ae',
        brightYellow: '#ffe57f',
        brightBlue: '#82b1ff',
        brightMagenta: '#d2a8ff',
        brightCyan: '#84ffff',
        brightWhite: '#f0f4ff',
      },
      allowTransparency: true,
      scrollback: 5000,
      convertEol: true,
      allowProposedApi: true,
    })

    const fitAddon = new FitAddon()
    const webLinksAddon = new WebLinksAddon()

    term.loadAddon(fitAddon)
    term.loadAddon(webLinksAddon)

    term.open(containerRef.current)

    termRef.current = term
    fitAddonRef.current = fitAddon

    // Handle terminal input - forward keystrokes to PTY via socket
    // With package name highlighting: we track the current line and
    // when Enter is pressed, we inject colored output before the PTY echo
    const dataDisposable = term.onData((data: string) => {
      const sid = sessionIdRef.current
      const sendFn = sendInputRef.current

      if (data === '\r') {
        // Enter pressed — colorize the current line and show it before PTY echo
        const line = currentLineRef.current
        if (line.trim() && PKG_COMMANDS.has(line.trim().split(/\s+/)[0])) {
          // This is a package command — show highlighted version
          const colored = colorizeLine(line)
          // Move cursor to start of line, clear it, write colored version
          term.write(`\r\x1b[2K${colored}\r\n`)
        }
        currentLineRef.current = ''
        cursorPosRef.current = 0
      } else if (data === '\x7f' || data === '\b') {
        // Backspace
        if (currentLineRef.current.length > 0) {
          currentLineRef.current = currentLineRef.current.slice(0, -1)
          cursorPosRef.current = Math.max(0, cursorPosRef.current - 1)
        }
      } else if (data === '\x03') {
        // Ctrl+C
        currentLineRef.current = ''
        cursorPosRef.current = 0
      } else if (data === '\x15') {
        // Ctrl+U (clear line)
        currentLineRef.current = ''
        cursorPosRef.current = 0
      } else if (data.length === 1 && data.charCodeAt(0) >= 32) {
        // Regular printable character
        currentLineRef.current += data
        cursorPosRef.current += 1
      } else if (data.startsWith('\x1b[')) {
        // Arrow keys / escape sequences — don't track, just pass through
        // For simplicity, we reset line tracking on complex sequences
      } else if (data === '\t') {
        // Tab completion — add to line
        currentLineRef.current += data
        cursorPosRef.current += 1
      }

      // Always forward raw data to PTY
      if (sid && sendFn) {
        sendFn(sid, data)
      }
    })

    // Handle resize with ResizeObserver
    const resizeObserver = new ResizeObserver(() => {
      try {
        fitAddon.fit()
        if (term.cols && term.rows) {
          resizeTerminalRef.current(sessionIdRef.current, term.cols, term.rows)
        }
      } catch {
        // ignore resize errors when terminal is not visible
      }
    })

    if (containerRef.current) {
      resizeObserver.observe(containerRef.current)
    }

    // Initial fit with delay to ensure DOM is ready
    const fitTimers: ReturnType<typeof setTimeout>[] = []

    fitTimers.push(setTimeout(() => {
      try {
        fitAddon.fit()
        if (term.cols && term.rows) {
          resizeTerminalRef.current(sessionIdRef.current, term.cols, term.rows)
        }
      } catch {
        // ignore
      }
    }, 100))

    fitTimers.push(setTimeout(() => {
      try {
        fitAddon.fit()
        if (term.cols && term.rows) {
          resizeTerminalRef.current(sessionIdRef.current, term.cols, term.rows)
        }
      } catch {
        // ignore
      }
    }, 500))

    return () => {
      fitTimers.forEach(t => clearTimeout(t))
      resizeObserver.disconnect()
      dataDisposable.dispose()
      term.dispose()
      termRef.current = null
      fitAddonRef.current = null
      initDoneRef.current = false
    }
  }, [sessionId]) // Re-init if sessionId changes

  // Subscribe to output for this session
  useEffect(() => {
    const unsubscribe = onOutput(sessionId, (data: string) => {
      if (termRef.current) {
        termRef.current.write(data)
      }
    })

    return unsubscribe
  }, [sessionId, onOutput])

  // Subscribe to clear-buffer events for this session
  // When the PTY is about to restart, clear the terminal state
  // to prevent buffered keystrokes from bleeding into the new session
  useEffect(() => {
    const unsubscribe = onClearBuffer(sessionId, () => {
      if (termRef.current) {
        // Clear the terminal buffer and reset state machine
        // This prevents "phantom" keystrokes from the old session
        // appearing in the newly restarted shell
        termRef.current.clear()
        termRef.current.reset()
        currentLineRef.current = ''
        cursorPosRef.current = 0
      }
    })

    return unsubscribe
  }, [sessionId, onClearBuffer])

  // Handle visibility changes - refit when becoming active
  useEffect(() => {
    if (isActive && fitAddonRef.current && termRef.current) {
      const timer = setTimeout(() => {
        try {
          if (fitAddonRef.current && termRef.current) {
            fitAddonRef.current.fit()
            if (termRef.current.cols && termRef.current.rows) {
              resizeTerminalRef.current(sessionIdRef.current, termRef.current.cols, termRef.current.rows)
            }
            termRef.current.focus()
          }
        } catch {
          // ignore fit errors
        }
      }, 50)
      return () => clearTimeout(timer)
    }
  }, [isActive])

  const handleContainerClick = useCallback(() => {
    termRef.current?.focus()
  }, [])

  return (
    <div
      ref={containerRef}
      onClick={handleContainerClick}
      className="w-full h-full"
      style={{
        padding: '4px',
        visibility: isActive ? 'visible' : 'hidden',
        position: isActive ? 'relative' : 'absolute',
        ...(isActive ? {} : {
          pointerEvents: 'none' as const,
          height: '100%',
          width: '100%',
          left: 0,
          top: 0,
          overflow: 'hidden',
        }),
      }}
    />
  )
}

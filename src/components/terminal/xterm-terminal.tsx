'use client'

import { useEffect, useRef, useCallback, useState } from 'react'
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
  installedPackages?: Set<string>
}

/* ================================================================
   NEXUS ECLIPSE — Command Intelligence Engine
   ================================================================ */

// Package manager commands
const PKG_MANAGERS = new Set([
  'npm', 'npx', 'yarn', 'pnpm', 'bun', 'deno',
  'pip', 'pip3', 'pipx', 'conda', 'mamba', 'uv',
  'gem', 'cargo', 'go', 'apt', 'apt-get', 'dnf', 'yum',
  'pacman', 'snap', 'flatpak', 'brew', 'port',
  'gh', 'vercel', 'netlify', 'supabase',
])

// Sub-commands that precede package names
const INSTALL_SUBCOMMANDS = new Set([
  'install', 'i', 'add', 'ci', 'update', 'upgrade',
  'uninstall', 'remove', 'rm', 'un', 'delete',
  'install-package', 'get', 'require', 'init',
])

// Core Linux / system commands — always "known"
const CORE_COMMANDS = new Set([
  'ls', 'cd', 'pwd', 'mkdir', 'rmdir', 'cp', 'mv', 'rm', 'touch',
  'cat', 'less', 'more', 'head', 'tail', 'wc', 'sort', 'uniq',
  'grep', 'find', 'sed', 'awk', 'tr', 'cut', 'tee', 'xargs',
  'echo', 'printf', 'read', 'source', 'export', 'alias', 'unalias',
  'chmod', 'chown', 'chgrp', 'ln', 'stat', 'file', 'du', 'df',
  'ps', 'top', 'htop', 'kill', 'killall', 'nohup', 'nice', 'renice',
  'bg', 'fg', 'jobs', 'disown', 'wait', 'sleep', 'time', 'timeout',
  'ssh', 'scp', 'rsync', 'curl', 'wget', 'ping', 'netstat', 'ss',
  'tar', 'gzip', 'gunzip', 'zip', 'unzip', 'bzip2', 'xz',
  'git', 'docker', 'docker-compose', 'kubectl', 'helm', 'terraform',
  'bash', 'sh', 'zsh', 'dash', 'env', 'which', 'type', 'command',
  'man', 'info', 'help', 'history', 'clear', 'reset', 'exit',
  'true', 'false', 'test', 'expr', 'let', 'seq', 'date', 'cal',
  'crontab', 'at', 'batch', 'systemctl', 'service', 'journalctl',
  'whoami', 'hostname', 'uname', 'id', 'groups', 'su', 'sudo',
])

// Pre-installed packages (known to exist in the HF Spaces Docker image)
const KNOWN_PACKAGES = new Set([
  // System tools
  'bash', 'sh', 'curl', 'wget', 'git', 'ssh', 'scp', 'rsync',
  'nano', 'vim', 'vi', 'sed', 'awk', 'grep', 'find', 'tar', 'gzip',
  'unzip', 'cat', 'less', 'head', 'tail', 'sort', 'wc', 'diff',
  'make', 'cmake', 'gcc', 'g++', 'python3', 'python', 'node', 'npm', 'npx',
  'jq', 'htop', 'top', 'ps', 'docker', 'docker-compose',
  // Python packages (commonly pre-installed or available)
  'pip', 'setuptools', 'wheel', 'virtualenv', 'venv',
  'requests', 'flask', 'django', 'fastapi', 'uvicorn',
  'numpy', 'pandas', 'scipy', 'matplotlib', 'pillow',
  'openai', 'anthropic', 'httpx', 'aiohttp', 'pydantic',
  'click', 'rich', 'boto3', 'sqlalchemy', 'redis', 'celery',
  'torch', 'tensorflow', 'keras', 'scikit-learn', 'transformers',
  // Node.js packages (commonly installed globally)
  'typescript', 'ts-node', 'tslib', 'eslint', 'prettier',
  'webpack', 'vite', 'next', 'react', 'react-dom', 'vue',
  'express', 'fastify', 'prisma', '@prisma/client',
  '@anthropic-ai/claude-code', 'nodemon', 'pm2', 'serve',
  'tailwindcss', 'postcss', 'autoprefixer', 'sass',
  'create-react-app', 'create-next-app', 'nx',
  // Languages & Runtimes
  'go', 'rust', 'cargo', 'ruby', 'gem', 'java', 'javac',
  'bun', 'deno', 'clang', 'swift', 'kotlinc',
  // DevOps & Cloud
  'terraform', 'ansible', 'vault', 'consul', 'helm',
  'aws', 'gcloud', 'az', 'vercel', 'netlify', 'supabase',
  // Databases
  'mysql', 'psql', 'postgres', 'mongosh', 'redis-cli', 'sqlite3',
  // Build tools
  'gradle', 'maven', 'ant', 'bazel', 'ninja',
])

// Token types for the tokenizer
type TokenType =
  | 'pkg-manager'   // npm, pip, yarn
  | 'subcmd'        // install, add, remove
  | 'installed-pkg' // known AND verified installed
  | 'known-pkg'     // in our dictionary but not verified
  | 'unknown-pkg'   // not in dictionary
  | 'flag'          // --save-dev, -g
  | 'pipe'          // |, ||
  | 'redirect'      // >, >>, <
  | 'operator'      // &&, ;
  | 'string'        // "..." or '...'
  | 'variable'      // $VAR, ${VAR}
  | 'comment'       // # ...
  | 'core-cmd'      // ls, cd, grep
  | 'path'          // ./foo, /usr/bin, ~/...
  | 'normal'

interface Token {
  text: string
  type: TokenType
}

// ANSI escape codes matching the Nexus Eclipse palette
const ANSI = {
  installed: '\x1b[38;5;80m',   // Vibrant teal #00E5C0
  known:     '\x1b[38;5;147m',  // Soft indigo #A5B4FC
  unknown:   '\x1b[38;5;102m',  // Gray #64748B
  danger:    '\x1b[38;5;210m',  // Coral #F87171
  flag:      '\x1b[38;5;111m',  // Lavender #818CF8
  pkgmgr:    '\x1b[38;5;80m',   // Teal (same as installed but bold)
  subcmd:    '\x1b[38;5;111m',  // Indigo #818CF8
  core:      '\x1b[38;5;147m',  // Indigo #A5B4FC
  string:    '\x1b[38;5;117m',  // Sky #7DD3FC
  variable:  '\x1b[38;5;123m',  // Cyan #67E8F9
  comment:   '\x1b[38;5;102m',  // Gray #64748B
  pipe:      '\x1b[38;5;188m',  // Light gray
  path:      '\x1b[38;5;188m',  // Light gray
  reset:     '\x1b[0m',
  bold:      '\x1b[1m',
  dim:       '\x1b[2m',
}

/**
 * Tokenize a command line and classify each token.
 * This is the heart of the command intelligence engine.
 */
function tokenizeLine(line: string, installedPkgs: Set<string>): Token[] {
  const tokens: Token[] = []
  let remaining = line
  let pos = 0

  // State machine context
  let inPackageContext = false
  let pastSubcommand = false

  while (remaining.length > 0) {
    // Match whitespace
    const wsMatch = remaining.match(/^(\s+)/)
    if (wsMatch) {
      tokens.push({ text: wsMatch[1], type: 'normal' })
      remaining = remaining.slice(wsMatch[1].length)
      pos += wsMatch[1].length
      continue
    }

    // Match comments
    if (remaining.startsWith('#')) {
      tokens.push({ text: remaining, type: 'comment' })
      break
    }

    // Match strings (double or single quoted)
    const strMatch = remaining.match(/^(["'])((?:\\.|(?!\1)[^\\])*)\1/)
    if (strMatch) {
      tokens.push({ text: strMatch[0], type: 'string' })
      remaining = remaining.slice(strMatch[0].length)
      pos += strMatch[0].length
      continue
    }

    // Match variables $VAR or ${VAR}
    const varMatch = remaining.match(/^\$\{[^}]+\}|\$[A-Za-z_][A-Za-z0-9_]*/)
    if (varMatch) {
      tokens.push({ text: varMatch[0], type: 'variable' })
      remaining = remaining.slice(varMatch[0].length)
      pos += varMatch[0].length
      continue
    }

    // Match pipes and operators
    if (remaining.startsWith('||')) {
      tokens.push({ text: '||', type: 'pipe' })
      remaining = remaining.slice(2); pos += 2; continue
    }
    if (remaining.startsWith('|')) {
      // Pipe resets context — new command after pipe
      tokens.push({ text: '|', type: 'pipe' })
      remaining = remaining.slice(1); pos += 1
      inPackageContext = false; pastSubcommand = false
      continue
    }
    if (remaining.startsWith('&&')) {
      tokens.push({ text: '&&', type: 'operator' })
      remaining = remaining.slice(2); pos += 2
      inPackageContext = false; pastSubcommand = false
      continue
    }
    if (remaining.startsWith(';')) {
      tokens.push({ text: ';', type: 'operator' })
      remaining = remaining.slice(1); pos += 1
      inPackageContext = false; pastSubcommand = false
      continue
    }

    // Match redirects
    const redirMatch = remaining.match(/^(>>|>|<)/)
    if (redirMatch) {
      tokens.push({ text: redirMatch[0], type: 'redirect' })
      remaining = remaining.slice(redirMatch[0].length)
      pos += redirMatch[0].length
      continue
    }

    // Match flags/options
    const flagMatch = remaining.match(/^(?:-[A-Za-z](?:\s|$)|--[\w-]+(?:=[^\s]*)?)/)
    if (flagMatch) {
      tokens.push({ text: flagMatch[0], type: 'flag' })
      remaining = remaining.slice(flagMatch[0].length)
      pos += flagMatch[0].length
      continue
    }

    // Match paths (./foo, /usr/bin, ~/..., ../...)
    const pathMatch = remaining.match(/^(?:\.\/|\/|~\/|\.\.\/)[^\s]*/)
    if (pathMatch) {
      tokens.push({ text: pathMatch[0], type: 'path' })
      remaining = remaining.slice(pathMatch[0].length)
      pos += pathMatch[0].length
      continue
    }

    // Match a word token
    const wordMatch = remaining.match(/^([^\s|&;><"']+)/)
    if (wordMatch) {
      const word = wordMatch[1]
      let type: TokenType = 'normal'

      if (!inPackageContext && CORE_COMMANDS.has(word)) {
        type = 'core-cmd'
        // Some core commands start a package context (like 'sudo npm install')
      } else if (!inPackageContext && PKG_MANAGERS.has(word)) {
        type = 'pkg-manager'
        inPackageContext = true
      } else if (inPackageContext && !pastSubcommand && INSTALL_SUBCOMMANDS.has(word)) {
        type = 'subcmd'
        pastSubcommand = true
      } else if (inPackageContext && pastSubcommand) {
        // This is a package name — classify it
        const pkgName = word.startsWith('@') ? word : word.replace(/[=<>@].*$/, '')
        if (installedPkgs.has(pkgName) || installedPkgs.has(word)) {
          type = 'installed-pkg'
        } else if (KNOWN_PACKAGES.has(pkgName) || KNOWN_PACKAGES.has(word)) {
          type = 'known-pkg'
        } else {
          type = 'unknown-pkg'
        }
      } else if (inPackageContext && !pastSubcommand) {
        // Still before subcommand
        if (INSTALL_SUBCOMMANDS.has(word)) {
          type = 'subcmd'
          pastSubcommand = true
        } else if (word.startsWith('-')) {
          type = 'flag'
        } else {
          // Some package managers don't require install subcommand (e.g., npx, deno)
          pastSubcommand = true
          const pkgName = word.replace(/[=<>@].*$/, '')
          if (installedPkgs.has(pkgName) || installedPkgs.has(word)) {
            type = 'installed-pkg'
          } else if (KNOWN_PACKAGES.has(pkgName) || KNOWN_PACKAGES.has(word)) {
            type = 'known-pkg'
          } else {
            type = 'unknown-pkg'
          }
        }
      } else {
        // Not in package context — check if it's a core command
        if (CORE_COMMANDS.has(word)) {
          type = 'core-cmd'
        }
      }

      tokens.push({ text: word, type })
      remaining = remaining.slice(word.length)
      pos += word.length
      continue
    }

    // Fallback: consume one character
    tokens.push({ text: remaining[0], type: 'normal' })
    remaining = remaining.slice(1)
    pos += 1
  }

  return tokens
}

/**
 * Apply ANSI color codes to tokens for xterm rendering.
 * This creates the beautiful colored command display.
 */
function colorizeTokens(tokens: Token[]): string {
  return tokens.map(t => {
    switch (t.type) {
      case 'pkg-manager':
        return `${ANSI.bold}${ANSI.pkgmgr}${t.text}${ANSI.reset}`
      case 'subcmd':
        return `${ANSI.subcmd}${t.text}${ANSI.reset}`
      case 'installed-pkg':
        return `${ANSI.bold}${ANSI.installed}${t.text}${ANSI.reset}`
      case 'known-pkg':
        return `${ANSI.known}${t.text}${ANSI.reset}`
      case 'unknown-pkg':
        return `${ANSI.unknown}${t.text}${ANSI.reset}`
      case 'flag':
        return `${ANSI.flag}${t.text}${ANSI.reset}`
      case 'core-cmd':
        return `${ANSI.bold}${ANSI.core}${t.text}${ANSI.reset}`
      case 'string':
        return `${ANSI.string}${t.text}${ANSI.reset}`
      case 'variable':
        return `${ANSI.variable}${t.text}${ANSI.reset}`
      case 'comment':
        return `${ANSI.dim}${ANSI.comment}${t.text}${ANSI.reset}`
      case 'pipe':
        return `${ANSI.bold}${ANSI.pipe}${t.text}${ANSI.reset}`
      case 'redirect':
        return `${ANSI.pipe}${t.text}${ANSI.reset}`
      case 'operator':
        return `${ANSI.pipe}${t.text}${ANSI.reset}`
      case 'path':
        return `${ANSI.dim}${t.text}${ANSI.reset}`
      default:
        return t.text
    }
  }).join('')
}

// ──────────────────────────────────────────────
// XtermTerminal Component
// ──────────────────────────────────────────────

export function XtermTerminal({
  sessionId,
  onOutput,
  onClearBuffer,
  sendInput,
  resizeTerminal,
  isActive,
  installedPackages = new Set(),
}: XtermTerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const sessionIdRef = useRef(sessionId)
  const sendInputRef = useRef(sendInput)
  const resizeTerminalRef = useRef(resizeTerminal)
  const initDoneRef = useRef(false)

  // Input line tracking for command intelligence
  const currentLineRef = useRef('')
  const inputActiveRef = useRef(false)

  // Suggestion state
  const [suggestions, setSuggestions] = useState<{name: string; type: string; desc: string}[]>([])
  const [selectedSuggestion, setSelectedSuggestion] = useState(0)
  const [showSuggestions, setShowSuggestions] = useState(false)

  // Keep refs updated
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

    const term = new Terminal({
      cursorBlink: true,
      cursorStyle: 'block',
      fontSize: 14,
      lineHeight: 1.45,
      fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', 'Consolas', monospace",
      theme: {
        // ─── Nexus Eclipse Dark (default) ───
        background: '#0F1117',
        foreground: '#E2E8F0',
        cursor: '#00E5C0',
        cursorAccent: '#0F1117',
        selectionBackground: 'rgba(99, 102, 241, 0.30)',
        selectionForeground: '#FFFFFF',
        black: '#0F1117',
        red: '#F87171',
        green: '#34D399',
        yellow: '#FBBF24',
        blue: '#818CF8',
        magenta: '#C084FC',
        cyan: '#00E5C0',
        white: '#E2E8F0',
        brightBlack: '#475569',
        brightRed: '#FCA5A5',
        brightGreen: '#6EE7B7',
        brightYellow: '#FDE68A',
        brightBlue: '#A5B4FC',
        brightMagenta: '#D8B4FE',
        brightCyan: '#5EEAD4',
        brightWhite: '#F1F5F9',
      },
      allowTransparency: true,
      scrollback: 10000, // Extended scrollback persistence
      convertEol: true,
      allowProposedApi: true,
      windowsMode: false,
    })

    const fitAddon = new FitAddon()
    const webLinksAddon = new WebLinksAddon()

    term.loadAddon(fitAddon)
    term.loadAddon(webLinksAddon)

    // ─── Fix: Enable Ctrl+Shift+C/V for copy/paste in browser ───
    // Without this, browsers intercept Ctrl+C/V and xterm never sees them.
    // Ctrl+Shift+C = copy selection, Ctrl+Shift+V = paste from clipboard
    // Ctrl+C alone = still sends SIGINT to the shell (normal terminal behavior)
    term.attachCustomKeyEventHandler((event: KeyboardEvent) => {
      // Allow Ctrl+Shift+C (copy)
      if (event.ctrlKey && event.shiftKey && event.key === 'C') {
        return false // Let browser handle it (copy)
      }
      // Allow Ctrl+Shift+V (paste)
      if (event.ctrlKey && event.shiftKey && event.key === 'V') {
        return false // Let browser handle it (paste)
      }
      // Allow Ctrl+Shift+X (cut)
      if (event.ctrlKey && event.shiftKey && event.key === 'X') {
        return false
      }
      // Allow Ctrl+Shift+A (select all)
      if (event.ctrlKey && event.shiftKey && event.key === 'A') {
        return false
      }
      // Allow browser refresh/close (Ctrl+R, Ctrl+W, Ctrl+T, Ctrl+L)
      if (event.ctrlKey && !event.shiftKey && !event.altKey) {
        if (['r', 'w', 't', 'l'].includes(event.key.toLowerCase())) {
          return false
        }
      }
      // Allow Ctrl+Plus/Minus for zoom
      if (event.ctrlKey && (event.key === '+' || event.key === '-' || event.key === '=')) {
        return false
      }
      // All other key events go to xterm
      return true
    })

    term.open(containerRef.current)

    termRef.current = term
    fitAddonRef.current = fitAddon

    // ─── Input Handler with Command Intelligence ───
    const dataDisposable = term.onData((data: string) => {
      const sid = sessionIdRef.current
      const sendFn = sendInputRef.current

      if (data === '\r') {
        // Enter pressed — colorize the current line before PTY echo
        const line = currentLineRef.current
        if (line.trim().length > 0) {
          const isPkgCmd = line.trim().split(/\s+/).some(w => PKG_MANAGERS.has(w))
          const isCoreCmd = CORE_COMMANDS.has(line.trim().split(/\s+/)[0])
          if (isPkgCmd || isCoreCmd) {
            const tokens = tokenizeLine(line, installedPackages)
            const colored = colorizeTokens(tokens)
            // Clear current line and write highlighted version
            term.write(`\r\x1b[2K${colored}\r\n`)
          }
        }
        currentLineRef.current = ''
        inputActiveRef.current = false
        setShowSuggestions(false)
      } else if (data === '\x7f' || data === '\b') {
        // Backspace
        if (currentLineRef.current.length > 0) {
          currentLineRef.current = currentLineRef.current.slice(0, -1)
        }
        setShowSuggestions(false)
      } else if (data === '\x03') {
        // Ctrl+C
        currentLineRef.current = ''
        inputActiveRef.current = false
        setShowSuggestions(false)
      } else if (data === '\x15') {
        // Ctrl+U — clear line
        currentLineRef.current = ''
      } else if (data === '\x17') {
        // Ctrl+W — delete word
        currentLineRef.current = currentLineRef.current.replace(/\s*\S+\s*$/, '')
      } else if (data === '\t') {
        // Tab — handle completion
        // For now, we pass tab to PTY for shell completion
        // Suggestions are shown but PTY handles actual completion
      } else if (data.length === 1 && data.charCodeAt(0) >= 32) {
        // Regular printable character
        currentLineRef.current += data
        inputActiveRef.current = true

        // Generate suggestions based on current input
        const words = currentLineRef.current.trim().split(/\s+/)
        const lastWord = words[words.length - 1] || ''
        if (lastWord.length >= 2 && words.length <= 2) {
          const matches: {name: string; type: string; desc: string}[] = []
          // Check core commands
          CORE_COMMANDS.forEach(cmd => {
            if (cmd.startsWith(lastWord) && cmd !== lastWord) {
              matches.push({ name: cmd, type: 'known', desc: 'system' })
            }
          })
          // Check package managers
          PKG_MANAGERS.forEach(cmd => {
            if (cmd.startsWith(lastWord) && cmd !== lastWord) {
              matches.push({ name: cmd, type: 'installed', desc: 'pkg-mgr' })
            }
          })
          // Check known packages
          KNOWN_PACKAGES.forEach(pkg => {
            if (pkg.startsWith(lastWord) && pkg !== lastWord && matches.length < 8) {
              const isInstalled = installedPackages.has(pkg)
              matches.push({
                name: pkg,
                type: isInstalled ? 'installed' : 'known',
                desc: isInstalled ? 'installed' : 'available'
              })
            }
          })
          setSuggestions(matches.slice(0, 8))
          setSelectedSuggestion(0)
          setShowSuggestions(matches.length > 0)
        } else {
          setShowSuggestions(false)
        }
      } else if (data.startsWith('\x1b[')) {
        // Arrow keys — for suggestion navigation
        if (data === '\x1b[A' && showSuggestions) {
          // Up arrow — previous suggestion
          setSelectedSuggestion(prev => Math.max(0, prev - 1))
          return // Don't forward to PTY
        }
        if (data === '\x1b[B' && showSuggestions) {
          // Down arrow — next suggestion
          setSelectedSuggestion(prev => Math.min(suggestions.length - 1, prev + 1))
          return // Don't forward to PTY
        }
        // For other escape sequences, reset tracking
      }

      // Always forward raw data to PTY
      if (sid && sendFn) {
        sendFn(sid, data)
      }
    })

    // Handle resize
    const resizeObserver = new ResizeObserver(() => {
      try {
        fitAddon.fit()
        if (term.cols && term.rows) {
          resizeTerminalRef.current(sessionIdRef.current, term.cols, term.rows)
        }
      } catch {
        // ignore
      }
    })

    if (containerRef.current) {
      resizeObserver.observe(containerRef.current)
    }

    // Initial fit
    const fitTimers: ReturnType<typeof setTimeout>[] = []
    fitTimers.push(setTimeout(() => {
      try { fitAddon.fit(); if (term.cols && term.rows) resizeTerminalRef.current(sessionIdRef.current, term.cols, term.rows) } catch {}
    }, 100))
    fitTimers.push(setTimeout(() => {
      try { fitAddon.fit(); if (term.cols && term.rows) resizeTerminalRef.current(sessionIdRef.current, term.cols, term.rows) } catch {}
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
  }, [sessionId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Subscribe to output
  useEffect(() => {
    const unsubscribe = onOutput(sessionId, (data: string) => {
      if (termRef.current) {
        termRef.current.write(data)
      }
    })
    return unsubscribe
  }, [sessionId, onOutput])

  // Subscribe to clear-buffer
  useEffect(() => {
    const unsubscribe = onClearBuffer(sessionId, () => {
      if (termRef.current) {
        termRef.current.clear()
        termRef.current.reset()
        currentLineRef.current = ''
        inputActiveRef.current = false
        setShowSuggestions(false)
      }
    })
    return unsubscribe
  }, [sessionId, onClearBuffer])

  // Handle visibility changes
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
        } catch {}
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

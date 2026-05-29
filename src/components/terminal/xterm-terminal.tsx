'use client'

import { useEffect, useRef, useCallback } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import '@xterm/xterm/css/xterm.css'

interface XtermTerminalProps {
  sessionId: string
  onOutput: (sessionId: string, handler: (data: string) => void) => () => void
  sendInput: (sessionId: string, data: string) => void
  resizeTerminal: (sessionId: string, cols: number, rows: number) => void
  isActive: boolean
}

export function XtermTerminal({
  sessionId,
  onOutput,
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

  // Keep refs updated without triggering re-renders or effect re-runs
  useEffect(() => {
    sessionIdRef.current = sessionId
    sendInputRef.current = sendInput
    resizeTerminalRef.current = resizeTerminal
  })

  // Initialize terminal ONCE
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
        background: '#0d1117',
        foreground: '#c9d1d9',
        cursor: '#00ff41',
        cursorAccent: '#0d1117',
        selectionBackground: '#264f78',
        black: '#0d1117',
        red: '#ff7b72',
        green: '#00ff41',
        yellow: '#d29922',
        blue: '#58a6ff',
        magenta: '#bc8cff',
        cyan: '#39c5cf',
        white: '#c9d1d9',
        brightBlack: '#484f58',
        brightRed: '#ffa198',
        brightGreen: '#56d364',
        brightYellow: '#e3b341',
        brightBlue: '#79c0ff',
        brightMagenta: '#d2a8ff',
        brightCyan: '#56d4dd',
        brightWhite: '#f0f6fc',
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
    term.onData((data: string) => {
      sendInputRef.current(sessionIdRef.current, data)
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

    // Second fit attempt after a longer delay (for slow DOM)
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
      term.dispose()
      termRef.current = null
      fitAddonRef.current = null
      initDoneRef.current = false
    }
  }, [sessionId]) // Re-init if sessionId changes (shouldn't normally happen)

  // Subscribe to output for this session
  useEffect(() => {
    const unsubscribe = onOutput(sessionId, (data: string) => {
      if (termRef.current) {
        termRef.current.write(data)
      }
    })

    return unsubscribe
  }, [sessionId, onOutput])

  // Handle visibility changes - refit when becoming active
  useEffect(() => {
    if (isActive && fitAddonRef.current && termRef.current) {
      // Small delay to ensure the container is visible and has dimensions
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
        // Use visibility instead of display:none so xterm can calculate dimensions
        // when the terminal is inactive but still needs to be measured
        visibility: isActive ? 'visible' : 'hidden',
        position: isActive ? 'relative' : 'absolute',
        // For inactive terminals, take them out of flow but keep dimensions calculable
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

'use client'

import { useEffect, useRef, useCallback } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import '@xterm/xterm/css/xterm.css'

interface XtermTerminalProps {
  sessionId: string
  onOutput: (handler: (data: { sessionId: string; data: string }) => void) => () => void
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
  const terminalRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)

  // Initialize terminal
  useEffect(() => {
    if (!terminalRef.current) return

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

    term.open(terminalRef.current)

    // Small delay to ensure DOM is ready before fitting
    setTimeout(() => {
      try {
        fitAddon.fit()
      } catch {
        // ignore fit errors on initial load
      }
    }, 100)

    termRef.current = term
    fitAddonRef.current = fitAddon

    // Handle terminal input
    term.onData((data: string) => {
      sendInput(sessionId, data)
    })

    // Handle resize
    const resizeObserver = new ResizeObserver(() => {
      try {
        fitAddon.fit()
        if (term.cols && term.rows) {
          resizeTerminal(sessionId, term.cols, term.rows)
        }
      } catch {
        // ignore resize errors
      }
    })

    resizeObserver.observe(terminalRef.current)

    // Initial resize
    try {
      fitAddon.fit()
      if (term.cols && term.rows) {
        resizeTerminal(sessionId, term.cols, term.rows)
      }
    } catch {
      // ignore
    }

    return () => {
      resizeObserver.disconnect()
      term.dispose()
      termRef.current = null
      fitAddonRef.current = null
    }
  }, [sessionId, sendInput, resizeTerminal])

  // Handle output from socket
  useEffect(() => {
    const unsubscribe = onOutput((data: { sessionId: string; data: string }) => {
      if (data.sessionId === sessionId && termRef.current) {
        termRef.current.write(data.data)
      }
    })

    return unsubscribe
  }, [sessionId, onOutput])

  // Handle visibility - refit when becoming active
  useEffect(() => {
    if (isActive && fitAddonRef.current && termRef.current) {
      setTimeout(() => {
        try {
          fitAddonRef.current?.fit()
          if (termRef.current?.cols && termRef.current?.rows) {
            resizeTerminal(sessionId, termRef.current.cols, termRef.current.rows)
          }
        } catch {
          // ignore
        }
      }, 50)
    }
  }, [isActive, sessionId, resizeTerminal])

  const handleFocus = useCallback(() => {
    termRef.current?.focus()
  }, [])

  return (
    <div
      ref={terminalRef}
      onClick={handleFocus}
      className={`w-full h-full ${isActive ? 'block' : 'hidden'}`}
      style={{ padding: '4px' }}
    />
  )
}

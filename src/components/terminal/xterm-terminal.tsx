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

  // Keep refs updated without triggering re-renders or effect re-runs
  useEffect(() => {
    sessionIdRef.current = sessionId
    sendInputRef.current = sendInput
    resizeTerminalRef.current = resizeTerminal
  })

  // Initialize terminal ONCE - never recreate it
  useEffect(() => {
    if (!containerRef.current) return
    // Prevent double init in React strict mode
    if (termRef.current) return

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

    // Handle terminal input - use refs so we don't need to recreate the listener
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
    const fitTimer = setTimeout(() => {
      try {
        fitAddon.fit()
        if (term.cols && term.rows) {
          resizeTerminalRef.current(sessionIdRef.current, term.cols, term.rows)
        }
      } catch {
        // ignore
      }
    }, 200)

    return () => {
      clearTimeout(fitTimer)
      resizeObserver.disconnect()
      term.dispose()
      termRef.current = null
      fitAddonRef.current = null
    }
  }, []) // Empty deps - only create once!

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
      const timer = setTimeout(() => {
        try {
          fitAddonRef.current?.fit()
          if (termRef.current?.cols && termRef.current?.rows) {
            resizeTerminalRef.current(sessionIdRef.current, termRef.current.cols, termRef.current.rows)
          }
          termRef.current?.focus()
        } catch {
          // ignore
        }
      }, 100)
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
      className={`w-full h-full ${isActive ? '' : 'hidden'}`}
      style={{ padding: '4px' }}
    />
  )
}

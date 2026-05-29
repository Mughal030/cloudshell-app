'use client'

import { useEffect, useRef, useCallback, useState } from 'react'
import { io, Socket } from 'socket.io-client'

export interface ToolInfo {
  name: string
  installed: boolean
  version: string
}

export interface FileInfo {
  name: string
  type: 'file' | 'directory'
  size: number
  modified: string
}

export interface TerminalSessionInfo {
  sessionId: string
  label: string
}

// Global output handlers per session
const outputHandlers = new Map<string, Set<(data: string) => void>>()

/**
 * Determine the best URL for connecting to the terminal service.
 * Strategy:
 * 1. Try direct connection to port 3003 on the same host (works if port is exposed)
 * 2. Fall back to Caddy proxy with XTransformPort query param
 */
function getTerminalServiceUrls(): { primary: string; fallback: string } {
  if (typeof window === 'undefined') {
    return { primary: '', fallback: '' }
  }

  const protocol = window.location.protocol
  const hostname = window.location.hostname

  // Primary: direct connection to terminal service on port 3003
  const primary = `${protocol}//${hostname}:3003`

  // Fallback: through Caddy proxy with XTransformPort
  const fallback = `${protocol}//${window.location.host}`

  return { primary, fallback }
}

export function useSocket() {
  const socketRef = useRef<Socket | null>(null)
  const [connected, setConnected] = useState(false)
  const [tools, setTools] = useState<ToolInfo[]>([])
  const [sessions, setSessions] = useState<TerminalSessionInfo[]>([])
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const [latency, setLatency] = useState(0)
  const latencyIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    const { primary, fallback } = getTerminalServiceUrls()

    // Try direct connection first, then fallback to Caddy proxy
    let socket: Socket
    const tryConnect = (url: string, query?: Record<string, string>): Socket => {
      const s = io(url, {
        transports: ['websocket', 'polling'],
        forceNew: true,
        reconnection: true,
        reconnectionAttempts: 15,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        timeout: 10000,
        query: query || {},
      })
      return s
    }

    // Try primary (direct) connection first
    socket = tryConnect(primary)

    // If primary fails after timeout, try fallback (Caddy proxy)
    let fallbackAttempted = false
    const fallbackTimer = setTimeout(() => {
      if (!socket.connected && !fallbackAttempted) {
        console.log('[useSocket] Primary connection failed, trying Caddy proxy fallback...')
        fallbackAttempted = true
        socket.disconnect()
        socket = tryConnect(fallback, { XTransformPort: '3003' })
        socketRef.current = socket
        setupSocketHandlers(socket)
      }
    }, 5000)

    socketRef.current = socket

    const setupSocketHandlers = (s: Socket) => {
      s.on('connect', () => {
        console.log('[useSocket] Connected to terminal service, socket id:', s.id)
        setConnected(true)
        clearTimeout(fallbackTimer)
        s.emit('tools:check')
      })

      s.on('disconnect', (reason) => {
        console.log('[useSocket] Disconnected from terminal service, reason:', reason)
        setConnected(false)
      })

      s.on('connect_error', (err) => {
        console.warn('[useSocket] Connection error:', err.message)
        setConnected(false)
      })

      // Single global output handler that dispatches to all registered handlers
      s.on('terminal:output', (data: { sessionId: string; data: string }) => {
        const handlers = outputHandlers.get(data.sessionId)
        if (handlers) {
          handlers.forEach(handler => handler(data.data))
        }
      })

      s.on('tools:status', (toolsStatus: ToolInfo[]) => {
        console.log('[useSocket] Received tools status:', toolsStatus.length, 'tools')
        setTools(toolsStatus)
      })

      // Latency measurement
      if (latencyIntervalRef.current) {
        clearInterval(latencyIntervalRef.current)
      }
      latencyIntervalRef.current = setInterval(() => {
        if (s.connected) {
          const start = Date.now()
          s.emit('ping', () => {
            setLatency(Date.now() - start)
          })
        }
      }, 5000)
    }

    setupSocketHandlers(socket)

    return () => {
      clearTimeout(fallbackTimer)
      if (latencyIntervalRef.current) {
        clearInterval(latencyIntervalRef.current)
      }
      socket.disconnect()
      socketRef.current = null
      outputHandlers.clear()
    }
  }, [])

  const createTerminal = useCallback((cols: number = 80, rows: number = 24) => {
    return new Promise<string>((resolve, reject) => {
      const socket = socketRef.current
      if (!socket || !socket.connected) {
        reject(new Error('Socket not connected. Please wait for the terminal service to connect.'))
        return
      }

      const handler = (data: { sessionId: string | null; error?: string }) => {
        socket.off('terminal:created', handler)
        if (data.sessionId) {
          const num = Math.floor(Math.random() * 9000) + 1000
          const label = `Terminal ${num}`
          setSessions(prev => [...prev, { sessionId: data.sessionId!, label }])
          setActiveSessionId(data.sessionId!)
          resolve(data.sessionId!)
        } else {
          reject(new Error(data.error || 'Failed to create terminal'))
        }
      }

      socket.on('terminal:created', handler)
      socket.emit('terminal:create', { cols, rows })

      // Timeout after 10 seconds
      setTimeout(() => {
        socket.off('terminal:created', handler)
        reject(new Error('Timeout creating terminal'))
      }, 10000)
    })
  }, [])

  const destroyTerminal = useCallback((sessionId: string) => {
    const socket = socketRef.current
    if (!socket) return

    // Clean up output handlers for this session
    outputHandlers.delete(sessionId)

    socket.emit('terminal:destroy', { sessionId })

    setSessions(prev => {
      const next = prev.filter(s => s.sessionId !== sessionId)
      // If the destroyed session was active, switch to another
      setActiveSessionId(currentActive => {
        if (currentActive === sessionId) {
          return next.length > 0 ? next[0].sessionId : null
        }
        return currentActive
      })
      return next
    })
  }, [])

  const sendInput = useCallback((sessionId: string, data: string) => {
    const socket = socketRef.current
    if (socket && socket.connected) {
      socket.emit('terminal:input', { sessionId, data })
    }
  }, [])

  const resizeTerminal = useCallback((sessionId: string, cols: number, rows: number) => {
    const socket = socketRef.current
    if (socket && socket.connected) {
      socket.emit('terminal:resize', { sessionId, cols, rows })
    }
  }, [])

  // Register an output handler for a session - returns unsubscribe function
  const onOutput = useCallback((sessionId: string, handler: (data: string) => void) => {
    if (!outputHandlers.has(sessionId)) {
      outputHandlers.set(sessionId, new Set())
    }
    outputHandlers.get(sessionId)!.add(handler)

    return () => {
      const handlers = outputHandlers.get(sessionId)
      if (handlers) {
        handlers.delete(handler)
        if (handlers.size === 0) {
          outputHandlers.delete(sessionId)
        }
      }
    }
  }, [])

  const checkTools = useCallback(() => {
    socketRef.current?.emit('tools:check')
  }, [])

  const installTool = useCallback((tool: string): Promise<string> => {
    return new Promise((resolve) => {
      const socket = socketRef.current
      if (!socket) {
        resolve(`sudo apt-get update && sudo apt-get install -y ${tool}`)
        return
      }

      const handler = (data: { tool: string; command: string }) => {
        if (data.tool === tool) {
          socket.off('tools:install-command', handler)
          resolve(data.command)
        }
      }

      socket.on('tools:install-command', handler)
      socket.emit('tools:install', { tool })

      // Fallback timeout
      setTimeout(() => {
        socket.off('tools:install-command', handler)
        resolve(`sudo apt-get update && sudo apt-get install -y ${tool}`)
      }, 3000)
    })
  }, [])

  const readFile = useCallback((path: string): Promise<{ content: string | null; error: string | null }> => {
    return new Promise((resolve) => {
      const socket = socketRef.current
      if (!socket) {
        resolve({ content: null, error: 'Socket not connected' })
        return
      }

      const handler = (data: { path: string; content: string | null; error: string | null }) => {
        if (data.path === path) {
          socket.off('file:content', handler)
          resolve({ content: data.content, error: data.error })
        }
      }

      socket.on('file:content', handler)
      socket.emit('file:read', { path })

      setTimeout(() => {
        socket.off('file:content', handler)
        resolve({ content: null, error: 'Timeout reading file' })
      }, 5000)
    })
  }, [])

  const writeFile = useCallback((path: string, content: string): Promise<{ error: string | null }> => {
    return new Promise((resolve) => {
      const socket = socketRef.current
      if (!socket) {
        resolve({ error: 'Socket not connected' })
        return
      }

      const handler = (data: { path: string; error: string | null }) => {
        if (data.path === path) {
          socket.off('file:written', handler)
          resolve({ error: data.error })
        }
      }

      socket.on('file:written', handler)
      socket.emit('file:write', { path, content })

      setTimeout(() => {
        socket.off('file:written', handler)
        resolve({ error: 'Timeout writing file' })
      }, 5000)
    })
  }, [])

  const listFiles = useCallback((path?: string): Promise<{ files: FileInfo[]; error: string | null }> => {
    return new Promise((resolve) => {
      const socket = socketRef.current
      if (!socket) {
        resolve({ files: [], error: 'Socket not connected' })
        return
      }

      const handler = (data: { path: string; files: FileInfo[]; error: string | null }) => {
        socket.off('file:listing', handler)
        resolve({ files: data.files, error: data.error })
      }

      socket.on('file:listing', handler)
      socket.emit('file:list', { path: path || '' })

      setTimeout(() => {
        socket.off('file:listing', handler)
        resolve({ files: [], error: 'Timeout listing files' })
      }, 5000)
    })
  }, [])

  const sendCommandToTerminal = useCallback((command: string) => {
    if (activeSessionId) {
      sendInput(activeSessionId, command + '\n')
    }
  }, [activeSessionId, sendInput])

  return {
    socket: socketRef,
    connected,
    tools,
    sessions,
    activeSessionId,
    setActiveSessionId,
    latency,
    createTerminal,
    destroyTerminal,
    sendInput,
    resizeTerminal,
    onOutput,
    checkTools,
    installTool,
    readFile,
    writeFile,
    listFiles,
    sendCommandToTerminal,
  }
}

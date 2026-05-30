'use client'

import { useEffect, useRef, useCallback, useState } from 'react'
import { io, Socket } from 'socket.io-client'

export interface ToolInfo {
  name: string
  installed: boolean
  version: string
  displayName?: string
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

// Buffer for output that arrives before a handler is registered
const outputBuffer = new Map<string, string[]>()

// Global clear-buffer handlers per session (for restart race condition fix)
const clearBufferHandlers = new Map<string, Set<() => void>>()

// Singleton socket instance - shared across hook instances
let globalSocket: Socket | null = null
let socketConnectionCount = 0

/**
 * Connect to the terminal service through the Caddy proxy.
 *
 * CRITICAL FIXES:
 * 1. Do NOT use XTransformPort - it tells Caddy to route to a different port.
 *    Our Socket.IO server runs on the SAME port (3000) as Next.js, and Caddy
 *    already proxies to port 3000 by default.
 * 2. Use polling FIRST, then upgrade to websocket. This is essential for
 *    reverse proxy compatibility (polling works over regular HTTP, while
 *    websocket requires a successful upgrade which can fail through proxies).
 */
function getOrCreateSocket(): Socket {
  // Reuse existing connected socket
  if (globalSocket && globalSocket.connected) {
    return globalSocket
  }

  // Clean up old socket if it exists but is disconnected
  if (globalSocket) {
    globalSocket.removeAllListeners()
    globalSocket.disconnect()
    globalSocket = null
  }

  console.log('[useSocket] Creating new socket connection...')

  const socket = io({
    path: '/socket.io/',
    transports: ['polling', 'websocket'],  // POLLING FIRST for proxy compat, then upgrade
    upgrade: true,                          // allow transport upgrade
    reconnection: true,
    reconnectionAttempts: Infinity,         // keep trying forever
    reconnectionDelay: 2000,                // Start at 2s
    reconnectionDelayMax: 10000,            // Max 10s between attempts
    randomizationFactor: 0.5,               // Add jitter to avoid thundering herd
    timeout: 30000,                         // Longer timeout for proxy environments
    forceNew: false,                        // reuse singleton
    rememberUpgrade: true,                  // Remember if websocket worked before
  })

  globalSocket = socket
  return socket
}

export function useSocket() {
  const socketRef = useRef<Socket | null>(null)
  const [connected, setConnected] = useState(false)
  const [tools, setTools] = useState<ToolInfo[]>([])
  const [sessions, setSessions] = useState<TerminalSessionInfo[]>([])
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const [latency, setLatency] = useState(0)
  const latencyIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const activeSessionIdRef = useRef<string | null>(null)
  const mountedRef = useRef(true)

  // Keep ref in sync with state
  useEffect(() => {
    activeSessionIdRef.current = activeSessionId
  }, [activeSessionId])

  useEffect(() => {
    mountedRef.current = true
    socketConnectionCount++

    console.log('[useSocket] Initializing socket connection...')

    const socket = getOrCreateSocket()
    socketRef.current = socket

    const onConnect = () => {
      console.log('[useSocket] Connected to terminal service, socket id:', socket.id)
      if (mountedRef.current) {
        setConnected(true)
      }
      // Check tools on connect
      socket.emit('tools:check')
      // Flush any buffered output for all registered handlers
      outputBuffer.forEach((buffered, sid) => {
        const handlers = outputHandlers.get(sid)
        if (handlers && handlers.size > 0) {
          buffered.forEach(data => handlers.forEach(h => h(data)))
          outputBuffer.delete(sid)
        }
      })
    }

    const onDisconnect = (reason: string) => {
      console.log('[useSocket] Disconnected, reason:', reason)
      if (mountedRef.current) {
        setConnected(false)
      }
    }

    const onConnectError = (err: Error) => {
      console.warn('[useSocket] Connection error:', err.message)
      if (mountedRef.current) {
        setConnected(false)
      }
    }

    const onOutput = (data: { sessionId: string; data: string }) => {
      // Ignore system messages (no session handler)
      if (data.sessionId === 'system') return
      const handlers = outputHandlers.get(data.sessionId)
      if (handlers && handlers.size > 0) {
        handlers.forEach(handler => handler(data.data))
      } else {
        // Buffer output for sessions that don't have a handler yet
        if (!outputBuffer.has(data.sessionId)) {
          outputBuffer.set(data.sessionId, [])
        }
        outputBuffer.get(data.sessionId)!.push(data.data)
      }
    }

    const onToolsStatus = (toolsStatus: ToolInfo[]) => {
      console.log('[useSocket] Received tools status:', toolsStatus.length, 'tools')
      if (mountedRef.current) {
        setTools(toolsStatus)
      }
    }

    // Handle reconnection — try to restore sessions
    const onReconnect = (attemptNumber: number) => {
      console.log('[useSocket] Reconnected after', attemptNumber, 'attempts')
      if (mountedRef.current) {
        setConnected(true)
      }
      // Re-check tools
      socket.emit('tools:check')
      // Try to restore active session
      const currentSessionId = activeSessionIdRef.current
      if (currentSessionId) {
        console.log('[useSocket] Requesting session restore for:', currentSessionId)
        socket.emit('restore-session', { sessionId: currentSessionId })
      }
    }

    // Handle clear-input-buffer event (sent before PTY restart)
    const onClearBuffer = (data: { sessionId: string }) => {
      const handlers = clearBufferHandlers.get(data.sessionId)
      if (handlers && handlers.size > 0) {
        handlers.forEach(handler => handler())
      }
    }

    socket.on('connect', onConnect)
    socket.on('disconnect', onDisconnect)
    socket.on('connect_error', onConnectError)
    socket.on('terminal:output', onOutput)
    socket.on('tools:status', onToolsStatus)
    socket.on('reconnect', onReconnect)
    socket.on('clear-input-buffer', onClearBuffer)

    // If already connected, update state
    if (socket.connected) {
      setConnected(true)
      socket.emit('tools:check')
    }

    // Latency measurement
    if (latencyIntervalRef.current) {
      clearInterval(latencyIntervalRef.current)
    }
    latencyIntervalRef.current = setInterval(() => {
      if (socket.connected) {
        const start = Date.now()
        socket.emit('ping', () => {
          if (mountedRef.current) {
            setLatency(Date.now() - start)
          }
        })
      }
    }, 5000)

    return () => {
      mountedRef.current = false
      socketConnectionCount--

      socket.off('connect', onConnect)
      socket.off('disconnect', onDisconnect)
      socket.off('connect_error', onConnectError)
      socket.off('terminal:output', onOutput)
      socket.off('tools:status', onToolsStatus)
      socket.off('reconnect', onReconnect)
      socket.off('clear-input-buffer', onClearBuffer)

      if (latencyIntervalRef.current) {
        clearInterval(latencyIntervalRef.current)
        latencyIntervalRef.current = null
      }

      // Only disconnect the global socket if this is the last consumer
      if (socketConnectionCount <= 0) {
        socket.removeAllListeners()
        socket.disconnect()
        globalSocket = null
        outputHandlers.clear()
        outputBuffer.clear()
        clearBufferHandlers.clear()
        socketConnectionCount = 0
      }
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

      // Timeout after 15 seconds
      setTimeout(() => {
        socket.off('terminal:created', handler)
        reject(new Error('Timeout creating terminal'))
      }, 15000)
    })
  }, [])

  const destroyTerminal = useCallback((sessionId: string) => {
    const socket = socketRef.current
    if (!socket) return

    // Clean up output handlers for this session
    outputHandlers.delete(sessionId)
    outputBuffer.delete(sessionId)

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
  // Also flushes any buffered output for that session
  const onOutput = useCallback((sessionId: string, handler: (data: string) => void) => {
    if (!outputHandlers.has(sessionId)) {
      outputHandlers.set(sessionId, new Set())
    }
    outputHandlers.get(sessionId)!.add(handler)

    // Flush any buffered output for this session
    const buffered = outputBuffer.get(sessionId)
    if (buffered && buffered.length > 0) {
      // Use setTimeout to avoid calling handler during render
      setTimeout(() => {
        buffered.forEach(data => handler(data))
        outputBuffer.delete(sessionId)
      }, 0)
    }

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

  // Register a clear-buffer handler for a session - called before PTY restart
  const onClearBuffer = useCallback((sessionId: string, handler: () => void) => {
    if (!clearBufferHandlers.has(sessionId)) {
      clearBufferHandlers.set(sessionId, new Set())
    }
    clearBufferHandlers.get(sessionId)!.add(handler)

    return () => {
      const handlers = clearBufferHandlers.get(sessionId)
      if (handlers) {
        handlers.delete(handler)
        if (handlers.size === 0) {
          clearBufferHandlers.delete(sessionId)
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
        resolve(`echo "Install ${tool}: check if already available with 'which ${tool}', or use npm/pip3/bun to install"`)
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
        resolve(`echo "Install ${tool}: use npm/pip3/bun or download binary to ~/.local/bin"`)
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
      }, 8000)
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
      }, 8000)
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
      }, 8000)
    })
  }, [])

  const sendCommandToTerminal = useCallback((command: string) => {
    const sid = activeSessionIdRef.current
    if (sid) {
      sendInput(sid, command + '\n')
    }
  }, [sendInput])

  // OpenOutreach status
  const [ooStatus, setOoStatus] = useState<Record<string, boolean | string>>({})

  const checkOoStatus = useCallback(() => {
    const socket = socketRef.current
    if (!socket || !socket.connected) return

    const handler = (data: Record<string, boolean | string>) => {
      socket.off('openoutreach:status', handler)
      setOoStatus(data)
    }

    socket.on('openoutreach:status', handler)
    socket.emit('openoutreach:status')

    setTimeout(() => {
      socket.off('openoutreach:status', handler)
    }, 5000)
  }, [])

  const startOoServices = useCallback(() => {
    const socket = socketRef.current
    if (!socket || !socket.connected) return

    const handler = (data: Record<string, boolean | string>) => {
      socket.off('openoutreach:status', handler)
      setOoStatus(data)
    }

    socket.on('openoutreach:status', handler)
    socket.emit('openoutreach:start')

    setTimeout(() => {
      socket.off('openoutreach:status', handler)
    }, 15000)
  }, [])

  const startOoDaemon = useCallback(() => {
    const socket = socketRef.current
    if (!socket || !socket.connected) return

    const handler = (data: Record<string, boolean | string>) => {
      socket.off('openoutreach:status', handler)
      setOoStatus(data)
    }

    socket.on('openoutreach:status', handler)
    socket.emit('openoutreach:start-daemon')

    setTimeout(() => {
      socket.off('openoutreach:status', handler)
    }, 10000)
  }, [])

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
    onClearBuffer,
    checkTools,
    installTool,
    readFile,
    writeFile,
    listFiles,
    sendCommandToTerminal,
    ooStatus,
    checkOoStatus,
    startOoServices,
    startOoDaemon,
  }
}

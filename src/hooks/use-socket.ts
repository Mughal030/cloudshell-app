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

export function useSocket() {
  const socketRef = useRef<Socket | null>(null)
  const [connected, setConnected] = useState(false)
  const [tools, setTools] = useState<ToolInfo[]>([])
  const [sessions, setSessions] = useState<TerminalSessionInfo[]>([])
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const [latency, setLatency] = useState(0)
  const latencyIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    const socket = io('/?XTransformPort=3003', {
      transports: ['websocket', 'polling'],
      forceNew: true,
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
    })

    socketRef.current = socket

    socket.on('connect', () => {
      console.log('[useSocket] Connected to terminal service')
      setConnected(true)
      socket.emit('tools:check')
    })

    socket.on('disconnect', () => {
      console.log('[useSocket] Disconnected from terminal service')
      setConnected(false)
    })

    // Single global output handler that dispatches to all registered handlers
    socket.on('terminal:output', (data: { sessionId: string; data: string }) => {
      const handlers = outputHandlers.get(data.sessionId)
      if (handlers) {
        handlers.forEach(handler => handler(data.data))
      }
    })

    socket.on('tools:status', (toolsStatus: ToolInfo[]) => {
      setTools(toolsStatus)
    })

    // Latency measurement
    latencyIntervalRef.current = setInterval(() => {
      if (socket.connected) {
        const start = Date.now()
        socket.emit('ping', () => {
          setLatency(Date.now() - start)
        })
      }
    }, 5000)

    return () => {
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
        reject(new Error('Socket not connected'))
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
    socketRef.current?.emit('terminal:input', { sessionId, data })
  }, [])

  const resizeTerminal = useCallback((sessionId: string, cols: number, rows: number) => {
    socketRef.current?.emit('terminal:resize', { sessionId, cols, rows })
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

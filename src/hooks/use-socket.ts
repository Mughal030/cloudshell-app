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
      setConnected(true)
      socket.emit('tools:check')
    })

    socket.on('disconnect', () => {
      setConnected(false)
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
      // Destroy all sessions on unmount
      for (const session of sessions) {
        socket.emit('terminal:destroy', { sessionId: session.sessionId })
      }
      if (latencyIntervalRef.current) {
        clearInterval(latencyIntervalRef.current)
      }
      socket.disconnect()
      socketRef.current = null
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
          const label = `Terminal ${sessions.length + 1}`
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
  }, [sessions.length])

  const destroyTerminal = useCallback((sessionId: string) => {
    const socket = socketRef.current
    if (!socket) return

    socket.emit('terminal:destroy', { sessionId })

    setSessions(prev => {
      const next = prev.filter(s => s.sessionId !== sessionId)
      return next
    })
    setActiveSessionId(prev => {
      if (prev === sessionId) {
        // Use setSessions to get latest state, pick first remaining
        setSessions(current => {
          const remaining = current.filter(s => s.sessionId !== sessionId)
          setActiveSessionId(remaining.length > 0 ? remaining[0].sessionId : null)
          return current
        })
        return null
      }
      return prev
    })
  }, [])

  const sendInput = useCallback((sessionId: string, data: string) => {
    socketRef.current?.emit('terminal:input', { sessionId, data })
  }, [])

  const resizeTerminal = useCallback((sessionId: string, cols: number, rows: number) => {
    socketRef.current?.emit('terminal:resize', { sessionId, cols, rows })
  }, [])

  const onOutput = useCallback((handler: (data: { sessionId: string; data: string }) => void) => {
    const socket = socketRef.current
    if (!socket) return () => {}
    socket.on('terminal:output', handler)
    return () => {
      socket.off('terminal:output', handler)
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

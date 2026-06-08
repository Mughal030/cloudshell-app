'use client'

import { useEffect, useState } from 'react'
import {
  Server,
  RefreshCw,
  Power,
  Cpu,
  Activity,
  CheckCircle2,
  XCircle,
  Loader2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'

interface OpenOutreachPanelProps {
  ooStatus: Record<string, boolean | string>
  checkOoStatus: () => void
  startOoServices: () => void
  startOoDaemon: () => void
  sendCommandToTerminal: (command: string) => void
  connected: boolean
}

interface ServiceItem {
  name: string
  key: string
  icon: React.ElementType
  description: string
  color: string
}

const SERVICES: ServiceItem[] = [
  {
    name: 'Docker',
    key: 'docker',
    icon: Cpu,
    description: 'Container runtime',
    color: 'text-[#ffc107]',
  },
]

export function OpenOutreachPanel({
  ooStatus,
  checkOoStatus,
  startOoServices,
  startOoDaemon,
  sendCommandToTerminal,
  connected,
}: OpenOutreachPanelProps) {
  const [starting, setStarting] = useState(false)

  // Check status on connect
  useEffect(() => {
    if (connected) {
      checkOoStatus()
    }
  }, [connected, checkOoStatus])

  // Auto-refresh status every 10s
  useEffect(() => {
    const interval = setInterval(() => {
      if (connected) {
        checkOoStatus()
      }
    }, 10000)
    return () => clearInterval(interval)
  }, [connected, checkOoStatus])

  const isServiceRunning = (key: string): boolean => {
    return ooStatus[key] === true
  }

  const allRunning = SERVICES.every(s => isServiceRunning(s.key))

  const handleStart = async () => {
    setStarting(true)
    startOoServices()
    setTimeout(() => {
      checkOoStatus()
      setStarting(false)
    }, 5000)
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[#1e2a5a]/50">
        <div className="flex items-center gap-1.5">
          <Server className="h-3.5 w-3.5 text-[#00d4ff]" />
          <span className="text-xs font-medium text-[#c8d6e5]">Services</span>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-[#6b7ba0] hover:text-[#00d4ff] transition-colors"
            onClick={checkOoStatus}
            disabled={!connected}
          >
            <RefreshCw className="h-3 w-3" />
          </Button>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-2 space-y-3">
          {/* Overall Status */}
          <div className={`rounded-lg border p-3 transition-colors ${
            allRunning
              ? 'bg-[#00e676]/5 border-[#00e676]/20'
              : 'bg-[#0a0e23] border-[#1e2a5a]'
          }`}>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                {allRunning ? (
                  <CheckCircle2 className="h-4 w-4 text-[#00e676]" />
                ) : (
                  <XCircle className="h-4 w-4 text-[#3d4a6e]" />
                )}
                <span className="text-xs font-semibold text-[#c8d6e5]">
                  {allRunning ? 'All Services Running' : 'Services Offline'}
                </span>
              </div>
              <Badge
                variant="secondary"
                className={`h-4 px-1.5 text-[8px] ${
                  allRunning
                    ? 'bg-[#00e676]/10 text-[#00e676] border-[#00e676]/20'
                    : 'bg-[#1e2a5a] text-[#6b7ba0]'
                }`}
              >
                {SERVICES.filter(s => isServiceRunning(s.key)).length}/{SERVICES.length}
              </Badge>
            </div>

            {!allRunning && (
              <Button
                size="sm"
                className="w-full h-7 text-xs gap-1.5 bg-[#ffc107]/20 hover:bg-[#ffc107]/30 text-[#ffc107] border border-[#ffc107]/30 transition-colors"
                onClick={handleStart}
                disabled={!connected || starting}
              >
                {starting ? (
                  <>
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Starting...
                  </>
                ) : (
                  <>
                    <Power className="h-3 w-3" />
                    Start All Services
                  </>
                )}
              </Button>
            )}
          </div>

          {/* Service Status List */}
          <div className="space-y-1.5">
            <h3 className="text-[10px] font-semibold text-[#6b7ba0] uppercase tracking-wider px-1">
              Service Status
            </h3>

            {SERVICES.map((service) => {
              const running = isServiceRunning(service.key)
              const Icon = service.icon

              return (
                <div
                  key={service.key}
                  className="flex items-center gap-2 px-2 py-1.5 rounded text-xs hover:bg-[#1a2048]/60 transition-colors"
                >
                  <span className={`relative flex h-1.5 w-1.5 shrink-0`}>
                    {running ? (
                      <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-[#00e676]" />
                    ) : (
                      <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-[#3d4a6e]" />
                    )}
                  </span>
                  <Icon className={`h-3 w-3 shrink-0 ${running ? service.color : 'text-[#3d4a6e]'}`} />
                  <span className={`flex-1 ${running ? 'text-[#c8d6e5]' : 'text-[#3d4a6e]'}`}>
                    {service.name}
                  </span>
                </div>
              )
            })}
          </div>

          {/* Terminal Commands */}
          <div className="space-y-1.5">
            <h3 className="text-[10px] font-semibold text-[#6b7ba0] uppercase tracking-wider px-1">
              Quick Commands
            </h3>

            <button
              className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs hover:bg-[#1a2048] transition-colors disabled:opacity-50"
              onClick={() => sendCommandToTerminal('docker ps 2>&1 || echo "Docker not running"')}
              disabled={!connected}
            >
              <Activity className="h-3 w-3 text-[#6b7ba0]" />
              <span className="text-[#c8d6e5]">Check Docker status</span>
            </button>

            <button
              className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs hover:bg-[#1a2048] transition-colors disabled:opacity-50"
              onClick={() => sendCommandToTerminal('dockerd-rootless &')}
              disabled={!connected}
            >
              <Power className="h-3 w-3 text-[#ffc107]" />
              <span className="text-[#c8d6e5]">Start rootless Docker</span>
            </button>

            <button
              className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs hover:bg-[#1a2048] transition-colors disabled:opacity-50"
              onClick={() => sendCommandToTerminal('which python3 && python3 --version')}
              disabled={!connected}
            >
              <Cpu className="h-3 w-3 text-[#6b7ba0]" />
              <span className="text-[#c8d6e5]">Check Python</span>
            </button>

            <button
              className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs hover:bg-[#1a2048] transition-colors disabled:opacity-50"
              onClick={() => sendCommandToTerminal('which node && node --version && which npm && npm --version')}
              disabled={!connected}
            >
              <Cpu className="h-3 w-3 text-[#6b7ba0]" />
              <span className="text-[#c8d6e5]">Check Node.js</span>
            </button>
          </div>

          {/* Docker Info */}
          <div className="px-3 py-2 border border-[#1e2a5a] rounded-lg bg-[#0a0e23]">
            <div className="flex items-center gap-1.5 mb-1.5">
              <Cpu className="h-3.5 w-3.5 text-[#ffc107]" />
              <span className="text-xs font-medium text-[#ffc107]">Container Runtime</span>
            </div>
            <div className="text-[10px] text-[#6b7ba0] space-y-1">
              <p>Start Docker daemon: <code className="text-[#00d4ff] bg-[#0f1430] px-1 rounded">dockerd-rootless &</code></p>
              <p>Then use: <code className="text-[#00d4ff] bg-[#0f1430] px-1 rounded">docker ps</code>, <code className="text-[#00d4ff] bg-[#0f1430] px-1 rounded">docker run</code>, etc.</p>
            </div>
          </div>
        </div>
      </ScrollArea>
    </div>
  )
}

'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Monitor,
  Shield,
  Globe,
  Server,
  Play,
  RefreshCw,
  ExternalLink,
  Activity,
  Power,
  PowerOff,
  Eye,
  LayoutDashboard,
  Cpu,
  Database,
  Wifi,
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
  port: number
  url: string
  color: string
}

const SERVICES: ServiceItem[] = [
  {
    name: 'Xvfb',
    key: 'xvfb',
    icon: Monitor,
    description: 'Virtual framebuffer (display :99)',
    port: 0,
    url: '',
    color: 'text-purple-400',
  },
  {
    name: 'x11vnc',
    key: 'x11vnc',
    icon: Eye,
    description: 'VNC server on port 5900',
    port: 5900,
    url: '',
    color: 'text-orange-400',
  },
  {
    name: 'websockify/noVNC',
    key: 'websockify',
    icon: Wifi,
    description: 'Browser-based remote desktop',
    port: 6080,
    url: '/novnc/vnc.html?autoconnect=true',
    color: 'text-cyan-400',
  },
  {
    name: 'Django Admin',
    key: 'django',
    icon: Shield,
    description: 'Web admin panel on port 8000',
    port: 8000,
    url: '/admin/',
    color: 'text-green-400',
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

  const anyRunning = Object.entries(ooStatus).some(
    ([key, val]) => key !== 'started' && val === true
  )

  const allRunning = SERVICES.every(s => isServiceRunning(s.key))

  const handleStart = async () => {
    setStarting(true)
    startOoServices()
    // Wait a bit then check status
    setTimeout(() => {
      checkOoStatus()
      setStarting(false)
    }, 5000)
  }

  const handleStartDaemon = () => {
    startOoDaemon()
    setTimeout(() => {
      checkOoStatus()
    }, 3000)
  }

  const openUrl = (url: string) => {
    window.open(url, '_blank')
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[#21262d]/50">
        <div className="flex items-center gap-1.5">
          <Globe className="h-3.5 w-3.5 text-[#00ff41]" />
          <span className="text-xs font-medium">OpenOutreach</span>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
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
          <div className={`rounded-lg border p-3 ${
            allRunning
              ? 'bg-green-500/5 border-green-500/20'
              : anyRunning
                ? 'bg-yellow-500/5 border-yellow-500/20'
                : 'bg-[#0d1117] border-[#21262d]'
          }`}>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                {allRunning ? (
                  <CheckCircle2 className="h-4 w-4 text-green-400" />
                ) : anyRunning ? (
                  <Activity className="h-4 w-4 text-yellow-400" />
                ) : (
                  <XCircle className="h-4 w-4 text-[#484f58]" />
                )}
                <span className="text-xs font-semibold">
                  {allRunning ? 'All Services Running' : anyRunning ? 'Partial Services' : 'Services Stopped'}
                </span>
              </div>
              <Badge
                variant="secondary"
                className={`h-4 px-1.5 text-[8px] ${
                  allRunning
                    ? 'bg-green-500/10 text-green-400 border-green-500/20'
                    : anyRunning
                      ? 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20'
                      : 'bg-[#21262d] text-[#8b949e]'
                }`}
              >
                {SERVICES.filter(s => isServiceRunning(s.key)).length}/{SERVICES.length}
              </Badge>
            </div>

            {!allRunning && (
              <Button
                size="sm"
                className="w-full h-7 text-xs gap-1.5 bg-[#238636] hover:bg-[#2ea043] text-white"
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

          {/* Quick Launch Buttons */}
          <div className="space-y-1.5">
            <h3 className="text-[10px] font-semibold text-[#8b949e] uppercase tracking-wider px-1">
              Quick Launch
            </h3>

            {/* Django Admin Button */}
            <button
              className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-xs hover:bg-[#21262d] transition-colors disabled:opacity-50 group"
              onClick={() => openUrl('/admin/')}
              disabled={!connected || !isServiceRunning('django')}
            >
              <div className="flex items-center justify-center h-7 w-7 rounded bg-green-500/10 border border-green-500/20 shrink-0">
                <Shield className="h-3.5 w-3.5 text-green-400" />
              </div>
              <div className="flex-1 text-left">
                <div className="font-medium text-[#c9d1d9] group-hover:text-green-400 transition-colors">Django Admin</div>
                <div className="text-[10px] text-[#8b949e]">Web admin panel</div>
              </div>
              <ExternalLink className="h-3 w-3 text-[#484f58] group-hover:text-green-400 transition-colors" />
            </button>

            {/* noVNC Button */}
            <button
              className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-xs hover:bg-[#21262d] transition-colors disabled:opacity-50 group"
              onClick={() => openUrl('/novnc/vnc.html?autoconnect=true')}
              disabled={!connected || !isServiceRunning('websockify')}
            >
              <div className="flex items-center justify-center h-7 w-7 rounded bg-cyan-500/10 border border-cyan-500/20 shrink-0">
                <Monitor className="h-3.5 w-3.5 text-cyan-400" />
              </div>
              <div className="flex-1 text-left">
                <div className="font-medium text-[#c9d1d9] group-hover:text-cyan-400 transition-colors">noVNC Desktop</div>
                <div className="text-[10px] text-[#8b949e]">Browser remote desktop</div>
              </div>
              <ExternalLink className="h-3 w-3 text-[#484f58] group-hover:text-cyan-400 transition-colors" />
            </button>

            {/* Django API Button */}
            <button
              className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-xs hover:bg-[#21262d] transition-colors disabled:opacity-50 group"
              onClick={() => openUrl('/openoutreach/api/')}
              disabled={!connected || !isServiceRunning('django')}
            >
              <div className="flex items-center justify-center h-7 w-7 rounded bg-blue-500/10 border border-blue-500/20 shrink-0">
                <Database className="h-3.5 w-3.5 text-blue-400" />
              </div>
              <div className="flex-1 text-left">
                <div className="font-medium text-[#c9d1d9] group-hover:text-blue-400 transition-colors">Outreach API</div>
                <div className="text-[10px] text-[#8b949e]">REST API endpoints</div>
              </div>
              <ExternalLink className="h-3 w-3 text-[#484f58] group-hover:text-blue-400 transition-colors" />
            </button>
          </div>

          {/* Service Status List */}
          <div className="space-y-1.5">
            <h3 className="text-[10px] font-semibold text-[#8b949e] uppercase tracking-wider px-1">
              Service Status
            </h3>

            {SERVICES.map((service) => {
              const running = isServiceRunning(service.key)
              const Icon = service.icon

              return (
                <div
                  key={service.key}
                  className="flex items-center gap-2 px-2 py-1.5 rounded text-xs hover:bg-[#21262d]/50 transition-colors"
                >
                  <span className={`relative flex h-1.5 w-1.5 shrink-0`}>
                    {running ? (
                      <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-green-500" />
                    ) : (
                      <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-[#484f58]" />
                    )}
                  </span>
                  <Icon className={`h-3 w-3 shrink-0 ${running ? service.color : 'text-[#484f58]'}`} />
                  <span className={`flex-1 ${running ? 'text-[#c9d1d9]' : 'text-[#484f58]'}`}>
                    {service.name}
                  </span>
                  {service.port > 0 && (
                    <span className="text-[9px] text-[#484f58] font-mono">
                      :{service.port}
                    </span>
                  )}
                  {running && service.url && (
                    <button
                      className="p-0.5 rounded hover:bg-[#21262d] text-[#484f58] hover:text-[#00ff41] transition-colors"
                      onClick={() => openUrl(service.url)}
                      title={`Open ${service.name}`}
                    >
                      <ExternalLink className="h-2.5 w-2.5" />
                    </button>
                  )}
                </div>
              )
            })}
          </div>

          {/* Advanced Actions */}
          <div className="space-y-1.5">
            <h3 className="text-[10px] font-semibold text-[#8b949e] uppercase tracking-wider px-1">
              Terminal Commands
            </h3>

            <button
              className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs hover:bg-[#21262d] transition-colors disabled:opacity-50"
              onClick={() => sendCommandToTerminal('openoutreach status')}
              disabled={!connected}
            >
              <Activity className="h-3 w-3 text-[#8b949e]" />
              <span className="text-[#c9d1d9]">Check service status</span>
            </button>

            <button
              className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs hover:bg-[#21262d] transition-colors disabled:opacity-50"
              onClick={() => sendCommandToTerminal('openoutreach start')}
              disabled={!connected}
            >
              <Play className="h-3 w-3 text-green-400" />
              <span className="text-[#c9d1d9]">Start via terminal</span>
            </button>

            <button
              className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs hover:bg-[#21262d] transition-colors disabled:opacity-50"
              onClick={() => sendCommandToTerminal('openoutreach restart')}
              disabled={!connected}
            >
              <RefreshCw className="h-3 w-3 text-yellow-400" />
              <span className="text-[#c9d1d9]">Restart all services</span>
            </button>

            <button
              className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs hover:bg-[#21262d] transition-colors disabled:opacity-50"
              onClick={() => sendCommandToTerminal('dockerd-rootless &')}
              disabled={!connected}
            >
              <Power className="h-3 w-3 text-blue-400" />
              <span className="text-[#c9d1d9]">Start rootless Docker</span>
            </button>

            <button
              className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs hover:bg-[#21262d] transition-colors disabled:opacity-50"
              onClick={() => sendCommandToTerminal('/home/z/bin/docker ps 2>&1 || echo "Docker daemon not running. Run: dockerd-rootless &"')}
              disabled={!connected}
            >
              <Cpu className="h-3 w-3 text-blue-400" />
              <span className="text-[#c9d1d9]">Check Docker containers</span>
            </button>

            <button
              className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs hover:bg-[#21262d] transition-colors disabled:opacity-50"
              onClick={handleStartDaemon}
              disabled={!connected}
            >
              <LayoutDashboard className="h-3 w-3 text-purple-400" />
              <span className="text-[#c9d1d9]">Start Outreach Daemon</span>
            </button>
          </div>

          {/* Rootless Docker Info */}
          <div className="px-3 py-2 border border-[#21262d] rounded-lg bg-[#0d1117]">
            <div className="flex items-center gap-1.5 mb-1.5">
              <Cpu className="h-3.5 w-3.5 text-blue-400" />
              <span className="text-xs font-medium text-blue-400">Rootless Docker</span>
            </div>
            <div className="text-[10px] text-[#8b949e] space-y-1">
              <p>Docker is installed at <code className="text-[#00ff41] bg-[#161b22] px-1 rounded">/home/z/bin/docker</code></p>
              <p>Start the daemon first: <code className="text-[#00ff41] bg-[#161b22] px-1 rounded">dockerd-rootless &</code></p>
              <p>Then use: <code className="text-[#00ff41] bg-[#161b22] px-1 rounded">docker ps</code>, <code className="text-[#00ff41] bg-[#161b22] px-1 rounded">docker run</code>, etc.</p>
            </div>
          </div>
        </div>
      </ScrollArea>
    </div>
  )
}

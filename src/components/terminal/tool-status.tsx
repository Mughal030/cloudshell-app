'use client'

import { RefreshCw, CheckCircle2, XCircle, Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import type { ToolInfo } from '@/hooks/use-socket'

interface ToolStatusProps {
  tools: ToolInfo[]
  checkTools: () => void
  onInstall: (tool: string) => Promise<string>
  sendCommandToTerminal: (command: string) => void
  loading: boolean
}

export function ToolStatus({ tools, checkTools, onInstall, sendCommandToTerminal, loading }: ToolStatusProps) {
  // Don't auto-check on mount — server now serves tool status from a 60s cache
  // and pushes updates via the 'tools:status' socket event whenever a client
  // connects. Auto-checking here just caused unnecessary re-renders and
  // latency on page load. User can still click the refresh button.
  // (Removed the empty-deps useEffect that was calling checkTools() on mount.)

  const handleInstall = async (toolName: string) => {
    const command = await onInstall(toolName)
    sendCommandToTerminal(command)
  }

  const installedCount = tools.filter(t => t.installed).length

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--nx-border)]/50">
        <span className="text-xs font-medium text-[var(--nx-text-secondary)]">
          {loading && tools.length === 0 ? 'Checking...' : `${installedCount}/${tools.length} installed`}
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 text-[var(--nx-text-secondary)] hover:text-[var(--nx-accent-teal)] transition-colors"
          onClick={checkTools}
          disabled={loading}
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading && tools.length === 0 ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {/* Tools Grid */}
      <ScrollArea className="flex-1">
        <div className="grid grid-cols-1 gap-0.5 p-1">
          {tools.map((tool) => (
            <div
              key={tool.name}
              className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-[var(--nx-bg-hover)]/60 transition-colors group"
            >
              {tool.installed ? (
                <CheckCircle2 className="h-3.5 w-3.5 text-[var(--nx-success)] shrink-0" />
              ) : (
                <XCircle className="h-3.5 w-3.5 text-[var(--nx-error)]/60 shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <span className="text-xs font-medium text-[var(--nx-text)]">
                  {tool.displayName || tool.name}
                </span>
                {tool.installed && tool.version && (
                  <span className="text-[10px] text-[var(--nx-text-dim)] ml-1.5 truncate">
                    {tool.version.split('\n')[0]}
                  </span>
                )}
              </div>
              {!tool.installed && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-5 px-1.5 text-[10px] opacity-0 group-hover:opacity-100 transition-opacity text-[var(--nx-warning)] hover:text-[var(--nx-warning)] hover:bg-[var(--nx-warning)]/10"
                  onClick={() => handleInstall(tool.name)}
                >
                  <Download className="h-3 w-3 mr-0.5" />
                  Install
                </Button>
              )}
              {tool.installed && (
                <Badge variant="secondary" className="h-4 px-1 text-[9px] bg-[var(--nx-success)]/10 text-[var(--nx-success)] border-[var(--nx-success)]/20">
                  OK
                </Badge>
              )}
            </div>
          ))}
          {tools.length === 0 && loading && (
            <div className="text-center text-[var(--nx-text-secondary)] text-xs py-6">
              <RefreshCw className="h-4 w-4 mx-auto mb-2 animate-spin" />
              Checking installed tools...
            </div>
          )}
          {tools.length === 0 && !loading && (
            <div className="text-center text-[var(--nx-text-dim)] text-xs py-6">
              Click refresh to check tools
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}

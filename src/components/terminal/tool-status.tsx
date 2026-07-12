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
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--nx-border)]/50 relative" style={{background: 'linear-gradient(180deg, var(--nx-bg-secondary) 0%, transparent 100%)'}}>
        <div className="absolute bottom-0 left-3 right-3 h-px" style={{background: 'linear-gradient(90deg, transparent, var(--nx-accent-teal)/25, transparent)'}} />
        <div className="flex items-center gap-2">
          <span className="inline-block w-1.5 h-1.5 rounded-full" style={{background: loading ? 'var(--nx-warning)' : installedCount === tools.length && tools.length > 0 ? 'var(--nx-success)' : 'var(--nx-accent-teal)', boxShadow: `0 0 6px ${loading ? 'rgba(251,191,36,0.4)' : installedCount === tools.length && tools.length > 0 ? 'rgba(52,211,153,0.4)' : 'rgba(99,102,241,0.4)'}`}} />
          <span className="text-xs font-medium text-[var(--nx-text-secondary)]">
            {loading && tools.length === 0 ? 'Checking...' : `${installedCount}/${tools.length} installed`}
          </span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 text-[var(--nx-text-secondary)] hover:text-[var(--nx-accent-teal)] transition-all duration-200 hover:drop-shadow-[0_0_6px_rgba(99,102,241,0.3)] hover:rotate-180"
          style={{transition: 'all 0.3s ease'}}
          onClick={checkTools}
          disabled={loading}
          title="Refresh tool status"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading && tools.length === 0 ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {/* Tools Grid */}
      <ScrollArea className="flex-1 min-h-0">
        <div className="grid grid-cols-1 gap-0.5 p-1.5">
          {tools.map((tool) => (
            <div
              key={tool.name}
              className="flex items-center gap-2 px-2.5 py-2 rounded-md transition-all duration-200 group relative overflow-hidden"
              style={{background: tool.installed ? 'linear-gradient(90deg, rgba(52,211,153,0.03) 0%, transparent 60%)' : 'linear-gradient(90deg, rgba(248,113,113,0.02) 0%, transparent 60%)'}}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLDivElement).style.background = tool.installed
                  ? 'linear-gradient(90deg, rgba(52,211,153,0.08) 0%, var(--nx-bg-hover) 50%)'
                  : 'linear-gradient(90deg, rgba(248,113,113,0.06) 0%, var(--nx-bg-hover) 50%)'
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLDivElement).style.background = tool.installed
                  ? 'linear-gradient(90deg, rgba(52,211,153,0.03) 0%, transparent 60%)'
                  : 'linear-gradient(90deg, rgba(248,113,113,0.02) 0%, transparent 60%)'
              }}
            >
              {/* Left accent bar */}
              <div className="absolute left-0 top-0 bottom-0 w-0.5 rounded-l-md transition-all duration-200" style={{background: tool.installed ? 'var(--nx-success)' : 'var(--nx-error)', opacity: 0.3}} />
              {tool.installed ? (
                <CheckCircle2 className="h-4 w-4 text-[var(--nx-success)] shrink-0 drop-shadow-[0_0_4px_rgba(52,211,153,0.35)]" />
              ) : (
                <XCircle className="h-4 w-4 text-[var(--nx-error)]/50 shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <span className="text-xs font-medium text-[var(--nx-text)]">
                  {tool.displayName || tool.name}
                </span>
                {tool.installed && tool.version && (
                  <span className="text-[10px] ml-1.5 truncate font-mono" style={{color: 'var(--nx-success)/70'}}>
                    v{tool.version.split('\n')[0].replace(/^v?/, '')}
                  </span>
                )}
              </div>
              {!tool.installed && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-[10px] opacity-0 group-hover:opacity-100 transition-all duration-300 text-[var(--nx-warning)] hover:text-[var(--nx-warning)] hover:bg-[var(--nx-warning)]/10 border border-[var(--nx-warning)]/20 hover:border-[var(--nx-warning)]/40 hover:drop-shadow-[0_0_6px_rgba(251,191,36,0.25)]"
                  onClick={() => handleInstall(tool.name)}
                  title={`Install ${tool.displayName || tool.name}`}
                >
                  <Download className="h-3 w-3 mr-0.5" />
                  Install
                </Button>
              )}
              {tool.installed && (
                <Badge variant="secondary" className="h-4 px-1.5 text-[9px] bg-[var(--nx-success)]/10 text-[var(--nx-success)] border-[var(--nx-success)]/20 drop-shadow-[0_0_4px_rgba(52,211,153,0.2)]">
                  ✓ OK
                </Badge>
              )}
            </div>
          ))}
          {tools.length === 0 && loading && (
            <div className="text-center text-[var(--nx-text-secondary)] text-xs py-8">
              <RefreshCw className="h-5 w-5 mx-auto mb-3 animate-spin opacity-50" />
              <span style={{background: 'linear-gradient(90deg, var(--nx-text-dim), var(--nx-text-muted))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent'}}>Scanning installed tools...</span>
            </div>
          )}
          {tools.length === 0 && !loading && (
            <div className="text-center text-[var(--nx-text-dim)] text-xs py-8">
              <div className="mb-2 opacity-30">⏎</div>
              <span style={{background: 'linear-gradient(135deg, var(--nx-text-dim), var(--nx-text-muted))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent'}}>Click refresh to scan tools</span>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}

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
  const handleInstall = async (toolName: string) => {
    const command = await onInstall(toolName)
    sendCommandToTerminal(command)
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[#21262d]/50">
        <span className="text-xs font-medium text-[#8b949e]">
          {tools.filter(t => t.installed).length}/{tools.length} installed
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 text-[#8b949e] hover:text-[#00ff41]"
          onClick={checkTools}
          disabled={loading}
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {/* Tools Grid */}
      <ScrollArea className="flex-1">
        <div className="grid grid-cols-1 gap-0.5 p-1">
          {tools.map((tool) => (
            <div
              key={tool.name}
              className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-[#21262d]/50 transition-colors group"
            >
              {tool.installed ? (
                <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />
              ) : (
                <XCircle className="h-3.5 w-3.5 text-red-400/70 shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <span className="text-xs font-medium text-[#c9d1d9]">{tool.name}</span>
                {tool.installed && tool.version && (
                  <span className="text-[10px] text-[#484f58] ml-1.5 truncate">
                    {tool.version.split('\n')[0]}
                  </span>
                )}
              </div>
              {!tool.installed && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-5 px-1.5 text-[10px] opacity-0 group-hover:opacity-100 transition-opacity text-[#00ff41] hover:text-[#56d364] hover:bg-[#238636]/10"
                  onClick={() => handleInstall(tool.name)}
                >
                  <Download className="h-3 w-3 mr-0.5" />
                  Install
                </Button>
              )}
              {tool.installed && (
                <Badge variant="secondary" className="h-4 px-1 text-[9px] bg-green-500/10 text-green-400 border-green-500/20">
                  OK
                </Badge>
              )}
            </div>
          ))}
          {tools.length === 0 && !loading && (
            <div className="text-center text-[#484f58] text-xs py-6">
              Click refresh to check tools
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}

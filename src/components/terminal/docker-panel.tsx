'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Container,
  FileCode,
  Plus,
  RefreshCw,
  Play,
  Rocket,
  Info,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import type { FileInfo } from '@/hooks/use-socket'

interface DockerPanelProps {
  listFiles: (path?: string) => Promise<{ files: FileInfo[]; error: string | null }>
  onFileOpen: (path: string, content?: string) => void
  sendCommandToTerminal: (command: string) => void
  connected: boolean
}

const DOCKERFILE_TEMPLATE = `FROM ubuntu:22.04

# Install system packages
RUN apt-get update && apt-get install -y \\
    curl \\
    wget \\
    git \\
    vim \\
    nano \\
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy application files
COPY . .

# Default command
CMD ["/bin/bash"]`

export function DockerPanel({ listFiles, onFileOpen, sendCommandToTerminal, connected }: DockerPanelProps) {
  const [dockerfiles, setDockerfiles] = useState<FileInfo[]>([])
  const [loading, setLoading] = useState(false)

  const loadDockerfiles = useCallback(async () => {
    setLoading(true)
    try {
      const result = await listFiles('.dockerfiles')
      if (!result.error) {
        setDockerfiles(result.files.filter(f => f.name.endsWith('.dockerfile') || f.name === 'Dockerfile' || f.name.endsWith('.Dockerfile')))
      }
    } finally {
      setLoading(false)
    }
  }, [listFiles])

  useEffect(() => {
    if (connected) {
      loadDockerfiles()
    }
  }, [connected, loadDockerfiles])

  const handleNewDockerfile = async () => {
    const name = `Dockerfile.${Date.now().toString(36)}`
    const path = `.dockerfiles/${name}`
    onFileOpen(path, DOCKERFILE_TEMPLATE)
  }

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '-'
    if (bytes < 1024) return `${bytes}B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}K`
    return `${(bytes / (1024 * 1024)).toFixed(1)}M`
  }

  const handleBuildImage = (dockerfileName: string) => {
    const name = dockerfileName.replace(/\.dockerfile$/i, '').toLowerCase()
    sendCommandToTerminal(`cd /home/z/my-project/workspace && docker build -f .dockerfiles/${dockerfileName} -t ${name}:latest .`)
  }

  const handleRunContainer = (dockerfileName: string) => {
    const name = dockerfileName.replace(/\.dockerfile$/i, '').toLowerCase()
    sendCommandToTerminal(`docker run -it --rm ${name}:latest`)
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border/30">
        <div className="flex items-center gap-1.5">
          <Container className="h-3.5 w-3.5 text-blue-400" />
          <span className="text-xs font-medium">Dockerfiles</span>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={loadDockerfiles}
            disabled={loading}
          >
            <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={handleNewDockerfile}
            title="New Dockerfile"
          >
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Docker Info */}
      <div className="px-3 py-2 border-b border-[#21262d]/50">
        <div className="flex items-start gap-2 text-[10px] text-[#8b949e] bg-[#0d1117] rounded p-2">
          <Info className="h-3.5 w-3.5 shrink-0 mt-0.5 text-blue-400" />
          <span>Dockerfiles are saved in <code className="text-[#00ff41] bg-[#161b22] px-1 rounded">.dockerfiles/</code> and persist across sessions.</span>
        </div>
      </div>

      {/* Dockerfiles List */}
      <ScrollArea className="flex-1">
        <div className="p-1">
          {dockerfiles.length === 0 && !loading && (
            <div className="text-center py-6 px-3">
              <Container className="h-8 w-8 mx-auto text-[#21262d] mb-2" />
              <p className="text-xs text-[#8b949e]">No Dockerfiles yet</p>
              <p className="text-[10px] text-[#484f58] mt-1">
                Create one to get started
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-3 h-7 text-xs text-[#00ff41] border-[#238636] hover:bg-[#238636]/20"
                onClick={handleNewDockerfile}
              >
                <Plus className="h-3 w-3 mr-1" />
                New Dockerfile
              </Button>
            </div>
          )}
          {dockerfiles.map((df) => (
            <div
              key={df.name}
              className="flex flex-col gap-1.5 px-2 py-2 rounded hover:bg-[#21262d]/50 transition-colors group"
            >
              <div className="flex items-center gap-2">
                <FileCode className="h-3.5 w-3.5 text-blue-400 shrink-0" />
                <button
                  className="text-xs font-medium truncate flex-1 text-left hover:text-blue-400 transition-colors"
                  onClick={() => onFileOpen(`.dockerfiles/${df.name}`)}
                >
                  {df.name}
                </button>
                <Badge variant="secondary" className="h-4 px-1 text-[8px] bg-blue-500/10 text-blue-400 border-blue-500/20 shrink-0">
                  {formatSize(df.size)}
                </Badge>
              </div>
              <div className="flex items-center gap-1 ml-5.5">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-5 px-1.5 text-[10px] text-green-400 hover:text-green-300 hover:bg-[#238636]/10"
                  onClick={() => handleBuildImage(df.name)}
                >
                  <Rocket className="h-3 w-3 mr-0.5" />
                  Build
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-5 px-1.5 text-[10px] text-blue-400 hover:text-blue-300 hover:bg-blue-500/10"
                  onClick={() => handleRunContainer(df.name)}
                >
                  <Play className="h-3 w-3 mr-0.5" />
                  Run
                </Button>
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  )
}

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
RUN apt-get update && apt-get install -y \
    curl \
    wget \
    git \
    vim \
    nano \
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
  const [error, setError] = useState<string | null>(null)

  const loadDockerfiles = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await listFiles('.dockerfiles')
      if (result.error) {
        setError(result.error)
        setDockerfiles([])
      } else {
        setDockerfiles(result.files.filter(f => {
          const nameLower = f.name.toLowerCase()
          return nameLower.startsWith('dockerfile') || nameLower.endsWith('.dockerfile')
        }))
      }
    } catch (err) {
      console.error('Error loading dockerfiles:', err)
      setError('Failed to load Dockerfiles')
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

  // Use rootless Docker installed at /home/z/bin/docker
  const getContainerCmd = () => {
    return '/home/z/bin/docker'
  }

  const handleBuildImage = (dockerfileName: string) => {
    const name = dockerfileName.replace(/\.dockerfile$/i, '').toLowerCase()
    const cmd = getContainerCmd()
    sendCommandToTerminal(`cd /home/z/my-project/workspace && ${cmd} build -f .dockerfiles/${dockerfileName} -t ${name}:latest . 2>&1 || echo "Docker build failed - make sure dockerd-rootless is running (dockerd-rootless &)"`)
  }

  const handleRunContainer = (dockerfileName: string) => {
    const name = dockerfileName.replace(/\.dockerfile$/i, '').toLowerCase()
    const cmd = getContainerCmd()
    sendCommandToTerminal(`${cmd} run -it --rm ${name}:latest 2>&1 || echo "Docker run failed - make sure dockerd-rootless is running (dockerd-rootless &)"`)
  }

  const handleCheckDocker = () => {
    sendCommandToTerminal('echo "=== Checking Docker (Rootless) ===" && /home/z/bin/docker --version 2>/dev/null && echo "Docker found!" && echo "" && (pgrep -f dockerd-rootless > /dev/null && echo "Docker daemon: Running" || echo "Docker daemon: NOT running (start with: dockerd-rootless &)") && /home/z/bin/docker ps 2>&1 || echo "Docker not available - start daemon first: dockerd-rootless &"')
  }

  const handleInstallPodman = () => {
    sendCommandToTerminal('echo "Starting rootless Docker daemon..." && dockerd-rootless &>/dev/null & sleep 3 && /home/z/bin/docker ps && echo "Docker is ready!" || echo "Failed to start Docker daemon"')
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[#1e2a5a]/50">
        <div className="flex items-center gap-1.5">
          <Container className="h-3.5 w-3.5 text-[#ffc107]" />
          <span className="text-xs font-medium text-[#c8d6e5]">Containers</span>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-[#6b7ba0] hover:text-[#00d4ff] transition-colors"
            onClick={loadDockerfiles}
            disabled={loading}
          >
            <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-[#6b7ba0] hover:text-[#ffc107] transition-colors"
            onClick={handleNewDockerfile}
            title="New Dockerfile"
          >
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Docker Info */}
      <div className="px-3 py-2 border-b border-[#1e2a5a]/50">
        <div className="flex items-start gap-2 text-[10px] text-[#6b7ba0] bg-[#0a0e23] rounded p-2">
          <Info className="h-3.5 w-3.5 shrink-0 mt-0.5 text-[#ffc107]" />
          <div className="flex-1">
            <span>Dockerfiles are saved in <code className="text-[#00d4ff] bg-[#0f1430] px-1 rounded">.dockerfiles/</code> and persist across sessions. Uses <b>Rootless Docker</b> at <code className="text-[#00d4ff] bg-[#0f1430] px-1 rounded">/home/z/bin/docker</code></span>
            <div className="flex gap-2 mt-1">
              <button
                className="text-[#ffc107] hover:text-[#ffe57f] underline transition-colors"
                onClick={handleCheckDocker}
              >
                Check Docker
              </button>
              <button
                className="text-[#00e676] hover:text-[#69f0ae] underline transition-colors"
                onClick={handleInstallPodman}
              >
                Start Daemon
              </button>
            </div>
          </div>
        </div>
        {error && (
          <div className="mt-1 text-[10px] text-[#ff5252] bg-[#ff5252]/10 rounded p-1.5">
            {error}
          </div>
        )}
      </div>

      {/* Dockerfiles List */}
      <ScrollArea className="flex-1">
        <div className="p-1">
          {dockerfiles.length === 0 && !loading && (
            <div className="text-center py-6 px-3">
              <Container className="h-8 w-8 mx-auto text-[#1e2a5a] mb-2" />
              <p className="text-xs text-[#6b7ba0]">No Dockerfiles yet</p>
              <p className="text-[10px] text-[#3d4a6e] mt-1">
                Create one to get started
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-3 h-7 text-xs text-[#ffc107] border-[#ffc107]/30 hover:bg-[#ffc107]/10 transition-colors"
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
              className="flex flex-col gap-1.5 px-2 py-2 rounded hover:bg-[#1a2048]/60 transition-colors group"
            >
              <div className="flex items-center gap-2">
                <FileCode className="h-3.5 w-3.5 text-[#ffc107] shrink-0" />
                <button
                  className="text-xs font-medium truncate flex-1 text-left hover:text-[#ffc107] transition-colors text-[#c8d6e5]"
                  onClick={() => onFileOpen(`.dockerfiles/${df.name}`)}
                >
                  {df.name}
                </button>
                <Badge variant="secondary" className="h-4 px-1 text-[8px] bg-[#ffc107]/10 text-[#ffc107] border-[#ffc107]/20 shrink-0">
                  {formatSize(df.size)}
                </Badge>
              </div>
              <div className="flex items-center gap-1 ml-5.5">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-5 px-1.5 text-[10px] text-[#00e676] hover:text-[#69f0ae] hover:bg-[#00e676]/10 transition-colors"
                  onClick={() => handleBuildImage(df.name)}
                >
                  <Rocket className="h-3 w-3 mr-0.5" />
                  Build
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-5 px-1.5 text-[10px] text-[#ffc107] hover:text-[#ffe57f] hover:bg-[#ffc107]/10 transition-colors"
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

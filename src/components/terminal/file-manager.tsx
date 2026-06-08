'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  File,
  Folder,
  FolderOpen,
  ChevronRight,
  ChevronDown,
  RefreshCw,
  FilePlus,
  FolderPlus,
  Home,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Input } from '@/components/ui/input'
import type { FileInfo } from '@/hooks/use-socket'

interface FileManagerProps {
  listFiles: (path?: string) => Promise<{ files: FileInfo[]; error: string | null }>
  onFileOpen: (path: string) => void
  connected: boolean
}

export function FileManager({ listFiles, onFileOpen, connected }: FileManagerProps) {
  const [currentPath, setCurrentPath] = useState('')
  const [files, setFiles] = useState<FileInfo[]>([])
  const [loading, setLoading] = useState(false)
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set())
  const [showNewFile, setShowNewFile] = useState(false)
  const [showNewFolder, setShowNewFolder] = useState(false)
  const [newItemName, setNewItemName] = useState('')

  const loadFiles = useCallback(async (path?: string) => {
    setLoading(true)
    try {
      const result = await listFiles(path)
      if (!result.error) {
        setFiles(result.files)
        setCurrentPath(path || '')
      }
    } finally {
      setLoading(false)
    }
  }, [listFiles])

  useEffect(() => {
    if (connected) {
      loadFiles()
    }
  }, [connected, loadFiles])

  const handleDirectoryClick = (dirName: string) => {
    const newPath = currentPath ? `${currentPath}/${dirName}` : dirName
    loadFiles(newPath)
  }

  const handleFileClick = (fileName: string) => {
    const filePath = currentPath ? `${currentPath}/${fileName}` : fileName
    onFileOpen(filePath)
  }

  const handleNavigateUp = () => {
    if (currentPath.includes('/')) {
      const parentPath = currentPath.split('/').slice(0, -1).join('/')
      loadFiles(parentPath)
    } else if (currentPath) {
      loadFiles()
    }
  }

  const handleNavigateHome = () => {
    loadFiles()
  }

  const breadcrumbs = currentPath ? currentPath.split('/') : []

  const handleCreateItem = async () => {
    if (!newItemName.trim()) return

    const basePath = currentPath ? `${currentPath}` : ''
    const fullPath = basePath ? `${basePath}/${newItemName}` : newItemName

    // We just create it via file:write with empty content for files
    // For folders we'd need a different approach, but we'll just reload
    setShowNewFile(false)
    setShowNewFolder(false)
    setNewItemName('')

    // Trigger refresh after a small delay
    setTimeout(() => loadFiles(currentPath || undefined), 300)
  }

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '-'
    if (bytes < 1024) return `${bytes}B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}K`
    return `${(bytes / (1024 * 1024)).toFixed(1)}M`
  }

  return (
    <div className="flex flex-col h-full">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1 px-2 py-1.5 border-b border-[#1e2a5a]/50 text-xs overflow-x-auto whitespace-nowrap">
        <Button
          variant="ghost"
          size="icon"
          className="h-5 w-5 shrink-0 text-[#6b7ba0] hover:text-[#00d4ff] transition-colors"
          onClick={handleNavigateHome}
        >
          <Home className="h-3 w-3" />
        </Button>
        {breadcrumbs.map((part, i) => (
          <span key={i} className="flex items-center gap-1 shrink-0">
            <ChevronRight className="h-3 w-3 text-[#3d4a6e]" />
            <button
              className="text-[#6b7ba0] hover:text-[#c8d6e5] transition-colors"
              onClick={() => {
                const path = breadcrumbs.slice(0, i + 1).join('/')
                loadFiles(path)
              }}
            >
              {part}
            </button>
          </span>
        ))}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 px-2 py-1.5 border-b border-[#1e2a5a]/50">
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 text-[#6b7ba0] hover:text-[#00d4ff] transition-colors"
          onClick={() => loadFiles(currentPath || undefined)}
          disabled={loading}
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 text-[#6b7ba0] hover:text-[#00d4ff] transition-colors"
          onClick={() => { setShowNewFile(true); setShowNewFolder(false) }}
          title="New File"
        >
          <FilePlus className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 text-[#6b7ba0] hover:text-[#00d4ff] transition-colors"
          onClick={() => { setShowNewFolder(true); setShowNewFile(false) }}
          title="New Folder"
        >
          <FolderPlus className="h-3.5 w-3.5" />
        </Button>
        {currentPath && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-xs text-[#6b7ba0] hover:text-[#c8d6e5] transition-colors"
            onClick={handleNavigateUp}
          >
            Up
          </Button>
        )}
      </div>

      {/* New item input */}
      {(showNewFile || showNewFolder) && (
        <div className="flex items-center gap-1 px-2 py-1.5 border-b border-[#1e2a5a]/50">
          {showNewFile ? <File className="h-3.5 w-3.5 text-[#6b7ba0]" /> : <Folder className="h-3.5 w-3.5 text-[#6b7ba0]" />}
          <Input
            value={newItemName}
            onChange={(e) => setNewItemName(e.target.value)}
            placeholder={showNewFile ? 'filename.ext' : 'folder-name'}
            className="h-6 text-xs bg-[#0a0e23] border-[#1e2a5a] text-[#c8d6e5] focus:border-[#00d4ff] placeholder-[#3d4a6e]"
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreateItem()
              if (e.key === 'Escape') { setShowNewFile(false); setShowNewFolder(false); setNewItemName('') }
            }}
            autoFocus
          />
          <Button size="sm" className="h-6 text-xs bg-[#00d4ff]/20 hover:bg-[#00d4ff]/30 text-[#00d4ff] border border-[#00d4ff]/30" onClick={handleCreateItem}>OK</Button>
        </div>
      )}

      {/* File list */}
      <ScrollArea className="flex-1">
        <div className="py-1">
          {files.length === 0 && !loading && (
            <div className="text-center text-[#3d4a6e] text-xs py-4">
              Empty directory
            </div>
          )}
          {files
            .sort((a, b) => {
              if (a.type !== b.type) return a.type === 'directory' ? -1 : 1
              return a.name.localeCompare(b.name)
            })
            .map((file) => (
              <button
                key={file.name}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-[#1a2048]/60 transition-colors group"
                onClick={() => {
                  if (file.type === 'directory') {
                    handleDirectoryClick(file.name)
                  } else {
                    handleFileClick(file.name)
                  }
                }}
              >
                {file.type === 'directory' ? (
                  <Folder className="h-3.5 w-3.5 text-[#ffc107] shrink-0" />
                ) : (
                  <File className="h-3.5 w-3.5 text-[#6b7ba0] shrink-0" />
                )}
                <span className="truncate flex-1 text-left text-[#c8d6e5]">{file.name}</span>
                <span className="text-[#3d4a6e] text-[10px] shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                  {formatSize(file.size)}
                </span>
              </button>
            ))}
        </div>
      </ScrollArea>
    </div>
  )
}

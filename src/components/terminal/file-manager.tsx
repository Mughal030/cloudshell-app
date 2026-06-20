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
  Trash2,
  Pencil,
  Check,
  X as XIcon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Input } from '@/components/ui/input'
import { useToast } from '@/hooks/use-toast'
import type { FileInfo } from '@/hooks/use-socket'

interface FileManagerProps {
  listFiles: (path?: string) => Promise<{ files: FileInfo[]; error: string | null }>
  onFileOpen: (path: string) => void
  connected: boolean
  writeFile: (path: string, content: string) => Promise<{ error: string | null }>
  createFolder: (path: string) => Promise<{ error: string | null }>
  deleteFile: (path: string) => Promise<{ error: string | null }>
}

export function FileManager({ listFiles, onFileOpen, connected, writeFile, createFolder, deleteFile }: FileManagerProps) {
  const { toast } = useToast()
  const [currentPath, setCurrentPath] = useState('')
  const [files, setFiles] = useState<FileInfo[]>([])
  const [loading, setLoading] = useState(false)
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set())
  const [showNewFile, setShowNewFile] = useState(false)
  const [showNewFolder, setShowNewFolder] = useState(false)
  const [newItemName, setNewItemName] = useState('')
  const [creating, setCreating] = useState(false)
  const [renamingPath, setRenamingPath] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')

  const loadFiles = useCallback(async (path?: string) => {
    setLoading(true)
    try {
      const result = await listFiles(path)
      if (!result.error) {
        setFiles(result.files)
        setCurrentPath(path || '')
      } else {
        toast({
          title: 'Failed to load files',
          description: result.error,
          variant: 'destructive',
        })
      }
    } finally {
      setLoading(false)
    }
  }, [listFiles, toast])

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
    if (creating) return
    setCreating(true)

    const basePath = currentPath ? `${currentPath}` : ''
    const fullPath = basePath ? `${basePath}/${newItemName}` : newItemName

    try {
      if (showNewFile) {
        // Create empty file via file:write
        const result = await writeFile(fullPath, '')
        if (result.error) {
          toast({
            title: 'Failed to create file',
            description: result.error,
            variant: 'destructive',
          })
        } else {
          toast({
            title: 'File created',
            description: newItemName,
          })
          // Open the new file in the editor
          onFileOpen(fullPath)
        }
      } else if (showNewFolder) {
        const result = await createFolder(fullPath)
        if (result.error) {
          toast({
            title: 'Failed to create folder',
            description: result.error,
            variant: 'destructive',
          })
        } else {
          toast({
            title: 'Folder created',
            description: newItemName,
          })
        }
      }
    } finally {
      setShowNewFile(false)
      setShowNewFolder(false)
      setNewItemName('')
      setCreating(false)
      // Reload the file list
      await loadFiles(currentPath || undefined)
    }
  }

  const handleDelete = async (fileName: string, isDir: boolean) => {
    const filePath = currentPath ? `${currentPath}/${fileName}` : fileName
    if (!confirm(`Delete ${isDir ? 'folder' : 'file'} "${fileName}"?${isDir ? '\n\nThis will delete all contents inside.' : ''}`)) {
      return
    }
    const result = await deleteFile(filePath)
    if (result.error) {
      toast({
        title: 'Delete failed',
        description: result.error,
        variant: 'destructive',
      })
    } else {
      toast({
        title: 'Deleted',
        description: fileName,
      })
      await loadFiles(currentPath || undefined)
    }
  }

  const handleRenameStart = (fileName: string) => {
    const filePath = currentPath ? `${currentPath}/${fileName}` : fileName
    setRenamingPath(filePath)
    setRenameValue(fileName)
  }

  const handleRenameSubmit = async () => {
    if (!renamingPath || !renameValue.trim()) {
      setRenamingPath(null)
      setRenameValue('')
      return
    }
    const dir = renamingPath.includes('/') ? renamingPath.split('/').slice(0, -1).join('/') : ''
    const newPath = dir ? `${dir}/${renameValue}` : renameValue
    if (renamingPath === newPath) {
      setRenamingPath(null)
      setRenameValue('')
      return
    }

    // We don't have renameFile in props, so use the createFolder+writeFile pattern
    // Actually let's just emit via terminal command
    // Simpler: use the renameFile function from socket (added separately)
    // For now, fall back to using `mv` via terminal command through onFileOpen trick
    // Better: just hide the rename UI for now and notify the user
    toast({
      title: 'Rename',
      description: 'Use the terminal: mv ' + renamingPath + ' ' + newPath,
    })
    setRenamingPath(null)
    setRenameValue('')
    await loadFiles(currentPath || undefined)
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
      <div className="flex items-center gap-1 px-2 py-1.5 border-b border-[var(--nx-border)]/50 text-xs overflow-x-auto whitespace-nowrap">
        <Button
          variant="ghost"
          size="icon"
          className="h-5 w-5 shrink-0 text-[var(--nx-text-secondary)] hover:text-[var(--nx-accent-teal)] transition-colors"
          onClick={handleNavigateHome}
        >
          <Home className="h-3 w-3" />
        </Button>
        {breadcrumbs.map((part, i) => (
          <span key={i} className="flex items-center gap-1 shrink-0">
            <ChevronRight className="h-3 w-3 text-[var(--nx-text-dim)]" />
            <button
              className="text-[var(--nx-text-secondary)] hover:text-[var(--nx-text)] transition-colors"
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
      <div className="flex items-center gap-1 px-2 py-1.5 border-b border-[var(--nx-border)]/50">
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 text-[var(--nx-text-secondary)] hover:text-[var(--nx-accent-teal)] transition-colors"
          onClick={() => loadFiles(currentPath || undefined)}
          disabled={loading}
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 text-[var(--nx-text-secondary)] hover:text-[var(--nx-accent-teal)] transition-colors"
          onClick={() => { setShowNewFile(true); setShowNewFolder(false); setNewItemName('') }}
          title="New File"
        >
          <FilePlus className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 text-[var(--nx-text-secondary)] hover:text-[var(--nx-accent-teal)] transition-colors"
          onClick={() => { setShowNewFolder(true); setShowNewFile(false); setNewItemName('') }}
          title="New Folder"
        >
          <FolderPlus className="h-3.5 w-3.5" />
        </Button>
        {currentPath && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-xs text-[var(--nx-text-secondary)] hover:text-[var(--nx-text)] transition-colors"
            onClick={handleNavigateUp}
          >
            Up
          </Button>
        )}
      </div>

      {/* New item input */}
      {(showNewFile || showNewFolder) && (
        <div className="flex items-center gap-1 px-2 py-1.5 border-b border-[var(--nx-border)]/50">
          {showNewFile ? <File className="h-3.5 w-3.5 text-[var(--nx-text-secondary)]" /> : <Folder className="h-3.5 w-3.5 text-[var(--nx-text-secondary)]" />}
          <Input
            value={newItemName}
            onChange={(e) => setNewItemName(e.target.value)}
            placeholder={showNewFile ? 'filename.ext' : 'folder-name'}
            className="h-6 text-xs bg-[var(--nx-bg-primary)] border-[var(--nx-border)] text-[var(--nx-text)] focus:border-[var(--nx-accent-teal)] placeholder-[var(--nx-text-dim)]"
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreateItem()
              if (e.key === 'Escape') { setShowNewFile(false); setShowNewFolder(false); setNewItemName('') }
            }}
            autoFocus
            disabled={creating}
          />
          <Button size="sm" className="h-6 text-xs bg-[var(--nx-accent-teal)]/20 hover:bg-[var(--nx-accent-teal)]/30 text-[var(--nx-accent-teal)] border border-[var(--nx-accent-teal)]/30" onClick={handleCreateItem} disabled={creating || !newItemName.trim()}>
            {creating ? '...' : 'OK'}
          </Button>
        </div>
      )}

      {/* File list */}
      <ScrollArea className="flex-1">
        <div className="py-1">
          {files.length === 0 && !loading && (
            <div className="text-center text-[var(--nx-text-dim)] text-xs py-4">
              Empty directory
              <div className="mt-2 text-[10px]">Click + to create a file or folder</div>
            </div>
          )}
          {loading && (
            <div className="text-center text-[var(--nx-text-dim)] text-xs py-4">
              Loading...
            </div>
          )}
          {files
            .sort((a, b) => {
              if (a.type !== b.type) return a.type === 'directory' ? -1 : 1
              return a.name.localeCompare(b.name)
            })
            .map((file) => {
              const filePath = currentPath ? `${currentPath}/${file.name}` : file.name
              const isRenaming = renamingPath === filePath
              return (
                <div
                  key={file.name}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-[var(--nx-bg-hover)]/60 transition-colors group"
                >
                  {file.type === 'directory' ? (
                    <Folder className="h-3.5 w-3.5 text-[var(--nx-warning)] shrink-0" />
                  ) : (
                    <File className="h-3.5 w-3.5 text-[var(--nx-text-secondary)] shrink-0" />
                  )}
                  {isRenaming ? (
                    <>
                      <Input
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleRenameSubmit()
                          if (e.key === 'Escape') { setRenamingPath(null); setRenameValue('') }
                        }}
                        className="h-5 flex-1 text-xs py-0 px-1 bg-[var(--nx-bg-primary)] border-[var(--nx-accent-teal)]/50 text-[var(--nx-text)]"
                        autoFocus
                      />
                      <Button size="icon" variant="ghost" className="h-5 w-5 text-[var(--nx-success)]" onClick={handleRenameSubmit}>
                        <Check className="h-3 w-3" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-5 w-5 text-[var(--nx-text-muted)]" onClick={() => { setRenamingPath(null); setRenameValue('') }}>
                        <XIcon className="h-3 w-3" />
                      </Button>
                    </>
                  ) : (
                    <>
                      <button
                        className="truncate flex-1 text-left text-[var(--nx-text)]"
                        onClick={() => {
                          if (file.type === 'directory') {
                            handleDirectoryClick(file.name)
                          } else {
                            handleFileClick(file.name)
                          }
                        }}
                      >
                        {file.name}
                      </button>
                      <span className="text-[var(--nx-text-dim)] text-[10px] shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                        {formatSize(file.size)}
                      </span>
                      <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-5 w-5 text-[var(--nx-text-muted)] hover:text-[var(--nx-accent-teal)]"
                          onClick={(e) => { e.stopPropagation(); handleRenameStart(file.name) }}
                          title="Rename"
                        >
                          <Pencil className="h-2.5 w-2.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-5 w-5 text-[var(--nx-text-muted)] hover:text-[var(--nx-error)]"
                          onClick={(e) => { e.stopPropagation(); handleDelete(file.name, file.type === 'directory') }}
                          title="Delete"
                        >
                          <Trash2 className="h-2.5 w-2.5" />
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              )
            })}
        </div>
      </ScrollArea>
    </div>
  )
}

'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
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
  Eye,
  EyeOff,
  Terminal as TerminalIcon,
  AlertTriangle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Input } from '@/components/ui/input'
import { useToast } from '@/hooks/use-toast'
import type { FileInfo } from '@/hooks/use-socket'

interface FileManagerProps {
  listFiles: (path?: string, showHidden?: boolean) => Promise<{ files: FileInfo[]; error: string | null }>
  onFileOpen: (path: string) => void
  connected: boolean
  writeFile: (path: string, content: string) => Promise<{ error: string | null }>
  createFolder: (path: string) => Promise<{ error: string | null }>
  deleteFile: (path: string) => Promise<{ error: string | null }>
  renameFile: (oldPath: string, newPath: string) => Promise<{ error: string | null }>
  onFilesChanged?: (handler: (data: { path: string; workspace: string }) => void) => () => void
  requestWorkspaceInfo?: (handler: (data: { workspace: string; defaultWorkspace: string }) => void) => void
  sendCommandToTerminal?: (command: string) => void
}

export function FileManager({
  listFiles,
  onFileOpen,
  connected,
  writeFile,
  createFolder,
  deleteFile,
  renameFile,
  onFilesChanged,
  requestWorkspaceInfo,
  sendCommandToTerminal,
}: FileManagerProps) {
  const { toast } = useToast()
  const [currentPath, setCurrentPath] = useState('')
  const [files, setFiles] = useState<FileInfo[]>([])
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [showHidden, setShowHidden] = useState(false)
  const [workspaceRoot, setWorkspaceRoot] = useState<string>('')
  const [showNewFile, setShowNewFile] = useState(false)
  const [showNewFolder, setShowNewFolder] = useState(false)
  const [newItemName, setNewItemName] = useState('')
  const [creating, setCreating] = useState(false)
  const [renamingPath, setRenamingPath] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  // Track the path the user is currently viewing, so auto-refresh uses the right one
  const currentPathRef = useRef('')
  const showHiddenRef = useRef(false)
  useEffect(() => { currentPathRef.current = currentPath }, [currentPath])
  useEffect(() => { showHiddenRef.current = showHidden }, [showHidden])

  // ─── Auto-refresh crash-prevention machinery ───────────────────────
  // Without these guards, npm install / git clone events flood the server
  // with hundreds of concurrent listFiles() requests, which causes the
  // app to slow down, hang, or crash (the user-reported "auto-reloading
  // causing caching app" issue).
  //
  // 1. `silentRefreshInFlight` — if a silent refresh is already running,
  //    skip new requests until it completes. Prevents request pile-up.
  // 2. `pendingRefreshTimer` — debounce: collapse a burst of fs.watch
  //    events (e.g., npm install touching 200 files) into ONE refresh
  //    fired 200ms after the last event.
  // 3. We never overwrite `files` with `[]` from a silent refresh — if
  //    the server returned no files, keep the previous list (likely a
  //    transient error, not actually an empty dir).
  // 4. We preserve scroll position by only re-rendering when the file
  //    list actually changed (shallow compare by name+type+mtime).
  const silentRefreshInFlight = useRef(false)
  const pendingRefreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  /** Stable shallow comparator for FileInfo arrays — avoids re-renders when the data hasn't actually changed. */
  function fileListsEqual(a: FileInfo[], b: FileInfo[]): boolean {
    if (a.length !== b.length) return false
    for (let i = 0; i < a.length; i++) {
      if (a[i].name !== b[i].name) return false
      if (a[i].type !== b[i].type) return false
      if (a[i].size !== b[i].size) return false
      // Skip mtime — most edits don't change order, and we don't want to
      // re-render just because mtime updated.
    }
    return true
  }

  // `silent=true` skips the loading spinner and error toast — used for
  // background auto-refresh (fs.watch events, fallback polling) so the UI
  // doesn't flash "Loading..." or pop error toasts on every refresh.
  const loadFiles = useCallback(async (path?: string, hidden?: boolean, silent: boolean = false) => {
    // Crash-prevention guard #1: skip silent refresh if one is in flight
    if (silent && silentRefreshInFlight.current) return
    if (silent) silentRefreshInFlight.current = true

    if (!silent) {
      setLoading(true)
      setLoadError(null)
    }
    try {
      const result = await listFiles(path, hidden)
      if (!result.error) {
        // Crash-prevention guard #3: don't overwrite existing list with
        // empty array from silent refresh — that wipes the sidebar if the
        // server briefly hiccups.
        if (silent && result.files.length === 0) {
          setFiles(prev => {
            if (prev.length === 0) return result.files
            return prev
          })
        } else {
          // Crash-prevention guard #4: avoid re-render if file list unchanged
          setFiles(prev => fileListsEqual(prev, result.files) ? prev : result.files)
        }
        setCurrentPath(path || '')
        // Clear any previous error on successful load
        setLoadError(null)
      } else {
        // Non-silent (user-initiated) load failed: show inline error UI
        // AND a toast. The inline error stays visible until next successful
        // load, so the user has a "Retry" button they can click.
        if (!silent) {
          setLoadError(result.error)
          // Only show toast for non-timeout errors (timeout already retried 3x
          // inside listFiles; spamming a toast for every reconnect attempt
          // is annoying).
          if (!result.error.toLowerCase().includes('timeout')) {
            toast({
              title: 'Failed to load files',
              description: result.error,
              variant: 'destructive',
            })
          }
        }
      }
    } finally {
      if (silent) silentRefreshInFlight.current = false
      if (!silent) setLoading(false)
    }
  }, [listFiles, toast])

  /**
   * Debounced silent refresh — collapses bursts of fs.watch events into a
   * single network request. Without this, `npm install` (which writes
   * hundreds of files in ~1s) was triggering 100+ concurrent requests.
   */
  const debouncedSilentRefresh = useCallback(() => {
    if (pendingRefreshTimer.current) clearTimeout(pendingRefreshTimer.current)
    pendingRefreshTimer.current = setTimeout(() => {
      loadFiles(currentPathRef.current || undefined, showHiddenRef.current, true)
    }, 200)
  }, [loadFiles])

  // Keep a ref to loadFiles so the polling interval doesn't depend on it
  // (otherwise the interval gets cleared/recreated every time `toast` or `listFiles` identity changes)
  const loadFilesRef = useRef(loadFiles)
  useEffect(() => { loadFilesRef.current = loadFiles }, [loadFiles])
  const debouncedRefreshRef = useRef(debouncedSilentRefresh)
  useEffect(() => { debouncedRefreshRef.current = debouncedSilentRefresh }, [debouncedSilentRefresh])

  // Cleanup any pending debounce timer on unmount
  useEffect(() => {
    return () => {
      if (pendingRefreshTimer.current) clearTimeout(pendingRefreshTimer.current)
    }
  }, [])

  // Initial load when connected
  useEffect(() => {
    if (connected) {
      loadFilesRef.current('', showHidden)
      if (requestWorkspaceInfo) {
        requestWorkspaceInfo((data) => setWorkspaceRoot(data.workspace))
      }
    }
  }, [connected, showHidden, requestWorkspaceInfo])

  // Auto-refresh on files:changed event from the server (fs.watch).
  // This is the PRIMARY refresh mechanism — fires within ~300ms of any
  // file change in the workspace (wget, curl -O, npm install, git clone, etc.).
  // DEBOUNCED — bursts (e.g., npm install touching 200 files) collapse
  // into a single refresh, preventing the request-flood crash.
  useEffect(() => {
    if (!onFilesChanged) return
    const unsubscribe = onFilesChanged(() => {
      // Silent + debounced refresh: prevents UI flicker AND request pile-up
      debouncedRefreshRef.current()
    })
    return unsubscribe
  }, [onFilesChanged])

  // Fallback polling every 30 seconds (only as safety net in case fs.watch
  // misses events — e.g. network-mounted volumes, very rapid edits).
  // Uses refs so the interval is stable and doesn't get cleared on re-renders.
  // Silent: never triggers loading state or error toasts.
  useEffect(() => {
    if (!connected) return
    const interval = setInterval(() => {
      loadFilesRef.current(currentPathRef.current || undefined, showHiddenRef.current, true)
    }, 30000)
    return () => clearInterval(interval)
  }, [connected])

  // Reload when showHidden toggles
  useEffect(() => {
    if (connected) {
      loadFilesRef.current(currentPath, showHidden)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showHidden])

  const handleDirectoryClick = (dirName: string) => {
    const newPath = currentPath ? `${currentPath}/${dirName}` : dirName
    loadFiles(newPath, showHidden)
  }

  const handleFileClick = (fileName: string) => {
    const filePath = currentPath ? `${currentPath}/${fileName}` : fileName
    onFileOpen(filePath)
  }

  const handleNavigateUp = () => {
    if (currentPath.includes('/')) {
      const parentPath = currentPath.split('/').slice(0, -1).join('/')
      loadFiles(parentPath, showHidden)
    } else if (currentPath) {
      loadFiles('', showHidden)
    }
  }

  const handleNavigateHome = () => {
    loadFiles('', showHidden)
  }

  const handleOpenTerminalHere = () => {
    if (!sendCommandToTerminal) return
    const target = currentPath ? `${workspaceRoot}/${currentPath}` : workspaceRoot
    sendCommandToTerminal(`cd ${target}`)
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
      await loadFiles(currentPath || undefined, showHidden)
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
      await loadFiles(currentPath || undefined, showHidden)
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

    const result = await renameFile(renamingPath, newPath)
    if (result.error) {
      toast({
        title: 'Rename failed',
        description: result.error,
        variant: 'destructive',
      })
    } else {
      toast({
        title: 'Renamed',
        description: `${renamingPath.split('/').pop()} → ${renameValue}`,
      })
    }
    setRenamingPath(null)
    setRenameValue('')
    await loadFiles(currentPath || undefined, showHidden)
  }

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '-'
    if (bytes < 1024) return `${bytes}B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}K`
    return `${(bytes / (1024 * 1024)).toFixed(1)}M`
  }

  // Absolute path display (for the breadcrumb header)
  const absolutePath = workspaceRoot ? `${workspaceRoot}${currentPath ? '/' + currentPath : ''}` : currentPath

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Absolute path display */}
      <div className="px-2 py-1 border-b border-[var(--nx-border)]/50 bg-[var(--nx-bg-primary)]/40">
        <div className="text-[9px] font-mono text-[var(--nx-text-dim)] truncate" title={absolutePath}>
          {absolutePath || '/workspace'}
        </div>
      </div>

      {/* Breadcrumb */}
      <div className="flex items-center gap-1 px-2 py-1.5 border-b border-[var(--nx-border)]/50 text-xs overflow-x-auto whitespace-nowrap">
        <Button
          variant="ghost"
          size="icon"
          className="h-5 w-5 shrink-0 text-[var(--nx-text-secondary)] hover:text-[var(--nx-accent-teal)] transition-colors"
          onClick={handleNavigateHome}
          title="Go to workspace root"
        >
          <Home className="h-3 w-3" />
        </Button>
        {breadcrumbs.length === 0 ? (
          <span className="text-[var(--nx-text-secondary)] text-xs">workspace</span>
        ) : (
          breadcrumbs.map((part, i) => (
            <span key={i} className="flex items-center gap-1 shrink-0">
              <ChevronRight className="h-3 w-3 text-[var(--nx-text-dim)]" />
              <button
                className="text-[var(--nx-text-secondary)] hover:text-[var(--nx-text)] transition-colors"
                onClick={() => {
                  const path = breadcrumbs.slice(0, i + 1).join('/')
                  loadFiles(path, showHidden)
                }}
              >
                {part}
              </button>
            </span>
          ))
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 px-2 py-1.5 border-b border-[var(--nx-border)]/50">
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 text-[var(--nx-text-secondary)] hover:text-[var(--nx-accent-teal)] transition-colors"
          onClick={() => loadFiles(currentPath || undefined, showHidden)}
          disabled={loading}
          title="Refresh"
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
        <Button
          variant="ghost"
          size="icon"
          className={`h-6 w-6 transition-colors ${showHidden ? 'text-[var(--nx-accent-teal)] bg-[var(--nx-accent-teal)]/10' : 'text-[var(--nx-text-secondary)] hover:text-[var(--nx-accent-teal)]'}`}
          onClick={() => setShowHidden(!showHidden)}
          title={showHidden ? 'Hide hidden files' : 'Show hidden files'}
        >
          {showHidden ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
        </Button>
        {sendCommandToTerminal && (
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-[var(--nx-text-secondary)] hover:text-[var(--nx-accent-teal)] transition-colors"
            onClick={handleOpenTerminalHere}
            title="Open terminal here"
          >
            <TerminalIcon className="h-3.5 w-3.5" />
          </Button>
        )}
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
      <ScrollArea className="flex-1 min-h-0">
        <div className="py-1">
          {/* Inline error state with retry button (visible until next successful load) */}
          {loadError && !loading && (
            <div className="m-2 p-3 rounded-md border border-[var(--nx-error)]/40 bg-[var(--nx-error)]/10 text-xs">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-3.5 w-3.5 text-[var(--nx-error)] shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-[var(--nx-error)] mb-1">Failed to load files</div>
                  <div className="text-[var(--nx-text-dim)] break-words text-[10px] font-mono">{loadError}</div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-6 mt-2 text-[10px] gap-1 border-[var(--nx-accent-teal)]/40 text-[var(--nx-accent-teal)] hover:bg-[var(--nx-accent-teal)]/10"
                    onClick={() => loadFiles(currentPath || undefined, showHidden)}
                  >
                    <RefreshCw className="h-3 w-3" />Retry
                  </Button>
                </div>
              </div>
            </div>
          )}
          {files.length === 0 && !loading && !loadError && (
            <div className="text-center text-[var(--nx-text-dim)] text-xs py-4 px-3">
              <FolderOpen className="h-6 w-6 mx-auto mb-2 opacity-50" />
              <div>Empty directory</div>
              <div className="mt-2 text-[10px]">
                Click <FilePlus className="inline h-2.5 w-2.5" /> to create a file,
                or <FolderPlus className="inline h-2.5 w-2.5" /> to create a folder.
              </div>
              {!showHidden && (
                <div className="mt-1 text-[10px] opacity-70">
                  Hidden files (dotfiles) are hidden. Click <EyeOff className="inline h-2.5 w-2.5" /> to show them.
                </div>
              )}
            </div>
          )}
          {loading && files.length === 0 && (
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
              const isHidden = file.name.startsWith('.')
              return (
                <div
                  key={file.name}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-[var(--nx-bg-hover)]/60 transition-colors group"
                >
                  {file.type === 'directory' ? (
                    <Folder className={`h-3.5 w-3.5 shrink-0 ${isHidden ? 'text-[var(--nx-text-dim)]' : 'text-[var(--nx-warning)]'}`} />
                  ) : (
                    <File className={`h-3.5 w-3.5 shrink-0 ${isHidden ? 'text-[var(--nx-text-dim)]' : 'text-[var(--nx-text-secondary)]'}`} />
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
                        className={`truncate flex-1 text-left ${isHidden ? 'text-[var(--nx-text-dim)]' : 'text-[var(--nx-text)]'}`}
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

      {/* Footer hint */}
      <div className="px-2 py-1 border-t border-[var(--nx-border)]/50 bg-[var(--nx-bg-primary)]/40">
        <div className="text-[9px] text-[var(--nx-text-dim)] truncate">
          {files.length} item{files.length !== 1 ? 's' : ''}{showHidden ? ' • showing hidden' : ''} • live sync
        </div>
      </div>
    </div>
  )
}

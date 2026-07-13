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
  Download,
  Upload,
  FolderArchive,
  FileCode,
  FileText,
  Image as ImageIcon,
  FileArchive,
  FileVideo,
  FileAudio,
  Database,
  FileType,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Input } from '@/components/ui/input'
import { useToast } from '@/hooks/use-toast'
import type { FileInfo } from '@/hooks/use-socket'

// ─── File type detection for icons and colors ────────────────────────
function getFileTypeInfo(fileName: string) {
  const ext = fileName.split('.').pop()?.toLowerCase() || ''
  // Code files
  if (['ts', 'tsx', 'js', 'jsx', 'py', 'rb', 'go', 'rs', 'java', 'c', 'cpp', 'h', 'cs', 'swift', 'kt', 'scala', 'php', 'sh', 'bash', 'zsh', 'fish'].includes(ext))
    return { icon: FileCode, color: 'text-[#60A5FA]' } // blue
  // Web files
  if (['html', 'htm', 'css', 'scss', 'sass', 'less', 'vue', 'svelte'].includes(ext))
    return { icon: FileCode, color: 'text-[#F472B6]' } // pink
  // Config/data
  if (['json', 'yaml', 'yml', 'toml', 'xml', 'csv', 'env', 'ini', 'conf', 'cfg'].includes(ext))
    return { icon: Database, color: 'text-[#A78BFA]' } // purple
  // Documents
  if (['md', 'txt', 'log', 'doc', 'docx', 'rtf', 'pdf', 'odt'].includes(ext))
    return { icon: FileText, color: 'text-[#34D399]' } // green
  // Images
  if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'bmp', 'ico', 'avif', 'tiff'].includes(ext))
    return { icon: ImageIcon, color: 'text-[#FBBF24]' } // amber
  // Audio
  if (['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a', 'wma'].includes(ext))
    return { icon: FileAudio, color: 'text-[#F87171]' } // red
  // Video
  if (['mp4', 'avi', 'mkv', 'mov', 'wmv', 'webm', 'flv', 'm4v'].includes(ext))
    return { icon: FileVideo, color: 'text-[#FB923C]' } // orange
  // Archives
  if (['zip', 'tar', 'gz', 'bz2', '7z', 'rar', 'xz', 'tgz', 'zst'].includes(ext))
    return { icon: FileArchive, color: 'text-[#F59E0B]' } // yellow
  // Lockfiles / package files
  if (['lock', 'package-lock', 'yarn.lock'].includes(fileName) || ext === 'lock')
    return { icon: FileType, color: 'text-[#94A3B8]' } // slate
  // Default
  return { icon: File, color: 'text-[var(--nx-text-secondary)]' }
}

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
  const [uploading, setUploading] = useState(false)
  // Track the path the user is currently viewing, so auto-refresh uses the right one
  const currentPathRef = useRef('')
  const showHiddenRef = useRef(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  useEffect(() => { currentPathRef.current = currentPath }, [currentPath])
  useEffect(() => { showHiddenRef.current = showHidden }, [showHidden])

  // ─── Helper: get auth token from localStorage (primary) or cookie (fallback) ──
  const getAuthToken = useCallback((): string | null => {
    try {
      // Primary: localStorage (where login stores the token)
      const lsToken = localStorage.getItem('jasbol-token')
      if (lsToken) return lsToken
      // Fallback: httpOnly-style cookie
      const cookies = document.cookie
      const prodMatch = cookies.match(/__Host-jasbol-token=([^;]+)/)
      if (prodMatch) return prodMatch[1]
      const devMatch = cookies.match(/jasbol-token=([^;]+)/)
      if (devMatch) return devMatch[1]
    } catch {}
    return null
  }, [])

  // ─── Helper: trigger file download via browser ───────────────────────
  const triggerDownload = useCallback((filePath: string) => {
    const token = getAuthToken()
    if (!token) {
      toast({
        title: 'Download failed',
        description: 'Authentication token not found. Please refresh the page.',
        variant: 'destructive',
      })
      return
    }
    const encodedPath = encodeURIComponent(filePath)
    const encodedToken = encodeURIComponent(token)
    const downloadUrl = `/api/files/download?path=${encodedPath}&token=${encodedToken}`
    // Use programmatic <a> click instead of window.open to avoid popup blockers
    const a = document.createElement('a')
    a.href = downloadUrl
    a.download = '' // Let server Content-Disposition header set the filename
    a.style.display = 'none'
    document.body.appendChild(a)
    a.click()
    // Cleanup after a short delay
    setTimeout(() => { document.body.removeChild(a) }, 100)
  }, [getAuthToken, toast])

  // ─── Helper: preview file in browser (PDF, images, text) ──────────
  const previewFile = useCallback((filePath: string) => {
    const token = getAuthToken()
    if (!token) {
      toast({
        title: 'Preview failed',
        description: 'Authentication token not found. Please refresh the page.',
        variant: 'destructive',
      })
      return
    }
    const encodedPath = encodeURIComponent(filePath)
    const encodedToken = encodeURIComponent(token)
    const previewUrl = `/api/files/download?path=${encodedPath}&token=${encodedToken}&preview=true`
    window.open(previewUrl, '_blank')
  }, [getAuthToken, toast])

  // ─── Helper: check if file is previewable ──────────────────────────
  const isPreviewable = useCallback((fileName: string) => {
    const ext = fileName.split('.').pop()?.toLowerCase() || ''
    const viewableExts = new Set([
      'pdf', 'png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'bmp', 'avif',
      'mp4', 'webm', 'mp3', 'wav', 'ogg', 'flac',
      'txt', 'md', 'csv', 'log', 'json', 'xml', 'yaml', 'yml', 'html', 'css',
      'js', 'ts', 'py', 'sh', 'bash', 'env', 'conf', 'ini', 'toml',
    ])
    return viewableExts.has(ext)
  }, [])

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

  // ─── Upload handler ──────────────────────────────────────────────────
  const handleUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = e.target.files
    if (!selectedFiles || selectedFiles.length === 0) return

    const token = getAuthToken()
    if (!token) {
      toast({
        title: 'Upload failed',
        description: 'Authentication token not found. Please refresh the page.',
        variant: 'destructive',
      })
      if (fileInputRef.current) fileInputRef.current.value = ''
      return
    }

    setUploading(true)
    try {
      const formData = new FormData()
      for (let i = 0; i < selectedFiles.length; i++) {
        formData.append('files', selectedFiles[i])
      }

      const targetPath = currentPath || ''
      const response = await fetch(`/api/files/upload?path=${encodeURIComponent(targetPath)}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      })

      if (!response.ok) {
        const data = await response.json().catch(() => ({ error: 'Upload failed' }))
        throw new Error(data.error || `Upload failed (${response.status})`)
      }

      const data = await response.json()
      toast({
        title: 'Upload complete',
        description: `${data.count} file${data.count !== 1 ? 's' : ''} uploaded`,
      })
      await loadFiles(currentPath || undefined, showHidden)
    } catch (err: any) {
      toast({
        title: 'Upload failed',
        description: err.message || 'Unknown error',
        variant: 'destructive',
      })
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }, [currentPath, showHidden, getAuthToken, toast])

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
      <div className="px-2 py-1 border-b border-[var(--nx-border)]/50" style={{background: 'linear-gradient(90deg, var(--nx-bg-primary) 0%, var(--nx-bg-secondary) 100%)'}}>
        <div className="text-[9px] font-mono text-[var(--nx-text-dim)] truncate" title={absolutePath}>
          {absolutePath || '/workspace'}
        </div>
      </div>

      {/* Breadcrumb */}
      <div className="flex items-center gap-1 px-2 py-1.5 border-b border-[var(--nx-border)]/50 text-xs overflow-x-auto whitespace-nowrap" style={{background: 'linear-gradient(90deg, var(--nx-bg-secondary) 0%, rgba(99,102,241,0.04) 50%, var(--nx-bg-secondary) 100%)'}}>
        <Button
          variant="ghost"
          size="icon"
          className="h-5 w-5 shrink-0 text-[var(--nx-text-secondary)] hover:text-[var(--nx-accent-teal)] transition-all duration-200 hover:drop-shadow-[0_0_6px_rgba(99,102,241,0.4)]"
          onClick={handleNavigateHome}
          title="Go to workspace root"
        >
          <Home className="h-3 w-3" />
        </Button>
        {breadcrumbs.length === 0 ? (
          <span className="text-[var(--nx-text-secondary)] text-xs font-medium">workspace</span>
        ) : (
          breadcrumbs.map((part, i) => (
            <span key={i} className="flex items-center gap-1 shrink-0">
              <span className="text-[var(--nx-text-dim)]/40 text-[6px] select-none">●</span>
              <button
                className="text-[var(--nx-text-secondary)] hover:text-[var(--nx-text)] transition-all duration-200 px-1 py-0.5 rounded hover:bg-[var(--nx-bg-hover)]/60 hover:drop-shadow-[0_0_8px_rgba(99,102,241,0.25)]"
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
          className="h-6 w-6 text-[var(--nx-text-secondary)] hover:text-[var(--nx-accent-teal)] transition-all duration-200 hover:drop-shadow-[0_0_6px_rgba(99,102,241,0.35)]"
          onClick={() => loadFiles(currentPath || undefined, showHidden)}
          disabled={loading}
          title="Refresh file list"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 text-[var(--nx-text-secondary)] hover:text-[var(--nx-accent-teal)] transition-all duration-200 hover:drop-shadow-[0_0_6px_rgba(99,102,241,0.35)]"
          onClick={() => { setShowNewFile(true); setShowNewFolder(false); setNewItemName('') }}
          title="Create new file"
        >
          <FilePlus className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 text-[var(--nx-text-secondary)] hover:text-[var(--nx-accent-teal)] transition-all duration-200 hover:drop-shadow-[0_0_6px_rgba(99,102,241,0.35)]"
          onClick={() => { setShowNewFolder(true); setShowNewFile(false); setNewItemName('') }}
          title="Create new folder"
        >
          <FolderPlus className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className={`h-6 w-6 transition-all duration-200 ${showHidden ? 'text-[var(--nx-accent-teal)] bg-[var(--nx-accent-teal)]/10 drop-shadow-[0_0_6px_rgba(99,102,241,0.3)]' : 'text-[var(--nx-text-secondary)] hover:text-[var(--nx-accent-teal)] hover:drop-shadow-[0_0_6px_rgba(99,102,241,0.35)]'}`}
          onClick={() => setShowHidden(!showHidden)}
          title={showHidden ? 'Hide hidden files (dotfiles)' : 'Show hidden files (dotfiles)'}
        >
          {showHidden ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
        </Button>
        {sendCommandToTerminal && (
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-[var(--nx-text-secondary)] hover:text-[var(--nx-accent-teal)] transition-all duration-200 hover:drop-shadow-[0_0_6px_rgba(99,102,241,0.35)]"
            onClick={handleOpenTerminalHere}
            title="Open terminal in current directory"
          >
            <TerminalIcon className="h-4 w-4" />
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 text-[var(--nx-text-secondary)] hover:text-[var(--nx-accent-teal)] transition-all duration-200 hover:drop-shadow-[0_0_6px_rgba(99,102,241,0.35)]"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading || !connected}
          title="Upload files to current directory"
        >
          <Upload className={`h-4 w-4 ${uploading ? 'animate-pulse' : ''}`} />
        </Button>
        <div className="flex-1" />
        <Button
          variant="ghost"
          size="sm"
          className="h-6 text-[10px] gap-1 px-2 text-[var(--nx-accent-teal)] hover:text-[var(--nx-accent-teal)] bg-[var(--nx-accent-teal)]/8 hover:bg-[var(--nx-accent-teal)]/15 border border-[var(--nx-accent-teal)]/20 hover:border-[var(--nx-accent-teal)]/40 transition-all duration-200 hover:drop-shadow-[0_0_8px_rgba(99,102,241,0.3)]"
          onClick={() => triggerDownload(currentPath || '')}
          title="Download current folder as ZIP archive"
        >
          <Download className="h-3 w-3" />
          <span>Download All</span>
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

      {/* Hidden file input for uploads */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={handleUpload}
      />

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
            <div className="text-center text-[var(--nx-text-dim)] text-xs py-8 px-3">
              <div className="relative inline-block mb-3">
                <FolderOpen className="h-10 w-10 mx-auto opacity-30" style={{filter: 'drop-shadow(0 0 12px rgba(99,102,241,0.2))'}} />
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-[8px] font-mono text-[var(--nx-accent-teal)]/60">∅</span>
                </div>
              </div>
              <div className="text-sm font-medium" style={{background: 'linear-gradient(135deg, var(--nx-text-secondary), var(--nx-accent-teal))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent'}}>Empty directory</div>
              <div className="mt-3 text-[10px] text-[var(--nx-text-muted)] space-y-1">
                <div>Click <FilePlus className="inline h-2.5 w-2.5 text-[var(--nx-accent-teal)]/70" /> to create a file</div>
                <div>or <FolderPlus className="inline h-2.5 w-2.5 text-[var(--nx-accent-teal)]/70" /> to create a folder</div>
              </div>
              {!showHidden && (
                <div className="mt-3 text-[10px] text-[var(--nx-text-dim)]/70">
                  Dotfiles are hidden · Click <EyeOff className="inline h-2.5 w-2.5 text-[var(--nx-accent-teal)]/50" /> to reveal
                </div>
              )}
            </div>
          )}
          {loading && files.length === 0 && (
            <div className="text-center text-[var(--nx-text-dim)] text-xs py-8">
              <RefreshCw className="h-5 w-5 mx-auto mb-2 animate-spin opacity-40" />
              <span style={{background: 'linear-gradient(90deg, var(--nx-text-dim), var(--nx-text-muted))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent'}}>Loading files...</span>
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
              const typeInfo = file.type === 'directory' ? null : getFileTypeInfo(file.name)
              const FileIcon = typeInfo?.icon || File
              const iconColor = typeInfo?.color || 'text-[var(--nx-text-secondary)]'
              return (
                <div
                  key={file.name}
                  className="w-full flex items-center gap-1.5 px-2 py-1.5 text-xs relative transition-all duration-200 group"
                  style={{borderLeft: '2px solid transparent'}}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLDivElement).style.background = 'linear-gradient(90deg, rgba(99,102,241,0.08) 0%, var(--nx-bg-hover) 40%)'
                    ;(e.currentTarget as HTMLDivElement).style.borderLeftColor = 'var(--nx-accent-teal)'
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLDivElement).style.background = 'transparent'
                    ;(e.currentTarget as HTMLDivElement).style.borderLeftColor = 'transparent'
                  }}
                >
                  {file.type === 'directory' ? (
                    <Folder className={`h-4 w-4 shrink-0 transition-all duration-200 group-hover:drop-shadow-[0_0_6px_rgba(251,191,36,0.4)] ${isHidden ? 'text-[var(--nx-text-dim)]' : 'text-[var(--nx-warning)]'}`} />
                  ) : (
                    <FileIcon className={`h-4 w-4 shrink-0 transition-all duration-200 group-hover:drop-shadow-[0_0_6px_rgba(99,102,241,0.3)] ${isHidden ? 'text-[var(--nx-text-dim)]' : iconColor}`} />
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
                      {/* File/folder name — clickable to open/navigate */}
                      <button
                        className={`truncate flex-1 text-left min-w-0 ${isHidden ? 'text-[var(--nx-text-dim)]' : 'text-[var(--nx-text)]'}`}
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

                      {/* Action buttons — ALWAYS visible for every file and folder */}
                      <div className="flex items-center gap-0 shrink-0">
                        {/* Preview button — for viewable files only */}
                        {file.type !== 'directory' && isPreviewable(file.name) && (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6 text-[var(--nx-text-muted)] hover:text-[var(--nx-accent)] hover:bg-[var(--nx-accent)]/10 hover:drop-shadow-[0_0_4px_rgba(129,140,248,0.3)] transition-all duration-200"
                            onClick={(e) => { e.stopPropagation(); previewFile(filePath) }}
                            title="Preview in browser"
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        {/* Download button — for files and folders */}
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-6 w-6 text-[var(--nx-text-muted)] hover:text-[var(--nx-accent-teal)] hover:bg-[var(--nx-accent-teal)]/10 hover:drop-shadow-[0_0_4px_rgba(99,102,241,0.3)] transition-all duration-200"
                          onClick={(e) => { e.stopPropagation(); triggerDownload(filePath) }}
                          title={file.type === 'directory' ? 'Download folder as ZIP' : 'Download file'}
                        >
                          {file.type === 'directory' ? <FolderArchive className="h-3.5 w-3.5" /> : <Download className="h-3.5 w-3.5" />}
                        </Button>
                        {/* Edit/Rename button */}
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-6 w-6 text-[var(--nx-text-muted)] hover:text-[var(--nx-warning)] hover:bg-[var(--nx-warning)]/10 hover:drop-shadow-[0_0_4px_rgba(251,191,36,0.3)] transition-all duration-200"
                          onClick={(e) => { e.stopPropagation(); handleRenameStart(file.name) }}
                          title="Rename"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        {/* Delete button */}
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-6 w-6 text-[var(--nx-text-muted)] hover:text-[var(--nx-error)] hover:bg-[var(--nx-error)]/10 hover:drop-shadow-[0_0_4px_rgba(248,113,113,0.3)] transition-all duration-200"
                          onClick={(e) => { e.stopPropagation(); handleDelete(file.name, file.type === 'directory') }}
                          title="Delete"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
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
      <div className="px-2 py-1.5 flex items-center justify-between" style={{borderTop: '1px solid transparent', borderImage: 'linear-gradient(90deg, transparent, var(--nx-accent-teal)/20, transparent) 1', background: 'linear-gradient(90deg, var(--nx-bg-primary), var(--nx-bg-secondary))'}}>
        <div className="text-[9px] text-[var(--nx-text-dim)] truncate flex items-center gap-1.5">
          <span className="inline-block w-1 h-1 rounded-full bg-[var(--nx-success)]/60 animate-pulse" />
          <span>{files.length} item{files.length !== 1 ? 's' : ''}{showHidden ? ' · hidden shown' : ''}</span>
          <span className="text-[var(--nx-text-dim)]/50">·</span>
          <span className="text-[var(--nx-success)]/50">live sync</span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-5 text-[9px] gap-1 px-2 text-[var(--nx-accent-teal)] bg-[var(--nx-accent-teal)]/8 hover:bg-[var(--nx-accent-teal)]/15 border border-[var(--nx-accent-teal)]/15 hover:border-[var(--nx-accent-teal)]/30 transition-all duration-200 hover:drop-shadow-[0_0_8px_rgba(99,102,241,0.25)]"
          onClick={() => triggerDownload(currentPath || '')}
          title="Download current folder as ZIP archive"
        >
          <Download className="h-3 w-3" />
          ZIP
        </Button>
      </div>
    </div>
  )
}

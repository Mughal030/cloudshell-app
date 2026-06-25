'use client'

import { useState, useEffect, useCallback } from 'react'
import { Save, Play, X, FileCode } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useToast } from '@/hooks/use-toast'

interface CodeEditorProps {
  filePath: string | null
  fileContent: string | null
  onSave: (path: string, content: string) => Promise<{ error: string | null }>
  onRun: (command: string) => void
  onClose: () => void
  readFile: (path: string) => Promise<{ content: string | null; error: string | null }>
}

export function CodeEditor({ filePath, fileContent: initialContent, onSave, onRun, onClose, readFile }: CodeEditorProps) {
  const { toast } = useToast()
  const [content, setContent] = useState('')
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [loaded, setLoaded] = useState(false)

  // Load file content when filePath changes
  useEffect(() => {
    if (filePath && initialContent !== undefined) {
      if (initialContent !== null) {
        setContent(initialContent)
        setLoaded(true)
        setDirty(false)
      } else {
        // File doesn't exist yet, use empty content
        setContent('')
        setLoaded(true)
        setDirty(false)
      }
    } else if (filePath && initialContent === null) {
      // Try to read the file
      readFile(filePath).then(result => {
        if (result.content !== null) {
          setContent(result.content)
        } else {
          setContent('')
        }
        setLoaded(true)
        setDirty(false)
      })
    }
  }, [filePath, initialContent, readFile])

  const handleSave = useCallback(async () => {
    if (!filePath) return
    if (saving) return
    setSaving(true)
    try {
      const result = await onSave(filePath, content)
      if (!result.error) {
        setDirty(false)
        toast({
          title: 'Saved',
          description: filePath.split('/').pop() || filePath,
        })
      } else {
        toast({
          title: 'Save failed',
          description: result.error,
          variant: 'destructive',
        })
      }
    } catch (err) {
      toast({
        title: 'Save error',
        description: String(err),
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }, [filePath, content, onSave, saving, toast])

  const handleRun = useCallback(() => {
    if (!filePath) return
    const fileName = filePath.split('/').pop() || ''
    const dir = filePath.includes('/') ? filePath.split('/').slice(0, -1).join('/') : '.'
    if (fileName.toLowerCase().includes('dockerfile')) {
      // Docker is NOT available in this environment — show a helpful
      // no-docker alternative instead of running a failing command.
      onRun(`echo "⚠ Docker is not available in this environment." && echo "👉 Alternative: use 'podman' or run the binary directly with './${fileName.replace(/\.dockerfile$/i, '')}'" && echo "💡 Or use nixpacks / buildpacks for imageless builds."`)
    } else {
      // Run as script
      onRun(`cd ${dir} && chmod +x ${fileName} && ./${fileName}`)
    }
  }, [filePath, onRun])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    // Ctrl+S to save
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault()
      handleSave()
    }
    // Tab key inserts spaces
    if (e.key === 'Tab') {
      e.preventDefault()
      const target = e.target as HTMLTextAreaElement
      const start = target.selectionStart
      const end = target.selectionEnd
      const newContent = content.substring(0, start) + '  ' + content.substring(end)
      setContent(newContent)
      setDirty(true)
      // Set cursor position after the inserted spaces
      setTimeout(() => {
        target.selectionStart = target.selectionEnd = start + 2
      }, 0)
    }
  }, [content, handleSave])

  if (!filePath) {
    return (
      <div className="flex items-center justify-center h-full text-[var(--nx-text-dim)] text-sm bg-[var(--nx-bg-primary)]">
        <div className="text-center">
          <FileCode className="h-8 w-8 mx-auto text-[var(--nx-border)] mb-2" />
          <p className="text-xs text-[var(--nx-text-dim)]">Select a file to edit</p>
        </div>
      </div>
    )
  }

  const fileName = filePath.split('/').pop() || filePath
  const isDockerfile = fileName.toLowerCase().includes('dockerfile')

  return (
    <div className="flex flex-col h-full bg-[var(--nx-bg-primary)]">
      {/* Editor Tab Bar */}
      <div className="flex items-center justify-between px-2 border-b border-[var(--nx-border)]/50">
        <div className="flex items-center gap-1.5 py-1">
          <FileCode className="h-3.5 w-3.5 text-[var(--nx-warning)]" />
          <span className="text-xs font-medium text-[var(--nx-text)] truncate max-w-48">{fileName}</span>
          {dirty && (
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--nx-warning)]" />
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-[10px] text-[var(--nx-text-secondary)] hover:text-[var(--nx-accent-teal)] transition-colors"
            onClick={handleSave}
            disabled={saving || !dirty}
          >
            <Save className="h-3 w-3 mr-1" />
            {saving ? 'Saving...' : 'Save'}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-[10px] text-[var(--nx-accent-teal)] hover:text-[var(--nx-accent-teal)] hover:bg-[var(--nx-accent-teal)]/10 transition-colors"
            onClick={handleRun}
          >
            <Play className="h-3 w-3 mr-1" />
            {isDockerfile ? 'Build' : 'Run'}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-[var(--nx-text-secondary)] hover:text-[var(--nx-error)] transition-colors"
            onClick={onClose}
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {/* Editor */}
      <div className="flex-1 relative">
        <textarea
          value={content}
          onChange={(e) => { setContent(e.target.value); setDirty(true) }}
          onKeyDown={handleKeyDown}
          className="w-full h-full resize-none bg-[var(--nx-bg-primary)] text-[var(--nx-text)] font-mono text-sm p-3 focus:outline-none border-0 selection:bg-[var(--nx-selection)] placeholder-[var(--nx-text-dim)]"
          spellCheck={false}
          style={{
            lineHeight: '1.5',
            tabSize: 2,
          }}
          placeholder="// Start typing or select a file..."
        />
        {/* Hint */}
        <div className="absolute bottom-2 right-2 text-[10px] text-[var(--nx-border)] pointer-events-none">
          Ctrl+S to save
        </div>
      </div>
    </div>
  )
}

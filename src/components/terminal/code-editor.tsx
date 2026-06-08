'use client'

import { useState, useEffect, useCallback } from 'react'
import { Save, Play, X, FileCode } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface CodeEditorProps {
  filePath: string | null
  fileContent: string | null
  onSave: (path: string, content: string) => Promise<{ error: string | null }>
  onRun: (command: string) => void
  onClose: () => void
  readFile: (path: string) => Promise<{ content: string | null; error: string | null }>
}

export function CodeEditor({ filePath, fileContent: initialContent, onSave, onRun, onClose, readFile }: CodeEditorProps) {
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
    setSaving(true)
    try {
      const result = await onSave(filePath, content)
      if (!result.error) {
        setDirty(false)
      }
    } finally {
      setSaving(false)
    }
  }, [filePath, content, onSave])

  const handleRun = useCallback(() => {
    if (!filePath) return
    const fileName = filePath.split('/').pop() || ''
    if (fileName.toLowerCase().includes('dockerfile')) {
      const name = fileName.replace(/\.dockerfile$/i, '').toLowerCase()
      onRun(`cd /home/z/my-project/workspace && docker build -f ${filePath} -t ${name}:latest .`)
    } else {
      // Run as script
      onRun(`cd /home/z/my-project/workspace && chmod +x ${filePath} && ./${fileName}`)
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
      <div className="flex items-center justify-center h-full text-[#3d4a6e] text-sm bg-[#0a0e23]">
        <div className="text-center">
          <FileCode className="h-8 w-8 mx-auto text-[#1e2a5a] mb-2" />
          <p className="text-xs text-[#3d4a6e]">Select a file to edit</p>
        </div>
      </div>
    )
  }

  const fileName = filePath.split('/').pop() || filePath
  const isDockerfile = fileName.toLowerCase().includes('dockerfile')

  return (
    <div className="flex flex-col h-full bg-[#0a0e23]">
      {/* Editor Tab Bar */}
      <div className="flex items-center justify-between px-2 border-b border-[#1e2a5a]/50">
        <div className="flex items-center gap-1.5 py-1">
          <FileCode className="h-3.5 w-3.5 text-[#ffc107]" />
          <span className="text-xs font-medium text-[#c8d6e5] truncate max-w-48">{fileName}</span>
          {dirty && (
            <span className="w-1.5 h-1.5 rounded-full bg-[#ffc107]" />
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-[10px] text-[#6b7ba0] hover:text-[#00d4ff] transition-colors"
            onClick={handleSave}
            disabled={saving || !dirty}
          >
            <Save className="h-3 w-3 mr-1" />
            {saving ? 'Saving...' : 'Save'}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-[10px] text-[#00d4ff] hover:text-[#84ffff] hover:bg-[#00d4ff]/10 transition-colors"
            onClick={handleRun}
          >
            <Play className="h-3 w-3 mr-1" />
            {isDockerfile ? 'Build' : 'Run'}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-[#6b7ba0] hover:text-[#ff5252] transition-colors"
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
          className="w-full h-full resize-none bg-[#0a0e23] text-[#c8d6e5] font-mono text-sm p-3 focus:outline-none border-0 selection:bg-[#1a3a6a] placeholder-[#3d4a6e]"
          spellCheck={false}
          style={{
            lineHeight: '1.5',
            tabSize: 2,
          }}
          placeholder="// Start typing or select a file..."
        />
        {/* Hint */}
        <div className="absolute bottom-2 right-2 text-[10px] text-[#1e2a5a] pointer-events-none">
          Ctrl+S to save
        </div>
      </div>
    </div>
  )
}

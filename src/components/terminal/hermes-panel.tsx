'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import {
  Sparkles, Send, Trash2, Key, ShieldCheck, Lock, Loader2,
  ChevronDown, Settings, AlertCircle, CheckCircle2, X, User, Bot,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'

// ─── Types ─────────────────────────────────────────────────────────
interface HermesModel {
  id: string
  name: string
  tier: 'free'
  vendor: string
  blurb: string
  endpoint: string
}

interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
  ts?: number
  error?: boolean
}

interface HermesConfig {
  isAdmin: boolean
  keyConfigured: boolean
  keySetAt: string | null
  canManageKey: boolean
  defaultModel: string | null
  keySource: 'server-env' | 'user-encrypted' | 'none'
}

// ─── Component ─────────────────────────────────────────────────────
export function HermesPanel({ sendCommandToTerminal, connected }: {
  sendCommandToTerminal: (cmd: string) => void
  connected: boolean
}) {
  const [config, setConfig] = useState<HermesConfig | null>(null)
  const [models, setModels] = useState<HermesModel[]>([])
  const [selectedModel, setSelectedModel] = useState<string>('')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [configLoading, setConfigLoading] = useState(true)
  const [showKeyDialog, setShowKeyDialog] = useState(false)
  const [keyInput, setKeyInput] = useState('')
  const [keyError, setKeyError] = useState('')
  const [keySaving, setKeySaving] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // ─── Load config + models on mount ───────────────────────────────
  const loadConfig = useCallback(async () => {
    setConfigLoading(true)
    try {
      const token = localStorage.getItem('jasbol-token')
      const res = await fetch('/api/agents/hermes/config', {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      if (data.success) {
        setConfig(data.config)
        setModels(data.models)
        if (data.config.defaultModel) {
          setSelectedModel(data.config.defaultModel)
        } else if (data.models.length > 0) {
          setSelectedModel(data.models[0].id)
        }
      }
    } catch (e) {
      console.error('[hermes] loadConfig', e)
    } finally {
      setConfigLoading(false)
    }
  }, [])

  useEffect(() => { loadConfig() }, [loadConfig])

  // ─── Persist last selected model ─────────────────────────────────
  useEffect(() => {
    if (!selectedModel || !config) return
    // Don't spam the API — only update if different from server's record
    if (config.defaultModel === selectedModel) return
    const token = localStorage.getItem('jasbol-token')
    fetch('/api/agents/hermes/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ action: 'set-default-model', defaultModel: selectedModel }),
    }).catch(() => {})
  }, [selectedModel, config])

  // ─── Auto-scroll to bottom on new messages ───────────────────────
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  // ─── Send a chat message ─────────────────────────────────────────
  const send = async () => {
    const text = input.trim()
    if (!text || loading) return
    if (!config?.keyConfigured) {
      setShowKeyDialog(true)
      return
    }
    if (!selectedModel) return

    const userMsg: ChatMessage = { role: 'user', content: text, ts: Date.now() }
    const newMessages = [...messages, userMsg]
    setMessages(newMessages)
    setInput('')
    setLoading(true)

    // Build the messages array — include system prompt + prior context (last 10 msgs)
    const systemPrompt: ChatMessage = {
      role: 'system',
      content: 'You are Hermes, the in-IDE AI assistant for Jasbol Hack. Be concise, helpful, and write code blocks when relevant. Use markdown.',
    }
    const prior = newMessages.slice(-10)
    const payload = {
      model: selectedModel,
      messages: [systemPrompt, ...prior],
      stream: false,
      temperature: 0.7,
      maxTokens: 4096,
    }

    try {
      const token = localStorage.getItem('jasbol-token')
      const res = await fetch('/api/agents/hermes/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!data.success) {
        setMessages(prev => [...prev, {
          role: 'assistant', content: `⚠️ ${data.error || 'Request failed'}`,
          ts: Date.now(), error: true,
        }])
      } else {
        // Extract assistant text from upstream response
        const upstream = data.data
        let text = ''
        if (upstream?.choices?.[0]?.message?.content) {
          // OpenAI-style
          text = upstream.choices[0].message.content
        } else if (upstream?.content?.[0]?.text) {
          // Anthropic-style
          text = upstream.content[0].text
        } else if (typeof upstream === 'string') {
          text = upstream
        } else {
          text = '```json\n' + JSON.stringify(upstream, null, 2) + '\n```'
        }
        setMessages(prev => [...prev, { role: 'assistant', content: text, ts: Date.now() }])
      }
    } catch (e) {
      setMessages(prev => [...prev, {
        role: 'assistant', content: '⚠️ Network error — check your connection and try again.',
        ts: Date.now(), error: true,
      }])
    } finally {
      setLoading(false)
      inputRef.current?.focus()
    }
  }

  // ─── Save API key (non-admin only) ───────────────────────────────
  const saveKey = async () => {
    if (!keyInput.trim()) {
      setKeyError('API key cannot be empty')
      return
    }
    setKeySaving(true)
    setKeyError('')
    try {
      const token = localStorage.getItem('jasbol-token')
      const res = await fetch('/api/agents/hermes/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          action: 'set-key',
          apiKey: keyInput.trim(),
          defaultModel: selectedModel || undefined,
        }),
      })
      const data = await res.json()
      if (data.success) {
        setShowKeyDialog(false)
        setKeyInput('')
        await loadConfig()
      } else {
        setKeyError(data.error || 'Failed to save key')
      }
    } catch {
      setKeyError('Network error')
    } finally {
      setKeySaving(false)
    }
  }

  const clearKey = async () => {
    if (!confirm('Remove your stored Hermes API key? You will need to re-add one to chat.')) return
    try {
      const token = localStorage.getItem('jasbol-token')
      await fetch('/api/agents/hermes/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: 'clear-key' }),
      })
      await loadConfig()
    } catch {}
  }

  const clearChat = () => {
    if (messages.length === 0) return
    if (confirm('Clear chat history?')) setMessages([])
  }

  // ─── Quick prompts ───────────────────────────────────────────────
  const quickPrompts = [
    { label: 'Explain code', text: 'Explain what this code does:\n\n```\n\n```' },
    { label: 'Find bugs', text: 'Review the following code for bugs and security issues:\n\n```\n\n```' },
    { label: 'Refactor', text: 'Refactor this code for clarity and performance:\n\n```\n\n```' },
    { label: 'Generate', text: 'Write a function that ' },
  ]

  // ─── Render ──────────────────────────────────────────────────────
  if (configLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-4 w-4 animate-spin text-[var(--nx-accent-teal)]" />
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full bg-[var(--nx-bg-primary)]">
      {/* ─── Header ─── */}
      <div className="flex items-center justify-between px-3 h-9 border-b border-[var(--nx-border)] shrink-0 bg-[var(--nx-bg-secondary)]/60">
        <div className="flex items-center gap-2 min-w-0">
          <Sparkles className="h-3.5 w-3.5 text-[var(--nx-accent)] shrink-0" />
          <span className="text-xs font-semibold tracking-wide truncate">Hermes Agent</span>
          {config?.isAdmin && (
            <Badge variant="outline" className="h-4 px-1 text-[8px] font-bold tracking-wider border-[var(--nx-accent)]/40 text-[var(--nx-accent)]">
              ADMIN
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost" size="icon"
            className="h-6 w-6 text-[var(--nx-text-muted)] hover:text-[var(--nx-warning)]"
            onClick={clearChat} title="Clear chat"
            disabled={messages.length === 0}
          >
            <Trash2 className="h-3 w-3" />
          </Button>
          <Button
            variant="ghost" size="icon"
            className="h-6 w-6 text-[var(--nx-text-muted)] hover:text-[var(--nx-accent-teal)]"
            onClick={() => setShowKeyDialog(true)} title="API key settings"
          >
            <Settings className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {/* ─── Model selector + key status ─── */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--nx-border)] bg-[var(--nx-bg-secondary)]/30 shrink-0">
        <Select value={selectedModel} onValueChange={setSelectedModel}>
          <SelectTrigger className="h-7 text-xs flex-1 min-w-0 bg-[var(--nx-bg-primary)] border-[var(--nx-border)]">
            <SelectValue placeholder="Select model" />
          </SelectTrigger>
          <SelectContent>
            {models.map(m => (
              <SelectItem key={m.id} value={m.id} className="text-xs">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{m.name}</span>
                  <span className="text-[10px] text-[var(--nx-text-muted)]">· {m.vendor}</span>
                  <Badge variant="outline" className="h-3 px-1 text-[8px] font-bold tracking-wider border-[var(--nx-success)]/40 text-[var(--nx-success)]">
                    FREE
                  </Badge>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {config?.keyConfigured ? (
          <div className="flex items-center gap-1 px-1.5 h-7 rounded-md bg-[var(--nx-success)]/10 border border-[var(--nx-success)]/30" title={config.isAdmin ? 'Using server admin key' : 'Using your stored key'}>
            <Lock className="h-3 w-3 text-[var(--nx-success)]" />
            <span className="text-[10px] text-[var(--nx-success)] font-medium">Key</span>
          </div>
        ) : (
          <Button
            variant="outline" size="sm"
            className="h-7 text-[10px] gap-1 border-[var(--nx-warning)]/40 text-[var(--nx-warning)] hover:bg-[var(--nx-warning)]/10"
            onClick={() => setShowKeyDialog(true)}
          >
            <Key className="h-3 w-3" /> Add Key
          </Button>
        )}
      </div>

      {/* ─── Messages ─── */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-3 scroll-smooth">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-4">
            <div className="relative mb-3">
              <div className="absolute inset-0 blur-xl bg-[var(--nx-accent)]/20 rounded-full" />
              <Sparkles className="relative h-10 w-10 text-[var(--nx-accent)]" />
            </div>
            <h3 className="text-sm font-semibold mb-1 text-[var(--nx-text)]">Hermes, at your service</h3>
            <p className="text-xs text-[var(--nx-text-muted)] mb-4 max-w-[220px]">
              {config?.isAdmin
                ? 'Admin mode — using the server API key with 6 free models.'
                : config?.keyConfigured
                  ? 'Your API key is loaded. Ask anything.'
                  : 'Add your own OpenCode Zen API key to start chatting.'}
            </p>
            <div className="grid grid-cols-2 gap-1.5 w-full max-w-[240px]">
              {quickPrompts.map(p => (
                <button
                  key={p.label}
                  className="text-[10px] px-2 py-1.5 rounded-md border border-[var(--nx-border)] bg-[var(--nx-bg-secondary)]/50 hover:bg-[var(--nx-bg-hover)] hover:border-[var(--nx-accent)]/30 text-[var(--nx-text-secondary)] transition-colors text-left"
                  onClick={() => { setInput(p.text); inputRef.current?.focus() }}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((m, i) => (
            <div key={i} className={`flex gap-2 ${m.role === 'user' ? 'flex-row-reverse' : ''}`}>
              <div className={`shrink-0 w-6 h-6 rounded-full flex items-center justify-center ${
                m.role === 'user'
                  ? 'bg-[var(--nx-accent-teal)]/15'
                  : m.error
                    ? 'bg-[var(--nx-error)]/15'
                    : 'bg-[var(--nx-accent)]/15'
              }`}>
                {m.role === 'user'
                  ? <User className="h-3 w-3 text-[var(--nx-accent-teal)]" />
                  : m.error
                    ? <AlertCircle className="h-3 w-3 text-[var(--nx-error)]" />
                    : <Bot className="h-3 w-3 text-[var(--nx-accent)]" />}
              </div>
              <div className={`flex-1 min-w-0 max-w-[85%] rounded-lg px-3 py-2 text-xs ${
                m.role === 'user'
                  ? 'bg-[var(--nx-accent-teal)]/10 text-[var(--nx-text)]'
                  : m.error
                    ? 'bg-[var(--nx-error)]/10 text-[var(--nx-error)]'
                    : 'bg-[var(--nx-bg-secondary)] text-[var(--nx-text)] border border-[var(--nx-border)]'
              }`}>
                <MessageContent content={m.content} />
              </div>
            </div>
          ))
        )}
        {loading && (
          <div className="flex gap-2">
            <div className="shrink-0 w-6 h-6 rounded-full flex items-center justify-center bg-[var(--nx-accent)]/15">
              <Bot className="h-3 w-3 text-[var(--nx-accent)]" />
            </div>
            <div className="flex-1 rounded-lg px-3 py-2 text-xs bg-[var(--nx-bg-secondary)] border border-[var(--nx-border)]">
              <div className="flex items-center gap-1.5 text-[var(--nx-text-muted)]">
                <Loader2 className="h-3 w-3 animate-spin" />
                <span className="text-[10px]">Hermes is thinking…</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ─── Input ─── */}
      <div className="border-t border-[var(--nx-border)] p-2 shrink-0 bg-[var(--nx-bg-secondary)]/40">
        <div className="relative">
          <Textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                send()
              }
            }}
            placeholder={config?.keyConfigured ? 'Ask Hermes anything… (Enter to send, Shift+Enter for new line)' : 'Add an API key to start chatting…'}
            disabled={loading || !connected}
            className="min-h-[60px] max-h-[180px] resize-none text-xs bg-[var(--nx-bg-primary)] border-[var(--nx-border)] pr-10"
            rows={3}
          />
          <Button
            size="icon"
            className="absolute right-1.5 bottom-1.5 h-7 w-7 bg-[var(--nx-accent)] hover:bg-[var(--nx-accent)]/80"
            onClick={send}
            disabled={loading || !input.trim()}
          >
            <Send className="h-3 w-3" />
          </Button>
        </div>
        <div className="flex items-center justify-between mt-1.5 px-1">
          <span className="text-[9px] text-[var(--nx-text-dim)] font-mono">
            {selectedModel.split('/').pop()}
          </span>
          <span className="text-[9px] text-[var(--nx-text-dim)]">
            {config?.keySource === 'server-env' && 'Server key (admin)'}
            {config?.keySource === 'user-encrypted' && 'Your key (AES-256-GCM)'}
            {config?.keySource === 'none' && 'No key set'}
          </span>
        </div>
      </div>

      {/* ─── Key dialog ─── */}
      {showKeyDialog && (
        <KeyDialog
          config={config}
          keyInput={keyInput}
          setKeyInput={setKeyInput}
          keyError={keyError}
          keySaving={keySaving}
          onSave={saveKey}
          onClear={clearKey}
          onClose={() => { setShowKeyDialog(false); setKeyError(''); setKeyInput('') }}
          onInstallShell={() => {
            sendCommandToTerminal('setup-hermes')
            setShowKeyDialog(false)
          }}
        />
      )}
    </div>
  )
}

// ─── Sub-components ────────────────────────────────────────────────

/** Very small markdown renderer — supports code blocks, bold, italics, inline code, line breaks. */
function MessageContent({ content }: { content: string }) {
  // Split by ``` for code blocks
  const parts: Array<{ type: 'text' | 'code'; content: string; lang?: string }> = []
  const regex = /```(\w*)\n?([\s\S]*?)```/g
  let lastIdx = 0
  let m: RegExpExecArray | null
  while ((m = regex.exec(content)) !== null) {
    if (m.index > lastIdx) {
      parts.push({ type: 'text', content: content.slice(lastIdx, m.index) })
    }
    parts.push({ type: 'code', lang: m[1] || 'text', content: m[2] })
    lastIdx = regex.lastIndex
  }
  if (lastIdx < content.length) {
    parts.push({ type: 'text', content: content.slice(lastIdx) })
  }

  return (
    <div className="space-y-2">
      {parts.map((p, i) => p.type === 'code' ? (
        <pre key={i} className="bg-[var(--nx-bg-primary)] border border-[var(--nx-border)] rounded-md p-2 overflow-x-auto text-[10px] font-mono">
          <div className="flex items-center justify-between mb-1 text-[9px] text-[var(--nx-text-dim)] uppercase tracking-wider">
            <span>{p.lang}</span>
          </div>
          <code className="text-[var(--nx-text)]">{p.content}</code>
        </pre>
      ) : (
        <div key={i} className="whitespace-pre-wrap leading-relaxed">
          {renderInline(p.content)}
        </div>
      ))}
    </div>
  )
}

/** Render inline markdown: **bold**, *italic*, `code` */
function renderInline(text: string): React.ReactNode {
  const tokens: React.ReactNode[] = []
  // Combined regex for **bold**, *italic*, `code`
  const re = /(\*\*([^*]+)\*\*|\*([^*]+)\*|`([^`]+)`)/g
  let last = 0
  let m: RegExpExecArray | null
  let i = 0
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) tokens.push(text.slice(last, m.index))
    if (m[2]) {
      tokens.push(<strong key={i++} className="font-semibold text-[var(--nx-text)]">{m[2]}</strong>)
    } else if (m[3]) {
      tokens.push(<em key={i++} className="italic">{m[3]}</em>)
    } else if (m[4]) {
      tokens.push(<code key={i++} className="px-1 py-0.5 rounded bg-[var(--nx-bg-primary)] border border-[var(--nx-border)] text-[10px] font-mono text-[var(--nx-accent-teal)]">{m[4]}</code>)
    }
    last = re.lastIndex
  }
  if (last < text.length) tokens.push(text.slice(last))
  return tokens
}

/** Modal dialog for setting / clearing the user's API key */
function KeyDialog({
  config, keyInput, setKeyInput, keyError, keySaving,
  onSave, onClear, onClose, onInstallShell,
}: {
  config: HermesConfig | null
  keyInput: string
  setKeyInput: (s: string) => void
  keyError: string
  keySaving: boolean
  onSave: () => void
  onClear: () => void
  onClose: () => void
  onInstallShell: () => void
}) {
  const isAdmin = config?.isAdmin
  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-3" onClick={onClose}>
      <div
        className="bg-[var(--nx-bg-primary)] border border-[var(--nx-border)] rounded-lg shadow-xl w-full max-w-md"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--nx-border)]">
          <div className="flex items-center gap-2">
            <Key className="h-3.5 w-3.5 text-[var(--nx-accent)]" />
            <span className="text-xs font-semibold">Hermes API Key</span>
          </div>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onClose}>
            <X className="h-3 w-3" />
          </Button>
        </div>

        <div className="p-3 space-y-3">
          {isAdmin ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2 p-2 rounded-md bg-[var(--nx-accent)]/10 border border-[var(--nx-accent)]/30">
                <ShieldCheck className="h-4 w-4 text-[var(--nx-accent)] shrink-0" />
                <div className="text-[11px]">
                  <div className="font-semibold text-[var(--nx-accent)]">Admin mode — server key in use</div>
                  <div className="text-[var(--nx-text-muted)] mt-0.5">
                    Your API key is sourced from the server's <code className="text-[10px] font-mono">HERMES_OPencode_ZEN_API_KEY</code> env var.
                    It is never written to disk, never exposed to non-admin users, and never returned by any API endpoint.
                  </div>
                </div>
              </div>
              <p className="text-[11px] text-[var(--nx-text-muted)]">
                Admins cannot set a per-user key — they always use the server key. To change the admin key, update the env var on the hosting platform and restart the container.
              </p>
              <Button variant="outline" size="sm" className="w-full text-[11px]" onClick={onInstallShell}>
                <Sparkles className="h-3 w-3 mr-1.5" /> Open Hermes in terminal
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-[10px] font-semibold uppercase tracking-wider text-[var(--nx-text-muted)]">
                  OpenCode Zen API Key
                </label>
                <input
                  type="password"
                  value={keyInput}
                  onChange={e => setKeyInput(e.target.value)}
                  placeholder="sk-..."
                  className="w-full px-2.5 py-1.5 text-xs font-mono rounded-md bg-[var(--nx-bg-secondary)] border border-[var(--nx-border)] focus:border-[var(--nx-accent)] outline-none"
                  autoFocus
                />
                <p className="text-[10px] text-[var(--nx-text-dim)]">
                  Get a free key at <span className="text-[var(--nx-accent-teal)]">opencode.ai/zen</span>. Stored AES-256-GCM encrypted in your account.
                </p>
              </div>
              {keyError && (
                <div className="flex items-center gap-1.5 text-[11px] text-[var(--nx-error)]">
                  <AlertCircle className="h-3 w-3" /> {keyError}
                </div>
              )}
              {config?.keyConfigured && (
                <div className="flex items-center gap-1.5 text-[11px] text-[var(--nx-success)]">
                  <CheckCircle2 className="h-3 w-3" /> Key configured{config.keySetAt ? ` · ${new Date(config.keySetAt).toLocaleDateString()}` : ''}
                </div>
              )}
              <div className="flex items-center gap-2">
                <Button size="sm" className="flex-1 text-[11px]" onClick={onSave} disabled={keySaving || !keyInput.trim()}>
                  {keySaving ? <Loader2 className="h-3 w-3 animate-spin mr-1.5" /> : <Key className="h-3 w-3 mr-1.5" />}
                  {keySaving ? 'Saving…' : 'Save Key'}
                </Button>
                {config?.keyConfigured && (
                  <Button variant="outline" size="sm" className="text-[11px] text-[var(--nx-error)] border-[var(--nx-error)]/30 hover:bg-[var(--nx-error)]/10" onClick={onClear}>
                    <Trash2 className="h-3 w-3 mr-1.5" /> Remove
                  </Button>
                )}
              </div>
              <Separator className="my-2" />
              <p className="text-[10px] text-[var(--nx-text-dim)]">
                Your key is encrypted before it touches disk using AES-256-GCM with a per-user key derived from the server's secret. Even administrators cannot decrypt your key.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

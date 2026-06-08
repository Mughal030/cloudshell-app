'use client'

import { useState, useEffect, useCallback } from 'react'
import dynamic from 'next/dynamic'
import {
  Terminal, Sun, Moon, Plus, X, ChevronLeft, ChevronRight,
  Wifi, WifiOff, Wrench, FolderTree, Container, Zap,
  SquareTerminal, Globe, LogOut, Shield, User, Package,
  Cpu, Database, Cloud, Code2, Sparkles,
} from 'lucide-react'
import { useTheme } from 'next-themes'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useSocket } from '@/hooks/use-socket'
import { FileManager } from '@/components/terminal/file-manager'
import { ToolStatus } from '@/components/terminal/tool-status'
import { DockerPanel } from '@/components/terminal/docker-panel'
import { OpenOutreachPanel } from '@/components/terminal/openoutreach-panel'
import { CodeEditor } from '@/components/terminal/code-editor'
import { PackageSidebar } from '@/components/terminal/package-sidebar'

const XtermTerminal = dynamic(
  () => import('@/components/terminal/xterm-terminal').then(mod => ({ default: mod.XtermTerminal })),
  { ssr: false, loading: () => <div className="w-full h-full bg-[#0F1117]" /> }
)

const QUICK_INSTALL = {
  'AI & CLI Tools': [
    { name: 'Claude Code', cmd: 'setup-claude-code', icon: 'sparkles' },
    { name: 'TypeScript', cmd: 'npm install -g typescript && echo "TypeScript installed!"', icon: 'code' },
    { name: 'Vercel CLI', cmd: 'npm install -g vercel', icon: 'cloud' },
    { name: 'Netlify CLI', cmd: 'npm install -g netlify-cli', icon: 'cloud' },
    { name: 'AWS CLI v2', cmd: 'curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "/tmp/awscliv2.zip" && cd /tmp && unzip -q awscliv2.zip && ./aws/install -i ~/.local/aws-cli -b ~/.local/bin', icon: 'cloud' },
    { name: 'GitHub CLI', cmd: 'sudo apt update && sudo apt install gh -y', icon: 'code' },
  ],
  'Dev Tools': [
    { name: 'Node.js (nvm)', cmd: 'curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash && source ~/.bashrc && nvm install --lts', icon: 'node' },
    { name: 'Rust', cmd: 'curl --proto "=https" --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y && source $HOME/.cargo/env', icon: 'lang' },
    { name: 'Bun', cmd: 'curl -fsSL https://bun.sh/install | bash && source ~/.bashrc', icon: 'node' },
    { name: 'Deno', cmd: 'curl -fsSL https://deno.land/install.sh | sh', icon: 'lang' },
    { name: 'Go', cmd: 'curl -fsSL https://go.dev/dl/go1.22.0.linux-amd64.tar.gz | tar -C ~/.local -xzf - && echo "export PATH=$HOME/.local/go/bin:$PATH" >> ~/.bashrc', icon: 'lang' },
  ],
  'Databases': [
    { name: 'PostgreSQL Client', cmd: 'pip3 install pgcli', icon: 'db' },
    { name: 'MySQL Client', cmd: 'pip3 install mycli', icon: 'db' },
    { name: 'Redis Tools', cmd: 'pip3 install iredis', icon: 'db' },
    { name: 'SQLite Browser', cmd: 'pip3 install sqlite-web', icon: 'db' },
  ],
}

export default function Home() {
  const {
    socket, connected, tools, sessions, activeSessionId, setActiveSessionId,
    latency, createTerminal, destroyTerminal, sendInput, resizeTerminal,
    onOutput, onClearBuffer, checkTools, installTool, readFile, writeFile,
    listFiles, sendCommandToTerminal, ooStatus, checkOoStatus, startOoServices, startOoDaemon,
  } = useSocket()

  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [sidebarTab, setSidebarTab] = useState('packages')
  const [editorFile, setEditorFile] = useState<string | null>(null)
  const [editorContent, setEditorContent] = useState<string | null>(null)
  const [creatingTerminal, setCreatingTerminal] = useState(false)
  const [currentUser, setCurrentUser] = useState<{userId: string; username: string; role: string} | null>(null)
  const [installedPkgs, setInstalledPkgs] = useState<Set<string>>(new Set())

  // Build installed packages set from tools data
  useEffect(() => {
    const pkgs = new Set<string>()
    tools.forEach(t => { if (t.installed) pkgs.add(t.name) })
    // Also add common known installed tools
    ;['node', 'npm', 'npx', 'python3', 'pip3', 'git', 'curl', 'wget', 'bash', 'vim', 'nano',
      'docker', 'ssh', 'scp', 'rsync', 'make', 'gcc', 'jq'].forEach(c => pkgs.add(c))
    setInstalledPkgs(pkgs)
  }, [tools])

  useEffect(() => {
    const token = localStorage.getItem('jasbol-token')
    const userStr = localStorage.getItem('jasbol-user')
    if (!token) { window.location.href = '/login'; return }
    if (userStr) { try { setCurrentUser(JSON.parse(userStr)) } catch {} }
    fetch('/api/auth/verify', { headers: { Authorization: `Bearer ${token}` } }).then(res => {
      if (!res.ok) { localStorage.removeItem('jasbol-token'); localStorage.removeItem('jasbol-user'); window.location.href = '/login' }
    }).catch(() => {})
  }, [])

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' })
    localStorage.removeItem('jasbol-token'); localStorage.removeItem('jasbol-user')
    window.location.href = '/login'
  }

  useEffect(() => { setMounted(true) }, [])

  useEffect(() => {
    if (mounted && connected && sessions.length === 0) {
      const timer = setTimeout(() => { if (connected && sessions.length === 0) createTerminal().catch(console.error) }, 1500)
      return () => clearTimeout(timer)
    }
  }, [mounted, connected, sessions.length, createTerminal])

  const handleNewTerminal = async () => {
    setCreatingTerminal(true)
    try { await createTerminal() } catch (err) { console.error('Failed:', err) } finally { setCreatingTerminal(false) }
  }

  const handleFileOpen = useCallback(async (path: string, content?: string) => {
    setEditorFile(path)
    if (content !== undefined) { setEditorContent(content) } else { const result = await readFile(path); setEditorContent(result.content) }
  }, [readFile])

  const handleEditorSave = useCallback(async (path: string, content: string) => {
    const result = await writeFile(path, content); if (!result.error) setEditorContent(content); return result
  }, [writeFile])

  const handleEditorClose = useCallback(() => { setEditorFile(null); setEditorContent(null) }, [])

  // Determine if dark mode
  const isDark = !mounted || theme === 'dark'

  return (
    <div className="flex flex-col h-screen bg-[var(--nx-bg-primary)] text-[var(--nx-text)] overflow-hidden transition-colors duration-200">
      {/* ═══ HEADER ═══ */}
      <header className="flex items-center justify-between px-4 h-11 border-b border-[var(--nx-border)] bg-[var(--nx-bg-secondary)]/90 backdrop-blur-md shrink-0 nx-panel-glow">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-md bg-gradient-to-br from-[#00E5C0] to-[#6366F1] flex items-center justify-center">
              <Terminal className="w-4 h-4 text-white" />
            </div>
            <h1 className="text-sm font-bold tracking-wide">
              <span className="bg-gradient-to-r from-[#00E5C0] to-[#6366F1] bg-clip-text text-transparent">Nexus</span>
              <span className="text-[var(--nx-text)] ml-0.5">Eclipse</span>
            </h1>
          </div>
          <Separator orientation="vertical" className="h-5 bg-[var(--nx-border)]" />
          <div className="flex items-center gap-1.5">
            {mounted && connected ? (
              <div className="flex items-center gap-1.5">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--nx-success)] opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-[var(--nx-success)]" />
                </span>
                <span className="text-[10px] text-[var(--nx-success)] font-medium">Live</span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5">
                <span className="relative inline-flex rounded-full h-2 w-2 bg-[var(--nx-error)]" />
                <span className="text-[10px] text-[var(--nx-error)] font-medium">{mounted ? 'Offline' : 'Connecting...'}</span>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" className="h-7 text-xs gap-1.5 text-[var(--nx-text-secondary)] hover:text-[var(--nx-accent-teal)] hover:bg-[var(--nx-bg-hover)] transition-colors" onClick={handleNewTerminal} disabled={creatingTerminal || !connected}>
            <Plus className="h-3.5 w-3.5" />New Terminal
          </Button>
          <Separator orientation="vertical" className="h-5 bg-[var(--nx-border)]" />
          <Button variant="ghost" size="icon" className="h-7 w-7 text-[var(--nx-text-secondary)] hover:text-[var(--nx-warning)] hover:bg-[var(--nx-bg-hover)] transition-colors" onClick={() => setTheme(isDark ? 'light' : 'dark')} disabled={!mounted}>
            {mounted ? (isDark ? <Moon className="h-3.5 w-3.5" /> : <Sun className="h-3.5 w-3.5" />) : <Sun className="h-3.5 w-3.5 opacity-0" />}
          </Button>
          <Separator orientation="vertical" className="h-5 bg-[var(--nx-border)]" />
          {currentUser && (
            <div className="flex items-center gap-1.5">
              <div className="flex items-center gap-1 px-2 py-1 rounded-md bg-[var(--nx-bg-primary)] border border-[var(--nx-border)] nx-hover-lift">
                {currentUser.role === 'admin' ? <Shield className="h-3 w-3 text-[var(--nx-accent)]" /> : <User className="h-3 w-3 text-[var(--nx-accent-teal)]" />}
                <span className="text-[10px] font-medium">{currentUser.username}</span>
                {currentUser.role === 'admin' && <span className="text-[8px] px-1 py-0.5 rounded bg-[var(--nx-accent)]/15 text-[var(--nx-accent)] font-bold tracking-wider">ADMIN</span>}
              </div>
              <Button variant="ghost" size="icon" className="h-7 w-7 text-[var(--nx-text-muted)] hover:text-[var(--nx-error)] hover:bg-[var(--nx-bg-hover)] transition-colors" onClick={handleLogout} title="Logout">
                <LogOut className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}
        </div>
      </header>

      {/* ═══ MAIN CONTENT ═══ */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar Toggle (collapsed) */}
        {sidebarCollapsed && (
          <div className="flex flex-col items-center py-2 border-r border-[var(--nx-border)] bg-[var(--nx-bg-secondary)]/80 w-8 shrink-0 nx-panel-enter">
            <Button variant="ghost" size="icon" className="h-6 w-6 text-[var(--nx-text-muted)] hover:text-[var(--nx-accent-teal)] transition-colors" onClick={() => setSidebarCollapsed(false)}>
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
            <div className="flex flex-col gap-1 mt-2">
              {[
                { icon: Package, tab: 'packages' },
                { icon: Wrench, tab: 'tools' },
                { icon: FolderTree, tab: 'files' },
                { icon: Container, tab: 'docker' },
                { icon: Zap, tab: 'quick' },
              ].map(({ icon: Icon, tab }) => (
                <Button key={tab} variant="ghost" size="icon" className="h-7 w-7 text-[var(--nx-text-muted)] hover:text-[var(--nx-accent-teal)] hover:bg-[var(--nx-bg-hover)] transition-colors" onClick={() => { setSidebarTab(tab); setSidebarCollapsed(false) }}>
                  <Icon className="h-3.5 w-3.5" />
                </Button>
              ))}
            </div>
          </div>
        )}

        {/* Sidebar */}
        {!sidebarCollapsed && (
          <div className="flex flex-col border-r border-[var(--nx-border)] bg-[var(--nx-bg-secondary)]/80 backdrop-blur-md shrink-0 overflow-hidden nx-panel-glow nx-panel-enter" style={{ width: 280 }}>
            <div className="flex items-center justify-between px-3 h-9 border-b border-[var(--nx-border)] shrink-0">
              <span className="text-xs font-semibold text-[var(--nx-text-muted)] uppercase tracking-wider">Explorer</span>
              <Button variant="ghost" size="icon" className="h-5 w-5 text-[var(--nx-text-muted)] hover:text-[var(--nx-text)] transition-colors" onClick={() => setSidebarCollapsed(true)}>
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>
            </div>

            <Tabs value={sidebarTab} onValueChange={setSidebarTab} className="flex flex-col flex-1 overflow-hidden">
              <TabsList className="w-full h-8 bg-[var(--nx-bg-primary)] rounded-none border-b border-[var(--nx-border)] p-0 shrink-0">
                {[
                  { value: 'packages', icon: Package },
                  { value: 'tools', icon: Wrench },
                  { value: 'files', icon: FolderTree },
                  { value: 'docker', icon: Container },
                  { value: 'quick', icon: Zap },
                ].map(({ value, icon: Icon }) => (
                  <TabsTrigger key={value} value={value} className="h-8 flex-1 text-[10px] gap-1 data-[state=active]:bg-[var(--nx-bg-active)] data-[state=active]:text-[var(--nx-accent-teal)] rounded-none transition-colors">
                    <Icon className="h-3 w-3" />
                    <span className="hidden sm:inline">{value.charAt(0).toUpperCase() + value.slice(1)}</span>
                  </TabsTrigger>
                ))}
              </TabsList>

              <TabsContent value="packages" className="flex-1 overflow-hidden mt-0">
                <PackageSidebar installedPackages={installedPkgs} sendCommandToTerminal={sendCommandToTerminal} connected={connected} />
              </TabsContent>
              <TabsContent value="tools" className="flex-1 overflow-hidden mt-0">
                <ToolStatus tools={tools} checkTools={checkTools} onInstall={installTool} sendCommandToTerminal={sendCommandToTerminal} loading={!mounted || !connected} />
              </TabsContent>
              <TabsContent value="files" className="flex-1 overflow-hidden mt-0">
                <FileManager listFiles={listFiles} onFileOpen={handleFileOpen} connected={connected} />
              </TabsContent>
              <TabsContent value="docker" className="flex-1 overflow-hidden mt-0">
                <DockerPanel listFiles={listFiles} onFileOpen={handleFileOpen} sendCommandToTerminal={sendCommandToTerminal} connected={connected} />
              </TabsContent>
              <TabsContent value="quick" className="flex-1 overflow-hidden mt-0">
                <QuickInstallPanel sendCommandToTerminal={sendCommandToTerminal} connected={connected} />
              </TabsContent>
            </Tabs>
          </div>
        )}

        {/* Main Area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <ResizablePanelGroup direction="vertical" className="flex-1">
            <ResizablePanel defaultSize={65} minSize={30}>
              <div className="flex flex-col h-full">
                {/* Terminal Tab Bar */}
                <div className="flex items-center h-9 border-b border-[var(--nx-border)] bg-[var(--nx-bg-secondary)]/60 shrink-0 overflow-x-auto">
                  <ScrollArea className="flex-1">
                    <div className="flex items-center h-9">
                      {sessions.map((session) => (
                        <div key={session.sessionId}
                          className={`flex items-center gap-1.5 px-3 h-full text-xs border-r border-[var(--nx-border)] transition-all duration-200 shrink-0 cursor-pointer ${
                            activeSessionId === session.sessionId
                              ? 'bg-[var(--nx-bg-primary)] text-[var(--nx-accent-teal)] nx-tab-active'
                              : 'text-[var(--nx-text-muted)] hover:text-[var(--nx-text)] hover:bg-[var(--nx-bg-primary)]/50'
                          }`}
                          onClick={() => setActiveSessionId(session.sessionId)}>
                          <SquareTerminal className="h-3 w-3 shrink-0" />
                          <span className="truncate max-w-24">{session.label}</span>
                          <span className="text-[8px] text-[var(--nx-text-dim)] shrink-0">{session.sessionId.substring(0, 4)}</span>
                          <span role="button" tabIndex={0}
                            className="ml-1 p-0.5 rounded hover:bg-[var(--nx-bg-hover)] text-[var(--nx-text-muted)] hover:text-[var(--nx-error)] transition-colors inline-flex items-center"
                            onClick={(e) => { e.stopPropagation(); destroyTerminal(session.sessionId) }}
                            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); destroyTerminal(session.sessionId) } }}>
                            <X className="h-2.5 w-2.5" />
                          </span>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                  <Button variant="ghost" size="icon" className="h-7 w-7 mx-1 text-[var(--nx-text-muted)] hover:text-[var(--nx-accent-teal)] hover:bg-[var(--nx-bg-hover)] shrink-0 transition-colors" onClick={handleNewTerminal} disabled={creatingTerminal || !connected}>
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                </div>

                {/* Terminal Content */}
                <div className="flex-1 bg-[var(--nx-bg-primary)] overflow-hidden relative">
                  {sessions.length === 0 ? (
                    <div className="flex items-center justify-center h-full">
                      <div className="text-center">
                        <Terminal className="h-12 w-12 mx-auto text-[var(--nx-border)] mb-3" />
                        <p className="text-sm text-[var(--nx-text-dim)] mb-3">{mounted && connected ? 'No terminal sessions' : 'Connecting...'}</p>
                        <Button variant="outline" size="sm" className="text-[var(--nx-accent-teal)] border-[var(--nx-accent-teal)]/30 hover:bg-[var(--nx-accent-teal)]/10 transition-colors" onClick={handleNewTerminal} disabled={!connected}>
                          <Plus className="h-3.5 w-3.5 mr-1.5" />Start Terminal
                        </Button>
                      </div>
                    </div>
                  ) : (
                    sessions.map((session) => (
                      <XtermTerminal key={session.sessionId} sessionId={session.sessionId} onOutput={onOutput} onClearBuffer={onClearBuffer} sendInput={sendInput} resizeTerminal={resizeTerminal} isActive={activeSessionId === session.sessionId} installedPackages={installedPkgs} />
                    ))
                  )}
                </div>
              </div>
            </ResizablePanel>

            <ResizableHandle withHandle className="bg-[var(--nx-border)] hover:bg-[var(--nx-accent)]/30 transition-colors" />
            <ResizablePanel defaultSize={35} minSize={15}>
              <div className="h-full bg-[var(--nx-bg-primary)] border-t border-[var(--nx-border)]">
                <CodeEditor filePath={editorFile} fileContent={editorContent} onSave={handleEditorSave} onRun={sendCommandToTerminal} onClose={handleEditorClose} readFile={readFile} />
              </div>
            </ResizablePanel>
          </ResizablePanelGroup>
        </div>
      </div>

      {/* ═══ STATUS BAR ═══ */}
      <footer className="flex items-center justify-between px-3 h-6 border-t border-[var(--nx-border)] bg-[var(--nx-bg-secondary)]/90 text-[10px] text-[var(--nx-text-muted)] shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <SquareTerminal className="h-2.5 w-2.5 text-[var(--nx-accent-teal)]" />
            <span>bash</span>
          </div>
          <Separator orientation="vertical" className="h-3 bg-[var(--nx-border)]" />
          <span>/workspace</span>
          <Separator orientation="vertical" className="h-3 bg-[var(--nx-border)]" />
          {/* Environment indicators */}
          <div className="flex items-center gap-1.5">
            <span className="nx-env-dot node" />
            <span>Node</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="nx-env-dot python" />
            <span>Py</span>
          </div>
          {activeSessionId && (
            <>
              <Separator orientation="vertical" className="h-3 bg-[var(--nx-border)]" />
              <span className="font-mono text-[var(--nx-text-dim)]">session:{activeSessionId.substring(0, 8)}</span>
            </>
          )}
          <Separator orientation="vertical" className="h-3 bg-[var(--nx-border)]" />
          <span>{sessions.length} tab{sessions.length !== 1 ? 's' : ''}</span>
        </div>
        <div className="flex items-center gap-3">
          {mounted && connected && latency > 0 && (
            <span className={latency > 200 ? 'text-[var(--nx-warning)]' : 'text-[var(--nx-success)]'}>{latency}ms</span>
          )}
          <div className="flex items-center gap-1">
            {mounted && connected ? <Wifi className="h-2.5 w-2.5 text-[var(--nx-success)]" /> : <WifiOff className="h-2.5 w-2.5 text-[var(--nx-error)]" />}
          </div>
          <span className="text-[var(--nx-text-dim)]">Nexus Eclipse</span>
        </div>
      </footer>
    </div>
  )
}

// ─── Quick Install Panel ───
function QuickInstallPanel({ sendCommandToTerminal, connected }: { sendCommandToTerminal: (cmd: string) => void; connected: boolean }) {
  const iconMap: Record<string, React.ReactNode> = {
    sparkles: <Sparkles className="h-3 w-3" />,
    code: <Code2 className="h-3 w-3" />,
    cloud: <Cloud className="h-3 w-3" />,
    node: <Cpu className="h-3 w-3" />,
    lang: <Code2 className="h-3 w-3" />,
    db: <Database className="h-3 w-3" />,
  }

  return (
    <ScrollArea className="h-full">
      <div className="p-2 space-y-3">
        {Object.entries(QUICK_INSTALL).map(([category, items]) => (
          <div key={category}>
            <h3 className="text-[10px] font-semibold text-[var(--nx-text-muted)] uppercase tracking-wider px-1 mb-1.5">{category}</h3>
            <div className="space-y-0.5">
              {items.map((item) => (
                <button key={item.name} className="w-full flex items-center justify-between px-2 py-1.5 rounded text-xs hover:bg-[var(--nx-bg-hover)] transition-colors disabled:opacity-50 nx-hover-lift" onClick={() => sendCommandToTerminal(item.cmd)} disabled={!connected}>
                  <span className="flex items-center gap-2 text-[var(--nx-text)]">
                    <span className="text-[var(--nx-accent-teal)]">{iconMap[item.icon] || <Zap className="h-3 w-3" />}</span>
                    {item.name}
                  </span>
                  <Zap className="h-3 w-3 text-[var(--nx-accent)] opacity-40" />
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </ScrollArea>
  )
}

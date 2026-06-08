'use client'

import { useState, useEffect, useCallback } from 'react'
import dynamic from 'next/dynamic'
import {
  Terminal,
  Sun,
  Moon,
  Plus,
  X,
  ChevronLeft,
  ChevronRight,
  Wifi,
  WifiOff,
  Wrench,
  FolderTree,
  Container,
  Zap,
  SquareTerminal,
  Globe,
  LogOut,
  Shield,
  User,
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

// Dynamic import xterm.js with SSR disabled — it accesses window/DOM APIs during init
const XtermTerminal = dynamic(
  () => import('@/components/terminal/xterm-terminal').then(mod => ({ default: mod.XtermTerminal })),
  { ssr: false, loading: () => <div className="w-full h-full bg-[#0a0e23]" /> }
)

// Quick install categories - rootless alternatives that work without sudo
const QUICK_INSTALL = {
  'AI & CLI Tools': [
    { name: 'Claude Code', cmd: 'setup-claude-code' },
    { name: 'TypeScript', cmd: 'npm install -g typescript && echo "TypeScript installed! Run: tsc --version"' },
    { name: 'Vercel CLI', cmd: 'npm install -g vercel && echo "Vercel CLI installed! Run: vercel"' },
    { name: 'Netlify CLI', cmd: 'npm install -g netlify-cli && echo "Netlify CLI installed! Run: netlify"' },
    { name: 'AWS CLI v2', cmd: 'curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "/tmp/awscliv2.zip" && cd /tmp && unzip -q awscliv2.zip && ./aws/install -i ~/.local/aws-cli -b ~/.local/bin && echo "AWS CLI installed! Run: aws --version"' },
    { name: 'GitHub CLI', cmd: 'curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | dd of=~/.local/share/keyrings/githubcli-archive-keyring.gpg 2>/dev/null && echo "deb [arch=$(dpkg --print-architecture) signed-by=~/.local/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | sudo tee /etc/apt/sources.list.d/github-cli.list > /dev/null && sudo apt update && sudo apt install gh -y && echo "GitHub CLI installed! Run: gh auth login"' },
  ],
  'Dev Tools': [
    { name: 'git', cmd: 'which git 2>/dev/null && echo "git already installed" || echo "git not available (needs root). Try: conda install git"' },
    { name: 'vim', cmd: 'which vim 2>/dev/null && echo "vim already installed" || echo "vim not available (needs root). Try: nano (pre-installed)"' },
    { name: 'nano', cmd: 'which nano 2>/dev/null && echo "nano already installed" || echo "nano not available (needs root)"' },
    { name: 'tmux', cmd: 'which tmux 2>/dev/null && echo "tmux already installed" || echo "tmux not available (needs root). Use terminal tabs instead."' },
    { name: 'htop', cmd: 'which htop 2>/dev/null && echo "htop already installed" || echo "htop not available (needs root). Try: top"' },
    { name: 'Node.js (nvm)', cmd: 'curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash && source ~/.bashrc && nvm install --lts' },
  ],
  'Languages': [
    { name: 'Python pip', cmd: 'pip3 install --upgrade pip 2>/dev/null || python3 -m pip install --upgrade pip' },
    { name: 'Go', cmd: 'curl -fsSL https://go.dev/dl/go1.22.0.linux-amd64.tar.gz | tar -C ~/.local -xzf - && echo "export PATH=$HOME/.local/go/bin:$PATH" >> ~/.bashrc && echo "Go installed! Run: source ~/.bashrc"' },
    { name: 'Rust', cmd: 'curl --proto "=https" --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y && source $HOME/.cargo/env' },
    { name: 'Bun', cmd: 'curl -fsSL https://bun.sh/install | bash && echo "Bun installed! Run: source ~/.bashrc && bun --version"' },
    { name: 'Deno', cmd: 'curl -fsSL https://deno.land/install.sh | sh && echo "Deno installed! Run: ~/.deno/bin/deno"' },
  ],
  'Containers': [
    { name: 'Docker Compose', cmd: 'mkdir -p ~/.local/bin && curl -SL https://github.com/docker/compose/releases/latest/download/docker-compose-linux-x86_64 -o ~/.local/bin/docker-compose && chmod +x ~/.local/bin/docker-compose && echo "Docker Compose installed to ~/.local/bin/"' },
    { name: 'kubectl', cmd: 'curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl" && chmod +x kubectl && mv kubectl ~/.local/bin/ && echo "kubectl installed! Run: kubectl version"' },
  ],
  'Network': [
    { name: 'curl', cmd: 'which curl 2>/dev/null && echo "curl already installed" || echo "curl not available (needs root)"' },
    { name: 'wget', cmd: 'which wget 2>/dev/null && echo "wget already installed" || echo "wget not available (needs root)"' },
    { name: 'OpenSSH Client', cmd: 'which ssh 2>/dev/null && echo "ssh already installed" || echo "ssh not available (needs root)"' },
    { name: 'ngrok', cmd: 'curl -s https://ngrok-agent.s3.amazonaws.com/ngrok.asc | sudo tee /etc/apt/trusted.gpg.d/ngrok.asc > /dev/null && echo "deb https://ngrok-agent.s3.amazonaws.com buster main" | sudo tee /etc/apt/sources.list.d/ngrok.list && sudo apt update && sudo apt install ngrok && echo "ngrok installed! Run: ngrok config add-authtoken YOUR_TOKEN"' },
  ],
  'Databases': [
    { name: 'PostgreSQL Client', cmd: 'pip3 install pgcli 2>/dev/null && echo "pgcli installed via pip" || echo "Install via pip: pip3 install pgcli"' },
    { name: 'MySQL Client', cmd: 'pip3 install mycli 2>/dev/null && echo "mycli installed via pip" || echo "Install via pip: pip3 install mycli"' },
    { name: 'Redis Tools', cmd: 'pip3 install iredis 2>/dev/null && echo "iredis installed via pip" || echo "Install via pip: pip3 install iredis"' },
    { name: 'SQLite Browser', cmd: 'pip3 install sqlite-web 2>/dev/null && echo "sqlite-web installed via pip" || echo "Install via pip: pip3 install sqlite-web"' },
  ],
}

// Theme color constants
const C = {
  bg:        '#0a0e23',  // Deep midnight blue
  bgPanel:   '#0f1430',  // Panel background
  bgSurface: '#141938',  // Surface/elevated
  bgHover:   '#1a2048',  // Hover state
  bgActive:  '#1e2555',  // Active/selected
  border:    '#1e2a5a',  // Subtle blue border
  borderHi:  '#2a3a7a',  // Highlighted border
  text:      '#c8d6e5',  // Primary text
  textMuted: '#6b7ba0',  // Muted/secondary text
  textDim:   '#3d4a6e',  // Dim/hint text
  cyan:      '#00d4ff',  // Primary accent - Electric cyan
  gold:      '#ffc107',  // Secondary accent - Warm gold
  purple:    '#a855f7',  // Tertiary accent - Royal purple
  green:     '#00e676',  // Success - Vibrant green
  red:       '#ff5252',  // Error/Danger
  blue:      '#448aff',  // Info blue
}

export default function Home() {
  const {
    socket,
    connected,
    tools,
    sessions,
    activeSessionId,
    setActiveSessionId,
    latency,
    createTerminal,
    destroyTerminal,
    sendInput,
    resizeTerminal,
    onOutput,
    onClearBuffer,
    checkTools,
    installTool,
    readFile,
    writeFile,
    listFiles,
    sendCommandToTerminal,
    ooStatus,
    checkOoStatus,
    startOoServices,
    startOoDaemon,
  } = useSocket()

  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [sidebarTab, setSidebarTab] = useState('services')
  const [editorFile, setEditorFile] = useState<string | null>(null)
  const [editorContent, setEditorContent] = useState<string | null>(null)
  const [creatingTerminal, setCreatingTerminal] = useState(false)
  const [currentUser, setCurrentUser] = useState<{userId: string; username: string; role: string} | null>(null)

  // Auth check on mount
  useEffect(() => {
    const token = localStorage.getItem('jasbol-token')
    const userStr = localStorage.getItem('jasbol-user')
    if (!token) {
      window.location.href = '/login'
      return
    }
    if (userStr) {
      try {
        setCurrentUser(JSON.parse(userStr))
      } catch {}
    }
    // Verify token validity
    fetch('/api/auth/verify', {
      headers: { Authorization: `Bearer ${token}` }
    }).then(res => {
      if (!res.ok) {
        localStorage.removeItem('jasbol-token')
        localStorage.removeItem('jasbol-user')
        window.location.href = '/login'
      }
    }).catch(() => {})
  }, [])

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' })
    localStorage.removeItem('jasbol-token')
    localStorage.removeItem('jasbol-user')
    window.location.href = '/login'
  }

  // Prevent hydration mismatch - only render theme-dependent UI after mount
  useEffect(() => {
    setMounted(true)
  }, [])

  // Auto-create first terminal on connect (with delay to ensure stable connection)
  useEffect(() => {
    if (mounted && connected && sessions.length === 0) {
      const timer = setTimeout(() => {
        if (connected && sessions.length === 0) {
          createTerminal().catch(console.error)
        }
      }, 1500)  // Wait 1.5s to ensure connection is stable before creating terminal
      return () => clearTimeout(timer)
    }
  }, [mounted, connected, sessions.length, createTerminal])

  const handleNewTerminal = async () => {
    setCreatingTerminal(true)
    try {
      await createTerminal()
    } catch (err) {
      console.error('Failed to create terminal:', err)
    } finally {
      setCreatingTerminal(false)
    }
  }

  const handleFileOpen = useCallback(async (path: string, content?: string) => {
    setEditorFile(path)
    if (content !== undefined) {
      setEditorContent(content)
    } else {
      const result = await readFile(path)
      setEditorContent(result.content)
    }
  }, [readFile])

  const handleEditorSave = useCallback(async (path: string, content: string) => {
    const result = await writeFile(path, content)
    if (!result.error) {
      setEditorContent(content)
    }
    return result
  }, [writeFile])

  const handleEditorClose = useCallback(() => {
    setEditorFile(null)
    setEditorContent(null)
  }, [])

  return (
    <div className="flex flex-col h-screen bg-[#0a0e23] text-[#c8d6e5] overflow-hidden">
      {/* HEADER */}
      <header className="flex items-center justify-between px-4 h-11 border-b border-[#1e2a5a] bg-[#0f1430]/90 backdrop-blur-md shrink-0 jh-glow-cyan">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <img
              src="/jasbol-hack-logo.png"
              alt="Jasbol Hack"
              width={28}
              height={28}
              className="rounded-sm"
            />
            <h1 className="text-sm font-bold tracking-wide">
              <span className="text-[#00d4ff]">Jasbol</span>
              <span className="text-[#c8d6e5]"> Hack</span>
            </h1>
          </div>
          <Separator orientation="vertical" className="h-5 bg-[#1e2a5a]" />
          <div className="flex items-center gap-1.5">
            {mounted && connected ? (
              <div className="flex items-center gap-1.5">
                <span className="relative flex h-2 w-2 jh-pulse-ring">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#00e676] opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-[#00e676]" />
                </span>
                <span className="text-[10px] text-[#00e676] font-medium">Connected</span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5">
                <span className="relative flex h-2 w-2">
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-[#ff5252]" />
                </span>
                <span className="text-[10px] text-[#ff5252] font-medium">
                  {mounted ? 'Disconnected' : 'Connecting...'}
                </span>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs gap-1.5 text-[#c8d6e5] hover:text-[#00d4ff] hover:bg-[#1a2048] transition-colors"
            onClick={handleNewTerminal}
            disabled={creatingTerminal || !connected}
          >
            <Plus className="h-3.5 w-3.5" />
            New Terminal
          </Button>
          <Separator orientation="vertical" className="h-5 bg-[#1e2a5a]" />
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-[#c8d6e5] hover:text-[#ffc107] hover:bg-[#1a2048] transition-colors"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            disabled={!mounted}
          >
            {mounted ? (theme === 'dark' ? <Moon className="h-3.5 w-3.5" /> : <Sun className="h-3.5 w-3.5" />) : <Sun className="h-3.5 w-3.5 opacity-0" />}
          </Button>
          <Separator orientation="vertical" className="h-5 bg-[#1e2a5a]" />
          {/* User Info & Logout */}
          {currentUser && (
            <div className="flex items-center gap-1.5">
              <div className="flex items-center gap-1 px-2 py-1 rounded-md bg-[#0a0e23] border border-[#1e2a5a] transition-colors hover:border-[#00d4ff]/30">
                {currentUser.role === 'admin' ? (
                  <Shield className="h-3 w-3 text-[#ffc107]" />
                ) : (
                  <User className="h-3 w-3 text-[#00d4ff]" />
                )}
                <span className="text-[10px] font-medium text-[#c8d6e5]">{currentUser.username}</span>
                {currentUser.role === 'admin' && (
                  <span className="text-[8px] px-1 py-0.5 rounded bg-[#ffc107]/15 text-[#ffc107] font-bold tracking-wider">ADMIN</span>
                )}
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-[#6b7ba0] hover:text-[#ff5252] hover:bg-[#1a2048] transition-colors"
                onClick={handleLogout}
                title="Logout"
              >
                <LogOut className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}
        </div>
      </header>

      {/* MAIN CONTENT */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar Toggle (when collapsed) */}
        {sidebarCollapsed && (
          <div className="flex flex-col items-center py-2 border-r border-[#1e2a5a] bg-[#0f1430]/80 w-8 shrink-0">
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-[#c8d6e5] hover:text-[#00d4ff] transition-colors"
              onClick={() => setSidebarCollapsed(false)}
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
            <div className="flex flex-col gap-1 mt-2">
              {[
                { icon: Globe, tab: 'services' },
                { icon: Wrench, tab: 'tools' },
                { icon: FolderTree, tab: 'files' },
                { icon: Container, tab: 'docker' },
                { icon: Zap, tab: 'quick' },
              ].map(({ icon: Icon, tab }) => (
                <Button
                  key={tab}
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-[#6b7ba0] hover:text-[#00d4ff] hover:bg-[#1a2048] transition-colors"
                  onClick={() => { setSidebarTab(tab); setSidebarCollapsed(false) }}
                >
                  <Icon className="h-3.5 w-3.5" />
                </Button>
              ))}
            </div>
          </div>
        )}

        {/* Sidebar */}
        {!sidebarCollapsed && (
          <div className="flex flex-col border-r border-[#1e2a5a] bg-[#0f1430]/80 backdrop-blur-md shrink-0 overflow-hidden jh-glow-cyan" style={{ width: 280 }}>
            {/* Sidebar Header */}
            <div className="flex items-center justify-between px-3 h-9 border-b border-[#1e2a5a] shrink-0">
              <span className="text-xs font-semibold text-[#6b7ba0] uppercase tracking-wider">Explorer</span>
              <Button
                variant="ghost"
                size="icon"
                className="h-5 w-5 text-[#6b7ba0] hover:text-[#c8d6e5] transition-colors"
                onClick={() => setSidebarCollapsed(true)}
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>
            </div>

            {/* Sidebar Tabs */}
            <Tabs value={sidebarTab} onValueChange={setSidebarTab} className="flex flex-col flex-1 overflow-hidden">
              <TabsList className="w-full h-8 bg-[#0a0e23] rounded-none border-b border-[#1e2a5a] p-0 shrink-0">
                <TabsTrigger
                  value="services"
                  className="h-8 flex-1 text-[10px] gap-1 data-[state=active]:bg-[#1e2555] data-[state=active]:text-[#00d4ff] rounded-none transition-colors"
                >
                  <Globe className="h-3 w-3" />
                  <span className="hidden sm:inline">Services</span>
                </TabsTrigger>
                <TabsTrigger
                  value="tools"
                  className="h-8 flex-1 text-[10px] gap-1 data-[state=active]:bg-[#1e2555] data-[state=active]:text-[#00d4ff] rounded-none transition-colors"
                >
                  <Wrench className="h-3 w-3" />
                  <span className="hidden sm:inline">Tools</span>
                </TabsTrigger>
                <TabsTrigger
                  value="files"
                  className="h-8 flex-1 text-[10px] gap-1 data-[state=active]:bg-[#1e2555] data-[state=active]:text-[#00d4ff] rounded-none transition-colors"
                >
                  <FolderTree className="h-3 w-3" />
                  <span className="hidden sm:inline">Files</span>
                </TabsTrigger>
                <TabsTrigger
                  value="docker"
                  className="h-8 flex-1 text-[10px] gap-1 data-[state=active]:bg-[#1e2555] data-[state=active]:text-[#00d4ff] rounded-none transition-colors"
                >
                  <Container className="h-3 w-3" />
                  <span className="hidden sm:inline">Docker</span>
                </TabsTrigger>
                <TabsTrigger
                  value="quick"
                  className="h-8 flex-1 text-[10px] gap-1 data-[state=active]:bg-[#1e2555] data-[state=active]:text-[#00d4ff] rounded-none transition-colors"
                >
                  <Zap className="h-3 w-3" />
                  <span className="hidden sm:inline">Quick</span>
                </TabsTrigger>
              </TabsList>

              <TabsContent value="services" className="flex-1 overflow-hidden mt-0">
                <OpenOutreachPanel
                  ooStatus={ooStatus}
                  checkOoStatus={checkOoStatus}
                  startOoServices={startOoServices}
                  startOoDaemon={startOoDaemon}
                  sendCommandToTerminal={sendCommandToTerminal}
                  connected={connected}
                />
              </TabsContent>

              <TabsContent value="tools" className="flex-1 overflow-hidden mt-0">
                <ToolStatus
                  tools={tools}
                  checkTools={checkTools}
                  onInstall={installTool}
                  sendCommandToTerminal={sendCommandToTerminal}
                  loading={!mounted || !connected}
                />
              </TabsContent>

              <TabsContent value="files" className="flex-1 overflow-hidden mt-0">
                <FileManager
                  listFiles={listFiles}
                  onFileOpen={handleFileOpen}
                  connected={connected}
                />
              </TabsContent>

              <TabsContent value="docker" className="flex-1 overflow-hidden mt-0">
                <DockerPanel
                  listFiles={listFiles}
                  onFileOpen={handleFileOpen}
                  sendCommandToTerminal={sendCommandToTerminal}
                  connected={connected}
                />
              </TabsContent>

              <TabsContent value="quick" className="flex-1 overflow-hidden mt-0">
                <QuickInstallPanel
                  sendCommandToTerminal={sendCommandToTerminal}
                  connected={connected}
                />
              </TabsContent>
            </Tabs>
          </div>
        )}

        {/* Main Area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <ResizablePanelGroup direction="vertical" className="flex-1">
            {/* Terminal Panel */}
            <ResizablePanel defaultSize={65} minSize={30}>
              <div className="flex flex-col h-full">
                {/* Terminal Tab Bar */}
                <div className="flex items-center h-9 border-b border-[#1e2a5a] bg-[#0f1430]/60 shrink-0 overflow-x-auto">
                  <ScrollArea className="flex-1">
                    <div className="flex items-center h-9">
                      {sessions.map((session) => (
                        <div
                          key={session.sessionId}
                          className={`flex items-center gap-1.5 px-3 h-full text-xs border-r border-[#1e2a5a] transition-all duration-200 shrink-0 cursor-pointer ${
                            activeSessionId === session.sessionId
                              ? 'bg-[#0a0e23] text-[#00d4ff] border-b-2 border-b-[#00d4ff]'
                              : 'text-[#6b7ba0] hover:text-[#c8d6e5] hover:bg-[#0a0e23]/50'
                          }`}
                          onClick={() => setActiveSessionId(session.sessionId)}
                        >
                          <SquareTerminal className="h-3 w-3 shrink-0" />
                          <span className="truncate max-w-24">{session.label}</span>
                          <span className="text-[8px] text-[#3d4a6e] shrink-0">
                            {session.sessionId.substring(0, 4)}
                          </span>
                          <span
                            role="button"
                            tabIndex={0}
                            className="ml-1 p-0.5 rounded hover:bg-[#1e2a5a] text-[#6b7ba0] hover:text-[#ff5252] transition-colors inline-flex items-center"
                            onClick={(e) => {
                              e.stopPropagation()
                              destroyTerminal(session.sessionId)
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.stopPropagation()
                                destroyTerminal(session.sessionId)
                              }
                            }}
                          >
                            <X className="h-2.5 w-2.5" />
                          </span>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 mx-1 text-[#6b7ba0] hover:text-[#00d4ff] hover:bg-[#1a2048] shrink-0 transition-colors"
                    onClick={handleNewTerminal}
                    disabled={creatingTerminal || !connected}
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                </div>

                {/* Terminal Content */}
                <div className="flex-1 bg-[#0a0e23] overflow-hidden relative">
                  {sessions.length === 0 ? (
                    <div className="flex items-center justify-center h-full">
                      <div className="text-center">
                        <Terminal className="h-12 w-12 mx-auto text-[#1e2a5a] mb-3" />
                        <p className="text-sm text-[#3d4a6e] mb-3">
                          {mounted && connected ? 'No terminal sessions' : 'Connecting to terminal service...'}
                        </p>
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-[#00d4ff] border-[#00d4ff]/30 hover:bg-[#00d4ff]/10 transition-colors"
                          onClick={handleNewTerminal}
                          disabled={!connected}
                        >
                          <Plus className="h-3.5 w-3.5 mr-1.5" />
                          Start Terminal
                        </Button>
                      </div>
                    </div>
                  ) : (
                    sessions.map((session) => (
                      <XtermTerminal
                        key={session.sessionId}
                        sessionId={session.sessionId}
                        onOutput={onOutput}
                        onClearBuffer={onClearBuffer}
                        sendInput={sendInput}
                        resizeTerminal={resizeTerminal}
                        isActive={activeSessionId === session.sessionId}
                      />
                    ))
                  )}
                </div>
              </div>
            </ResizablePanel>

            {/* Editor Panel */}
            <ResizableHandle withHandle className="bg-[#1e2a5a] hover:bg-[#2a3a7a] transition-colors" />
            <ResizablePanel defaultSize={35} minSize={15}>
              <div className="h-full bg-[#0a0e23] border-t border-[#1e2a5a]">
                <CodeEditor
                  filePath={editorFile}
                  fileContent={editorContent}
                  onSave={handleEditorSave}
                  onRun={sendCommandToTerminal}
                  onClose={handleEditorClose}
                  readFile={readFile}
                />
              </div>
            </ResizablePanel>
          </ResizablePanelGroup>
        </div>
      </div>

      {/* STATUS BAR */}
      <footer className="flex items-center justify-between px-3 h-6 border-t border-[#1e2a5a] bg-[#0f1430]/90 text-[10px] text-[#6b7ba0] shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1">
            <SquareTerminal className="h-2.5 w-2.5 text-[#00d4ff]" />
            <span>bash</span>
          </div>
          <Separator orientation="vertical" className="h-3 bg-[#1e2a5a]" />
          <span>/workspace</span>
          <Separator orientation="vertical" className="h-3 bg-[#1e2a5a]" />
          {activeSessionId && (
            <span className="font-mono text-[#3d4a6e]">
              session:{activeSessionId.substring(0, 8)}
            </span>
          )}
          <Separator orientation="vertical" className="h-3 bg-[#1e2a5a]" />
          <span>{sessions.length} terminal{sessions.length !== 1 ? 's' : ''}</span>
        </div>
        <div className="flex items-center gap-3">
          {mounted && connected && latency > 0 && (
            <span className={`${latency > 200 ? 'text-[#ffc107]' : 'text-[#00e676]'}`}>
              {latency}ms
            </span>
          )}
          <div className="flex items-center gap-1">
            {mounted && connected ? (
              <Wifi className="h-2.5 w-2.5 text-[#00e676]" />
            ) : (
              <WifiOff className="h-2.5 w-2.5 text-[#ff5252]" />
            )}
          </div>
        </div>
      </footer>
    </div>
  )
}

// Quick Install Panel Component
function QuickInstallPanel({
  sendCommandToTerminal,
  connected,
}: {
  sendCommandToTerminal: (command: string) => void
  connected: boolean
}) {
  return (
    <ScrollArea className="h-full">
      <div className="p-2 space-y-3">
        {Object.entries(QUICK_INSTALL).map(([category, items]) => (
          <div key={category}>
            <h3 className="text-[10px] font-semibold text-[#6b7ba0] uppercase tracking-wider px-1 mb-1.5">
              {category}
            </h3>
            <div className="space-y-0.5">
              {items.map((item) => (
                <button
                  key={item.name}
                  className="w-full flex items-center justify-between px-2 py-1.5 rounded text-xs hover:bg-[#1a2048] transition-colors disabled:opacity-50"
                  onClick={() => sendCommandToTerminal(item.cmd)}
                  disabled={!connected}
                >
                  <span className="text-[#c8d6e5]">{item.name}</span>
                  <Zap className="h-3 w-3 text-[#ffc107] opacity-50" />
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </ScrollArea>
  )
}

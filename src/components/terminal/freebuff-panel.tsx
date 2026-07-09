'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  Sword, Shield, Zap, Terminal, Loader2, AlertCircle, CheckCircle2,
  RefreshCw, ExternalLink, ChevronRight, Bug, Search, Key, FileSearch,
  Network, Globe, Database, Lock,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'

// ─── Types ─────────────────────────────────────────────────────────
interface FreeBuffTool {
  name: string
  category: string
  description: string
  installCmd: string
  icon: React.ReactNode
  installed: boolean
  installing: boolean
}

// ─── Curated tool list (matches scripts/setup-freebuff.sh) ────────
const FREEBUFF_TOOLS: Array<Omit<FreeBuffTool, 'installed' | 'installing'>> = [
  // Scanners
  { name: 'nmap',       category: 'Scanner',  description: 'Network scanner — the swiss army knife of recon', installCmd: 'sudo apt-get install -y nmap',       icon: <Network /> },
  { name: 'masscan',    category: 'Scanner',  description: 'Fastest port scanner on earth (rate-limited by ISP)', installCmd: 'sudo apt-get install -y masscan',   icon: <Zap /> },
  // Web
  { name: 'nikto',      category: 'Web',      description: 'Web server vulnerability scanner',           installCmd: 'sudo apt-get install -y nikto',       icon: <Bug /> },
  { name: 'sqlmap',     category: 'Web',      description: 'Automatic SQL injection + database takeover', installCmd: 'sudo apt-get install -y sqlmap',     icon: <Database /> },
  { name: 'dirb',       category: 'Web',      description: 'Directory/file bruteforcer',                 installCmd: 'sudo apt-get install -y dirb',        icon: <FileSearch /> },
  { name: 'whatweb',    category: 'Web',      description: 'Web tech fingerprinter',                     installCmd: 'sudo apt-get install -y whatweb',     icon: <Globe /> },
  { name: 'wpscan',     category: 'Web',      description: 'WordPress vulnerability scanner',            installCmd: 'sudo gem install wpscan',             icon: <Bug /> },
  // Recon
  { name: 'dnsenum',    category: 'Recon',    description: 'DNS enumeration',                            installCmd: 'sudo apt-get install -y dnsenum',     icon: <Search /> },
  { name: 'whois',      category: 'Recon',    description: 'WHOIS lookup',                               installCmd: 'sudo apt-get install -y whois',       icon: <Search /> },
  { name: 'theHarvester', category: 'Recon',  description: 'Email/subdomain harvester',                  installCmd: 'pip3 install --user theHarvester',   icon: <Search /> },
  { name: 'recon-ng',   category: 'Recon',    description: 'Web recon framework',                        installCmd: 'pip3 install --user recon-ng',       icon: <Search /> },
  { name: 'dnsrecon',   category: 'Recon',    description: 'DNS enumeration (Python)',                   installCmd: 'pip3 install --user dnsrecon',       icon: <Search /> },
  // Firmware
  { name: 'binwalk',    category: 'Firmware', description: 'Firmware analyzer',                          installCmd: 'sudo apt-get install -y binwalk',     icon: <FileSearch /> },
  { name: 'exiftool',   category: 'Firmware', description: 'Metadata extractor',                         installCmd: 'sudo apt-get install -y libimage-exiftool-perl', icon: <FileSearch /> },
  // Crackers
  { name: 'john',       category: 'Crack',    description: 'John the Ripper — CPU hash cracker',         installCmd: 'sudo apt-get install -y john',        icon: <Key /> },
  { name: 'hashcat',    category: 'Crack',    description: 'GPU hash cracker',                           installCmd: 'sudo apt-get install -y hashcat',     icon: <Key /> },
  // Utils
  { name: 'httpie',     category: 'Util',     description: 'User-friendly HTTP client',                  installCmd: 'sudo apt-get install -y httpie',      icon: <Globe /> },
]

// Go-based tools — need Go runtime first
const FREEBUFF_GO_TOOLS: Array<Omit<FreeBuffTool, 'installed' | 'installing'>> = [
  { name: 'gobuster',  category: 'Web',   description: 'Directory/file bruteforcer (Go)',          installCmd: 'go install github.com/OJ/gobuster/v3@latest',                 icon: <FileSearch /> },
  { name: 'ffuf',      category: 'Web',   description: 'Fast web fuzzer (Go)',                     installCmd: 'go install github.com/ffuf/ffuf/v2@latest',                   icon: <Zap /> },
  { name: 'httpx',     category: 'Recon', description: 'HTTP prober (ProjectDiscovery)',           installCmd: 'go install github.com/projectdiscovery/httpx/cmd/httpx@latest', icon: <Globe /> },
  { name: 'subfinder', category: 'Recon', description: 'Subdomain finder (ProjectDiscovery)',      installCmd: 'go install github.com/projectdiscovery/subfinder/v2/cmd/subfinder@latest', icon: <Search /> },
  { name: 'nuclei',    category: 'Recon', description: 'Vulnerability scanner (ProjectDiscovery)', installCmd: 'go install github.com/projectdiscovery/nuclei/v3/cmd/nuclei@latest', icon: <Bug /> },
]

// ─── Component ─────────────────────────────────────────────────────
export function FreeBuffPanel({ sendCommandToTerminal, connected }: {
  sendCommandToTerminal: (cmd: string) => void
  connected: boolean
}) {
  const [tools, setTools] = useState<FreeBuffTool[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<string>('All')
  const [searchQuery, setSearchQuery] = useState('')

  // ─── Check which tools are installed ───────────────────────────
  const refreshInstalled = useCallback(async () => {
    setLoading(true)
    try {
      const allTools = [...FREEBUFF_TOOLS, ...FREEBUFF_GO_TOOLS]
      const checked = allTools.map(t => ({
        ...t,
        installed: false,
        installing: false,
      }))
      // We don't actually check installation status from the browser
      // (no /api/ endpoint for that). Instead, we just show all tools
      // and let the user click "install" if they want to (re)install.
      // The `installed` flag is updated optimistically when install succeeds.
      setTools(checked)
    } catch (e) {
      console.error('[freebuff] refresh failed', e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { refreshInstalled() }, [refreshInstalled])

  // ─── Install a single tool ─────────────────────────────────────
  const installTool = (toolName: string) => {
    const tool = tools.find(t => t.name === toolName)
    if (!tool) return
    setTools(prev => prev.map(t =>
      t.name === toolName ? { ...t, installing: true } : t
    ))
    // Send the install command to the terminal — the user can watch progress
    sendCommandToTerminal(tool.installCmd)
    // After a delay, mark as installed optimistically (the user can see
    // output in the terminal; they'll re-click install if it failed)
    setTimeout(() => {
      setTools(prev => prev.map(t =>
        t.name === toolName ? { ...t, installing: false, installed: true } : t
      ))
    }, 5000)
  }

  // ─── Install everything (full bundle) ──────────────────────────
  const installAll = () => {
    sendCommandToTerminal('setup-freebuff')
  }

  // ─── Install just lightweight tools ────────────────────────────
  const installMinimal = () => {
    sendCommandToTerminal('setup-freebuff --minimal')
  }

  // ─── Open the FreeBuff menu ────────────────────────────────────
  const openMenu = () => {
    sendCommandToTerminal('freebuff')
  }

  // ─── Filtered tool list ────────────────────────────────────────
  const categories = ['All', 'Scanner', 'Web', 'Recon', 'Firmware', 'Crack', 'Util']
  const filtered = tools.filter(t => {
    if (filter !== 'All' && t.category !== filter) return false
    if (searchQuery && !t.name.toLowerCase().includes(searchQuery.toLowerCase()) &&
        !t.description.toLowerCase().includes(searchQuery.toLowerCase())) return false
    return true
  })

  // ─── Render ────────────────────────────────────────────────────
  if (loading) {
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
          <Sword className="h-3.5 w-3.5 text-[var(--nx-warning)] shrink-0" />
          <span className="text-xs font-semibold tracking-wide truncate">FreeBuff Toolkit</span>
          <Badge variant="outline" className="h-4 px-1 text-[8px] font-bold tracking-wider border-[var(--nx-warning)]/40 text-[var(--nx-warning)]">
            SECURITY
          </Badge>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost" size="icon"
            className="h-6 w-6 text-[var(--nx-text-muted)] hover:text-[var(--nx-accent-teal)]"
            onClick={refreshInstalled} title="Refresh"
          >
            <RefreshCw className="h-3 w-3" />
          </Button>
          <Button
            variant="ghost" size="icon"
            className="h-6 w-6 text-[var(--nx-text-muted)] hover:text-[var(--nx-accent-teal)]"
            onClick={openMenu} title="Open FreeBuff menu in terminal"
            disabled={!connected}
          >
            <Terminal className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {/* ─── Quick actions ─── */}
      <div className="flex items-center gap-1.5 px-3 py-2 border-b border-[var(--nx-border)] bg-[var(--nx-bg-secondary)]/30 shrink-0">
        <Button
          variant="outline" size="sm"
          className="h-7 text-[10px] gap-1 border-[var(--nx-accent)]/40 text-[var(--nx-accent)] hover:bg-[var(--nx-accent)]/10"
          onClick={installAll}
          disabled={!connected}
        >
          <Shield className="h-3 w-3" /> Install All
        </Button>
        <Button
          variant="outline" size="sm"
          className="h-7 text-[10px] gap-1 border-[var(--nx-text-muted)]/40 text-[var(--nx-text-secondary)] hover:bg-[var(--nx-bg-hover)]"
          onClick={installMinimal}
          disabled={!connected}
        >
          <Zap className="h-3 w-3" /> Minimal
        </Button>
        <Button
          variant="outline" size="sm"
          className="h-7 text-[10px] gap-1 border-[var(--nx-warning)]/40 text-[var(--nx-warning)] hover:bg-[var(--nx-warning)]/10"
          onClick={openMenu}
          disabled={!connected}
        >
          <Sword className="h-3 w-3" /> Menu
        </Button>
      </div>

      {/* ─── Search + filter ─── */}
      <div className="px-3 py-2 border-b border-[var(--nx-border)] bg-[var(--nx-bg-secondary)]/20 shrink-0">
        <input
          type="text"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder="Search tools…"
          className="w-full px-2 py-1 text-xs rounded-md bg-[var(--nx-bg-primary)] border border-[var(--nx-border)] focus:border-[var(--nx-accent-teal)] outline-none"
        />
        <div className="flex flex-wrap gap-1 mt-2">
          {categories.map(c => (
            <button
              key={c}
              onClick={() => setFilter(c)}
              className={`text-[9px] px-1.5 py-0.5 rounded font-medium transition-colors ${
                filter === c
                  ? 'bg-[var(--nx-accent-teal)]/20 text-[var(--nx-accent-teal)] border border-[var(--nx-accent-teal)]/40'
                  : 'bg-[var(--nx-bg-primary)] text-[var(--nx-text-muted)] border border-[var(--nx-border)] hover:text-[var(--nx-text)]'
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      {/* ─── Tool list ─── */}
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
          {filtered.map(tool => (
            <div
              key={tool.name}
              className="flex items-start gap-2 p-2 rounded-md hover:bg-[var(--nx-bg-hover)] transition-colors group"
            >
              <div className={`shrink-0 w-7 h-7 rounded-md flex items-center justify-center ${
                tool.installed
                  ? 'bg-[var(--nx-success)]/15 text-[var(--nx-success)]'
                  : 'bg-[var(--nx-bg-secondary)] text-[var(--nx-text-muted)]'
              }`}>
                {tool.installing ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : tool.installed ? (
                  <CheckCircle2 className="h-3.5 w-3.5" />
                ) : (
                  <span className="text-[10px]">{tool.icon}</span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-medium text-[var(--nx-text)]">{tool.name}</span>
                  <span className="text-[8px] px-1 py-0.5 rounded bg-[var(--nx-bg-secondary)] text-[var(--nx-text-muted)] uppercase tracking-wider">
                    {tool.category}
                  </span>
                </div>
                <p className="text-[10px] text-[var(--nx-text-muted)] mt-0.5 leading-tight">
                  {tool.description}
                </p>
              </div>
              <Button
                variant="ghost" size="sm"
                className={`h-6 px-1.5 text-[10px] shrink-0 ${
                  tool.installed
                    ? 'text-[var(--nx-success)] hover:bg-[var(--nx-success)]/10'
                    : 'text-[var(--nx-accent-teal)] hover:bg-[var(--nx-accent-teal)]/10'
                }`}
                onClick={() => installTool(tool.name)}
                disabled={!connected || tool.installing}
                title={tool.installed ? 'Reinstall' : 'Install'}
              >
                {tool.installing ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : tool.installed ? (
                  <RefreshCw className="h-3 w-3" />
                ) : (
                  <>
                    <ChevronRight className="h-3 w-3" /> Install
                  </>
                )}
              </Button>
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="text-center py-8 text-xs text-[var(--nx-text-muted)]">
              No tools match your search.
            </div>
          )}
        </div>
      </ScrollArea>

      {/* ─── Footer ─── */}
      <div className="px-3 py-1.5 border-t border-[var(--nx-border)] bg-[var(--nx-bg-secondary)]/40 shrink-0">
        <div className="flex items-center justify-between text-[9px] text-[var(--nx-text-dim)]">
          <span className="flex items-center gap-1">
            <Lock className="h-2.5 w-2.5" />
            Use only on systems you own or have permission to test.
          </span>
          <a
            href="https://github.com/OJ/gobuster"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[var(--nx-accent-teal)] hover:underline flex items-center gap-0.5"
          >
            Docs <ExternalLink className="h-2.5 w-2.5" />
          </a>
        </div>
      </div>
    </div>
  )
}

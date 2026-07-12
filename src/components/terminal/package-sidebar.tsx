'use client'

import { useState, useEffect } from 'react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import {
  Package, Search, Box, Terminal, Code2, Database,
  Cpu, Cloud, Shield, Zap,
} from 'lucide-react'

interface PackageSidebarProps {
  installedPackages: Set<string>
  sendCommandToTerminal: (command: string) => void
  connected: boolean
}

// Package categories with icons
const PACKAGE_CATEGORIES = [
  {
    name: 'System',
    icon: Terminal,
    iconClass: 'system',
    packages: [
      { name: 'bash', desc: 'Shell' },
      { name: 'git', desc: 'Version control' },
      { name: 'curl', desc: 'HTTP client' },
      { name: 'wget', desc: 'Downloader' },
      { name: 'vim', desc: 'Editor' },
      { name: 'nano', desc: 'Editor' },
      { name: 'ssh', desc: 'Remote shell' },
      { name: 'make', desc: 'Build tool' },
      { name: 'jq', desc: 'JSON processor' },
    ],
  },
  {
    name: 'Languages',
    icon: Code2,
    iconClass: 'lang',
    packages: [
      { name: 'node', desc: 'JavaScript runtime' },
      { name: 'npm', desc: 'Node package mgr' },
      { name: 'npx', desc: 'Node runner' },
      { name: 'python3', desc: 'Python runtime' },
      { name: 'pip3', desc: 'Python package mgr' },
      { name: 'gcc', desc: 'C compiler' },
      { name: 'go', desc: 'Go runtime' },
      { name: 'rust', desc: 'Rust language' },
      { name: 'bun', desc: 'JS runtime' },
      { name: 'deno', desc: 'JS runtime' },
    ],
  },
  {
    name: 'npm Global',
    icon: Box,
    iconClass: 'npm',
    packages: [
      { name: 'typescript', desc: 'Type checker' },
      { name: 'eslint', desc: 'Linter' },
      { name: 'prettier', desc: 'Formatter' },
      { name: 'next', desc: 'React framework' },
      { name: 'react', desc: 'UI library' },
      { name: 'express', desc: 'Web framework' },
      { name: 'prisma', desc: 'ORM' },
      { name: 'tailwindcss', desc: 'CSS framework' },
      { name: 'vite', desc: 'Build tool' },
      { name: 'webpack', desc: 'Bundler' },
      { name: 'nodemon', desc: 'Dev server' },
      { name: 'pm2', desc: 'Process mgr' },
    ],
  },
  {
    name: 'Python',
    icon: Database,
    iconClass: 'pip',
    packages: [
      { name: 'requests', desc: 'HTTP library' },
      { name: 'flask', desc: 'Web framework' },
      { name: 'fastapi', desc: 'API framework' },
      { name: 'django', desc: 'Web framework' },
      { name: 'numpy', desc: 'Math library' },
      { name: 'pandas', desc: 'Data analysis' },
      { name: 'openai', desc: 'OpenAI SDK' },
      { name: 'anthropic', desc: 'Claude SDK' },
      { name: 'torch', desc: 'ML framework' },
    ],
  },
  {
    name: 'DevOps',
    icon: Cloud,
    iconClass: 'devops',
    packages: [
      { name: 'docker', desc: 'Containers' },
      { name: 'docker-compose', desc: 'Orchestration' },
      { name: 'kubectl', desc: 'Kubernetes CLI' },
      { name: 'terraform', desc: 'IaC tool' },
      { name: 'vercel', desc: 'Deploy platform' },
      { name: 'gh', desc: 'GitHub CLI' },
    ],
  },
]

export function PackageSidebar({ installedPackages, sendCommandToTerminal, connected }: PackageSidebarProps) {
  const [search, setSearch] = useState('')
  const [collapsedCats, setCollapsedCats] = useState<Set<string>>(new Set())

  const toggleCat = (name: string) => {
    setCollapsedCats(prev => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name); else next.add(name)
      return next
    })
  }

  const filteredCategories = PACKAGE_CATEGORIES.map(cat => ({
    ...cat,
    packages: cat.packages.filter(p =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.desc.toLowerCase().includes(search.toLowerCase())
    ),
  })).filter(cat => cat.packages.length > 0)

  const totalInstalled = PACKAGE_CATEGORIES.reduce((acc, cat) =>
    acc + cat.packages.filter(p => installedPackages.has(p.name)).length, 0)

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header with search */}
      <div className="px-3 py-2 border-b border-[var(--nx-border)] space-y-2 relative" style={{background: 'linear-gradient(180deg, var(--nx-bg-secondary) 0%, transparent 100%)'}}>
        {/* Gradient underline decoration */}
        <div className="absolute bottom-0 left-3 right-3 h-px" style={{background: 'linear-gradient(90deg, transparent, var(--nx-accent-teal)/30, transparent)'}} />
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Package className="h-3.5 w-3.5 text-[var(--nx-accent-teal)] drop-shadow-[0_0_6px_rgba(99,102,241,0.3)]" />
            <span className="text-xs font-semibold text-[var(--nx-text)]" style={{background: 'linear-gradient(135deg, var(--nx-text), var(--nx-accent-teal))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent'}}>Packages</span>
          </div>
          <Badge variant="secondary" className="h-4 px-1.5 text-[8px] bg-[var(--nx-accent-teal)]/10 text-[var(--nx-accent-teal)] border-[var(--nx-accent-teal)]/20 drop-shadow-[0_0_4px_rgba(99,102,241,0.15)]">
            {totalInstalled} installed
          </Badge>
        </div>
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-[var(--nx-text-dim)] transition-colors duration-200" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter packages by name or desc..."
            className="w-full pl-7 pr-2 py-1 text-[11px] bg-[var(--nx-bg-primary)] border border-[var(--nx-border)] rounded-md text-[var(--nx-text)] placeholder-[var(--nx-text-dim)] focus:outline-none focus:border-[var(--nx-accent-teal)]/50 focus:ring-1 focus:ring-[var(--nx-accent-teal)]/20 transition-all duration-300 focus:drop-shadow-[0_0_8px_rgba(99,102,241,0.15)] focus:bg-[var(--nx-bg-primary)]/80"
          />
        </div>
      </div>

      {/* Color Legend */}
      <div className="px-3 py-1.5 border-b border-[var(--nx-border)] flex items-center gap-3 text-[9px]" style={{background: 'linear-gradient(90deg, var(--nx-bg-primary) 0%, var(--nx-bg-secondary) 100%)'}}>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-[var(--nx-cmd-installed)] drop-shadow-[0_0_4px_rgba(52,211,153,0.4)]" />
          <span className="text-[var(--nx-text-muted)]">Installed</span>
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-[var(--nx-cmd-known)] drop-shadow-[0_0_4px_rgba(99,102,241,0.4)]" />
          <span className="text-[var(--nx-text-muted)]">Known</span>
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-[var(--nx-cmd-unknown)]" />
          <span className="text-[var(--nx-text-muted)]">Available</span>
        </span>
      </div>

      {/* Package List */}
      <ScrollArea className="flex-1 min-h-0">
        <div className="p-1.5 space-y-1">
          {filteredCategories.map((category) => {
            const CatIcon = category.icon
            const isCollapsed = collapsedCats.has(category.name)
            const catInstalled = category.packages.filter(p => installedPackages.has(p.name)).length

            return (
              <div key={category.name}>
                {/* Category header */}
                <button
                  className="w-full flex items-center gap-1.5 px-2 py-1.5 rounded-md text-[10px] hover:bg-[var(--nx-bg-hover)] transition-all duration-200 group/cat"
                  onClick={() => toggleCat(category.name)}
                >
                  <CatIcon className="h-3.5 w-3.5 text-[var(--nx-text-muted)] group-hover/cat:drop-shadow-[0_0_4px_rgba(99,102,241,0.25)] transition-all duration-200" />
                  <span className="font-semibold text-[var(--nx-text-secondary)] uppercase tracking-wider flex-1 text-left">{category.name}</span>
                  <Badge variant="secondary" className="h-3 px-1 text-[7px] bg-[var(--nx-bg-hover)] text-[var(--nx-text-muted)] border-0 transition-all duration-200">
                    {catInstalled}/{category.packages.length}
                  </Badge>
                  <span className="text-[var(--nx-text-dim)] transition-transform duration-200" style={{transform: isCollapsed ? 'rotate(0deg)' : 'rotate(0deg)'}}>{isCollapsed ? '▸' : '▾'}</span>
                </button>

                {/* Packages */}
                {!isCollapsed && category.packages.map((pkg) => {
                  const isInstalled = installedPackages.has(pkg.name)
                  return (
                    <div key={pkg.name} className="nx-pkg-item nx-hover-lift relative" onClick={() => sendCommandToTerminal(`which ${pkg.name} && ${pkg.name} --version || echo "${pkg.name} not found"`)} style={{borderLeft: isInstalled ? '2px solid var(--nx-success)/40' : '2px solid transparent'}}>
                      <div className={`nx-pkg-icon ${category.iconClass} ${isInstalled ? 'drop-shadow-[0_0_4px_rgba(52,211,153,0.4)]' : ''}`}>
                        {isInstalled ? '✓' : '·'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className={`text-[11px] font-medium transition-colors duration-200 ${isInstalled ? 'text-[var(--nx-cmd-installed)]' : 'text-[var(--nx-text-secondary)]'}`}>
                          {pkg.name}
                        </div>
                        <div className="text-[9px] text-[var(--nx-text-dim)]">{pkg.desc}</div>
                      </div>
                      {isInstalled && (
                        <Badge variant="secondary" className="h-3 px-1 text-[7px] bg-[var(--nx-success)]/10 text-[var(--nx-success)] border-[var(--nx-success)]/20 shrink-0 drop-shadow-[0_0_4px_rgba(52,211,153,0.25)]">
                          ✓ OK
                        </Badge>
                      )}
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
      </ScrollArea>
    </div>
  )
}

'use client'

/**
 * AuthLayout — shared split-screen layout for /login and /signup.
 *
 * Aurora Eclipse theme:
 *   - Deep-space background with subtle aurora orbs (cyan/indigo/pink)
 *   - Frosted-glass panels with flowing aurora gradient borders
 *   - Left showcase: MagicUI Terminal demo + security feature badges
 *   - Right form: actual auth form (passed as children)
 *
 * On small screens, the showcase collapses to a compact header above the form.
 */

import { type ReactNode } from 'react'
import Image from 'next/image'
import { Shield, Lock, Fingerprint, ServerCog, CheckCircle2, KeyRound } from 'lucide-react'
import { TerminalDemo } from '@/registry/magicui/terminal-demo'

export function AuthLayout({
  children,
  accent = 'teal',
}: {
  children: ReactNode
  accent?: 'teal' | 'indigo'
}) {
  // Both accent flavors use the aurora gradient — the only difference is
  // which end of the gradient leads. Visual variety between login & signup.
  const isIndigo = accent === 'indigo'

  return (
    <div className="min-h-screen bg-[#070811] grid lg:grid-cols-2 overflow-hidden relative">
      {/* ───── Aurora ambient background ───── */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {/* Three floating aurora orbs — cyan, indigo, pink */}
        <div
          className="nx-aurora-orb"
          style={{
            top: '8%',
            left: '5%',
            width: '480px',
            height: '480px',
            background: 'radial-gradient(circle, #5EEAD4 0%, transparent 70%)',
            animation: 'nx-float 14s ease-in-out infinite',
          }}
        />
        <div
          className="nx-aurora-orb"
          style={{
            top: '45%',
            right: '8%',
            width: '520px',
            height: '520px',
            background: 'radial-gradient(circle, #818CF8 0%, transparent 70%)',
            opacity: 0.18,
            animation: 'nx-float 18s ease-in-out infinite 2s',
          }}
        />
        <div
          className="nx-aurora-orb"
          style={{
            bottom: '5%',
            left: '30%',
            width: '420px',
            height: '420px',
            background: 'radial-gradient(circle, #F472B6 0%, transparent 70%)',
            opacity: 0.12,
            animation: 'nx-float 16s ease-in-out infinite 4s',
          }}
        />
        {/* Subtle grid overlay */}
        <div
          className="absolute inset-0 opacity-[0.025]"
          style={{
            backgroundImage: `
              linear-gradient(rgba(129,140,248,0.6) 1px, transparent 1px),
              linear-gradient(90deg, rgba(129,140,248,0.6) 1px, transparent 1px)
            `,
            backgroundSize: '60px 60px',
          }}
        />
      </div>

      {/* ───── Left: Showcase panel (desktop only) ───── */}
      <div className="hidden lg:flex flex-col justify-center px-12 xl:px-20 relative z-10">
        <div className="max-w-xl mx-auto w-full">
          {/* Brand */}
          <div className="flex items-center gap-3 mb-8">
            <Image
              src="/jasbol-hack-logo.png"
              alt="Jasbol Hack"
              width={48}
              height={48}
              className="rounded-xl"
              priority
              style={{
                filter: 'drop-shadow(0 0 14px rgba(129,140,248,0.45)) drop-shadow(0 0 28px rgba(94,234,212,0.22))',
              }}
            />
            <div>
              <h1 className="text-2xl font-bold leading-none">
                <span className="nx-text-aurora">Jasbol</span>{' '}
                <span className="text-white">Hack</span>
              </h1>
              <p className="text-[11px] text-[var(--nx-text-muted)] mt-1 tracking-wider uppercase">
                Aurora Eclipse Terminal IDE
              </p>
            </div>
          </div>

          {/* MagicUI Terminal demo */}
          <TerminalDemo />

          {/* Security badges */}
          <div className="mt-8 grid grid-cols-2 gap-3">
            <FeatureBadge
              icon={<Lock className="h-4 w-4" />}
              title="Encrypted Session"
              desc="HTTP-only + SameSite cookies"
              color="#5EEAD4"
            />
            <FeatureBadge
              icon={<Fingerprint className="h-4 w-4" />}
              title="IP Fingerprint"
              desc="Token theft detection"
              color="#818CF8"
            />
            <FeatureBadge
              icon={<Shield className="h-4 w-4" />}
              title="Account Lockout"
              desc="5 fails → 15 min lock"
              color="#5EEAD4"
            />
            <FeatureBadge
              icon={<ServerCog className="h-4 w-4" />}
              title="Isolated Workspace"
              desc="No cross-user access"
              color="#F472B6"
            />
          </div>

          {/* Trust strip */}
          <div className="mt-8 flex items-center gap-3 text-[11px] text-[var(--nx-text-muted)] flex-wrap">
            <KeyRound className="h-3.5 w-3.5" style={{ color: '#5EEAD4' }} />
            <span>bCrypt(12) password hashing</span>
            <span className="text-[var(--nx-text-dim)]">•</span>
            <CheckCircle2 className="h-3.5 w-3.5" style={{ color: '#818CF8' }} />
            <span>JWT + IP-bound fingerprint</span>
          </div>
        </div>
      </div>

      {/* ───── Right: Form panel ───── */}
      <div className="flex items-center justify-center px-4 sm:px-8 py-8 relative z-10">
        <div className="w-full max-w-md">
          {/* Mobile-only compact header */}
          <div className="lg:hidden flex items-center gap-3 justify-center mb-6">
            <Image
              src="/jasbol-hack-logo.png"
              alt="Jasbol Hack"
              width={40}
              height={40}
              className="rounded-lg"
              priority
            />
            <h1 className="text-xl font-bold">
              <span className="nx-text-aurora">Jasbol</span>{' '}
              <span className="text-white">Hack</span>
            </h1>
          </div>

          {children}
        </div>
      </div>
    </div>
  )
}

function FeatureBadge({
  icon,
  title,
  desc,
  color,
}: {
  icon: ReactNode
  title: string
  desc: string
  color: string
}) {
  return (
    <div
      className="flex items-start gap-2.5 p-3 rounded-xl nx-glass transition-all hover:scale-[1.02] hover:border-[var(--nx-border-focus)]/30"
      style={{ boxShadow: `inset 0 0 0 1px ${color}18` }}
    >
      <div
        className="shrink-0 flex items-center justify-center w-7 h-7 rounded-lg"
        style={{ background: `${color}1F`, color, boxShadow: `0 0 12px ${color}30` }}
      >
        {icon}
      </div>
      <div className="min-w-0">
        <div className="text-[11px] font-semibold text-[var(--nx-text)] leading-tight">{title}</div>
        <div className="text-[10px] text-[var(--nx-text-muted)] mt-0.5 leading-tight">{desc}</div>
      </div>
    </div>
  )
}

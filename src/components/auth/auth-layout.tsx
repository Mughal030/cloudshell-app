'use client'

/**
 * AuthLayout — shared split-screen layout for /login and /signup.
 *
 * Left side:  Animated showcase panel — displays the MagicUI Terminal demo
 *             + security feature badges.
 * Right side: The actual form (passed as children).
 *
 * On small screens, the showcase panel collapses to a compact header above
 * the form, keeping the auth flow fast and visible on phones.
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
  const isIndigo = accent === 'indigo'
  const primary = isIndigo ? '#6366F1' : '#00E5C0'
  const secondary = isIndigo ? '#00E5C0' : '#6366F1'

  return (
    <div className="min-h-screen bg-[#080A12] grid lg:grid-cols-2 overflow-hidden relative">
      {/* ───── Background — animated gradient orbs + grid ───── */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div
          className="absolute top-1/4 left-1/4 w-[500px] h-[500px] rounded-full blur-3xl opacity-[0.06] animate-pulse"
          style={{ background: primary }}
        />
        <div
          className="absolute bottom-1/4 right-1/4 w-[500px] h-[500px] rounded-full blur-3xl opacity-[0.06] animate-pulse"
          style={{ background: secondary, animationDelay: '1.5s' }}
        />
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: `
              linear-gradient(${primary}55 1px, transparent 1px),
              linear-gradient(90deg, ${primary}55 1px, transparent 1px)
            `,
            backgroundSize: '50px 50px',
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
                filter: `drop-shadow(0 0 12px ${primary}55) drop-shadow(0 0 24px ${secondary}33)`,
              }}
            />
            <div>
              <h1 className="text-2xl font-bold leading-none">
                <span
                  className="bg-clip-text text-transparent"
                  style={{ backgroundImage: `linear-gradient(135deg, ${primary}, ${secondary})` }}
                >
                  Jasbol
                </span>{' '}
                <span className="text-white">Hack</span>
              </h1>
              <p className="text-[11px] text-[var(--nx-text-muted)] mt-1 tracking-wider uppercase">
                Nexus Eclipse Terminal IDE
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
              color={primary}
            />
            <FeatureBadge
              icon={<Fingerprint className="h-4 w-4" />}
              title="IP Fingerprint"
              desc="Token theft detection"
              color={secondary}
            />
            <FeatureBadge
              icon={<Shield className="h-4 w-4" />}
              title="Account Lockout"
              desc="5 fails → 15 min lock"
              color={primary}
            />
            <FeatureBadge
              icon={<ServerCog className="h-4 w-4" />}
              title="Isolated Workspace"
              desc="No cross-user access"
              color={secondary}
            />
          </div>

          {/* Trust strip */}
          <div className="mt-8 flex items-center gap-3 text-[11px] text-[var(--nx-text-muted)] flex-wrap">
            <KeyRound className="h-3.5 w-3.5" style={{ color: primary }} />
            <span>bCrypt(12) password hashing</span>
            <span className="text-[var(--nx-text-dim)]">•</span>
            <CheckCircle2 className="h-3.5 w-3.5" style={{ color: secondary }} />
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
              <span
                className="bg-clip-text text-transparent"
                style={{ backgroundImage: `linear-gradient(135deg, ${primary}, ${secondary})` }}
              >
                Jasbol
              </span>{' '}
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
      className="flex items-start gap-2.5 p-3 rounded-lg border border-[var(--nx-border)] bg-[var(--nx-bg-secondary)]/40 backdrop-blur-sm transition-all hover:bg-[var(--nx-bg-secondary)]/60 hover:border-[var(--nx-border-focus)]/30"
      style={{ boxShadow: `inset 0 0 0 1px ${color}11` }}
    >
      <div
        className="shrink-0 flex items-center justify-center w-7 h-7 rounded-md"
        style={{ background: `${color}1A`, color }}
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

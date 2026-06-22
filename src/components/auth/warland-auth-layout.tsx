'use client'

/**
 * WarlandAuthLayout — shared split-screen layout for /login and /signup.
 *
 * Inspired by the Dribbble "Mmorpg Metin2 Animated Website Template —
 * Warland" shot: a dark fantasy MMORPG aesthetic with deep obsidian
 * background, ember particle field, fire-glow at the bottom of the
 * hero, gold-foil ornaments, Cinzel serif typography, and ornate
 * card frames with corner brackets.
 *
 *   Left  : Hero banner — animated Warland terminal demo + sigil badges
 *   Right : The actual auth form (passed as children)
 *
 * On small screens the hero collapses to a compact header above the form
 * so the auth flow stays fast and visible.
 */

import { type ReactNode } from 'react'
import Image from 'next/image'
import {
  Shield, Lock, Fingerprint, ServerCog, CheckCircle2, KeyRound,
  Flame, Sword,
} from 'lucide-react'
import { WarlandTerminalDemo } from '@/registry/magicui/warland-terminal-demo'
import { WarlandEmbers } from '@/components/auth/warland-embers'

export function WarlandAuthLayout({
  children,
}: {
  children: ReactNode
}) {
  return (
    <div className="min-h-screen wl-atmosphere wl-stone-texture grid lg:grid-cols-2 overflow-hidden relative">
      {/* ───── Floating ember particle field ───── */}
      <WarlandEmbers count={18} />

      {/* ───── Bottom fire glow ───── */}
      <div className="wl-fire-glow" aria-hidden="true" />

      {/* ───── Vignette overlay (top + sides) ───── */}
      <div
        className="pointer-events-none absolute inset-0 z-[3]"
        style={{
          background:
            'radial-gradient(ellipse 100% 70% at 50% 50%, transparent 40%, rgba(0,0,0,0.6) 100%)',
        }}
        aria-hidden="true"
      />

      {/* ════════════════════════════════════════════════════════════
           LEFT — Hero Showcase Panel (desktop only)
           ════════════════════════════════════════════════════════════ */}
      <div className="hidden lg:flex flex-col justify-center px-12 xl:px-20 relative z-10">
        <div className="max-w-xl mx-auto w-full wl-fade-up">
          {/* Brand wordmark */}
          <div className="flex items-center gap-4 mb-8">
            <div
              className="relative shrink-0"
              style={{
                filter:
                  'drop-shadow(0 0 16px rgba(245, 179, 66, 0.55)) drop-shadow(0 0 32px rgba(255, 107, 26, 0.25))',
              }}
            >
              <Image
                src="/jasbol-hack-logo.png"
                alt="Jasbol Hack"
                width={56}
                height={56}
                className="rounded-xl"
                priority
              />
              {/* Gold ring around logo */}
              <div
                className="absolute -inset-1 rounded-xl pointer-events-none"
                style={{
                  border: '1px solid rgba(245, 179, 66, 0.4)',
                  boxShadow:
                    'inset 0 0 0 1px rgba(245, 179, 66, 0.15), 0 0 24px rgba(245, 179, 66, 0.2)',
                }}
              />
            </div>
            <div>
              <h1
                className="wl-font-display text-3xl font-bold leading-none wl-text-gold"
                style={{ textShadow: '0 2px 12px rgba(245, 179, 66, 0.25)' }}
              >
                Jasbol Hack
              </h1>
              <p
                className="text-[11px] mt-1.5 tracking-[0.3em] uppercase wl-font-serif"
                style={{ color: '#C9B89A' }}
              >
                <span style={{ color: '#F5B342' }}>◆</span>{' '}
                Warland Forge Terminal
              </p>
            </div>
          </div>

          {/* Hero tagline */}
          <div className="mb-6">
            <h2
              className="wl-font-display text-2xl font-semibold leading-tight"
              style={{ color: '#F5E6D3' }}
            >
              Forge your code in the{' '}
              <span className="wl-text-ember">fires</span>
              <br />
              of an unbreakable terminal.
            </h2>
            <p
              className="text-sm mt-3 leading-relaxed"
              style={{ color: '#8A7860' }}
            >
              An isolated, bcrypt-fortified stronghold where your work
              stays yours. Sealed by JWT, guarded by rate-limiting,
              armored with HTTP-only cookies.
            </p>
          </div>

          {/* Warland terminal demo */}
          <WarlandTerminalDemo />

          {/* Sigil grid — security features */}
          <div className="mt-6 grid grid-cols-2 gap-3">
            <SigilBadge
              icon={<Lock className="h-4 w-4" />}
              title="Sealed Session"
              desc="HTTP-only · SameSite cookies"
            />
            <SigilBadge
              icon={<Shield className="h-4 w-4" />}
              title="Account Lockout"
              desc="5 fails → 15 min cooldown"
            />
            <SigilBadge
              icon={<Fingerprint className="h-4 w-4" />}
              title="JWT Inscribed"
              desc="24h rotation · bcrypt(12)"
            />
            <SigilBadge
              icon={<ServerCog className="h-4 w-4" />}
              title="Isolated Stronghold"
              desc="No cross-user access"
            />
          </div>

          {/* Trust strip */}
          <div
            className="mt-6 flex items-center gap-3 text-[11px] flex-wrap"
            style={{ color: '#8A7860' }}
          >
            <KeyRound className="h-3.5 w-3.5" style={{ color: '#F5B342' }} />
            <span>bcrypt(12) password hashing</span>
            <span style={{ color: '#5C4E3D' }}>◆</span>
            <CheckCircle2 className="h-3.5 w-3.5" style={{ color: '#FF6B1A' }} />
            <span>JWT + IP-fingerprint ready</span>
            <span style={{ color: '#5C4E3D' }}>◆</span>
            <Flame className="h-3.5 w-3.5" style={{ color: '#DC2626' }} />
            <span>Forged for builders</span>
          </div>
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════════
           RIGHT — Form Panel
           ════════════════════════════════════════════════════════════ */}
      <div className="flex items-center justify-center px-4 sm:px-8 py-8 relative z-10">
        <div className="w-full max-w-md wl-fade-up" style={{ animationDelay: '0.1s' }}>
          {/* Mobile-only compact header */}
          <div className="lg:hidden flex flex-col items-center gap-2 mb-6 text-center">
            <div
              className="relative"
              style={{
                filter:
                  'drop-shadow(0 0 12px rgba(245, 179, 66, 0.5))',
              }}
            >
              <Image
                src="/jasbol-hack-logo.png"
                alt="Jasbol Hack"
                width={48}
                height={48}
                className="rounded-lg"
                priority
              />
            </div>
            <h1
              className="wl-font-display text-2xl font-bold wl-text-gold"
              style={{ textShadow: '0 2px 12px rgba(245, 179, 66, 0.25)' }}
            >
              Jasbol Hack
            </h1>
            <p
              className="text-[10px] tracking-[0.3em] uppercase wl-font-serif"
              style={{ color: '#C9B89A' }}
            >
              <span style={{ color: '#F5B342' }}>◆</span> Warland Forge
            </p>
          </div>

          {/* The actual form card — passed in from /login or /signup */}
          {children}

          {/* Mobile-only tagline */}
          <div className="lg:hidden mt-6 text-center">
            <p
              className="wl-font-serif text-sm italic"
              style={{ color: '#8A7860' }}
            >
              &ldquo;Forge your code. Guard your craft.&rdquo;
            </p>
          </div>
        </div>
      </div>

      {/* ───── Bottom corner brand stamp ───── */}
      <div
        className="hidden lg:flex absolute bottom-4 right-6 z-10 items-center gap-2 text-[10px] tracking-[0.3em] uppercase wl-font-serif"
        style={{ color: '#5C4E3D' }}
      >
        <Sword className="h-3 w-3" style={{ color: '#F5B342' }} />
        <span>Forged by Jasbol Hack · v2</span>
      </div>
    </div>
  )
}

/* ──────────────────────────────────────────────────────────────────
   SigilBadge — a single security feature card
   ────────────────────────────────────────────────────────────────── */
function SigilBadge({
  icon,
  title,
  desc,
}: {
  icon: ReactNode
  title: string
  desc: string
}) {
  return (
    <div className="wl-sigil">
      <div className="wl-sigil-icon">{icon}</div>
      <div className="min-w-0">
        <div
          className="text-[11px] font-semibold leading-tight wl-font-serif tracking-wide"
          style={{ color: '#F5E6D3' }}
        >
          {title}
        </div>
        <div
          className="text-[10px] mt-0.5 leading-tight"
          style={{ color: '#8A7860' }}
        >
          {desc}
        </div>
      </div>
    </div>
  )
}

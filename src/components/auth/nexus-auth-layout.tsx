'use client'

/**
 * NexusAuthLayout — premium split-screen layout for /login and /signup.
 *
 * Modern design: deep dark background with animated gradient mesh,
 * frosted glass cards, floating orb decorations, and clean typography.
 *
 *   Left  : Hero showcase — animated terminal demo + feature cards
 *   Right : The actual auth form (passed as children)
 *
 * On small screens the hero collapses to a compact header above the form.
 */

import { type ReactNode } from 'react'
import Image from 'next/image'
import {
  Shield, Lock, Fingerprint, Cpu, CheckCircle2,
  Terminal, Zap, Globe,
} from 'lucide-react'
import { WarlandTerminalDemo } from '@/registry/magicui/warland-terminal-demo'

export function NexusAuthLayout({
  children,
}: {
  children: ReactNode
}) {
  return (
    <div className="min-h-screen relative overflow-hidden flex" style={{ background: '#050810' }}>
      {/* ───── Animated gradient mesh background ───── */}
      <div className="absolute inset-0 z-0" aria-hidden="true">
        {/* Primary orb - top left */}
        <div
          className="absolute -top-32 -left-32 w-[500px] h-[500px] rounded-full opacity-20 blur-[120px] animate-[float1_20s_ease-in-out_infinite]"
          style={{ background: 'linear-gradient(135deg, #6366F1, #8B5CF6)' }}
        />
        {/* Secondary orb - bottom right */}
        <div
          className="absolute -bottom-32 -right-32 w-[400px] h-[400px] rounded-full opacity-15 blur-[100px] animate-[float2_25s_ease-in-out_infinite]"
          style={{ background: 'linear-gradient(135deg, #06B6D4, #3B82F6)' }}
        />
        {/* Accent orb - center */}
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] h-[300px] rounded-full opacity-10 blur-[80px] animate-[float3_15s_ease-in-out_infinite]"
          style={{ background: 'linear-gradient(135deg, #8B5CF6, #EC4899)' }}
        />
        {/* Grid overlay */}
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: 'linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)',
            backgroundSize: '60px 60px',
          }}
        />
      </div>

      {/* ───── Vignette ───── */}
      <div
        className="pointer-events-none absolute inset-0 z-[1]"
        style={{
          background: 'radial-gradient(ellipse 80% 60% at 50% 50%, transparent 30%, rgba(5,8,16,0.8) 100%)',
        }}
        aria-hidden="true"
      />

      {/* ════════════════════════════════════════════════════════════
           LEFT — Hero Showcase Panel (desktop only)
           ════════════════════════════════════════════════════════════ */}
      <div className="hidden lg:flex flex-col justify-center px-12 xl:px-20 relative z-10 w-1/2">
        <div className="max-w-xl mx-auto w-full">
          {/* Brand wordmark */}
          <div className="flex items-center gap-4 mb-10">
            <div
              className="relative shrink-0"
              style={{
                filter: 'drop-shadow(0 0 20px rgba(99, 102, 241, 0.4)) drop-shadow(0 0 40px rgba(139, 92, 246, 0.15))',
              }}
            >
              <Image
                src="/jasbol-hack-logo.png"
                alt="Jasbol Hack"
                width={56}
                height={56}
                className="rounded-2xl"
                priority
              />
              {/* Glowing ring */}
              <div
                className="absolute -inset-1.5 rounded-2xl pointer-events-none"
                style={{
                  border: '1.5px solid rgba(139, 92, 246, 0.3)',
                  boxShadow: 'inset 0 0 0 1px rgba(139, 92, 246, 0.08), 0 0 30px rgba(139, 92, 246, 0.12)',
                }}
              />
            </div>
            <div>
              <h1
                className="text-3xl font-bold leading-none tracking-tight"
                style={{
                  background: 'linear-gradient(135deg, #C7D2FE 0%, #818CF8 50%, #A78BFA 100%)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                }}
              >
                Jasbol Hack
              </h1>
              <p className="text-[11px] mt-1.5 tracking-[0.2em] uppercase font-medium" style={{ color: '#64748B' }}>
                <span style={{ color: '#818CF8' }}>▸</span>{' '}
                Cloud Terminal IDE
              </p>
            </div>
          </div>

          {/* Hero tagline */}
          <div className="mb-8">
            <h2 className="text-[28px] font-semibold leading-tight tracking-tight" style={{ color: '#E2E8F0' }}>
              Code in the cloud.
              <br />
              <span style={{
                background: 'linear-gradient(135deg, #818CF8, #6366F1, #8B5CF6)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }}>
                Ship from anywhere.
              </span>
            </h2>
            <p className="text-sm mt-4 leading-relaxed" style={{ color: '#64748B' }}>
              A full-featured browser IDE with terminal, file manager, code editor,
              and one-click tool installation. Secured, isolated, and always ready.
            </p>
          </div>

          {/* Terminal demo */}
          <WarlandTerminalDemo />

          {/* Feature grid */}
          <div className="mt-8 grid grid-cols-2 gap-3">
            <FeatureCard
              icon={<Lock className="h-4 w-4" />}
              title="Encrypted Auth"
              desc="JWT + bcrypt(12) hashing"
              color="#818CF8"
            />
            <FeatureCard
              icon={<Shield className="h-4 w-4" />}
              title="Account Lockout"
              desc="5 fails → 15 min cooldown"
              color="#6366F1"
            />
            <FeatureCard
              icon={<Fingerprint className="h-4 w-4" />}
              title="Per-User Isolation"
              desc="Separate workspaces & API keys"
              color="#8B5CF6"
            />
            <FeatureCard
              icon={<Cpu className="h-4 w-4" />}
              title="Cloud Runtime"
              desc="Full terminal in your browser"
              color="#A78BFA"
            />
          </div>

          {/* Trust strip */}
          <div className="mt-8 flex items-center gap-3 text-[11px] flex-wrap" style={{ color: '#475569' }}>
            <Zap className="h-3.5 w-3.5" style={{ color: '#818CF8' }} />
            <span>Instant workspace</span>
            <span style={{ color: '#334155' }}>·</span>
            <Globe className="h-3.5 w-3.5" style={{ color: '#6366F1' }} />
            <span>Works in any browser</span>
            <span style={{ color: '#334155' }}>·</span>
            <Terminal className="h-3.5 w-3.5" style={{ color: '#8B5CF6' }} />
            <span>Built for developers</span>
          </div>
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════════
           RIGHT — Form Panel
           ════════════════════════════════════════════════════════════ */}
      <div className="flex items-center justify-center px-4 sm:px-8 py-8 relative z-10 w-full lg:w-1/2">
        <div className="w-full max-w-md">
          {/* Mobile-only compact header */}
          <div className="lg:hidden flex flex-col items-center gap-3 mb-8 text-center">
            <div style={{ filter: 'drop-shadow(0 0 16px rgba(99, 102, 241, 0.4))' }}>
              <Image
                src="/jasbol-hack-logo.png"
                alt="Jasbol Hack"
                width={48}
                height={48}
                className="rounded-xl"
                priority
              />
            </div>
            <h1
              className="text-2xl font-bold tracking-tight"
              style={{
                background: 'linear-gradient(135deg, #C7D2FE, #818CF8)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }}
            >
              Jasbol Hack
            </h1>
            <p className="text-[10px] tracking-[0.2em] uppercase font-medium" style={{ color: '#64748B' }}>
              <span style={{ color: '#818CF8' }}>▸</span> Cloud Terminal IDE
            </p>
          </div>

          {/* The actual form card */}
          {children}

          {/* Mobile-only tagline */}
          <div className="lg:hidden mt-8 text-center">
            <p className="text-sm" style={{ color: '#475569' }}>
              Code anywhere. Ship faster.
            </p>
          </div>
        </div>
      </div>

      {/* ───── Corner brand ───── */}
      <div
        className="hidden lg:flex absolute bottom-5 right-7 z-10 items-center gap-2 text-[10px] tracking-[0.15em] uppercase font-medium"
        style={{ color: '#334155' }}
      >
        <CheckCircle2 className="h-3 w-3" style={{ color: '#818CF8' }} />
        <span>Powered by Jasbol Hack · v3</span>
      </div>

      {/* ───── Keyframe animations ───── */}
      <style jsx>{`
        @keyframes float1 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          33% { transform: translate(30px, -40px) scale(1.05); }
          66% { transform: translate(-20px, 20px) scale(0.95); }
        }
        @keyframes float2 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          33% { transform: translate(-30px, 30px) scale(1.05); }
          66% { transform: translate(40px, -20px) scale(0.95); }
        }
        @keyframes float3 {
          0%, 100% { transform: translate(-50%, -50%) scale(1); }
          50% { transform: translate(-50%, -50%) scale(1.15); }
        }
      `}</style>
    </div>
  )
}

/* ──────────────────────────────────────────────────────────────────
   FeatureCard — a single security/feature card with glass effect
   ────────────────────────────────────────────────────────────────── */
function FeatureCard({
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
      className="rounded-xl p-3.5 transition-all duration-300 hover:scale-[1.02]"
      style={{
        background: 'rgba(15, 20, 35, 0.6)',
        border: `1px solid ${color}18`,
        backdropFilter: 'blur(12px)',
      }}
    >
      <div className="flex items-start gap-2.5">
        <div
          className="shrink-0 rounded-lg p-1.5"
          style={{
            background: `${color}12`,
            color: color,
          }}
        >
          {icon}
        </div>
        <div className="min-w-0">
          <div className="text-[11px] font-semibold leading-tight tracking-wide" style={{ color: '#E2E8F0' }}>
            {title}
          </div>
          <div className="text-[10px] mt-0.5 leading-tight" style={{ color: '#64748B' }}>
            {desc}
          </div>
        </div>
      </div>
    </div>
  )
}

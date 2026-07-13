'use client'

/**
 * NexusAuthLayout — "Obsidian Aurora" premium split-screen layout.
 *
 * Deep space background (#030508) with animated aurora borealis,
 * CSS-only starfield, scan lines, and glass-morphism cards.
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
  Terminal, Zap, Globe, Activity,
} from 'lucide-react'
import { WarlandTerminalDemo } from '@/registry/magicui/warland-terminal-demo'

export function NexusAuthLayout({
  children,
}: {
  children: ReactNode
}) {
  return (
    <div className="min-h-screen relative overflow-hidden flex" style={{ background: '#030508' }}>
      {/* ───── Animated Aurora Borealis ───── */}
      <div className="absolute inset-0 z-0" aria-hidden="true">
        {/* Aurora band 1 — cyan to indigo */}
        <div
          className="absolute w-[200%] h-[60%] opacity-[0.18] animate-[aurora1_12s_ease-in-out_infinite]"
          style={{
            top: '-15%',
            left: '-50%',
            background: 'linear-gradient(180deg, transparent 0%, #06B6D422 15%, #6366F144 40%, #8B5CF633 65%, transparent 100%)',
            filter: 'blur(80px)',
            transformOrigin: 'center center',
          }}
        />
        {/* Aurora band 2 — violet to indigo */}
        <div
          className="absolute w-[200%] h-[50%] opacity-[0.14] animate-[aurora2_16s_ease-in-out_infinite]"
          style={{
            top: '5%',
            left: '-30%',
            background: 'linear-gradient(180deg, transparent 0%, #8B5CF622 20%, #6366F144 50%, #06B6D433 75%, transparent 100%)',
            filter: 'blur(100px)',
            transformOrigin: 'center center',
          }}
        />
        {/* Aurora band 3 — subtle warm accent */}
        <div
          className="absolute w-[180%] h-[40%] opacity-[0.08] animate-[aurora3_20s_ease-in-out_infinite]"
          style={{
            top: '15%',
            left: '-40%',
            background: 'linear-gradient(160deg, transparent 0%, #06B6D411 25%, #6366F122 50%, #8B5CF622 75%, transparent 100%)',
            filter: 'blur(120px)',
            transformOrigin: 'center center',
          }}
        />

        {/* ───── CSS-Only Starfield ───── */}
        <div
          className="absolute inset-0 animate-[starTwinkle_4s_ease-in-out_infinite]"
          style={{
            backgroundImage:
              'radial-gradient(1px 1px at 10% 20%, rgba(255,255,255,0.4) 0%, transparent 100%),' +
              'radial-gradient(1px 1px at 25% 55%, rgba(255,255,255,0.3) 0%, transparent 100%),' +
              'radial-gradient(1.5px 1.5px at 40% 15%, rgba(6,182,212,0.5) 0%, transparent 100%),' +
              'radial-gradient(1px 1px at 55% 80%, rgba(255,255,255,0.25) 0%, transparent 100%),' +
              'radial-gradient(1px 1px at 70% 35%, rgba(255,255,255,0.35) 0%, transparent 100%),' +
              'radial-gradient(1.5px 1.5px at 85% 60%, rgba(139,92,246,0.4) 0%, transparent 100%),' +
              'radial-gradient(1px 1px at 15% 85%, rgba(255,255,255,0.2) 0%, transparent 100%),' +
              'radial-gradient(1px 1px at 50% 45%, rgba(255,255,255,0.3) 0%, transparent 100%),' +
              'radial-gradient(1px 1px at 90% 10%, rgba(6,182,212,0.35) 0%, transparent 100%),' +
              'radial-gradient(1px 1px at 30% 70%, rgba(255,255,255,0.2) 0%, transparent 100%),' +
              'radial-gradient(1px 1px at 65% 5%, rgba(255,255,255,0.3) 0%, transparent 100%),' +
              'radial-gradient(1.5px 1.5px at 5% 50%, rgba(99,102,241,0.4) 0%, transparent 100%),' +
              'radial-gradient(1px 1px at 80% 90%, rgba(255,255,255,0.2) 0%, transparent 100%),' +
              'radial-gradient(1px 1px at 45% 30%, rgba(255,255,255,0.3) 0%, transparent 100%),' +
              'radial-gradient(1px 1px at 95% 75%, rgba(139,92,246,0.3) 0%, transparent 100%)',
            backgroundSize: '200px 200px',
          }}
        />
        {/* Second layer — offset for density */}
        <div
          className="absolute inset-0 animate-[starTwinkle2_6s_ease-in-out_infinite]"
          style={{
            backgroundImage:
              'radial-gradient(1px 1px at 18% 32%, rgba(255,255,255,0.25) 0%, transparent 100%),' +
              'radial-gradient(1px 1px at 42% 78%, rgba(255,255,255,0.2) 0%, transparent 100%),' +
              'radial-gradient(1px 1px at 68% 12%, rgba(6,182,212,0.3) 0%, transparent 100%),' +
              'radial-gradient(1px 1px at 82% 52%, rgba(255,255,255,0.2) 0%, transparent 100%),' +
              'radial-gradient(1px 1px at 8% 68%, rgba(139,92,246,0.3) 0%, transparent 100%),' +
              'radial-gradient(1px 1px at 58% 88%, rgba(255,255,255,0.2) 0%, transparent 100%),' +
              'radial-gradient(1px 1px at 35% 5%, rgba(255,255,255,0.3) 0%, transparent 100%)',
            backgroundSize: '300px 300px',
          }}
        />

        {/* ───── Perspective Grid Overlay ───── */}
        <div
          className="absolute inset-0 opacity-[0.025]"
          style={{
            backgroundImage: 'linear-gradient(rgba(6,182,212,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(6,182,212,0.3) 1px, transparent 1px)',
            backgroundSize: '80px 80px',
            transform: 'perspective(500px) rotateX(30deg) scale(1.5)',
            transformOrigin: 'center top',
          }}
        />

        {/* ───── Scan Lines ───── */}
        <div
          className="absolute inset-0 pointer-events-none opacity-[0.03]"
          style={{
            backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(6,182,212,0.15) 2px, rgba(6,182,212,0.15) 4px)',
            backgroundSize: '100% 4px',
          }}
        />
      </div>

      {/* ───── Deep Vignette ───── */}
      <div
        className="pointer-events-none absolute inset-0 z-[1]"
        style={{
          background: 'radial-gradient(ellipse 70% 50% at 50% 50%, transparent 20%, rgba(3,5,8,0.7) 70%, rgba(3,5,8,0.95) 100%)',
        }}
        aria-hidden="true"
      />

      {/* ════════════════════════════════════════════════════════════
           LEFT — Hero Showcase Panel (desktop only)
           ════════════════════════════════════════════════════════════ */}
      <div className="hidden lg:flex flex-col justify-center px-12 xl:px-20 relative z-10 w-1/2">
        <div className="max-w-xl mx-auto w-full animate-[slideInLeft_0.8s_ease-out_both]">
          {/* Brand wordmark */}
          <div className="flex items-center gap-4 mb-10">
            <div
              className="relative shrink-0"
              style={{
                filter: 'drop-shadow(0 0 24px rgba(6, 182, 212, 0.3)) drop-shadow(0 0 48px rgba(99, 102, 241, 0.15))',
              }}
            >
              <Image
                src="/jasbol-hack-logo.png"
                alt="Jasbol Hack"
                width={60}
                height={60}
                className="rounded-2xl"
                priority
              />
              {/* Animated glow ring */}
              <div
                className="absolute -inset-2 rounded-2xl pointer-events-none animate-[glowPulse_3s_ease-in-out_infinite]"
                style={{
                  border: '1.5px solid rgba(6, 182, 212, 0.25)',
                  boxShadow: 'inset 0 0 0 1px rgba(6, 182, 212, 0.06), 0 0 30px rgba(6, 182, 212, 0.08), 0 0 60px rgba(99, 102, 241, 0.05)',
                }}
              />
            </div>
            <div>
              <h1
                className="text-3xl font-bold leading-none tracking-tight"
                style={{
                  background: 'linear-gradient(135deg, #C7D2FE 0%, #06B6D4 40%, #818CF8 70%, #8B5CF6 100%)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                }}
              >
                Jasbol Hack
              </h1>
              <p className="text-[11px] mt-1.5 tracking-[0.2em] uppercase font-medium" style={{ color: '#64748B' }}>
                <span className="animate-[glowPulse_2s_ease-in-out_infinite]" style={{ color: '#06B6D4' }}>▸</span>{' '}
                Cloud Terminal IDE
              </p>
            </div>
          </div>

          {/* Hero tagline */}
          <div className="mb-8">
            <h2 className="text-[30px] font-semibold leading-tight tracking-tight" style={{ color: '#E2E8F0' }}>
              Code in the cloud.
              <br />
              <span style={{
                background: 'linear-gradient(135deg, #06B6D4, #6366F1, #8B5CF6)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }}>
                Ship from anywhere.
              </span>
            </h2>
            <p className="text-[14px] mt-4 leading-relaxed" style={{ color: '#64748B' }}>
              A full-featured browser IDE with terminal, file manager, code editor,
              and one-click tool installation. Secured, isolated, and always ready.
            </p>
          </div>

          {/* Terminal demo — enhanced container */}
          <div
            className="rounded-xl overflow-hidden relative"
            style={{
              border: '1px solid rgba(6, 182, 212, 0.1)',
              boxShadow: '0 0 40px rgba(6, 182, 212, 0.04), 0 0 80px rgba(99, 102, 241, 0.03)',
            }}
          >
            {/* Subtle glow line at top of terminal container */}
            <div
              className="h-[1px] w-full"
              style={{
                background: 'linear-gradient(90deg, transparent, rgba(6,182,212,0.3), rgba(99,102,241,0.2), transparent)',
              }}
            />
            <WarlandTerminalDemo />
          </div>

          {/* Feature grid */}
          <div className="mt-8 grid grid-cols-2 gap-3">
            <FeatureCard
              icon={<Lock className="h-4 w-4" />}
              title="Encrypted Auth"
              desc="JWT + bcrypt(12) hashing"
              color="#06B6D4"
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
            <Zap className="h-3.5 w-3.5" style={{ color: '#06B6D4' }} />
            <span>Instant workspace</span>
            <span style={{ color: '#1E293B' }}>·</span>
            <Globe className="h-3.5 w-3.5" style={{ color: '#6366F1' }} />
            <span>Works in any browser</span>
            <span style={{ color: '#1E293B' }}>·</span>
            <Terminal className="h-3.5 w-3.5" style={{ color: '#8B5CF6' }} />
            <span>Built for developers</span>
          </div>
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════════
           RIGHT — Form Panel
           ════════════════════════════════════════════════════════════ */}
      <div className="flex items-center justify-center px-4 sm:px-8 py-8 relative z-10 w-full lg:w-1/2">
        <div className="w-full max-w-md animate-[slideInRight_0.8s_ease-out_both]">
          {/* Mobile-only compact header */}
          <div className="lg:hidden flex flex-col items-center gap-3 mb-8 text-center">
            <div
              style={{ filter: 'drop-shadow(0 0 20px rgba(6, 182, 212, 0.35))' }}
            >
              <Image
                src="/jasbol-hack-logo.png"
                alt="Jasbol Hack"
                width={52}
                height={52}
                className="rounded-xl"
                priority
              />
            </div>
            <h1
              className="text-2xl font-bold tracking-tight"
              style={{
                background: 'linear-gradient(135deg, #C7D2FE, #06B6D4, #818CF8)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }}
            >
              Jasbol Hack
            </h1>
            <p className="text-[10px] tracking-[0.2em] uppercase font-medium" style={{ color: '#64748B' }}>
              <span style={{ color: '#06B6D4' }}>▸</span> Cloud Terminal IDE
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

      {/* ───── Corner brand with pulsing indicator ───── */}
      <div
        className="hidden lg:flex absolute bottom-5 right-7 z-10 items-center gap-2.5 text-[10px] tracking-[0.15em] uppercase font-medium"
        style={{ color: '#334155' }}
      >
        <Activity
          className="h-3 w-3 animate-[glowPulse_2.5s_ease-in-out_infinite]"
          style={{ color: '#06B6D4' }}
        />
        <span>Powered by Jasbol Hack · v3</span>
        <div
          className="w-1.5 h-1.5 rounded-full animate-[glowPulse_2s_ease-in-out_infinite]"
          style={{ background: '#06B6D4' }}
        />
      </div>

      {/* ───── Keyframe Animations ───── */}
      <style jsx>{`
        @keyframes aurora1 {
          0%, 100% { transform: translateX(-10%) rotate(-2deg) scaleY(1); }
          25% { transform: translateX(5%) rotate(1deg) scaleY(1.1); }
          50% { transform: translateX(-5%) rotate(-1deg) scaleY(0.95); }
          75% { transform: translateX(10%) rotate(2deg) scaleY(1.05); }
        }
        @keyframes aurora2 {
          0%, 100% { transform: translateX(5%) rotate(1deg) scaleY(1); }
          33% { transform: translateX(-8%) rotate(-2deg) scaleY(1.1); }
          66% { transform: translateX(12%) rotate(1.5deg) scaleY(0.9); }
        }
        @keyframes aurora3 {
          0%, 100% { transform: translateX(-5%) rotate(0deg) scaleY(1); }
          50% { transform: translateX(8%) rotate(-1deg) scaleY(1.15); }
        }
        @keyframes starTwinkle {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        @keyframes starTwinkle2 {
          0%, 100% { opacity: 0.7; }
          50% { opacity: 0.3; }
        }
        @keyframes glowPulse {
          0%, 100% { opacity: 0.6; }
          50% { opacity: 1; }
        }
        @keyframes slideInLeft {
          from { opacity: 0; transform: translateX(-30px); }
          to { opacity: 1; transform: translateX(0); }
        }
        @keyframes slideInRight {
          from { opacity: 0; transform: translateX(30px); }
          to { opacity: 1; transform: translateX(0); }
        }
      `}</style>
    </div>
  )
}

/* ──────────────────────────────────────────────────────────────────
   FeatureCard — glass card with hover glow effect
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
      className="group rounded-xl p-3.5 transition-all duration-500 hover:scale-[1.03] relative overflow-hidden"
      style={{
        background: 'rgba(8, 12, 25, 0.7)',
        border: `1px solid ${color}15`,
        backdropFilter: 'blur(16px)',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = `${color}40`
        e.currentTarget.style.boxShadow = `0 0 20px ${color}12, inset 0 0 20px ${color}05`
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = `${color}15`
        e.currentTarget.style.boxShadow = 'none'
      }}
    >
      {/* Hover glow effect — radial gradient overlay */}
      <div
        className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
        style={{
          background: `radial-gradient(circle at 50% 50%, ${color}08, transparent 70%)`,
        }}
      />
      <div className="flex items-start gap-2.5 relative z-10">
        <div
          className="shrink-0 rounded-lg p-1.5 transition-all duration-300"
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

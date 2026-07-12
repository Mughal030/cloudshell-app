'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

/* ──────────────────────────────────────────────────────────────────
   Warland Terminal — Animated demo component (Jasbol Hack branded)
   ──────────────────────────────────────────────────────────────────
   A cyberpunk-styled terminal window: deep dark body, cyan
   traffic-light dots, electric-glow shadow, clean sans-serif title.
   Renders a fake terminal window with a typing cursor and AnimatedSpan
   lines that progressively fade in. Used on the login / signup pages.
   ────────────────────────────────────────────────────────────────── */

export function WarlandTerminal({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'z-0 w-full max-w-2xl rounded-xl overflow-hidden',
        className
      )}
      style={{
        background: 'linear-gradient(180deg, #141C2E 0%, #0C1220 100%)',
        border: '1px solid rgba(6, 182, 212, 0.15)',
        boxShadow:
          '0 0 0 1px rgba(6, 182, 212, 0.08), 0 0 40px rgba(6, 182, 212, 0.06), 0 0 80px rgba(59, 130, 246, 0.04), 0 25px 60px rgba(0, 0, 0, 0.6)',
      }}
    >
      {/* Title bar — dark with cyan accents */}
      <div
        className="flex items-center gap-2 px-4 py-2.5 border-b"
        style={{
          background: 'linear-gradient(180deg, #1A2540 0%, #141C2E 100%)',
          borderColor: 'rgba(6, 182, 212, 0.12)',
        }}
      >
        <div className="flex gap-1.5">
          <span
            className="h-3 w-3 rounded-full"
            style={{ background: '#EF4444', boxShadow: '0 0 6px rgba(239, 68, 68, 0.6)' }}
          />
          <span
            className="h-3 w-3 rounded-full"
            style={{ background: '#06B6D4', boxShadow: '0 0 6px rgba(6, 182, 212, 0.6)' }}
          />
          <span
            className="h-3 w-3 rounded-full"
            style={{ background: '#10B981', boxShadow: '0 0 6px rgba(16, 185, 129, 0.5)' }}
          />
        </div>
        <div
          className="ml-2 flex items-center gap-1.5 text-[10px] font-mono"
          style={{ color: '#94A3B8' }}
        >
          <span
            className="inline-block h-1.5 w-1.5 rounded-full animate-pulse"
            style={{ background: '#06B6D4', boxShadow: '0 0 6px rgba(6, 182, 212, 0.7)' }}
          />
          jasbol@hack — zsh
        </div>
        <div
          className="ml-auto flex items-center gap-1.5 text-[9px] uppercase tracking-[0.15em] font-semibold"
          style={{ color: '#64748B', fontFamily: 'var(--font-inter), system-ui, sans-serif' }}
        >
          <span style={{ color: '#06B6D4' }}>▸</span>
          <span>Cyberpunk Terminal</span>
        </div>
      </div>

      {/* Body */}
      <pre
        className="p-5 font-mono text-[13px] leading-relaxed overflow-x-auto wl-scroll"
        style={{
          fontFamily: 'var(--font-jetbrains), ui-monospace, monospace',
          color: '#94A3B8',
        }}
      >
        {children}
      </pre>
    </div>
  )
}

/* ──────────────────────────────────────────────────────────────────
   TypingAnimation — types out text character by character
   ────────────────────────────────────────────────────────────────── */
export function TypingAnimation({
  children,
  className,
  style,
  duration = 45,
  delay = 0,
}: {
  children: string
  className?: string
  style?: React.CSSProperties
  duration?: number
  delay?: number
}) {
  const [displayed, setDisplayed] = useState('')
  const [started, setStarted] = useState(false)
  const indexRef = useRef(0)

  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>
    timeout = setTimeout(() => setStarted(true), delay)
    return () => clearTimeout(timeout)
  }, [delay])

  useEffect(() => {
    if (!started) return
    const text = String(children)
    let active = true

    function tick() {
      if (!active) return
      if (indexRef.current >= text.length) return
      setDisplayed(text.slice(0, indexRef.current + 1))
      indexRef.current += 1
      if (indexRef.current < text.length) {
        setTimeout(tick, duration)
      }
    }
    tick()
    return () => {
      active = false
    }
  }, [started, children, duration])

  return (
    <span className={cn('inline-block', className)} style={style}>
      {displayed}
      {displayed.length < String(children).length && (
        <span
          className="ml-0.5 inline-block h-3.5 w-1.5 -mb-0.5 animate-pulse"
          style={{ background: '#06B6D4' }}
        />
      )}
    </span>
  )
}

/* ──────────────────────────────────────────────────────────────────
   AnimatedSpan — fades in with a delay, used for status lines
   ────────────────────────────────────────────────────────────────── */
export function AnimatedSpan({
  children,
  className,
  style,
  delay = 0,
}: {
  children: ReactNode
  className?: string
  style?: React.CSSProperties
  delay?: number
}) {
  const [shown, setShown] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setShown(true), delay)
    return () => clearTimeout(t)
  }, [delay])

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 transition-all duration-500',
        shown ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-1',
        className
      )}
      style={style}
    >
      {children}
    </span>
  )
}

'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

/* ──────────────────────────────────────────────────────────────────
   MagicUI Terminal — Animated demo component (Jasbol Hack branded)
   ──────────────────────────────────────────────────────────────────
   Renders a fake terminal window with traffic-light dots, a typing
   cursor, and "AnimatedSpan" lines that progressively appear with a
   fade-in. Used on the login / signup pages as a beautiful showcase
   of the kind of work the IDE does.
   ────────────────────────────────────────────────────────────────── */

export function Terminal({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'z-0 w-full max-w-2xl rounded-xl border border-[var(--nx-border)] bg-[#0F1117]/95 backdrop-blur-md overflow-hidden shadow-2xl',
        'nx-gradient-border',
        className
      )}
      style={{
        boxShadow:
          '0 0 60px rgba(0,229,192,0.10), 0 0 120px rgba(99,102,241,0.06), 0 25px 60px rgba(0,0,0,0.55)',
      }}
    >
      {/* Title bar */}
      <div className="flex items-center gap-2 border-b border-[var(--nx-border)] bg-[var(--nx-bg-secondary)]/80 px-4 py-2.5">
        <div className="flex gap-1.5">
          <span className="h-3 w-3 rounded-full bg-[#FF5F57] shadow-[0_0_6px_rgba(255,95,87,0.6)]" />
          <span className="h-3 w-3 rounded-full bg-[#FEBC2E] shadow-[0_0_6px_rgba(254,188,46,0.6)]" />
          <span className="h-3 w-3 rounded-full bg-[#28C840] shadow-[0_0_6px_rgba(40,200,64,0.6)]" />
        </div>
        <div className="ml-2 flex items-center gap-1.5 text-[10px] text-[var(--nx-text-muted)] font-mono">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--nx-accent-teal)] animate-pulse" />
          jasbol@hack — zsh
        </div>
        <div className="ml-auto flex items-center gap-1.5 text-[9px] uppercase tracking-wider text-[var(--nx-text-dim)]">
          <span className="text-[var(--nx-accent-teal)]">●</span>
          <span>nexus-eclipse</span>
        </div>
      </div>

      {/* Body */}
      <pre
        className="p-5 font-mono text-[13px] leading-relaxed text-[var(--nx-text-secondary)] overflow-x-auto"
        style={{ fontFamily: 'var(--font-jetbrains), ui-monospace, monospace' }}
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
  duration = 45,
  delay = 0,
}: {
  children: string
  className?: string
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
    <span className={cn('inline-block', className)}>
      {displayed}
      {displayed.length < String(children).length && (
        <span className="ml-0.5 inline-block h-3.5 w-1.5 -mb-0.5 animate-pulse bg-[var(--nx-accent-teal)]" />
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
  delay = 0,
}: {
  children: ReactNode
  className?: string
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
    >
      {children}
    </span>
  )
}

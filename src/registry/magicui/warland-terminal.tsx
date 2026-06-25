'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

/* ──────────────────────────────────────────────────────────────────
   Warland Terminal — Animated demo component (Jasbol Hack branded)
   ──────────────────────────────────────────────────────────────────
   A fantasy MMORPG-styled terminal window: deep obsidian body, gold
   traffic-light dots, ember-glow shadow, Cinzel-accented title bar.
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
        background: 'linear-gradient(180deg, #1A1112 0%, #0E0809 100%)',
        border: '1px solid #3A2624',
        boxShadow:
          '0 0 0 1px rgba(245, 179, 66, 0.10), 0 0 40px rgba(255, 107, 26, 0.10), 0 0 80px rgba(220, 38, 38, 0.06), 0 25px 60px rgba(0, 0, 0, 0.7)',
      }}
    >
      {/* Title bar — obsidian with gold accents */}
      <div
        className="flex items-center gap-2 px-4 py-2.5 border-b"
        style={{
          background: 'linear-gradient(180deg, #25181A 0%, #1A1112 100%)',
          borderColor: '#3A2624',
        }}
      >
        <div className="flex gap-1.5">
          <span
            className="h-3 w-3 rounded-full"
            style={{ background: '#DC2626', boxShadow: '0 0 6px rgba(220, 38, 38, 0.7)' }}
          />
          <span
            className="h-3 w-3 rounded-full"
            style={{ background: '#F5B342', boxShadow: '0 0 6px rgba(245, 179, 66, 0.7)' }}
          />
          <span
            className="h-3 w-3 rounded-full"
            style={{ background: '#84CC16', boxShadow: '0 0 6px rgba(132, 204, 22, 0.6)' }}
          />
        </div>
        <div
          className="ml-2 flex items-center gap-1.5 text-[10px] font-mono"
          style={{ color: '#C9B89A' }}
        >
          <span
            className="inline-block h-1.5 w-1.5 rounded-full animate-pulse"
            style={{ background: '#F5B342', boxShadow: '0 0 6px rgba(245, 179, 66, 0.7)' }}
          />
          jasbol@hack — zsh
        </div>
        <div
          className="ml-auto flex items-center gap-1.5 text-[9px] uppercase tracking-[0.2em] font-semibold"
          style={{ color: '#8A7860', fontFamily: 'var(--font-cinzel), serif' }}
        >
          <span style={{ color: '#F5B342' }}>◆</span>
          <span>Warland Forge</span>
        </div>
      </div>

      {/* Body */}
      <pre
        className="p-5 font-mono text-[13px] leading-relaxed overflow-x-auto wl-scroll"
        style={{
          fontFamily: 'var(--font-jetbrains), ui-monospace, monospace',
          color: '#C9B89A',
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
          style={{ background: '#F5B342' }}
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

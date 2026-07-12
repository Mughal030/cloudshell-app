'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import {
  Eye, EyeOff, Lock, User, ArrowRight, Fingerprint, ShieldAlert,
  Terminal, Activity,
} from 'lucide-react'
import { WarlandAuthLayout } from '@/components/auth/warland-auth-layout'

export default function LoginPage() {
  const router = useRouter()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [attemptsRemaining, setAttemptsRemaining] = useState<number | null>(null)
  const [retryAfter, setRetryAfter] = useState<number | null>(null)
  const submitRef = useRef<HTMLButtonElement>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setAttemptsRemaining(null)
    setRetryAfter(null)
    setLoading(true)

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      })
      const data = await res.json()

      if (data.success) {
        // Persist token in localStorage for socket.io auth + use alongside httpOnly cookie
        localStorage.setItem('jasbol-token', data.token)
        localStorage.setItem('jasbol-user', JSON.stringify(data.user))
        router.push('/')
      } else {
        setError(data.error || 'Login failed')
        const m = typeof data.error === 'string' ? data.error.match(/(\d+)\s+attempt/i) : null
        if (m) setAttemptsRemaining(parseInt(m[1], 10))
        if (res.status === 429) setRetryAfter(60)
      }
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <WarlandAuthLayout>
      {/* ── Form Card ── */}
      <div className="wl-card rounded-2xl overflow-hidden">
        {/* Corner brackets */}
        <span className="wl-corner wl-corner-tl" />
        <span className="wl-corner wl-corner-tr" />
        <span className="wl-corner wl-corner-bl" />
        <span className="wl-corner wl-corner-br" />

        {/* Top accent bar with terminal icon */}
        <div
          className="h-1 relative"
          style={{
            background:
              'linear-gradient(90deg, #0891B2 0%, #06B6D4 20%, #22D3EE 50%, #06B6D4 80%, #0891B2 100%)',
            boxShadow: '0 0 16px rgba(6, 182, 212, 0.3)',
          }}
        >
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
            <Terminal
              className="h-3 w-3"
              style={{ color: '#22D3EE', filter: 'drop-shadow(0 0 4px rgba(6, 182, 212, 0.8))' }}
            />
          </div>
        </div>

        {/* Header */}
        <div className="px-8 pt-7 pb-4 text-center relative">
          <h2
            className="wl-font-display text-2xl font-bold mb-1.5"
            style={{ color: '#E2E8F0' }}
          >
            <span className="wl-text-gold">Access</span>{' '}
            Terminal
          </h2>
          <p className="text-sm" style={{ color: '#64748B' }}>
            Sign in to your secure workspace
          </p>

          {/* Encrypted connection badge */}
          <div
            className="inline-flex items-center gap-1.5 mt-3 px-3 py-1 rounded-full"
            style={{
              background: 'rgba(6, 182, 212, 0.08)',
              border: '1px solid rgba(6, 182, 212, 0.2)',
            }}
          >
            <Lock className="w-3 h-3" style={{ color: '#06B6D4' }} />
            <span
              className="text-[10px] font-semibold tracking-[0.15em] uppercase wl-font-serif"
              style={{ color: '#06B6D4' }}
            >
              Encrypted Connection
            </span>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-8 pb-7">
          {error && (
            <div
              className="mb-4 p-3 rounded-lg text-sm flex items-start gap-2"
              style={{
                background: 'rgba(239, 68, 68, 0.08)',
                border: '1px solid rgba(239, 68, 68, 0.25)',
                color: '#FCA5A5',
              }}
            >
              <ShieldAlert className="w-4 h-4 mt-0.5 shrink-0" style={{ color: '#EF4444' }} />
              <div className="flex-1">
                <div>{error}</div>
                {attemptsRemaining !== null && attemptsRemaining > 0 && (
                  <div className="text-[10px] opacity-80 mt-1">
                    {attemptsRemaining} attempt{attemptsRemaining !== 1 ? 's' : ''}{' '}
                    remaining before lockout
                  </div>
                )}
                {retryAfter && (
                  <div className="text-[10px] opacity-80 mt-1">
                    Rate-limited — wait ~{retryAfter}s
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Username field */}
          <div className="mb-4">
            <label
              className="block text-[10px] font-semibold mb-1.5 uppercase tracking-[0.15em] wl-font-serif"
              style={{ color: '#94A3B8' }}
            >
              Username
            </label>
            <div className="relative group">
              <div
                className="absolute left-3 top-1/2 -translate-y-1/2 transition-colors"
                style={{ color: '#475569' }}
              >
                <User className="w-4 h-4" />
              </div>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="wl-input w-full pl-10 pr-4 py-3 rounded-xl text-sm font-mono"
                placeholder="Enter your username"
                required
                maxLength={60}
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
              />
            </div>
          </div>

          {/* Password field */}
          <div className="mb-6">
            <label
              className="block text-[10px] font-semibold mb-1.5 uppercase tracking-[0.15em] wl-font-serif"
              style={{ color: '#94A3B8' }}
            >
              Password
            </label>
            <div className="relative group">
              <div
                className="absolute left-3 top-1/2 -translate-y-1/2 transition-colors"
                style={{ color: '#475569' }}
              >
                <Lock className="w-4 h-4" />
              </div>
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="wl-input w-full pl-10 pr-12 py-3 rounded-xl text-sm font-mono"
                placeholder="Enter your password"
                required
                maxLength={200}
                autoComplete="current-password"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 transition-colors"
                style={{ color: '#475569' }}
                onMouseEnter={(e) => (e.currentTarget.style.color = '#06B6D4')}
                onMouseLeave={(e) => (e.currentTarget.style.color = '#475569')}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Login button */}
          <button
            ref={submitRef}
            type="submit"
            disabled={loading}
            className="wl-btn-gold w-full py-3.5 rounded-xl font-semibold text-sm relative flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <span className="relative z-10 flex items-center justify-center gap-2">
              {loading ? (
                <>
                  <div
                    className="w-4 h-4 border-2 rounded-full animate-spin"
                    style={{ borderColor: 'rgba(255,255,255,0.3)', borderTopColor: '#FFFFFF' }}
                  />
                  Authenticating…
                </>
              ) : (
                <>
                  <Fingerprint className="w-4 h-4" />
                  Access Terminal
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </>
              )}
            </span>
          </button>

          {/* Divider */}
          <div className="wl-divider my-6">
            <span className="wl-divider-gem" />
          </div>

          {/* Signup link */}
          <div className="text-center">
            <span className="text-sm" style={{ color: '#64748B' }}>
              No account yet?{' '}
            </span>
            <button
              type="button"
              onClick={() => router.push('/signup')}
              className="text-sm font-semibold hover:underline inline-flex items-center gap-1.5 wl-font-serif tracking-wide"
              style={{ color: '#06B6D4' }}
            >
              <Activity className="w-3 h-3" />
              Create Account
            </button>
          </div>
        </form>
      </div>

      {/* Footer note */}
      <p
        className="text-center text-[10px] mt-4 wl-font-serif"
        style={{ color: '#475569' }}
      >
        A secure key unlocks an unbreakable terminal.
      </p>
    </WarlandAuthLayout>
  )
}

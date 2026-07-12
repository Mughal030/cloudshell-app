'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import {
  Eye, EyeOff, Lock, User, ArrowRight, Fingerprint, AlertCircle,
  Terminal,
} from 'lucide-react'
import { NexusAuthLayout } from '@/components/auth/nexus-auth-layout'

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
    <NexusAuthLayout>
      {/* ── Glass Card ── */}
      <div
        className="rounded-2xl overflow-hidden"
        style={{
          background: 'rgba(15, 20, 35, 0.65)',
          border: '1px solid rgba(139, 92, 246, 0.12)',
          backdropFilter: 'blur(20px)',
          boxShadow: '0 0 60px rgba(99, 102, 241, 0.06), 0 25px 50px rgba(0, 0, 0, 0.3)',
        }}
      >
        {/* Top gradient accent bar */}
        <div
          className="h-[3px] relative"
          style={{
            background: 'linear-gradient(90deg, transparent 0%, #6366F1 20%, #818CF8 50%, #6366F1 80%, transparent 100%)',
          }}
        />

        {/* Header */}
        <div className="px-8 pt-8 pb-5 text-center">
          {/* Icon circle */}
          <div
            className="mx-auto mb-4 w-12 h-12 rounded-2xl flex items-center justify-center"
            style={{
              background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.15), rgba(139, 92, 246, 0.1))',
              border: '1px solid rgba(129, 140, 248, 0.15)',
            }}
          >
            <Terminal className="h-5 w-5" style={{ color: '#818CF8' }} />
          </div>

          <h2 className="text-2xl font-bold tracking-tight" style={{ color: '#F1F5F9' }}>
            Welcome back
          </h2>
          <p className="text-sm mt-1.5" style={{ color: '#64748B' }}>
            Sign in to your cloud terminal
          </p>

          {/* Secure connection badge */}
          <div
            className="inline-flex items-center gap-1.5 mt-4 px-3 py-1.5 rounded-lg text-[10px] font-semibold tracking-wider uppercase"
            style={{
              background: 'rgba(16, 185, 129, 0.08)',
              border: '1px solid rgba(16, 185, 129, 0.15)',
              color: '#34D399',
            }}
          >
            <Lock className="w-3 h-3" />
            Encrypted Connection
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-8 pb-8">
          {error && (
            <div
              className="mb-5 p-3.5 rounded-xl text-sm flex items-start gap-2.5"
              style={{
                background: 'rgba(239, 68, 68, 0.06)',
                border: '1px solid rgba(239, 68, 68, 0.15)',
                color: '#FCA5A5',
              }}
            >
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" style={{ color: '#EF4444' }} />
              <div className="flex-1">
                <div>{error}</div>
                {attemptsRemaining !== null && attemptsRemaining > 0 && (
                  <div className="text-[10px] opacity-70 mt-1">
                    {attemptsRemaining} attempt{attemptsRemaining !== 1 ? 's' : ''} remaining before lockout
                  </div>
                )}
                {retryAfter && (
                  <div className="text-[10px] opacity-70 mt-1">
                    Rate-limited — wait ~{retryAfter}s
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Username field */}
          <div className="mb-4">
            <label
              className="block text-[11px] font-semibold mb-2 uppercase tracking-[0.12em]"
              style={{ color: '#94A3B8' }}
            >
              Username
            </label>
            <div className="relative">
              <div
                className="absolute left-3.5 top-1/2 -translate-y-1/2"
                style={{ color: '#475569' }}
              >
                <User className="w-4 h-4" />
              </div>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full pl-11 pr-4 py-3 rounded-xl text-sm font-mono transition-all duration-200 outline-none"
                style={{
                  background: 'rgba(15, 23, 42, 0.5)',
                  border: '1px solid rgba(100, 116, 139, 0.2)',
                  color: '#E2E8F0',
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = 'rgba(129, 140, 248, 0.4)'
                  e.currentTarget.style.boxShadow = '0 0 0 3px rgba(129, 140, 248, 0.08)'
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = 'rgba(100, 116, 139, 0.2)'
                  e.currentTarget.style.boxShadow = 'none'
                }}
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
              className="block text-[11px] font-semibold mb-2 uppercase tracking-[0.12em]"
              style={{ color: '#94A3B8' }}
            >
              Password
            </label>
            <div className="relative">
              <div
                className="absolute left-3.5 top-1/2 -translate-y-1/2"
                style={{ color: '#475569' }}
              >
                <Lock className="w-4 h-4" />
              </div>
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-11 pr-12 py-3 rounded-xl text-sm font-mono transition-all duration-200 outline-none"
                style={{
                  background: 'rgba(15, 23, 42, 0.5)',
                  border: '1px solid rgba(100, 116, 139, 0.2)',
                  color: '#E2E8F0',
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = 'rgba(129, 140, 248, 0.4)'
                  e.currentTarget.style.boxShadow = '0 0 0 3px rgba(129, 140, 248, 0.08)'
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = 'rgba(100, 116, 139, 0.2)'
                  e.currentTarget.style.boxShadow = 'none'
                }}
                placeholder="Enter your password"
                required
                maxLength={200}
                autoComplete="current-password"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 transition-colors"
                style={{ color: '#475569' }}
                onMouseEnter={(e) => (e.currentTarget.style.color = '#818CF8')}
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
            className="w-full py-3.5 rounded-xl font-semibold text-sm relative flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
            style={{
              background: 'linear-gradient(135deg, #6366F1, #818CF8)',
              color: '#FFFFFF',
              boxShadow: '0 4px 15px rgba(99, 102, 241, 0.3), 0 1px 3px rgba(0, 0, 0, 0.2)',
            }}
            onMouseEnter={(e) => {
              if (!loading) {
                e.currentTarget.style.boxShadow = '0 6px 25px rgba(99, 102, 241, 0.4), 0 2px 6px rgba(0, 0, 0, 0.2)'
                e.currentTarget.style.transform = 'translateY(-1px)'
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.boxShadow = '0 4px 15px rgba(99, 102, 241, 0.3), 0 1px 3px rgba(0, 0, 0, 0.2)'
              e.currentTarget.style.transform = 'translateY(0)'
            }}
          >
            {loading ? (
              <>
                <div
                  className="w-4 h-4 border-2 rounded-full animate-spin"
                  style={{ borderColor: 'rgba(255,255,255,0.3)', borderTopColor: '#FFFFFF' }}
                />
                Authenticating...
              </>
            ) : (
              <>
                <Fingerprint className="w-4 h-4" />
                Sign In
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>

          {/* Divider */}
          <div className="my-6 flex items-center gap-3">
            <div className="flex-1 h-px" style={{ background: 'rgba(100, 116, 139, 0.15)' }} />
            <span className="text-[10px] uppercase tracking-[0.15em] font-medium" style={{ color: '#475569' }}>
              or
            </span>
            <div className="flex-1 h-px" style={{ background: 'rgba(100, 116, 139, 0.15)' }} />
          </div>

          {/* Signup link */}
          <div className="text-center">
            <span className="text-sm" style={{ color: '#64748B' }}>
              Don&apos;t have an account?{' '}
            </span>
            <button
              type="button"
              onClick={() => router.push('/signup')}
              className="text-sm font-semibold hover:underline inline-flex items-center gap-1.5 tracking-wide transition-colors"
              style={{ color: '#818CF8' }}
              onMouseEnter={(e) => (e.currentTarget.style.color = '#A5B4FC')}
              onMouseLeave={(e) => (e.currentTarget.style.color = '#818CF8')}
            >
              Create Account
            </button>
          </div>
        </form>
      </div>

      {/* Footer note */}
      <p className="text-center text-[10px] mt-5" style={{ color: '#334155' }}>
        Secured with JWT + bcrypt encryption
      </p>
    </NexusAuthLayout>
  )
}

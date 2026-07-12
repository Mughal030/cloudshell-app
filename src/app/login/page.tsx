'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import {
  Eye, EyeOff, Lock, User, ArrowRight, Fingerprint, AlertCircle,
  Terminal, ShieldCheck,
} from 'lucide-react'
import { NexusAuthLayout } from '@/components/auth/nexus-auth-layout'

export default function LoginPage() {
  const router = useRouter()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [rememberMe, setRememberMe] = useState(false)
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
        className="rounded-2xl overflow-hidden relative"
        style={{
          background: 'rgba(8, 12, 25, 0.7)',
          border: '1px solid rgba(6, 182, 212, 0.1)',
          backdropFilter: 'blur(32px)',
          boxShadow: '0 0 80px rgba(6, 182, 212, 0.04), 0 0 120px rgba(99, 102, 241, 0.03), 0 25px 60px rgba(0, 0, 0, 0.4)',
        }}
      >
        {/* Animated gradient border glow */}
        <div
          className="absolute inset-0 rounded-2xl pointer-events-none animate-[borderGlow_4s_ease-in-out_infinite]"
          style={{
            background: 'linear-gradient(135deg, rgba(6,182,212,0.12), transparent 30%, transparent 70%, rgba(99,102,241,0.12))',
            mask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
            maskComposite: 'exclude',
            WebkitMaskComposite: 'xor',
            padding: '1px',
          }}
        />

        {/* Top gradient accent bar — animated shimmer */}
        <div className="h-[3px] relative overflow-hidden">
          <div
            className="absolute inset-0"
            style={{
              background: 'linear-gradient(90deg, transparent 0%, #06B6D4 20%, #6366F1 50%, #8B5CF6 80%, transparent 100%)',
            }}
          />
          <div
            className="absolute inset-0 animate-[shimmer_3s_ease-in-out_infinite]"
            style={{
              background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.3) 50%, transparent 100%)',
              backgroundSize: '200% 100%',
            }}
          />
        </div>

        {/* Header */}
        <div className="px-9 pt-9 pb-6 text-center">
          {/* Icon circle with glow */}
          <div
            className="mx-auto mb-5 w-14 h-14 rounded-2xl flex items-center justify-center relative"
            style={{
              background: 'linear-gradient(135deg, rgba(6, 182, 212, 0.12), rgba(99, 102, 241, 0.08))',
              border: '1px solid rgba(6, 182, 212, 0.15)',
              boxShadow: '0 0 20px rgba(6, 182, 212, 0.08)',
            }}
          >
            <Terminal className="h-6 w-6" style={{ color: '#06B6D4' }} />
          </div>

          <h2 className="text-[26px] font-bold tracking-tight" style={{ color: '#F1F5F9' }}>
            Welcome back
          </h2>
          <p className="text-[14px] mt-2" style={{ color: '#64748B' }}>
            Sign in to your cloud terminal
          </p>

          {/* Secure connection badge — subtle pulse */}
          <div
            className="inline-flex items-center gap-1.5 mt-5 px-3.5 py-1.5 rounded-lg text-[10px] font-semibold tracking-wider uppercase animate-[subtlePulse_3s_ease-in-out_infinite]"
            style={{
              background: 'rgba(6, 182, 212, 0.06)',
              border: '1px solid rgba(6, 182, 212, 0.12)',
              color: '#06B6D4',
            }}
          >
            <Lock className="w-3 h-3" />
            Encrypted Connection
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-9 pb-9">
          {/* Error message — smooth transition */}
          {error && (
            <div
              className="mb-6 p-4 rounded-xl text-sm flex items-start gap-3 animate-[fadeSlideIn_0.3s_ease-out_both]"
              style={{
                background: 'rgba(239, 68, 68, 0.05)',
                border: '1px solid rgba(239, 68, 68, 0.12)',
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
          <div className="mb-5">
            <label
              className="block text-[11px] font-semibold mb-2.5 uppercase tracking-[0.12em]"
              style={{ color: '#94A3B8' }}
            >
              Username
            </label>
            <div className="relative group">
              <div
                className="absolute left-4 top-1/2 -translate-y-1/2 transition-colors duration-300"
                style={{ color: '#475569' }}
              >
                <User className="w-[18px] h-[18px]" />
              </div>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full pl-12 pr-4 py-3.5 rounded-xl text-[14px] font-mono transition-all duration-300 outline-none"
                style={{
                  background: 'rgba(6, 10, 22, 0.6)',
                  border: '1px solid rgba(100, 116, 139, 0.15)',
                  borderLeft: '3px solid rgba(100, 116, 139, 0.1)',
                  color: '#E2E8F0',
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = 'rgba(6, 182, 212, 0.35)'
                  e.currentTarget.style.borderLeftColor = '#06B6D4'
                  e.currentTarget.style.boxShadow = '0 0 0 3px rgba(6, 182, 212, 0.06), 0 0 20px rgba(6, 182, 212, 0.04)'
                  e.currentTarget.style.background = 'rgba(6, 10, 22, 0.8)'
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = 'rgba(100, 116, 139, 0.15)'
                  e.currentTarget.style.borderLeftColor = 'rgba(100, 116, 139, 0.1)'
                  e.currentTarget.style.boxShadow = 'none'
                  e.currentTarget.style.background = 'rgba(6, 10, 22, 0.6)'
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
          <div className="mb-5">
            <label
              className="block text-[11px] font-semibold mb-2.5 uppercase tracking-[0.12em]"
              style={{ color: '#94A3B8' }}
            >
              Password
            </label>
            <div className="relative group">
              <div
                className="absolute left-4 top-1/2 -translate-y-1/2 transition-colors duration-300"
                style={{ color: '#475569' }}
              >
                <Lock className="w-[18px] h-[18px]" />
              </div>
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-12 pr-13 py-3.5 rounded-xl text-[14px] font-mono transition-all duration-300 outline-none"
                style={{
                  background: 'rgba(6, 10, 22, 0.6)',
                  border: '1px solid rgba(100, 116, 139, 0.15)',
                  borderLeft: '3px solid rgba(100, 116, 139, 0.1)',
                  color: '#E2E8F0',
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = 'rgba(6, 182, 212, 0.35)'
                  e.currentTarget.style.borderLeftColor = '#06B6D4'
                  e.currentTarget.style.boxShadow = '0 0 0 3px rgba(6, 182, 212, 0.06), 0 0 20px rgba(6, 182, 212, 0.04)'
                  e.currentTarget.style.background = 'rgba(6, 10, 22, 0.8)'
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = 'rgba(100, 116, 139, 0.15)'
                  e.currentTarget.style.borderLeftColor = 'rgba(100, 116, 139, 0.1)'
                  e.currentTarget.style.boxShadow = 'none'
                  e.currentTarget.style.background = 'rgba(6, 10, 22, 0.6)'
                }}
                placeholder="Enter your password"
                required
                maxLength={200}
                autoComplete="current-password"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-4 top-1/2 -translate-y-1/2 transition-all duration-300"
                style={{ color: '#475569' }}
                onMouseEnter={(e) => (e.currentTarget.style.color = '#06B6D4')}
                onMouseLeave={(e) => (e.currentTarget.style.color = '#475569')}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff className="w-[18px] h-[18px]" /> : <Eye className="w-[18px] h-[18px]" />}
              </button>
            </div>
          </div>

          {/* Remember me + forgot area */}
          <div className="mb-7 flex items-center justify-between">
            <label className="flex items-center gap-2.5 cursor-pointer group">
              <div className="relative">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="sr-only"
                />
                <div
                  className="w-4 h-4 rounded flex items-center justify-center transition-all duration-300"
                  style={{
                    background: rememberMe ? 'rgba(6, 182, 212, 0.15)' : 'rgba(6, 10, 22, 0.6)',
                    border: rememberMe ? '1px solid rgba(6, 182, 212, 0.4)' : '1px solid rgba(100, 116, 139, 0.2)',
                    boxShadow: rememberMe ? '0 0 8px rgba(6, 182, 212, 0.1)' : 'none',
                  }}
                >
                  {rememberMe && (
                    <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                      <path d="M2 6L5 9L10 3" stroke="#06B6D4" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  )}
                </div>
              </div>
              <span
                className="text-[12px] transition-colors duration-300"
                style={{ color: '#64748B' }}
              >
                Remember me
              </span>
            </label>
          </div>

          {/* Login button — shimmer gradient */}
          <button
            ref={submitRef}
            type="submit"
            disabled={loading}
            className="w-full py-4 rounded-xl font-semibold text-[14px] relative flex items-center justify-center gap-2.5 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 overflow-hidden"
            style={{
              background: 'linear-gradient(135deg, #06B6D4, #6366F1, #8B5CF6)',
              color: '#FFFFFF',
              boxShadow: '0 4px 20px rgba(6, 182, 212, 0.25), 0 2px 8px rgba(99, 102, 241, 0.2)',
            }}
            onMouseEnter={(e) => {
              if (!loading) {
                e.currentTarget.style.boxShadow = '0 8px 30px rgba(6, 182, 212, 0.35), 0 4px 12px rgba(99, 102, 241, 0.25)'
                e.currentTarget.style.transform = 'translateY(-2px)'
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.boxShadow = '0 4px 20px rgba(6, 182, 212, 0.25), 0 2px 8px rgba(99, 102, 241, 0.2)'
              e.currentTarget.style.transform = 'translateY(0)'
            }}
          >
            {/* Shimmer overlay */}
            {!loading && (
              <div
                className="absolute inset-0 animate-[btnShimmer_2.5s_ease-in-out_infinite]"
                style={{
                  background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.15) 50%, transparent 100%)',
                  backgroundSize: '200% 100%',
                }}
              />
            )}
            {loading ? (
              <>
                <div
                  className="w-5 h-5 border-2 rounded-full animate-spin"
                  style={{ borderColor: 'rgba(255,255,255,0.3)', borderTopColor: '#FFFFFF' }}
                />
                Authenticating...
              </>
            ) : (
              <>
                <Fingerprint className="w-5 h-5" />
                Sign In
                <ArrowRight className="w-5 h-5" />
              </>
            )}
          </button>

          {/* Divider — gradient style */}
          <div className="my-7 flex items-center gap-4">
            <div
              className="flex-1 h-px"
              style={{ background: 'linear-gradient(90deg, transparent, rgba(6, 182, 212, 0.15))' }}
            />
            <span className="text-[10px] uppercase tracking-[0.15em] font-medium" style={{ color: '#334155' }}>
              or
            </span>
            <div
              className="flex-1 h-px"
              style={{ background: 'linear-gradient(90deg, rgba(6, 182, 212, 0.15), transparent)' }}
            />
          </div>

          {/* Signup link */}
          <div className="text-center">
            <span className="text-[13px]" style={{ color: '#64748B' }}>
              Don&apos;t have an account?{' '}
            </span>
            <button
              type="button"
              onClick={() => router.push('/signup')}
              className="text-[13px] font-semibold hover:underline inline-flex items-center gap-1.5 tracking-wide transition-all duration-300"
              style={{ color: '#06B6D4' }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = '#22D3EE'
                e.currentTarget.style.textShadow = '0 0 12px rgba(6, 182, 212, 0.3)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = '#06B6D4'
                e.currentTarget.style.textShadow = 'none'
              }}
            >
              Create Account
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </form>
      </div>

      {/* Footer note */}
      <p className="text-center text-[10px] mt-6 flex items-center justify-center gap-1.5" style={{ color: '#1E293B' }}>
        <ShieldCheck className="w-3 h-3" style={{ color: '#06B6D4' }} />
        Secured with JWT + bcrypt encryption
      </p>

      {/* ───── Keyframe Animations ───── */}
      <style jsx>{`
        @keyframes borderGlow {
          0%, 100% { opacity: 0.5; }
          50% { opacity: 1; }
        }
        @keyframes shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
        @keyframes btnShimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
        @keyframes subtlePulse {
          0%, 100% { opacity: 0.85; }
          50% { opacity: 1; box-shadow: 0 0 12px rgba(6, 182, 212, 0.1); }
        }
        @keyframes fadeSlideIn {
          from { opacity: 0; transform: translateY(-8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </NexusAuthLayout>
  )
}

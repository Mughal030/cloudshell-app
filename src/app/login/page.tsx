'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Eye, EyeOff, Lock, User, ArrowRight, Fingerprint, ShieldAlert, Activity } from 'lucide-react'
import { AuthLayout } from '@/components/auth/auth-layout'

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
        // Parse remaining-attempts hint from the error message
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
    <AuthLayout accent="teal">
      <div
        className="relative bg-[var(--nx-bg-secondary)]/80 backdrop-blur-xl border border-[var(--nx-border)]/60 rounded-2xl shadow-2xl overflow-hidden nx-gradient-border"
        style={{
          boxShadow: `
            0 0 40px rgba(0,229,192,0.06),
            0 0 80px rgba(99,102,241,0.03),
            0 25px 50px rgba(0,0,0,0.5),
            inset 0 1px 0 rgba(255,255,255,0.04)
          `,
        }}
      >
        {/* Top glow bar */}
        <div className="h-1 bg-gradient-to-r from-[#00E5C0] via-[#6366F1] to-[#00E5C0] animate-pulse" />

        {/* Header */}
        <div className="p-8 pb-4 text-center">
          <h2 className="text-2xl font-bold mb-1">
            <span className="bg-gradient-to-r from-[#00E5C0] to-[#6366F1] bg-clip-text text-transparent">Welcome</span> <span className="text-white">Back</span>
          </h2>
          <p className="text-[var(--nx-text-secondary)] text-sm">Sign in to your secure terminal</p>

          {/* Security badge */}
          <div className="inline-flex items-center gap-1.5 mt-3 px-3 py-1 rounded-full bg-[#00E5C0]/10 border border-[#00E5C0]/20">
            <Lock className="w-3 h-3 text-[#00E5C0]" />
            <span className="text-[10px] text-[#00E5C0] font-medium tracking-wider uppercase">Encrypted Connection</span>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-8 pb-8">
          {error && (
            <div className="mb-4 p-3 rounded-lg bg-[var(--nx-error)]/10 border border-[var(--nx-error)]/30 text-[var(--nx-error)] text-sm flex items-start gap-2">
              <ShieldAlert className="w-4 h-4 mt-0.5 shrink-0" />
              <div className="flex-1">
                <div>{error}</div>
                {attemptsRemaining !== null && attemptsRemaining > 0 && (
                  <div className="text-[10px] opacity-80 mt-1">
                    {attemptsRemaining} attempt{attemptsRemaining !== 1 ? 's' : ''} remaining before lockout
                  </div>
                )}
                {retryAfter && (
                  <div className="text-[10px] opacity-80 mt-1">
                    Rate-limited — please wait ~{retryAfter}s
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Username field */}
          <div className="mb-4">
            <label className="block text-xs font-medium text-[var(--nx-text-secondary)] mb-1.5 uppercase tracking-wider">Username</label>
            <div className="relative group">
              <div className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--nx-text-dim)] group-focus-within:text-[#00E5C0] transition-colors">
                <User className="w-4 h-4" />
              </div>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full pl-10 pr-4 py-3 bg-[var(--nx-bg-primary)] border border-[var(--nx-border)] rounded-xl text-[var(--nx-text)] text-sm placeholder-[var(--nx-text-dim)] focus:outline-none focus:border-[#00E5C0]/50 focus:ring-1 focus:ring-[#00E5C0]/20 transition-all"
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
            <label className="block text-xs font-medium text-[var(--nx-text-secondary)] mb-1.5 uppercase tracking-wider">Password</label>
            <div className="relative group">
              <div className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--nx-text-dim)] group-focus-within:text-[#00E5C0] transition-colors">
                <Lock className="w-4 h-4" />
              </div>
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-10 pr-12 py-3 bg-[var(--nx-bg-primary)] border border-[var(--nx-border)] rounded-xl text-[var(--nx-text)] text-sm placeholder-[var(--nx-text-dim)] focus:outline-none focus:border-[#00E5C0]/50 focus:ring-1 focus:ring-[#00E5C0]/20 transition-all"
                placeholder="Enter your password"
                required
                maxLength={200}
                autoComplete="current-password"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--nx-text-dim)] hover:text-[#00E5C0] transition-colors"
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
            className="w-full py-3.5 rounded-xl font-semibold text-sm relative overflow-hidden group disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              background: 'linear-gradient(135deg, #00E5C0, #6366F1)',
              boxShadow: '0 4px 15px rgba(0,229,192,0.3), 0 0 30px rgba(0,229,192,0.1)',
            }}
          >
            <span className="relative z-10 flex items-center justify-center gap-2 text-[#080A12] font-bold">
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-[#080A12]/30 border-t-[#080A12] rounded-full animate-spin" />
                  Authenticating...
                </>
              ) : (
                <>
                  <Fingerprint className="w-4 h-4" />
                  Access Terminal
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </>
              )}
            </span>
            <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
          </button>

          {/* Divider */}
          <div className="flex items-center gap-3 mt-6 mb-4">
            <div className="flex-1 h-px bg-[var(--nx-border)]" />
            <span className="text-[10px] text-[var(--nx-text-dim)] uppercase tracking-wider">Secure Access</span>
            <div className="flex-1 h-px bg-[var(--nx-border)]" />
          </div>

          {/* Signup link */}
          <div className="text-center">
            <span className="text-[var(--nx-text-secondary)] text-sm">Don&apos;t have an account? </span>
            <button
              type="button"
              onClick={() => router.push('/signup')}
              className="text-[#00E5C0] text-sm font-medium hover:underline inline-flex items-center gap-1"
            >
              <Activity className="w-3 h-3" />
              Create Account
            </button>
          </div>
        </form>
      </div>

      {/* Footer note */}
      <p className="text-center text-[10px] text-[var(--nx-text-dim)] mt-4">
        By signing in, you agree to keep your credentials private. Sharing accounts is prohibited.
      </p>
    </AuthLayout>
  )
}

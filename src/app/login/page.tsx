'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import {
  Eye, EyeOff, Lock, User, ArrowRight, Fingerprint, AlertCircle,
  Terminal, ShieldCheck, Cpu,
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
  const [usernameFocused, setUsernameFocused] = useState(false)
  const [passwordFocused, setPasswordFocused] = useState(false)
  const [shakeError, setShakeError] = useState(false)
  const submitRef = useRef<HTMLButtonElement>(null)

  // Load remember me preference on mount
  useEffect(() => {
    const saved = localStorage.getItem('jasbol-remember')
    if (saved) {
      try {
        const prefs = JSON.parse(saved)
        if (prefs.username) setUsername(prefs.username)
        if (prefs.rememberMe) setRememberMe(true)
      } catch { /* ignore corrupt data */ }
    }
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setAttemptsRemaining(null)
    setRetryAfter(null)
    setLoading(true)

    // Save or clear remember me preference
    if (rememberMe) {
      localStorage.setItem('jasbol-remember', JSON.stringify({ username, rememberMe: true }))
    } else {
      localStorage.removeItem('jasbol-remember')
    }

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
        setShakeError(true)
        setTimeout(() => setShakeError(false), 600)
      }
    } catch {
      setError('Network error. Please try again.')
      setShakeError(true)
      setTimeout(() => setShakeError(false), 600)
    } finally {
      setLoading(false)
    }
  }

  return (
    <NexusAuthLayout>
      {/* ── Glass Card ── */}
      <div
        className={`rounded-2xl overflow-hidden relative ${shakeError ? 'animate-[errorShake_0.5s_ease-in-out]' : ''}`}
        style={{
          background: 'rgba(8, 12, 25, 0.65)',
          border: '1px solid rgba(129, 140, 248, 0.08)',
          backdropFilter: 'blur(64px) saturate(1.6)',
          WebkitBackdropFilter: 'blur(64px) saturate(1.6)',
          boxShadow: '0 0 120px rgba(129, 140, 248, 0.07), 0 0 200px rgba(6, 182, 212, 0.04), 0 40px 100px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.04), inset 0 0 80px rgba(129, 140, 248, 0.02)',
        }}
      >
        {/* Rotating shimmer border — conic gradient animation */}
        <div
          className="absolute inset-0 rounded-2xl pointer-events-none overflow-hidden"
          style={{ padding: '1.5px' }}
        >
          <div
            className="absolute inset-[-100%] animate-[rotateBorder_6s_linear_infinite]"
            style={{
              background: 'conic-gradient(from 0deg, transparent 0%, rgba(129,140,248,0.35) 10%, transparent 20%, transparent 35%, rgba(6,182,212,0.35) 45%, transparent 55%, transparent 70%, rgba(139,92,246,0.25) 80%, transparent 90%, transparent 100%)',
            }}
          />
          <div
            className="absolute inset-0 rounded-2xl"
            style={{
              background: 'rgba(8, 12, 25, 0.97)',
              margin: '1.5px',
            }}
          />
        </div>

        {/* Inner glow layer */}
        <div
          className="absolute inset-0 rounded-2xl pointer-events-none"
          style={{
            background: 'radial-gradient(ellipse 60% 40% at 50% 0%, rgba(129,140,248,0.08), transparent 70%)',
          }}
        />

        {/* Top aurora accent bar — animated flowing */}
        <div className="h-[4px] relative overflow-hidden">
          <div
            className="absolute inset-0 animate-[auroraFlow_8s_ease-in-out_infinite]"
            style={{
              background: 'linear-gradient(90deg, transparent 0%, #818CF8 15%, #06B6D4 35%, #8B5CF6 55%, #818CF8 75%, transparent 100%)',
              backgroundSize: '200% 100%',
            }}
          />
          <div
            className="absolute inset-0 animate-[shimmerSweep_2.5s_ease-in-out_infinite]"
            style={{
              background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.5) 50%, transparent 100%)',
              backgroundSize: '200% 100%',
            }}
          />
          {/* Glow underneath the bar */}
          <div
            className="absolute inset-x-0 top-0 h-[20px] pointer-events-none"
            style={{
              background: 'linear-gradient(180deg, rgba(129,140,248,0.18), transparent)',
            }}
          />
        </div>

        {/* Header */}
        <div className="px-9 pt-10 pb-7 text-center relative z-10">
          {/* Icon circle — larger, dramatic glow, pulse */}
          <div className="relative mx-auto mb-6">
            <div
              className="w-[68px] h-[68px] rounded-2xl flex items-center justify-center relative animate-[iconPulse_3s_ease-in-out_infinite]"
              style={{
                background: 'linear-gradient(135deg, rgba(129, 140, 248, 0.15), rgba(6, 182, 212, 0.1))',
                border: '1.5px solid rgba(129, 140, 248, 0.25)',
                boxShadow: '0 0 30px rgba(129, 140, 248, 0.12), 0 0 60px rgba(6, 182, 212, 0.06), inset 0 0 20px rgba(129, 140, 248, 0.05)',
              }}
            >
              <Terminal
                className="h-7 w-7"
                style={{
                  color: '#818CF8',
                  filter: 'drop-shadow(0 0 6px rgba(129, 140, 248, 0.5))',
                }}
              />
            </div>
            {/* Outer glow ring */}
            <div
              className="absolute -inset-3 rounded-3xl pointer-events-none animate-[glowRing_3s_ease-in-out_infinite]"
              style={{
                border: '1px solid rgba(129, 140, 248, 0.08)',
                boxShadow: '0 0 40px rgba(129, 140, 248, 0.06)',
              }}
            />
          </div>

          <h2
            className="text-[30px] font-extrabold tracking-tight"
            style={{
              background: 'linear-gradient(135deg, #F1F5F9 0%, #818CF8 40%, #06B6D4 70%, #8B5CF6 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}
          >
            Welcome back
          </h2>
          <p className="text-[14px] mt-2.5" style={{ color: '#64748B' }}>
            Sign in to your cloud terminal
          </p>

          {/* Encrypted Connection badge */}
          <div
            className="inline-flex items-center gap-2 mt-5 px-4 py-2 rounded-xl text-[10px] font-semibold tracking-[0.15em] uppercase relative overflow-hidden"
            style={{
              background: 'rgba(129, 140, 248, 0.06)',
              border: '1px solid rgba(129, 140, 248, 0.15)',
              color: '#818CF8',
              boxShadow: '0 0 20px rgba(129, 140, 248, 0.04)',
            }}
          >
            <Lock
              className="w-3.5 h-3.5 animate-[lockPulse_2s_ease-in-out_infinite]"
              style={{ filter: 'drop-shadow(0 0 4px rgba(129, 140, 248, 0.3))' }}
            />
            Encrypted Connection
            {/* Subtle shimmer on badge */}
            <div
              className="absolute inset-0 pointer-events-none animate-[badgeShimmer_4s_ease-in-out_infinite]"
              style={{
                background: 'linear-gradient(90deg, transparent 0%, rgba(129,140,248,0.08) 50%, transparent 100%)',
                backgroundSize: '200% 100%',
              }}
            />
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-9 pb-9 relative z-10">
          {/* Error message — slide down with enhanced shake */}
          {error && (
            <div
              className={`mb-6 p-4 rounded-xl text-sm flex items-start gap-3 animate-[errorSlideIn_0.4s_ease-out_both] ${shakeError ? 'animate-[errorShakeDetailed_0.6s_ease-in-out]' : ''}`}
              style={{
                background: 'rgba(239, 68, 68, 0.06)',
                border: '1px solid rgba(239, 68, 68, 0.2)',
                color: '#FCA5A5',
                boxShadow: '0 0 24px rgba(239, 68, 68, 0.08), inset 0 0 30px rgba(239, 68, 68, 0.02)',
              }}
            >
              <AlertCircle
                className="w-4 h-4 mt-0.5 shrink-0 animate-[errorPulse_1.5s_ease-in-out_infinite]"
                style={{ color: '#EF4444', filter: 'drop-shadow(0 0 4px rgba(239, 68, 68, 0.4))' }}
              />
              <div className="flex-1">
                <div className="font-medium">{error}</div>
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

          {/* Username field — floating label with animated glow focus */}
          <div className="mb-6 relative">
            <div className="relative group">
              {/* Left accent bar that glows on focus */}
              <div
                className="absolute left-0 top-0 bottom-0 w-[3px] rounded-l-xl transition-all duration-500 z-10"
                style={{
                  background: usernameFocused
                    ? 'linear-gradient(180deg, #818CF8, #06B6D4)'
                    : 'rgba(100, 116, 139, 0.15)',
                  boxShadow: usernameFocused
                    ? '0 0 12px rgba(129, 140, 248, 0.3), 0 0 4px rgba(129, 140, 248, 0.5)'
                    : 'none',
                }}
              />
              <div
                className="absolute left-4 top-1/2 -translate-y-1/2 transition-all duration-300 z-10"
                style={{
                  color: usernameFocused ? '#818CF8' : '#475569',
                  filter: usernameFocused ? 'drop-shadow(0 0 6px rgba(129, 140, 248, 0.4))' : 'none',
                }}
              >
                <User className="w-[18px] h-[18px]" />
              </div>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full pl-12 pr-4 py-4 rounded-xl text-[14px] font-mono transition-all duration-500 outline-none peer"
                style={{
                  background: usernameFocused ? 'rgba(6, 10, 22, 0.95)' : 'rgba(6, 10, 22, 0.6)',
                  border: usernameFocused ? '1px solid rgba(129, 140, 248, 0.35)' : '1px solid rgba(100, 116, 139, 0.12)',
                  color: '#E2E8F0',
                  boxShadow: usernameFocused
                    ? '0 0 0 3px rgba(129, 140, 248, 0.1), 0 0 40px rgba(129, 140, 248, 0.08), inset 0 0 20px rgba(129, 140, 248, 0.03)'
                    : 'none',
                }}
                onFocus={() => setUsernameFocused(true)}
                onBlur={() => setUsernameFocused(false)}
                placeholder=" "
                required
                maxLength={60}
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
              />
              {/* Floating label */}
              <label
                className="absolute left-12 transition-all duration-300 pointer-events-none z-10"
                style={{
                  top: usernameFocused || username ? '6px' : '50%',
                  transform: usernameFocused || username ? 'translateY(0)' : 'translateY(-50%)',
                  fontSize: usernameFocused || username ? '9px' : '14px',
                  color: usernameFocused ? '#818CF8' : '#475569',
                  fontWeight: usernameFocused || username ? 700 : 400,
                  letterSpacing: usernameFocused || username ? '0.12em' : '0',
                  textTransform: usernameFocused || username ? 'uppercase' : 'none',
                  opacity: usernameFocused || username ? 0.8 : 1,
                  filter: usernameFocused ? 'drop-shadow(0 0 4px rgba(129, 140, 248, 0.3))' : 'none',
                }}
              >
                Username
              </label>
            </div>
          </div>

          {/* Password field — floating label with animated glow focus */}
          <div className="mb-5 relative">
            <div className="relative group">
              {/* Left accent bar */}
              <div
                className="absolute left-0 top-0 bottom-0 w-[3px] rounded-l-xl transition-all duration-500 z-10"
                style={{
                  background: passwordFocused
                    ? 'linear-gradient(180deg, #818CF8, #06B6D4)'
                    : 'rgba(100, 116, 139, 0.15)',
                  boxShadow: passwordFocused
                    ? '0 0 12px rgba(129, 140, 248, 0.3), 0 0 4px rgba(129, 140, 248, 0.5)'
                    : 'none',
                }}
              />
              <div
                className="absolute left-4 top-1/2 -translate-y-1/2 transition-all duration-300 z-10"
                style={{
                  color: passwordFocused ? '#818CF8' : '#475569',
                  filter: passwordFocused ? 'drop-shadow(0 0 6px rgba(129, 140, 248, 0.4))' : 'none',
                }}
              >
                <Lock className="w-[18px] h-[18px]" />
              </div>
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-12 pr-13 py-4 rounded-xl text-[14px] font-mono transition-all duration-500 outline-none"
                style={{
                  background: passwordFocused ? 'rgba(6, 10, 22, 0.95)' : 'rgba(6, 10, 22, 0.6)',
                  border: passwordFocused ? '1px solid rgba(129, 140, 248, 0.35)' : '1px solid rgba(100, 116, 139, 0.12)',
                  color: '#E2E8F0',
                  boxShadow: passwordFocused
                    ? '0 0 0 3px rgba(129, 140, 248, 0.1), 0 0 40px rgba(129, 140, 248, 0.08), inset 0 0 20px rgba(129, 140, 248, 0.03)'
                    : 'none',
                }}
                onFocus={() => setPasswordFocused(true)}
                onBlur={() => setPasswordFocused(false)}
                placeholder=" "
                required
                maxLength={200}
                autoComplete="current-password"
              />
              {/* Floating label */}
              <label
                className="absolute left-12 transition-all duration-300 pointer-events-none z-10"
                style={{
                  top: passwordFocused || password ? '6px' : '50%',
                  transform: passwordFocused || password ? 'translateY(0)' : 'translateY(-50%)',
                  fontSize: passwordFocused || password ? '9px' : '14px',
                  color: passwordFocused ? '#818CF8' : '#475569',
                  fontWeight: passwordFocused || password ? 700 : 400,
                  letterSpacing: passwordFocused || password ? '0.12em' : '0',
                  textTransform: passwordFocused || password ? 'uppercase' : 'none',
                  opacity: passwordFocused || password ? 0.8 : 1,
                  filter: passwordFocused ? 'drop-shadow(0 0 4px rgba(129, 140, 248, 0.3))' : 'none',
                }}
              >
                Password
              </label>
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-4 top-1/2 -translate-y-1/2 transition-all duration-300 z-10"
                style={{ color: '#475569' }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = '#818CF8'
                  e.currentTarget.style.filter = 'drop-shadow(0 0 4px rgba(129, 140, 248, 0.3))'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = '#475569'
                  e.currentTarget.style.filter = 'none'
                }}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff className="w-[18px] h-[18px]" /> : <Eye className="w-[18px] h-[18px]" />}
              </button>
            </div>
          </div>

          {/* Remember me + Forgot password row */}
          <div className="mb-8 flex items-center justify-between">
            <label className="flex items-center gap-3 cursor-pointer group">
              <div className="relative">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="sr-only"
                />
                {/* Toggle track */}
                <div
                  className="w-[44px] h-[24px] rounded-full transition-all duration-400 relative"
                  style={{
                    background: rememberMe
                      ? 'linear-gradient(135deg, rgba(129, 140, 248, 0.3), rgba(6, 182, 212, 0.2))'
                      : 'rgba(30, 41, 59, 0.5)',
                    border: rememberMe
                      ? '1px solid rgba(129, 140, 248, 0.4)'
                      : '1px solid rgba(100, 116, 139, 0.2)',
                    boxShadow: rememberMe
                      ? '0 0 16px rgba(129, 140, 248, 0.15), inset 0 0 8px rgba(129, 140, 248, 0.1)'
                      : 'none',
                  }}
                  onClick={() => setRememberMe(!rememberMe)}
                >
                  {/* Toggle thumb */}
                  <div
                    className="absolute top-[2px] w-[18px] h-[18px] rounded-full transition-all duration-400 flex items-center justify-center"
                    style={{
                      left: rememberMe ? '22px' : '2px',
                      background: rememberMe
                        ? 'linear-gradient(135deg, #818CF8, #06B6D4)'
                        : 'rgba(100, 116, 139, 0.4)',
                      boxShadow: rememberMe
                        ? '0 0 8px rgba(129, 140, 248, 0.4), 0 2px 4px rgba(0, 0, 0, 0.3)'
                        : '0 1px 3px rgba(0, 0, 0, 0.2)',
                    }}
                  >
                    {rememberMe && (
                      <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                        <path d="M2 6L5 9L10 3" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    )}
                  </div>
                </div>
              </div>
              <span
                className="text-[12px] transition-colors duration-300"
                style={{ color: rememberMe ? '#94A3B8' : '#64748B' }}
              >
                Remember me
              </span>
            </label>

            {/* Forgot password link */}
            <button
              type="button"
              className="text-[12px] font-medium transition-all duration-300"
              style={{ color: '#64748B' }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = '#818CF8'
                e.currentTarget.style.textShadow = '0 0 8px rgba(129, 140, 248, 0.3)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = '#64748B'
                e.currentTarget.style.textShadow = 'none'
              }}
              onClick={() => {
                // Non-functional but standard UI pattern
              }}
            >
              Forgot password?
            </button>
          </div>

          {/* Login button — gradient with hover effects */}
          <button
            ref={submitRef}
            type="submit"
            disabled={loading}
            className="w-full py-[18px] rounded-xl font-bold text-[15px] relative flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 overflow-hidden group"
            style={{
              background: 'linear-gradient(135deg, #818CF8, #6366F1, #06B6D4, #818CF8)',
              backgroundSize: '300% 300%',
              animation: loading ? 'none' : 'gradientFlow_4s_ease_infinite',
              color: '#FFFFFF',
              boxShadow: '0 6px 30px rgba(129, 140, 248, 0.3), 0 4px 15px rgba(6, 182, 212, 0.25), 0 2px 6px rgba(0, 0, 0, 0.2)',
              letterSpacing: '0.02em',
            }}
            onMouseEnter={(e) => {
              if (!loading) {
                e.currentTarget.style.boxShadow = '0 10px 40px rgba(129, 140, 248, 0.4), 0 6px 20px rgba(6, 182, 212, 0.3), 0 0 80px rgba(129, 140, 248, 0.15)'
                e.currentTarget.style.transform = 'translateY(-3px) scale(1.01)'
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.boxShadow = '0 6px 30px rgba(129, 140, 248, 0.3), 0 4px 15px rgba(6, 182, 212, 0.25), 0 2px 6px rgba(0, 0, 0, 0.2)'
              e.currentTarget.style.transform = 'translateY(0) scale(1)'
            }}
            onMouseDown={(e) => {
              if (!loading) {
                e.currentTarget.style.transform = 'translateY(-1px) scale(0.98)'
                e.currentTarget.style.boxShadow = '0 4px 20px rgba(129, 140, 248, 0.3), 0 2px 10px rgba(6, 182, 212, 0.2)'
              }
            }}
            onMouseUp={(e) => {
              if (!loading) {
                e.currentTarget.style.transform = 'translateY(-3px) scale(1.01)'
                e.currentTarget.style.boxShadow = '0 10px 40px rgba(129, 140, 248, 0.4), 0 6px 20px rgba(6, 182, 212, 0.3), 0 0 80px rgba(129, 140, 248, 0.15)'
              }
            }}
          >
            {/* Shimmer overlay */}
            {!loading && (
              <div
                className="absolute inset-0 animate-[btnShimmer_2s_ease-in-out_infinite]"
                style={{
                  background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.2) 50%, transparent 100%)',
                  backgroundSize: '200% 100%',
                }}
              />
            )}
            {/* Top highlight */}
            <div
              className="absolute inset-x-0 top-0 h-[1px]"
              style={{
                background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent)',
              }}
            />
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
                <Fingerprint className="w-5 h-5" style={{ filter: 'drop-shadow(0 0 4px rgba(255,255,255,0.3))' }} />
                Sign In
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform duration-300" style={{ filter: 'drop-shadow(0 0 4px rgba(255,255,255,0.3))' }} />
              </>
            )}
          </button>

          {/* Sign in with Claude Code section */}
          <div
            className="mt-6 p-4 rounded-xl relative overflow-hidden"
            style={{
              background: 'rgba(6, 10, 22, 0.5)',
              border: '1px solid rgba(16, 185, 129, 0.1)',
              backdropFilter: 'blur(8px)',
            }}
          >
            <div className="flex items-center gap-3">
              <div
                className="shrink-0 w-9 h-9 rounded-lg flex items-center justify-center"
                style={{
                  background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.12), rgba(6, 182, 212, 0.08))',
                  border: '1px solid rgba(16, 185, 129, 0.2)',
                }}
              >
                <Cpu className="w-4 h-4" style={{ color: '#34D399', filter: 'drop-shadow(0 0 4px rgba(16, 185, 129, 0.4))' }} />
              </div>
              <div className="min-w-0">
                <div className="text-[11px] font-semibold tracking-wide" style={{ color: '#E2E8F0' }}>
                  Sign in with Claude Code
                </div>
                <div className="text-[10px] mt-0.5" style={{ color: '#64748B' }}>
                  NVIDIA NIM API support · AI-powered workflows
                </div>
              </div>
            </div>
            {/* Subtle green shimmer */}
            <div
              className="absolute inset-0 pointer-events-none animate-[badgeShimmer_6s_ease-in-out_infinite]"
              style={{
                background: 'linear-gradient(90deg, transparent 0%, rgba(16,185,129,0.03) 50%, transparent 100%)',
                backgroundSize: '200% 100%',
              }}
            />
          </div>

          {/* Divider — gradient style */}
          <div className="my-8 flex items-center gap-4">
            <div
              className="flex-1 h-px"
              style={{ background: 'linear-gradient(90deg, transparent, rgba(129, 140, 248, 0.15))' }}
            />
            <span className="text-[10px] uppercase tracking-[0.15em] font-medium" style={{ color: '#334155' }}>
              or
            </span>
            <div
              className="flex-1 h-px"
              style={{ background: 'linear-gradient(90deg, rgba(129, 140, 248, 0.15), transparent)' }}
            />
          </div>

          {/* Signup link — secondary button style */}
          <div className="text-center">
            <span className="text-[13px]" style={{ color: '#64748B' }}>
              Don&apos;t have an account?{' '}
            </span>
            <button
              type="button"
              onClick={() => router.push('/signup')}
              className="inline-flex items-center gap-2 text-[13px] font-semibold tracking-wide transition-all duration-300 px-5 py-2.5 rounded-lg relative overflow-hidden"
              style={{
                color: '#818CF8',
                background: 'transparent',
                border: '1px solid rgba(129, 140, 248, 0.15)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = '#A5B4FC'
                e.currentTarget.style.borderColor = 'rgba(129, 140, 248, 0.4)'
                e.currentTarget.style.boxShadow = '0 0 20px rgba(129, 140, 248, 0.1), 0 0 40px rgba(129, 140, 248, 0.05)'
                e.currentTarget.style.background = 'rgba(129, 140, 248, 0.05)'
                e.currentTarget.style.textShadow = '0 0 12px rgba(129, 140, 248, 0.3)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = '#818CF8'
                e.currentTarget.style.borderColor = 'rgba(129, 140, 248, 0.15)'
                e.currentTarget.style.boxShadow = 'none'
                e.currentTarget.style.background = 'transparent'
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
        <ShieldCheck className="w-3 h-3" style={{ color: '#818CF8' }} />
        Secured with JWT + bcrypt encryption
      </p>

      {/* ───── Keyframe Animations ───── */}
      <style jsx>{`
        @keyframes rotateBorder {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        @keyframes auroraFlow {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        @keyframes shimmerSweep {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
        @keyframes iconPulse {
          0%, 100% { box-shadow: 0 0 30px rgba(129, 140, 248, 0.12), 0 0 60px rgba(129, 140, 248, 0.06), inset 0 0 20px rgba(129, 140, 248, 0.05); }
          50% { box-shadow: 0 0 40px rgba(129, 140, 248, 0.2), 0 0 80px rgba(129, 140, 248, 0.1), inset 0 0 25px rgba(129, 140, 248, 0.08); }
        }
        @keyframes glowRing {
          0%, 100% { opacity: 0.4; transform: scale(1); }
          50% { opacity: 0.8; transform: scale(1.05); }
        }
        @keyframes lockPulse {
          0%, 100% { opacity: 0.8; }
          50% { opacity: 1; filter: drop-shadow(0 0 6px rgba(129, 140, 248, 0.5)); }
        }
        @keyframes badgeShimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
        @keyframes gradientFlow {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        @keyframes btnShimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
        @keyframes errorSlideIn {
          from { opacity: 0; transform: translateY(-12px) scaleY(0.95); }
          to { opacity: 1; transform: translateY(0) scaleY(1); }
        }
        @keyframes errorPulse {
          0%, 100% { opacity: 0.8; }
          50% { opacity: 1; }
        }
        @keyframes errorShake {
          0%, 100% { transform: translateX(0); }
          10% { transform: translateX(-6px); }
          20% { transform: translateX(5px); }
          30% { transform: translateX(-4px); }
          40% { transform: translateX(3px); }
          50% { transform: translateX(-2px); }
          60% { transform: translateX(1px); }
        }
        @keyframes errorShakeDetailed {
          0%, 100% { transform: translateX(0); }
          8% { transform: translateX(-8px); }
          16% { transform: translateX(7px); }
          24% { transform: translateX(-5px); }
          32% { transform: translateX(4px); }
          40% { transform: translateX(-3px); }
          48% { transform: translateX(2px); }
          56% { transform: translateX(-1px); }
        }
      `}</style>
    </NexusAuthLayout>
  )
}

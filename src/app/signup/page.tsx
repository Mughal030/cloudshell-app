'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import {
  Eye, EyeOff, Lock, Shield, User, ArrowRight, Mail, Sparkles,
  Check, X, ShieldCheck, Terminal, CircleCheck, AlertCircle,
} from 'lucide-react'
import { NexusAuthLayout } from '@/components/auth/nexus-auth-layout'

interface PasswordRule {
  label: string
  test: (pwd: string) => boolean
}

const PASSWORD_RULES: PasswordRule[] = [
  { label: 'At least 8 characters', test: (p) => p.length >= 8 },
  { label: 'An uppercase letter (A-Z)', test: (p) => /[A-Z]/.test(p) },
  { label: 'A lowercase letter (a-z)', test: (p) => /[a-z]/.test(p) },
  { label: 'A number (0-9)',          test: (p) => /\d/.test(p) },
  { label: 'A special character (!@#$…)', test: (p) => /[!@#$%^&*()_\-+=\[\]{};:'",.<>/?\\|`~]/.test(p) },
]

export default function SignupPage() {
  const router = useRouter()
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [usernameFocused, setUsernameFocused] = useState(false)
  const [emailFocused, setEmailFocused] = useState(false)
  const [passwordFocused, setPasswordFocused] = useState(false)
  const [confirmFocused, setConfirmFocused] = useState(false)
  const [shakeError, setShakeError] = useState(false)

  // Live password-strength checks
  const ruleStates = useMemo(
    () => PASSWORD_RULES.map((r) => r.test(password)),
    [password]
  )
  const strength = ruleStates.filter(Boolean).length
  // Gradient colors from red → orange → yellow → cyan → green
  const strengthColors = ['#EF4444', '#F97316', '#EAB308', '#06B6D4', '#34D399', '#34D399']
  const strengthLabels = ['Too Short', 'Very Weak', 'Weak', 'Fair', 'Strong', 'Excellent']
  const strengthIndex = password.length === 0 ? 0 : Math.max(1, strength)
  const isPasswordValid = strength === PASSWORD_RULES.length

  // Username validation
  const isUsernameValid = useMemo(() => {
    if (!username) return null
    return /^[a-zA-Z0-9_-]{3,30}$/.test(username)
  }, [username])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccess('')

    if (password !== confirmPassword) {
      setError('Passwords do not match')
      setShakeError(true)
      setTimeout(() => setShakeError(false), 600)
      return
    }
    if (!isPasswordValid) {
      setError('Please meet all password requirements')
      setShakeError(true)
      setTimeout(() => setShakeError(false), 600)
      return
    }

    setLoading(true)

    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, email, password }),
      })
      const data = await res.json()

      if (data.success) {
        setSuccess('Account created! Redirecting to login...')
        setTimeout(() => router.push('/login'), 1800)
      } else {
        setError(data.error || 'Signup failed')
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

  // Email validation
  const isEmailValid = useMemo(() => {
    if (!email) return null
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  }, [email])

  return (
    <NexusAuthLayout>
      {/* ── Glass Card ── */}
      <div
        className={`rounded-2xl overflow-hidden relative ${shakeError ? 'animate-[errorShake_0.5s_ease-in-out]' : ''}`}
        style={{
          background: 'rgba(8, 12, 25, 0.65)',
          border: '1px solid rgba(139, 92, 246, 0.08)',
          backdropFilter: 'blur(64px) saturate(1.6)',
          WebkitBackdropFilter: 'blur(64px) saturate(1.6)',
          boxShadow: '0 0 120px rgba(139, 92, 246, 0.07), 0 0 200px rgba(129, 140, 248, 0.04), 0 40px 100px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.04), inset 0 0 80px rgba(139, 92, 246, 0.02)',
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
              background: 'conic-gradient(from 0deg, transparent 0%, rgba(139,92,246,0.35) 10%, transparent 20%, transparent 35%, rgba(129,140,248,0.35) 45%, transparent 55%, transparent 70%, rgba(6,182,212,0.25) 80%, transparent 90%, transparent 100%)',
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
            background: 'radial-gradient(ellipse 60% 40% at 50% 0%, rgba(139,92,246,0.08), transparent 70%)',
          }}
        />

        {/* Top aurora accent bar — animated flowing */}
        <div className="h-[4px] relative overflow-hidden">
          <div
            className="absolute inset-0 animate-[auroraFlow_8s_ease-in-out_infinite]"
            style={{
              background: 'linear-gradient(90deg, transparent 0%, #8B5CF6 15%, #818CF8 30%, #06B6D4 55%, #8B5CF6 75%, transparent 100%)',
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
              background: 'linear-gradient(180deg, rgba(139,92,246,0.18), transparent)',
            }}
          />
        </div>

        {/* Header */}
        <div className="px-9 pt-10 pb-5 text-center relative z-10">
          {/* Icon circle — larger, dramatic glow, pulse */}
          <div className="relative mx-auto mb-6">
            <div
              className="w-[68px] h-[68px] rounded-2xl flex items-center justify-center relative animate-[iconPulse_3s_ease-in-out_infinite]"
              style={{
                background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.15), rgba(129, 140, 248, 0.1))',
                border: '1.5px solid rgba(139, 92, 246, 0.25)',
                boxShadow: '0 0 30px rgba(139, 92, 246, 0.12), 0 0 60px rgba(139, 92, 246, 0.06), inset 0 0 20px rgba(139, 92, 246, 0.05)',
              }}
            >
              <Sparkles
                className="h-7 w-7"
                style={{
                  color: '#A78BFA',
                  filter: 'drop-shadow(0 0 6px rgba(139, 92, 246, 0.5))',
                }}
              />
            </div>
            {/* Outer glow ring */}
            <div
              className="absolute -inset-3 rounded-3xl pointer-events-none animate-[glowRing_3s_ease-in-out_infinite]"
              style={{
                border: '1px solid rgba(139, 92, 246, 0.08)',
                boxShadow: '0 0 40px rgba(139, 92, 246, 0.06)',
              }}
            />
          </div>

          <h2
            className="text-[30px] font-extrabold tracking-tight"
            style={{
              background: 'linear-gradient(135deg, #F1F5F9 0%, #A78BFA 40%, #818CF8 70%, #06B6D4 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}
          >
            Create account
          </h2>
          <p className="text-[14px] mt-2.5" style={{ color: '#64748B' }}>
            Start your cloud coding journey
          </p>

          {/* Features badges with hover effects */}
          <div className="flex items-center justify-center gap-3 mt-5">
            <span
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-semibold tracking-wider uppercase transition-all duration-300 cursor-default"
              style={{
                background: 'rgba(16, 185, 129, 0.06)',
                border: '1px solid rgba(16, 185, 129, 0.12)',
                color: '#34D399',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = 'rgba(16, 185, 129, 0.3)'
                e.currentTarget.style.boxShadow = '0 0 16px rgba(16, 185, 129, 0.1)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'rgba(16, 185, 129, 0.12)'
                e.currentTarget.style.boxShadow = 'none'
              }}
            >
              <Check className="w-3 h-3" />
              Isolated Workspace
            </span>
            <span
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-semibold tracking-wider uppercase transition-all duration-300 cursor-default"
              style={{
                background: 'rgba(129, 140, 248, 0.06)',
                border: '1px solid rgba(129, 140, 248, 0.12)',
                color: '#818CF8',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = 'rgba(129, 140, 248, 0.3)'
                e.currentTarget.style.boxShadow = '0 0 16px rgba(129, 140, 248, 0.1)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'rgba(129, 140, 248, 0.12)'
                e.currentTarget.style.boxShadow = 'none'
              }}
            >
              <Lock className="w-3 h-3" />
              Encrypted Auth
            </span>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-9 pb-9 relative z-10">
          {/* Error message — slide down with enhanced shake */}
          {error && (
            <div
              className={`mb-5 p-4 rounded-xl text-sm flex items-center gap-3 animate-[errorSlideIn_0.4s_ease-out_both] ${shakeError ? 'animate-[errorShakeDetailed_0.6s_ease-in-out]' : ''}`}
              style={{
                background: 'rgba(239, 68, 68, 0.06)',
                border: '1px solid rgba(239, 68, 68, 0.2)',
                color: '#FCA5A5',
                boxShadow: '0 0 24px rgba(239, 68, 68, 0.08), inset 0 0 30px rgba(239, 68, 68, 0.02)',
              }}
            >
              <AlertCircle
                className="w-4 h-4 shrink-0 animate-[errorPulse_1.5s_ease-in-out_infinite]"
                style={{ color: '#EF4444', filter: 'drop-shadow(0 0 4px rgba(239, 68, 68, 0.4))' }}
              />
              {error}
            </div>
          )}

          {/* Success message — celebratory animation */}
          {success && (
            <div
              className="mb-5 p-5 rounded-xl text-sm flex items-center gap-3 relative overflow-hidden animate-[successPop_0.6s_ease-out_both]"
              style={{
                background: 'rgba(16, 185, 129, 0.06)',
                border: '1px solid rgba(16, 185, 129, 0.2)',
                color: '#34D399',
                boxShadow: '0 0 30px rgba(16, 185, 129, 0.1), inset 0 0 30px rgba(16, 185, 129, 0.03)',
              }}
            >
              {/* Celebratory particles */}
              <div className="absolute inset-0 pointer-events-none overflow-hidden">
                {[...Array(12)].map((_, i) => (
                  <div
                    key={i}
                    className="absolute w-1 h-1 rounded-full animate-[confettiFall_1.5s_ease-out_both]"
                    style={{
                      left: `${8 + i * 8}%`,
                      top: '-4px',
                      background: i % 3 === 0 ? '#06B6D4' : i % 3 === 1 ? '#8B5CF6' : '#34D399',
                      animationDelay: `${i * 0.05}s`,
                      opacity: 0.7,
                    }}
                  />
                ))}
              </div>
              {/* Big animated checkmark */}
              <div className="relative shrink-0">
                <CircleCheck
                  className="w-6 h-6 animate-[checkBounce_0.5s_ease-out_both]"
                  style={{ color: '#34D399', filter: 'drop-shadow(0 0 8px rgba(16, 185, 129, 0.4))' }}
                />
              </div>
              <span className="font-semibold relative z-10">{success}</span>
            </div>
          )}

          {/* Username field — floating label with validation indicator */}
          <div className="mb-4 relative">
            <div className="relative group">
              {/* Left accent bar */}
              <div
                className="absolute left-0 top-0 bottom-0 w-[3px] rounded-l-xl transition-all duration-500 z-10"
                style={{
                  background: usernameFocused
                    ? 'linear-gradient(180deg, #8B5CF6, #818CF8)'
                    : 'rgba(100, 116, 139, 0.15)',
                  boxShadow: usernameFocused
                    ? '0 0 12px rgba(139, 92, 246, 0.3), 0 0 4px rgba(139, 92, 246, 0.5)'
                    : 'none',
                }}
              />
              <div
                className="absolute left-4 top-1/2 -translate-y-1/2 transition-all duration-300 z-10"
                style={{
                  color: usernameFocused ? '#A78BFA' : '#475569',
                  filter: usernameFocused ? 'drop-shadow(0 0 6px rgba(139, 92, 246, 0.4))' : 'none',
                }}
              >
                <User className="w-[18px] h-[18px]" />
              </div>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full pl-12 pr-11 py-4 rounded-xl text-[14px] font-mono transition-all duration-500 outline-none"
                style={{
                  background: usernameFocused ? 'rgba(6, 10, 22, 0.95)' : 'rgba(6, 10, 22, 0.6)',
                  border: usernameFocused ? '1px solid rgba(139, 92, 246, 0.35)' : '1px solid rgba(100, 116, 139, 0.12)',
                  color: '#E2E8F0',
                  boxShadow: usernameFocused
                    ? '0 0 0 3px rgba(139, 92, 246, 0.1), 0 0 40px rgba(139, 92, 246, 0.08), inset 0 0 20px rgba(139, 92, 246, 0.03)'
                    : 'none',
                }}
                onFocus={() => setUsernameFocused(true)}
                onBlur={() => setUsernameFocused(false)}
                placeholder=" "
                required
                minLength={3}
                maxLength={30}
                pattern="[a-zA-Z0-9_-]+"
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
                  color: usernameFocused ? '#A78BFA' : '#475569',
                  fontWeight: usernameFocused || username ? 700 : 400,
                  letterSpacing: usernameFocused || username ? '0.12em' : '0',
                  textTransform: usernameFocused || username ? 'uppercase' : 'none',
                  opacity: usernameFocused || username ? 0.8 : 1,
                  filter: usernameFocused ? 'drop-shadow(0 0 4px rgba(139, 92, 246, 0.3))' : 'none',
                }}
              >
                Username
              </label>
              {/* Validation indicator */}
              {isUsernameValid !== null && (
                <div
                  className="absolute right-4 top-1/2 -translate-y-1/2 z-10"
                  style={{
                    color: isUsernameValid ? '#34D399' : '#EF4444',
                    animation: isUsernameValid ? 'checkBounce 0.4s ease-out' : 'none',
                    filter: isUsernameValid ? 'drop-shadow(0 0 4px rgba(16, 185, 129, 0.4))' : 'drop-shadow(0 0 4px rgba(239, 68, 68, 0.3))',
                  }}
                >
                  {isUsernameValid ? (
                    <CircleCheck className="w-[18px] h-[18px]" />
                  ) : (
                    <X className="w-[18px] h-[18px]" />
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Email field with validation icon — floating label */}
          <div className="mb-4 relative">
            <div className="relative group">
              {/* Left accent bar */}
              <div
                className="absolute left-0 top-0 bottom-0 w-[3px] rounded-l-xl transition-all duration-500 z-10"
                style={{
                  background: emailFocused
                    ? 'linear-gradient(180deg, #8B5CF6, #818CF8)'
                    : 'rgba(100, 116, 139, 0.15)',
                  boxShadow: emailFocused
                    ? '0 0 12px rgba(139, 92, 246, 0.3), 0 0 4px rgba(139, 92, 246, 0.5)'
                    : 'none',
                }}
              />
              <div
                className="absolute left-4 top-1/2 -translate-y-1/2 transition-all duration-300 z-10"
                style={{
                  color: emailFocused ? '#A78BFA' : '#475569',
                  filter: emailFocused ? 'drop-shadow(0 0 6px rgba(139, 92, 246, 0.4))' : 'none',
                }}
              >
                <Mail className="w-[18px] h-[18px]" />
              </div>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full pl-12 pr-11 py-4 rounded-xl text-[14px] font-mono transition-all duration-500 outline-none"
                style={{
                  background: emailFocused ? 'rgba(6, 10, 22, 0.95)' : 'rgba(6, 10, 22, 0.6)',
                  border: emailFocused ? '1px solid rgba(139, 92, 246, 0.35)' : '1px solid rgba(100, 116, 139, 0.12)',
                  color: '#E2E8F0',
                  boxShadow: emailFocused
                    ? '0 0 0 3px rgba(139, 92, 246, 0.1), 0 0 40px rgba(139, 92, 246, 0.08), inset 0 0 20px rgba(139, 92, 246, 0.03)'
                    : 'none',
                }}
                onFocus={() => setEmailFocused(true)}
                onBlur={() => setEmailFocused(false)}
                placeholder=" "
                required
                maxLength={254}
                autoComplete="email"
              />
              {/* Floating label */}
              <label
                className="absolute left-12 transition-all duration-300 pointer-events-none z-10"
                style={{
                  top: emailFocused || email ? '6px' : '50%',
                  transform: emailFocused || email ? 'translateY(0)' : 'translateY(-50%)',
                  fontSize: emailFocused || email ? '9px' : '14px',
                  color: emailFocused ? '#A78BFA' : '#475569',
                  fontWeight: emailFocused || email ? 700 : 400,
                  letterSpacing: emailFocused || email ? '0.12em' : '0',
                  textTransform: emailFocused || email ? 'uppercase' : 'none',
                  opacity: emailFocused || email ? 0.8 : 1,
                  filter: emailFocused ? 'drop-shadow(0 0 4px rgba(139, 92, 246, 0.3))' : 'none',
                }}
              >
                Email
              </label>
              {/* Validation icon */}
              {isEmailValid !== null && (
                <div
                  className="absolute right-4 top-1/2 -translate-y-1/2 z-10"
                  style={{
                    color: isEmailValid ? '#34D399' : '#EF4444',
                    animation: isEmailValid ? 'checkBounce 0.4s ease-out' : 'none',
                    filter: isEmailValid ? 'drop-shadow(0 0 4px rgba(16, 185, 129, 0.4))' : 'drop-shadow(0 0 4px rgba(239, 68, 68, 0.3))',
                  }}
                >
                  {isEmailValid ? (
                    <CircleCheck className="w-[18px] h-[18px]" />
                  ) : (
                    <X className="w-[18px] h-[18px]" />
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Password field — floating label */}
          <div className="mb-2 relative">
            <div className="relative group">
              {/* Left accent bar */}
              <div
                className="absolute left-0 top-0 bottom-0 w-[3px] rounded-l-xl transition-all duration-500 z-10"
                style={{
                  background: passwordFocused
                    ? 'linear-gradient(180deg, #8B5CF6, #818CF8)'
                    : 'rgba(100, 116, 139, 0.15)',
                  boxShadow: passwordFocused
                    ? '0 0 12px rgba(139, 92, 246, 0.3), 0 0 4px rgba(139, 92, 246, 0.5)'
                    : 'none',
                }}
              />
              <div
                className="absolute left-4 top-1/2 -translate-y-1/2 transition-all duration-300 z-10"
                style={{
                  color: passwordFocused ? '#A78BFA' : '#475569',
                  filter: passwordFocused ? 'drop-shadow(0 0 6px rgba(139, 92, 246, 0.4))' : 'none',
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
                  border: passwordFocused ? '1px solid rgba(139, 92, 246, 0.35)' : '1px solid rgba(100, 116, 139, 0.12)',
                  color: '#E2E8F0',
                  boxShadow: passwordFocused
                    ? '0 0 0 3px rgba(139, 92, 246, 0.1), 0 0 40px rgba(139, 92, 246, 0.08), inset 0 0 20px rgba(139, 92, 246, 0.03)'
                    : 'none',
                }}
                onFocus={() => setPasswordFocused(true)}
                onBlur={() => setPasswordFocused(false)}
                placeholder=" "
                required
                maxLength={200}
                autoComplete="new-password"
              />
              {/* Floating label */}
              <label
                className="absolute left-12 transition-all duration-300 pointer-events-none z-10"
                style={{
                  top: passwordFocused || password ? '6px' : '50%',
                  transform: passwordFocused || password ? 'translateY(0)' : 'translateY(-50%)',
                  fontSize: passwordFocused || password ? '9px' : '14px',
                  color: passwordFocused ? '#A78BFA' : '#475569',
                  fontWeight: passwordFocused || password ? 700 : 400,
                  letterSpacing: passwordFocused || password ? '0.12em' : '0',
                  textTransform: passwordFocused || password ? 'uppercase' : 'none',
                  opacity: passwordFocused || password ? 0.8 : 1,
                  filter: passwordFocused ? 'drop-shadow(0 0 4px rgba(139, 92, 246, 0.3))' : 'none',
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
                  e.currentTarget.style.color = '#A78BFA'
                  e.currentTarget.style.filter = 'drop-shadow(0 0 4px rgba(139, 92, 246, 0.3))'
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

            {/* Strength meter — enhanced visual bar with segments */}
            {password.length > 0 && (
              <div
                className="mt-3 p-4 rounded-xl animate-[fadeSlideIn_0.3s_ease-out_both] relative overflow-hidden"
                style={{
                  background: 'rgba(6, 10, 22, 0.6)',
                  border: '1px solid rgba(100, 116, 139, 0.08)',
                  boxShadow: 'inset 0 0 20px rgba(0, 0, 0, 0.2)',
                }}
              >
                {/* Segmented strength bar — visual segments with glow */}
                <div className="mb-3 relative">
                  <div className="flex gap-1.5 w-full">
                    {PASSWORD_RULES.map((_, i) => (
                      <div
                        key={i}
                        className="flex-1 h-[7px] rounded-full overflow-hidden transition-all duration-500"
                        style={{ background: 'rgba(30, 41, 59, 0.5)' }}
                      >
                        <div
                          className="h-full rounded-full transition-all duration-700 ease-out relative"
                          style={{
                            width: i < strength ? '100%' : '0%',
                            background: i < strength
                              ? `linear-gradient(90deg, ${strengthColors[Math.min(i, strengthColors.length - 1)]}, ${strengthColors[strengthIndex]})`
                              : 'transparent',
                            boxShadow: i < strength
                              ? `0 0 10px ${strengthColors[strengthIndex]}44, 0 0 3px ${strengthColors[strengthIndex]}66`
                              : 'none',
                          }}
                        >
                          {/* Shimmer on each segment */}
                          {i < strength && (
                            <div
                              className="absolute inset-0 animate-[strengthShimmer_2s_ease-in-out_infinite]"
                              style={{
                                background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent)',
                                backgroundSize: '200% 100%',
                              }}
                            />
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                  {/* Glow underneath the bar */}
                  <div
                    className="absolute -bottom-1 left-0 h-2 rounded-full transition-all duration-700"
                    style={{
                      width: `${(strength / PASSWORD_RULES.length) * 100}%`,
                      background: strengthColors[strengthIndex],
                      filter: 'blur(6px)',
                      opacity: 0.3,
                    }}
                  />
                </div>

                {/* Label */}
                <div className="flex items-center justify-between mb-3">
                  <span
                    className="text-[10px] font-bold uppercase tracking-wider transition-all duration-300"
                    style={{
                      color: strengthColors[strengthIndex],
                      textShadow: `0 0 8px ${strengthColors[strengthIndex]}44`,
                    }}
                  >
                    {strengthLabels[strengthIndex]}
                  </span>
                  <span className="text-[10px] font-mono" style={{ color: '#475569' }}>
                    {strength}/{PASSWORD_RULES.length}
                  </span>
                </div>

                {/* Rules checklist — animated checkmarks with highlight transitions */}
                <ul className="grid grid-cols-1 gap-1.5">
                  {PASSWORD_RULES.map((rule, i) => (
                    <li
                      key={i}
                      className="flex items-center gap-2.5 text-[11px] transition-all duration-400 rounded-md px-2 py-1 -mx-2"
                      style={{
                        background: ruleStates[i] ? 'rgba(16, 185, 129, 0.04)' : 'transparent',
                        transition: 'all 0.4s ease',
                      }}
                    >
                      <div
                        className="relative shrink-0 w-4 h-4 flex items-center justify-center"
                      >
                        {ruleStates[i] ? (
                          <div
                            className="w-4 h-4 rounded-full flex items-center justify-center animate-[checkPop_0.4s_ease-out_both]"
                            style={{
                              background: 'rgba(16, 185, 129, 0.15)',
                              border: '1px solid rgba(16, 185, 129, 0.3)',
                              boxShadow: '0 0 8px rgba(16, 185, 129, 0.1)',
                            }}
                          >
                            <Check
                              className="w-2.5 h-2.5"
                              style={{
                                color: '#34D399',
                                filter: 'drop-shadow(0 0 2px rgba(16, 185, 129, 0.5))',
                              }}
                            />
                          </div>
                        ) : (
                          <div
                            className="w-4 h-4 rounded-full flex items-center justify-center"
                            style={{
                              background: 'rgba(100, 116, 139, 0.06)',
                              border: '1px solid rgba(100, 116, 139, 0.1)',
                            }}
                          >
                            <X className="w-2.5 h-2.5" style={{ color: '#334155' }} />
                          </div>
                        )}
                      </div>
                      <span
                        className="transition-all duration-400"
                        style={{
                          color: ruleStates[i] ? '#E2E8F0' : '#475569',
                          fontWeight: ruleStates[i] ? 500 : 400,
                        }}
                      >
                        {rule.label}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Confirm password — floating label */}
          <div className="mb-6 relative">
            <div className="relative group">
              {/* Left accent bar */}
              <div
                className="absolute left-0 top-0 bottom-0 w-[3px] rounded-l-xl transition-all duration-500 z-10"
                style={{
                  background: confirmFocused
                    ? 'linear-gradient(180deg, #8B5CF6, #818CF8)'
                    : 'rgba(100, 116, 139, 0.15)',
                  boxShadow: confirmFocused
                    ? '0 0 12px rgba(139, 92, 246, 0.3), 0 0 4px rgba(139, 92, 246, 0.5)'
                    : 'none',
                }}
              />
              <div
                className="absolute left-4 top-1/2 -translate-y-1/2 transition-all duration-300 z-10"
                style={{
                  color: confirmFocused ? '#A78BFA' : '#475569',
                  filter: confirmFocused ? 'drop-shadow(0 0 6px rgba(139, 92, 246, 0.4))' : 'none',
                }}
              >
                <Shield className="w-[18px] h-[18px]" />
              </div>
              <input
                type={showPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full pl-12 pr-11 py-4 rounded-xl text-[14px] font-mono transition-all duration-500 outline-none"
                style={{
                  background: confirmFocused ? 'rgba(6, 10, 22, 0.95)' : 'rgba(6, 10, 22, 0.6)',
                  border: confirmFocused ? '1px solid rgba(139, 92, 246, 0.35)' : '1px solid rgba(100, 116, 139, 0.12)',
                  color: '#E2E8F0',
                  boxShadow: confirmFocused
                    ? '0 0 0 3px rgba(139, 92, 246, 0.1), 0 0 40px rgba(139, 92, 246, 0.08), inset 0 0 20px rgba(139, 92, 246, 0.03)'
                    : 'none',
                }}
                onFocus={() => setConfirmFocused(true)}
                onBlur={() => setConfirmFocused(false)}
                placeholder=" "
                required
                maxLength={200}
                autoComplete="new-password"
              />
              {/* Floating label */}
              <label
                className="absolute left-12 transition-all duration-300 pointer-events-none z-10"
                style={{
                  top: confirmFocused || confirmPassword ? '6px' : '50%',
                  transform: confirmFocused || confirmPassword ? 'translateY(0)' : 'translateY(-50%)',
                  fontSize: confirmFocused || confirmPassword ? '9px' : '14px',
                  color: confirmFocused ? '#A78BFA' : '#475569',
                  fontWeight: confirmFocused || confirmPassword ? 700 : 400,
                  letterSpacing: confirmFocused || confirmPassword ? '0.12em' : '0',
                  textTransform: confirmFocused || confirmPassword ? 'uppercase' : 'none',
                  opacity: confirmFocused || confirmPassword ? 0.8 : 1,
                  filter: confirmFocused ? 'drop-shadow(0 0 4px rgba(139, 92, 246, 0.3))' : 'none',
                }}
              >
                Confirm Password
              </label>
              {confirmPassword && (
                <div
                  className="absolute right-4 top-1/2 -translate-y-1/2 z-10"
                  style={{
                    animation: password === confirmPassword ? 'checkBounce 0.4s ease-out' : 'none',
                    filter: password === confirmPassword
                      ? 'drop-shadow(0 0 4px rgba(16, 185, 129, 0.4))'
                      : 'drop-shadow(0 0 4px rgba(239, 68, 68, 0.3))',
                  }}
                >
                  {password === confirmPassword ? (
                    <CircleCheck className="w-[18px] h-[18px]" style={{ color: '#34D399' }} />
                  ) : (
                    <X className="w-[18px] h-[18px]" style={{ color: '#EF4444' }} />
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Submit button — dramatic gradient with animated flow */}
          <button
            type="submit"
            disabled={loading || (password.length > 0 && !isPasswordValid)}
            className="w-full py-[18px] rounded-xl font-bold text-[15px] relative flex items-center justify-center gap-3 disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-300 overflow-hidden group"
            style={{
              background: 'linear-gradient(135deg, #8B5CF6, #818CF8, #06B6D4, #8B5CF6)',
              backgroundSize: '300% 300%',
              animation: loading || (password.length > 0 && !isPasswordValid) ? 'none' : 'gradientFlow_4s_ease_infinite',
              color: '#FFFFFF',
              boxShadow: '0 6px 30px rgba(139, 92, 246, 0.3), 0 4px 15px rgba(129, 140, 248, 0.25), 0 2px 6px rgba(0, 0, 0, 0.2)',
              letterSpacing: '0.02em',
            }}
            onMouseEnter={(e) => {
              if (!loading && !(password.length > 0 && !isPasswordValid)) {
                e.currentTarget.style.boxShadow = '0 10px 40px rgba(139, 92, 246, 0.4), 0 6px 20px rgba(6, 182, 212, 0.25), 0 0 80px rgba(139, 92, 246, 0.15)'
                e.currentTarget.style.transform = 'translateY(-3px) scale(1.01)'
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.boxShadow = '0 6px 30px rgba(139, 92, 246, 0.3), 0 4px 15px rgba(129, 140, 248, 0.25), 0 2px 6px rgba(0, 0, 0, 0.2)'
              e.currentTarget.style.transform = 'translateY(0) scale(1)'
            }}
            onMouseDown={(e) => {
              if (!loading && !(password.length > 0 && !isPasswordValid)) {
                e.currentTarget.style.transform = 'translateY(-1px) scale(0.98)'
                e.currentTarget.style.boxShadow = '0 4px 20px rgba(139, 92, 246, 0.3), 0 2px 10px rgba(6, 182, 212, 0.2)'
              }
            }}
            onMouseUp={(e) => {
              if (!loading && !(password.length > 0 && !isPasswordValid)) {
                e.currentTarget.style.transform = 'translateY(-3px) scale(1.01)'
                e.currentTarget.style.boxShadow = '0 10px 40px rgba(139, 92, 246, 0.4), 0 6px 20px rgba(6, 182, 212, 0.25), 0 0 80px rgba(139, 92, 246, 0.15)'
              }
            }}
          >
            {/* Shimmer overlay */}
            {!loading && !(password.length > 0 && !isPasswordValid) && (
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
                Creating account...
              </>
            ) : (
              <>
                <Sparkles className="w-5 h-5" style={{ filter: 'drop-shadow(0 0 4px rgba(255,255,255,0.3))' }} />
                Create Account
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform duration-300" style={{ filter: 'drop-shadow(0 0 4px rgba(255,255,255,0.3))' }} />
              </>
            )}
          </button>

          {/* Divider — gradient style */}
          <div className="my-7 flex items-center gap-4">
            <div
              className="flex-1 h-px"
              style={{ background: 'linear-gradient(90deg, transparent, rgba(139, 92, 246, 0.15))' }}
            />
            <span className="text-[10px] uppercase tracking-[0.15em] font-medium" style={{ color: '#334155' }}>
              or
            </span>
            <div
              className="flex-1 h-px"
              style={{ background: 'linear-gradient(90deg, rgba(139, 92, 246, 0.15), transparent)' }}
            />
          </div>

          {/* Login link — Already have an account? Sign In */}
          <div className="text-center">
            <span className="text-[13px]" style={{ color: '#64748B' }}>
              Already have an account?{' '}
            </span>
            <button
              type="button"
              onClick={() => router.push('/login')}
              className="inline-flex items-center gap-2 text-[13px] font-semibold tracking-wide transition-all duration-300 px-5 py-2.5 rounded-lg relative overflow-hidden"
              style={{
                color: '#A78BFA',
                background: 'transparent',
                border: '1px solid rgba(139, 92, 246, 0.15)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = '#C4B5FD'
                e.currentTarget.style.borderColor = 'rgba(139, 92, 246, 0.4)'
                e.currentTarget.style.boxShadow = '0 0 20px rgba(139, 92, 246, 0.1), 0 0 40px rgba(139, 92, 246, 0.05)'
                e.currentTarget.style.background = 'rgba(139, 92, 246, 0.05)'
                e.currentTarget.style.textShadow = '0 0 12px rgba(139, 92, 246, 0.3)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = '#A78BFA'
                e.currentTarget.style.borderColor = 'rgba(139, 92, 246, 0.15)'
                e.currentTarget.style.boxShadow = 'none'
                e.currentTarget.style.background = 'transparent'
                e.currentTarget.style.textShadow = 'none'
              }}
            >
              <ArrowRight className="w-3.5 h-3.5 rotate-180" />
              Sign In
            </button>
          </div>
        </form>
      </div>

      {/* Security note */}
      <p
        className="text-center text-[10px] mt-6 flex items-center justify-center gap-1.5"
        style={{ color: '#1E293B' }}
      >
        <ShieldCheck className="w-3 h-3" style={{ color: '#818CF8' }} />
        Passwords are encrypted with bcrypt(12). Plaintext is never stored.
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
          0%, 100% { box-shadow: 0 0 30px rgba(139, 92, 246, 0.12), 0 0 60px rgba(139, 92, 246, 0.06), inset 0 0 20px rgba(139, 92, 246, 0.05); }
          50% { box-shadow: 0 0 40px rgba(139, 92, 246, 0.2), 0 0 80px rgba(139, 92, 246, 0.1), inset 0 0 25px rgba(139, 92, 246, 0.08); }
        }
        @keyframes glowRing {
          0%, 100% { opacity: 0.4; transform: scale(1); }
          50% { opacity: 0.8; transform: scale(1.05); }
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
        @keyframes fadeSlideIn {
          from { opacity: 0; transform: translateY(-8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes successPop {
          0% { opacity: 0; transform: translateY(-12px) scale(0.95); }
          60% { transform: translateY(2px) scale(1.02); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes checkBounce {
          0% { transform: scale(0.5); opacity: 0; }
          50% { transform: scale(1.3); }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes checkPop {
          0% { transform: scale(0); opacity: 0; }
          50% { transform: scale(1.2); }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes confettiFall {
          0% { transform: translateY(0) rotate(0deg); opacity: 1; }
          100% { transform: translateY(40px) rotate(360deg); opacity: 0; }
        }
        @keyframes strengthShimmer {
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

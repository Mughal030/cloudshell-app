'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import {
  Eye, EyeOff, Lock, Shield, User, ArrowRight, Mail, Sparkles,
  Check, X, ShieldCheck, Terminal, CircleCheck,
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccess('')

    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }
    if (!isPasswordValid) {
      setError('Please meet all password requirements')
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
      }
    } catch {
      setError('Network error. Please try again.')
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
        className="rounded-2xl overflow-hidden relative"
        style={{
          background: 'rgba(8, 12, 25, 0.7)',
          border: '1px solid rgba(139, 92, 246, 0.1)',
          backdropFilter: 'blur(32px)',
          boxShadow: '0 0 80px rgba(139, 92, 246, 0.04), 0 0 120px rgba(99, 102, 241, 0.03), 0 25px 60px rgba(0, 0, 0, 0.4)',
        }}
      >
        {/* Animated gradient border glow */}
        <div
          className="absolute inset-0 rounded-2xl pointer-events-none animate-[borderGlow_4s_ease-in-out_infinite]"
          style={{
            background: 'linear-gradient(135deg, rgba(139,92,246,0.12), transparent 30%, transparent 70%, rgba(6,182,212,0.12))',
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
              background: 'linear-gradient(90deg, transparent 0%, #8B5CF6 20%, #6366F1 40%, #06B6D4 60%, #8B5CF6 80%, transparent 100%)',
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
        <div className="px-9 pt-9 pb-5 text-center">
          {/* Icon circle with glow */}
          <div
            className="mx-auto mb-5 w-14 h-14 rounded-2xl flex items-center justify-center relative"
            style={{
              background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.12), rgba(6, 182, 212, 0.08))',
              border: '1px solid rgba(139, 92, 246, 0.15)',
              boxShadow: '0 0 20px rgba(139, 92, 246, 0.08)',
            }}
          >
            <Sparkles className="h-6 w-6" style={{ color: '#A78BFA' }} />
          </div>

          <h2 className="text-[26px] font-bold tracking-tight" style={{ color: '#F1F5F9' }}>
            Create account
          </h2>
          <p className="text-[14px] mt-2" style={{ color: '#64748B' }}>
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
                e.currentTarget.style.boxShadow = '0 0 12px rgba(16, 185, 129, 0.08)'
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
                background: 'rgba(6, 182, 212, 0.06)',
                border: '1px solid rgba(6, 182, 212, 0.12)',
                color: '#06B6D4',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = 'rgba(6, 182, 212, 0.3)'
                e.currentTarget.style.boxShadow = '0 0 12px rgba(6, 182, 212, 0.08)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'rgba(6, 182, 212, 0.12)'
                e.currentTarget.style.boxShadow = 'none'
              }}
            >
              <Lock className="w-3 h-3" />
              Encrypted Auth
            </span>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-9 pb-9">
          {/* Error message */}
          {error && (
            <div
              className="mb-5 p-4 rounded-xl text-sm flex items-center gap-3 animate-[fadeSlideIn_0.3s_ease-out_both]"
              style={{
                background: 'rgba(239, 68, 68, 0.05)',
                border: '1px solid rgba(239, 68, 68, 0.12)',
                color: '#FCA5A5',
              }}
            >
              <div
                className="w-1.5 h-1.5 rounded-full shrink-0 animate-ping"
                style={{ background: '#EF4444' }}
              />
              {error}
            </div>
          )}

          {/* Success message — enhanced animation */}
          {success && (
            <div
              className="mb-5 p-4 rounded-xl text-sm flex items-center gap-3 animate-[successPop_0.5s_ease-out_both]"
              style={{
                background: 'rgba(16, 185, 129, 0.05)',
                border: '1px solid rgba(16, 185, 129, 0.12)',
                color: '#34D399',
                boxShadow: '0 0 20px rgba(16, 185, 129, 0.06)',
              }}
            >
              <CircleCheck className="w-5 h-5 shrink-0" style={{ color: '#34D399' }} />
              {success}
            </div>
          )}

          {/* Username field */}
          <div className="mb-4">
            <label className="block text-[11px] font-semibold mb-2.5 uppercase tracking-[0.12em]" style={{ color: '#94A3B8' }}>
              Username
            </label>
            <div className="relative group">
              <div className="absolute left-4 top-1/2 -translate-y-1/2 transition-colors duration-300" style={{ color: '#475569' }}>
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
                  e.currentTarget.style.borderColor = 'rgba(139, 92, 246, 0.35)'
                  e.currentTarget.style.borderLeftColor = '#8B5CF6'
                  e.currentTarget.style.boxShadow = '0 0 0 3px rgba(139, 92, 246, 0.06), 0 0 20px rgba(139, 92, 246, 0.04)'
                  e.currentTarget.style.background = 'rgba(6, 10, 22, 0.8)'
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = 'rgba(100, 116, 139, 0.15)'
                  e.currentTarget.style.borderLeftColor = 'rgba(100, 116, 139, 0.1)'
                  e.currentTarget.style.boxShadow = 'none'
                  e.currentTarget.style.background = 'rgba(6, 10, 22, 0.6)'
                }}
                placeholder="3-30 chars: letters, numbers, _ -"
                required
                minLength={3}
                maxLength={30}
                pattern="[a-zA-Z0-9_-]+"
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
              />
            </div>
          </div>

          {/* Email field with validation icon */}
          <div className="mb-4">
            <label className="block text-[11px] font-semibold mb-2.5 uppercase tracking-[0.12em]" style={{ color: '#94A3B8' }}>
              Email
            </label>
            <div className="relative group">
              <div className="absolute left-4 top-1/2 -translate-y-1/2 transition-colors duration-300" style={{ color: '#475569' }}>
                <Mail className="w-[18px] h-[18px]" />
              </div>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full pl-12 pr-11 py-3.5 rounded-xl text-[14px] font-mono transition-all duration-300 outline-none"
                style={{
                  background: 'rgba(6, 10, 22, 0.6)',
                  border: '1px solid rgba(100, 116, 139, 0.15)',
                  borderLeft: '3px solid rgba(100, 116, 139, 0.1)',
                  color: '#E2E8F0',
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = 'rgba(139, 92, 246, 0.35)'
                  e.currentTarget.style.borderLeftColor = '#8B5CF6'
                  e.currentTarget.style.boxShadow = '0 0 0 3px rgba(139, 92, 246, 0.06), 0 0 20px rgba(139, 92, 246, 0.04)'
                  e.currentTarget.style.background = 'rgba(6, 10, 22, 0.8)'
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = 'rgba(100, 116, 139, 0.15)'
                  e.currentTarget.style.borderLeftColor = 'rgba(100, 116, 139, 0.1)'
                  e.currentTarget.style.boxShadow = 'none'
                  e.currentTarget.style.background = 'rgba(6, 10, 22, 0.6)'
                }}
                placeholder="your@email.com"
                required
                maxLength={254}
                autoComplete="email"
              />
              {/* Validation icon */}
              {isEmailValid !== null && (
                <div
                  className="absolute right-4 top-1/2 -translate-y-1/2 transition-all duration-300"
                  style={{
                    color: isEmailValid ? '#34D399' : '#EF4444',
                    animation: isEmailValid ? 'checkBounce 0.3s ease-out' : 'none',
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

          {/* Password field */}
          <div className="mb-2">
            <label className="block text-[11px] font-semibold mb-2.5 uppercase tracking-[0.12em]" style={{ color: '#94A3B8' }}>
              Password
            </label>
            <div className="relative group">
              <div className="absolute left-4 top-1/2 -translate-y-1/2 transition-colors duration-300" style={{ color: '#475569' }}>
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
                  e.currentTarget.style.borderColor = 'rgba(139, 92, 246, 0.35)'
                  e.currentTarget.style.borderLeftColor = '#8B5CF6'
                  e.currentTarget.style.boxShadow = '0 0 0 3px rgba(139, 92, 246, 0.06), 0 0 20px rgba(139, 92, 246, 0.04)'
                  e.currentTarget.style.background = 'rgba(6, 10, 22, 0.8)'
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = 'rgba(100, 116, 139, 0.15)'
                  e.currentTarget.style.borderLeftColor = 'rgba(100, 116, 139, 0.1)'
                  e.currentTarget.style.boxShadow = 'none'
                  e.currentTarget.style.background = 'rgba(6, 10, 22, 0.6)'
                }}
                placeholder="Create a strong password"
                required
                maxLength={200}
                autoComplete="new-password"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-4 top-1/2 -translate-y-1/2 transition-all duration-300"
                style={{ color: '#475569' }}
                onMouseEnter={(e) => (e.currentTarget.style.color = '#8B5CF6')}
                onMouseLeave={(e) => (e.currentTarget.style.color = '#475569')}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff className="w-[18px] h-[18px]" /> : <Eye className="w-[18px] h-[18px]" />}
              </button>
            </div>

            {/* Strength meter + live checklist — enhanced gradient */}
            {password.length > 0 && (
              <div
                className="mt-3 p-4 rounded-xl animate-[fadeSlideIn_0.3s_ease-out_both]"
                style={{
                  background: 'rgba(6, 10, 22, 0.5)',
                  border: '1px solid rgba(100, 116, 139, 0.08)',
                }}
              >
                {/* Strength bars — gradient fill */}
                <div className="flex gap-2 mb-2.5">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div
                      key={i}
                      className="h-1.5 flex-1 rounded-full transition-all duration-500 overflow-hidden"
                      style={{
                        backgroundColor: i < strength ? 'transparent' : 'rgba(30, 41, 59, 0.4)',
                      }}
                    >
                      {i < strength && (
                        <div
                          className="h-full w-full rounded-full transition-all duration-500"
                          style={{
                            background: `linear-gradient(90deg, ${strengthColors[strengthIndex]}, ${strengthColors[Math.min(strengthIndex + 1, 5)]})`,
                            boxShadow: `0 0 8px ${strengthColors[strengthIndex]}44`,
                          }}
                        />
                      )}
                    </div>
                  ))}
                </div>
                {/* Label */}
                <div className="flex items-center justify-between mb-3">
                  <span
                    className="text-[10px] font-semibold uppercase tracking-wider"
                    style={{ color: strengthColors[strengthIndex] }}
                  >
                    {strengthLabels[strengthIndex]}
                  </span>
                  <span className="text-[10px]" style={{ color: '#475569' }}>
                    {strength}/{PASSWORD_RULES.length}
                  </span>
                </div>
                {/* Rules checklist — animated checkmarks */}
                <ul className="grid grid-cols-1 gap-1">
                  {PASSWORD_RULES.map((rule, i) => (
                    <li
                      key={i}
                      className="flex items-center gap-2 text-[11px] transition-all duration-300"
                    >
                      {ruleStates[i] ? (
                        <Check
                          className="w-3.5 h-3.5 shrink-0"
                          style={{
                            color: '#34D399',
                            animation: 'checkBounce 0.3s ease-out',
                          }}
                        />
                      ) : (
                        <X className="w-3.5 h-3.5 shrink-0" style={{ color: '#334155' }} />
                      )}
                      <span
                        className="transition-colors duration-300"
                        style={{ color: ruleStates[i] ? '#E2E8F0' : '#475569' }}
                      >
                        {rule.label}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Confirm password */}
          <div className="mb-6">
            <label className="block text-[11px] font-semibold mb-2.5 uppercase tracking-[0.12em]" style={{ color: '#94A3B8' }}>
              Confirm Password
            </label>
            <div className="relative group">
              <div className="absolute left-4 top-1/2 -translate-y-1/2 transition-colors duration-300" style={{ color: '#475569' }}>
                <Shield className="w-[18px] h-[18px]" />
              </div>
              <input
                type={showPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full pl-12 pr-11 py-3.5 rounded-xl text-[14px] font-mono transition-all duration-300 outline-none"
                style={{
                  background: 'rgba(6, 10, 22, 0.6)',
                  border: '1px solid rgba(100, 116, 139, 0.15)',
                  borderLeft: '3px solid rgba(100, 116, 139, 0.1)',
                  color: '#E2E8F0',
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = 'rgba(139, 92, 246, 0.35)'
                  e.currentTarget.style.borderLeftColor = '#8B5CF6'
                  e.currentTarget.style.boxShadow = '0 0 0 3px rgba(139, 92, 246, 0.06), 0 0 20px rgba(139, 92, 246, 0.04)'
                  e.currentTarget.style.background = 'rgba(6, 10, 22, 0.8)'
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = 'rgba(100, 116, 139, 0.15)'
                  e.currentTarget.style.borderLeftColor = 'rgba(100, 116, 139, 0.1)'
                  e.currentTarget.style.boxShadow = 'none'
                  e.currentTarget.style.background = 'rgba(6, 10, 22, 0.6)'
                }}
                placeholder="Re-enter your password"
                required
                maxLength={200}
                autoComplete="new-password"
              />
              {confirmPassword && (
                <div
                  className="absolute right-4 top-1/2 -translate-y-1/2"
                  style={{
                    animation: password === confirmPassword ? 'checkBounce 0.3s ease-out' : 'none',
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

          {/* Submit button — shimmer gradient */}
          <button
            type="submit"
            disabled={loading || (password.length > 0 && !isPasswordValid)}
            className="w-full py-4 rounded-xl font-semibold text-[14px] relative flex items-center justify-center gap-2.5 disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-300 overflow-hidden"
            style={{
              background: 'linear-gradient(135deg, #8B5CF6, #6366F1, #06B6D4)',
              color: '#FFFFFF',
              boxShadow: '0 4px 20px rgba(139, 92, 246, 0.25), 0 2px 8px rgba(99, 102, 241, 0.2)',
            }}
            onMouseEnter={(e) => {
              if (!loading && !(password.length > 0 && !isPasswordValid)) {
                e.currentTarget.style.boxShadow = '0 8px 30px rgba(139, 92, 246, 0.35), 0 4px 12px rgba(6, 182, 212, 0.2)'
                e.currentTarget.style.transform = 'translateY(-2px)'
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.boxShadow = '0 4px 20px rgba(139, 92, 246, 0.25), 0 2px 8px rgba(99, 102, 241, 0.2)'
              e.currentTarget.style.transform = 'translateY(0)'
            }}
          >
            {/* Shimmer overlay */}
            {!loading && !(password.length > 0 && !isPasswordValid) && (
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
                Creating account...
              </>
            ) : (
              <>
                <Sparkles className="w-5 h-5" />
                Create Account
                <ArrowRight className="w-5 h-5" />
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

          {/* Login link */}
          <div className="text-center">
            <span className="text-[13px]" style={{ color: '#64748B' }}>
              Already have an account?{' '}
            </span>
            <button
              type="button"
              onClick={() => router.push('/login')}
              className="text-[13px] font-semibold hover:underline inline-flex items-center gap-1.5 tracking-wide transition-all duration-300"
              style={{ color: '#8B5CF6' }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = '#A78BFA'
                e.currentTarget.style.textShadow = '0 0 12px rgba(139, 92, 246, 0.3)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = '#8B5CF6'
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
        <ShieldCheck className="w-3 h-3" style={{ color: '#06B6D4' }} />
        Passwords are encrypted with bcrypt(12). Plaintext is never stored.
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
      `}</style>
    </NexusAuthLayout>
  )
}

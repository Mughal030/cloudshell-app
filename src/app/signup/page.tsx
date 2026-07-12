'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import {
  Eye, EyeOff, Lock, Shield, User, ArrowRight, Mail, Sparkles,
  Check, X, ShieldCheck, Terminal,
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
  const strengthColors = ['#EF4444', '#F97316', '#EAB308', '#818CF8', '#34D399', '#34D399']
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

  // Input style helper
  const inputStyle = {
    background: 'rgba(15, 23, 42, 0.5)',
    border: '1px solid rgba(100, 116, 139, 0.2)',
    color: '#E2E8F0',
  }
  const inputFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    e.currentTarget.style.borderColor = 'rgba(129, 140, 248, 0.4)'
    e.currentTarget.style.boxShadow = '0 0 0 3px rgba(129, 140, 248, 0.08)'
  }
  const inputBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    e.currentTarget.style.borderColor = 'rgba(100, 116, 139, 0.2)'
    e.currentTarget.style.boxShadow = 'none'
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
            background: 'linear-gradient(90deg, transparent 0%, #8B5CF6 20%, #A78BFA 50%, #8B5CF6 80%, transparent 100%)',
          }}
        />

        {/* Header */}
        <div className="px-7 pt-7 pb-5 text-center">
          {/* Icon circle */}
          <div
            className="mx-auto mb-4 w-12 h-12 rounded-2xl flex items-center justify-center"
            style={{
              background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.15), rgba(167, 139, 250, 0.1))',
              border: '1px solid rgba(167, 139, 250, 0.15)',
            }}
          >
            <Sparkles className="h-5 w-5" style={{ color: '#A78BFA' }} />
          </div>

          <h2 className="text-2xl font-bold tracking-tight" style={{ color: '#F1F5F9' }}>
            Create account
          </h2>
          <p className="text-sm mt-1.5" style={{ color: '#64748B' }}>
            Start your cloud coding journey
          </p>

          {/* Features badges */}
          <div className="flex items-center justify-center gap-4 mt-4 text-[10px]" style={{ color: '#64748B' }}>
            <span className="flex items-center gap-1">
              <Check className="w-3 h-3" style={{ color: '#34D399' }} />
              Isolated Workspace
            </span>
            <span className="flex items-center gap-1">
              <Check className="w-3 h-3" style={{ color: '#818CF8' }} />
              Encrypted Auth
            </span>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-7 pb-7">
          {error && (
            <div
              className="mb-4 p-3 rounded-xl text-sm flex items-center gap-2"
              style={{
                background: 'rgba(239, 68, 68, 0.06)',
                border: '1px solid rgba(239, 68, 68, 0.15)',
                color: '#FCA5A5',
              }}
            >
              <div
                className="w-1.5 h-1.5 rounded-full animate-ping"
                style={{ background: '#EF4444' }}
              />
              {error}
            </div>
          )}

          {success && (
            <div
              className="mb-4 p-3 rounded-xl text-sm flex items-center gap-2"
              style={{
                background: 'rgba(16, 185, 129, 0.06)',
                border: '1px solid rgba(16, 185, 129, 0.15)',
                color: '#34D399',
              }}
            >
              <Sparkles className="w-4 h-4" style={{ color: '#34D399' }} />
              {success}
            </div>
          )}

          {/* Username field */}
          <div className="mb-3">
            <label className="block text-[11px] font-semibold mb-2 uppercase tracking-[0.12em]" style={{ color: '#94A3B8' }}>
              Username
            </label>
            <div className="relative">
              <div className="absolute left-3.5 top-1/2 -translate-y-1/2" style={{ color: '#475569' }}>
                <User className="w-4 h-4" />
              </div>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full pl-11 pr-4 py-3 rounded-xl text-sm font-mono transition-all duration-200 outline-none"
                style={inputStyle}
                onFocus={inputFocus}
                onBlur={inputBlur}
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

          {/* Email field */}
          <div className="mb-3">
            <label className="block text-[11px] font-semibold mb-2 uppercase tracking-[0.12em]" style={{ color: '#94A3B8' }}>
              Email
            </label>
            <div className="relative">
              <div className="absolute left-3.5 top-1/2 -translate-y-1/2" style={{ color: '#475569' }}>
                <Mail className="w-4 h-4" />
              </div>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full pl-11 pr-4 py-3 rounded-xl text-sm font-mono transition-all duration-200 outline-none"
                style={inputStyle}
                onFocus={inputFocus}
                onBlur={inputBlur}
                placeholder="your@email.com"
                required
                maxLength={254}
                autoComplete="email"
              />
            </div>
          </div>

          {/* Password field */}
          <div className="mb-2">
            <label className="block text-[11px] font-semibold mb-2 uppercase tracking-[0.12em]" style={{ color: '#94A3B8' }}>
              Password
            </label>
            <div className="relative">
              <div className="absolute left-3.5 top-1/2 -translate-y-1/2" style={{ color: '#475569' }}>
                <Lock className="w-4 h-4" />
              </div>
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-11 pr-12 py-3 rounded-xl text-sm font-mono transition-all duration-200 outline-none"
                style={inputStyle}
                onFocus={inputFocus}
                onBlur={inputBlur}
                placeholder="Create a strong password"
                required
                maxLength={200}
                autoComplete="new-password"
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

            {/* Strength meter + live checklist */}
            {password.length > 0 && (
              <div
                className="mt-2.5 p-3 rounded-xl"
                style={{
                  background: 'rgba(15, 23, 42, 0.4)',
                  border: '1px solid rgba(100, 116, 139, 0.1)',
                }}
              >
                {/* Strength bars */}
                <div className="flex gap-1.5 mb-2">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div
                      key={i}
                      className="h-1 flex-1 rounded-full transition-all duration-300"
                      style={{
                        backgroundColor: i < strength ? strengthColors[strengthIndex] : 'rgba(30, 41, 59, 0.5)',
                        boxShadow: i < strength ? `0 0 6px ${strengthColors[strengthIndex]}66` : 'none',
                      }}
                    />
                  ))}
                </div>
                {/* Label */}
                <div className="flex items-center justify-between mb-2">
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
                {/* Rules checklist */}
                <ul className="grid grid-cols-1 gap-0.5">
                  {PASSWORD_RULES.map((rule, i) => (
                    <li key={i} className="flex items-center gap-1.5 text-[10px]">
                      {ruleStates[i] ? (
                        <Check className="w-3 h-3" style={{ color: '#34D399' }} />
                      ) : (
                        <X className="w-3 h-3" style={{ color: '#475569' }} />
                      )}
                      <span style={{ color: ruleStates[i] ? '#E2E8F0' : '#64748B' }}>
                        {rule.label}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Confirm password */}
          <div className="mb-5">
            <label className="block text-[11px] font-semibold mb-2 uppercase tracking-[0.12em]" style={{ color: '#94A3B8' }}>
              Confirm Password
            </label>
            <div className="relative">
              <div className="absolute left-3.5 top-1/2 -translate-y-1/2" style={{ color: '#475569' }}>
                <Shield className="w-4 h-4" />
              </div>
              <input
                type={showPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full pl-11 pr-10 py-3 rounded-xl text-sm font-mono transition-all duration-200 outline-none"
                style={inputStyle}
                onFocus={inputFocus}
                onBlur={inputBlur}
                placeholder="Re-enter your password"
                required
                maxLength={200}
                autoComplete="new-password"
              />
              {confirmPassword && (
                <div className="absolute right-3.5 top-1/2 -translate-y-1/2">
                  {password === confirmPassword ? (
                    <Check className="w-4 h-4" style={{ color: '#34D399' }} />
                  ) : (
                    <X className="w-4 h-4" style={{ color: '#EF4444' }} />
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Submit button */}
          <button
            type="submit"
            disabled={loading || (password.length > 0 && !isPasswordValid)}
            className="w-full py-3.5 rounded-xl font-semibold text-sm relative flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
            style={{
              background: 'linear-gradient(135deg, #7C3AED, #8B5CF6)',
              color: '#FFFFFF',
              boxShadow: '0 4px 15px rgba(139, 92, 246, 0.3), 0 1px 3px rgba(0, 0, 0, 0.2)',
            }}
            onMouseEnter={(e) => {
              if (!loading) {
                e.currentTarget.style.boxShadow = '0 6px 25px rgba(139, 92, 246, 0.4), 0 2px 6px rgba(0, 0, 0, 0.2)'
                e.currentTarget.style.transform = 'translateY(-1px)'
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.boxShadow = '0 4px 15px rgba(139, 92, 246, 0.3), 0 1px 3px rgba(0, 0, 0, 0.2)'
              e.currentTarget.style.transform = 'translateY(0)'
            }}
          >
            {loading ? (
              <>
                <div
                  className="w-4 h-4 border-2 rounded-full animate-spin"
                  style={{ borderColor: 'rgba(255,255,255,0.3)', borderTopColor: '#FFFFFF' }}
                />
                Creating account...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                Create Account
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>

          {/* Divider */}
          <div className="my-5 flex items-center gap-3">
            <div className="flex-1 h-px" style={{ background: 'rgba(100, 116, 139, 0.15)' }} />
            <span className="text-[10px] uppercase tracking-[0.15em] font-medium" style={{ color: '#475569' }}>
              or
            </span>
            <div className="flex-1 h-px" style={{ background: 'rgba(100, 116, 139, 0.15)' }} />
          </div>

          {/* Login link */}
          <div className="text-center">
            <span className="text-sm" style={{ color: '#64748B' }}>
              Already have an account?{' '}
            </span>
            <button
              type="button"
              onClick={() => router.push('/login')}
              className="text-sm font-semibold hover:underline inline-flex items-center gap-1.5 tracking-wide transition-colors"
              style={{ color: '#818CF8' }}
              onMouseEnter={(e) => (e.currentTarget.style.color = '#A5B4FC')}
              onMouseLeave={(e) => (e.currentTarget.style.color = '#818CF8')}
            >
              <ArrowRight className="w-3 h-3 rotate-180" />
              Sign In
            </button>
          </div>
        </form>
      </div>

      {/* Security note */}
      <p
        className="text-center text-[10px] mt-5 flex items-center justify-center gap-1.5"
        style={{ color: '#334155' }}
      >
        <ShieldCheck className="w-3 h-3" style={{ color: '#818CF8' }} />
        Passwords are encrypted with bcrypt(12). Plaintext is never stored.
      </p>
    </NexusAuthLayout>
  )
}

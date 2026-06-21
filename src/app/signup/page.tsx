'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Eye, EyeOff, Lock, Shield, User, ArrowRight, Mail, Sparkles, Check, X, ShieldCheck } from 'lucide-react'
import { AuthLayout } from '@/components/auth/auth-layout'

interface PasswordRule {
  label: string
  test: (pwd: string) => boolean
}

const PASSWORD_RULES: PasswordRule[] = [
  { label: 'At least 8 characters', test: (p) => p.length >= 8 },
  { label: 'An uppercase letter (A-Z)', test: (p) => /[A-Z]/.test(p) },
  { label: 'A lowercase letter (a-z)', test: (p) => /[a-z]/.test(p) },
  { label: 'A number (0-9)', test: (p) => /\d/.test(p) },
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

  // Compute live password-strength checks
  const ruleStates = useMemo(
    () => PASSWORD_RULES.map((r) => r.test(password)),
    [password]
  )
  const strength = ruleStates.filter(Boolean).length
  const strengthColors = ['#F87171', '#FBBF24', '#FBBF24', '#34D399', '#34D399', '#00E5C0']
  const strengthLabels = ['Too Short', 'Very Weak', 'Weak', 'Fair', 'Strong', 'Very Strong']
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
        setSuccess('Account created successfully! Redirecting to login...')
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

  return (
    <AuthLayout accent="indigo">
      <div
        className="relative bg-[var(--nx-bg-secondary)]/80 backdrop-blur-xl border border-[var(--nx-border)]/60 rounded-2xl shadow-2xl overflow-hidden nx-gradient-border"
        style={{
          boxShadow: `
            0 0 40px rgba(99,102,241,0.06),
            0 0 80px rgba(0,229,192,0.03),
            0 25px 50px rgba(0,0,0,0.5),
            inset 0 1px 0 rgba(255,255,255,0.04)
          `,
        }}
      >
        {/* Top glow bar */}
        <div className="h-1 bg-gradient-to-r from-[#6366F1] via-[#00E5C0] to-[#6366F1] animate-pulse" />

        {/* Header */}
        <div className="p-7 pb-4 text-center">
          <h2 className="text-2xl font-bold mb-1">
            <span className="bg-gradient-to-r from-[#6366F1] to-[#00E5C0] bg-clip-text text-transparent">Create</span> <span className="text-white">Account</span>
          </h2>
          <p className="text-[var(--nx-text-secondary)] text-sm">Start your secure coding journey</p>

          {/* Features */}
          <div className="flex items-center justify-center gap-4 mt-3 text-[10px] text-[var(--nx-text-secondary)]">
            <span className="flex items-center gap-1"><Check className="w-3 h-3 text-[#6366F1]" />Isolated Workspace</span>
            <span className="flex items-center gap-1"><Check className="w-3 h-3 text-[#00E5C0]" />End-to-End Encrypted</span>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-7 pb-7">
          {error && (
            <div className="mb-4 p-3 rounded-lg bg-[var(--nx-error)]/10 border border-[var(--nx-error)]/30 text-[var(--nx-error)] text-sm flex items-center gap-2">
              <div className="w-1 h-1 rounded-full bg-[var(--nx-error)] animate-ping" />
              {error}
            </div>
          )}

          {success && (
            <div className="mb-4 p-3 rounded-lg bg-[#00E5C0]/10 border border-[#00E5C0]/30 text-[#00E5C0] text-sm flex items-center gap-2">
              <Sparkles className="w-4 h-4" />
              {success}
            </div>
          )}

          {/* Username field */}
          <div className="mb-3">
            <label className="block text-xs font-medium text-[var(--nx-text-secondary)] mb-1.5 uppercase tracking-wider">Username</label>
            <div className="relative group">
              <div className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--nx-text-dim)] group-focus-within:text-[#6366F1] transition-colors">
                <User className="w-4 h-4" />
              </div>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full pl-10 pr-4 py-3 bg-[var(--nx-bg-primary)] border border-[var(--nx-border)] rounded-xl text-[var(--nx-text)] text-sm placeholder-[var(--nx-text-dim)] focus:outline-none focus:border-[#6366F1]/50 focus:ring-1 focus:ring-[#6366F1]/20 transition-all"
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
            <label className="block text-xs font-medium text-[var(--nx-text-secondary)] mb-1.5 uppercase tracking-wider">Email</label>
            <div className="relative group">
              <div className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--nx-text-dim)] group-focus-within:text-[#6366F1] transition-colors">
                <Mail className="w-4 h-4" />
              </div>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full pl-10 pr-4 py-3 bg-[var(--nx-bg-primary)] border border-[var(--nx-border)] rounded-xl text-[var(--nx-text)] text-sm placeholder-[var(--nx-text-dim)] focus:outline-none focus:border-[#6366F1]/50 focus:ring-1 focus:ring-[#6366F1]/20 transition-all"
                placeholder="your@email.com"
                required
                maxLength={254}
                autoComplete="email"
              />
            </div>
          </div>

          {/* Password field */}
          <div className="mb-2">
            <label className="block text-xs font-medium text-[var(--nx-text-secondary)] mb-1.5 uppercase tracking-wider">Password</label>
            <div className="relative group">
              <div className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--nx-text-dim)] group-focus-within:text-[#6366F1] transition-colors">
                <Lock className="w-4 h-4" />
              </div>
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-10 pr-12 py-3 bg-[var(--nx-bg-primary)] border border-[var(--nx-border)] rounded-xl text-[var(--nx-text)] text-sm placeholder-[var(--nx-text-dim)] focus:outline-none focus:border-[#6366F1]/50 focus:ring-1 focus:ring-[#6366F1]/20 transition-all"
                placeholder="Create a strong password"
                required
                maxLength={200}
                autoComplete="new-password"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--nx-text-dim)] hover:text-[#6366F1] transition-colors"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>

            {/* Strength meter + live checklist */}
            {password.length > 0 && (
              <div className="mt-2 p-2.5 rounded-lg bg-[var(--nx-bg-primary)]/50 border border-[var(--nx-border)]/60">
                <div className="flex gap-1 mb-2">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div
                      key={i}
                      className="h-1 flex-1 rounded-full transition-all duration-300"
                      style={{
                        backgroundColor: i < strength ? strengthColors[strengthIndex] : 'var(--nx-border)',
                      }}
                    />
                  ))}
                </div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px]" style={{ color: strengthColors[strengthIndex] }}>
                    {strengthLabels[strengthIndex]}
                  </span>
                  <span className="text-[10px] text-[var(--nx-text-dim)]">
                    {strength}/{PASSWORD_RULES.length} requirements met
                  </span>
                </div>
                <ul className="grid grid-cols-1 gap-0.5">
                  {PASSWORD_RULES.map((rule, i) => (
                    <li key={i} className="flex items-center gap-1.5 text-[10px]">
                      {ruleStates[i] ? (
                        <Check className="w-3 h-3 text-[var(--nx-success)]" />
                      ) : (
                        <X className="w-3 h-3 text-[var(--nx-text-dim)]" />
                      )}
                      <span style={{ color: ruleStates[i] ? 'var(--nx-text)' : 'var(--nx-text-muted)' }}>
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
            <label className="block text-xs font-medium text-[var(--nx-text-secondary)] mb-1.5 uppercase tracking-wider">Confirm Password</label>
            <div className="relative group">
              <div className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--nx-text-dim)] group-focus-within:text-[#6366F1] transition-colors">
                <Shield className="w-4 h-4" />
              </div>
              <input
                type={showPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full pl-10 pr-10 py-3 bg-[var(--nx-bg-primary)] border border-[var(--nx-border)] rounded-xl text-[var(--nx-text)] text-sm placeholder-[var(--nx-text-dim)] focus:outline-none focus:border-[#6366F1]/50 focus:ring-1 focus:ring-[#6366F1]/20 transition-all"
                placeholder="Re-enter your password"
                required
                maxLength={200}
                autoComplete="new-password"
              />
              {confirmPassword && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  {password === confirmPassword ? (
                    <Check className="w-4 h-4 text-[var(--nx-success)]" />
                  ) : (
                    <X className="w-4 h-4 text-[var(--nx-error)]" />
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Signup button */}
          <button
            type="submit"
            disabled={loading || (password.length > 0 && !isPasswordValid)}
            className="w-full py-3.5 rounded-xl font-semibold text-sm relative overflow-hidden group disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              background: 'linear-gradient(135deg, #6366F1, #00E5C0)',
              boxShadow: '0 4px 15px rgba(99,102,241,0.3), 0 0 30px rgba(99,102,241,0.1)',
            }}
          >
            <span className="relative z-10 flex items-center justify-center gap-2 text-[#080A12] font-bold">
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-[#080A12]/30 border-t-[#080A12] rounded-full animate-spin" />
                  Creating Account...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  Create Account
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </>
              )}
            </span>
            <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
          </button>

          {/* Divider */}
          <div className="flex items-center gap-3 mt-5 mb-3">
            <div className="flex-1 h-px bg-[var(--nx-border)]" />
            <span className="text-[10px] text-[var(--nx-text-dim)] uppercase tracking-wider">Already have an account?</span>
            <div className="flex-1 h-px bg-[var(--nx-border)]" />
          </div>

          {/* Login link */}
          <div className="text-center">
            <button
              type="button"
              onClick={() => router.push('/login')}
              className="text-[#6366F1] text-sm font-medium hover:underline inline-flex items-center gap-1"
            >
              <ArrowRight className="w-3 h-3 rotate-180" />
              Sign In Instead
            </button>
          </div>
        </form>
      </div>

      {/* Security note */}
      <p className="text-center text-[10px] text-[var(--nx-text-dim)] mt-4 flex items-center justify-center gap-1.5">
        <ShieldCheck className="w-3 h-3" />
        Passwords are hashed with bcrypt(12). We never store plaintext credentials.
      </p>
    </AuthLayout>
  )
}

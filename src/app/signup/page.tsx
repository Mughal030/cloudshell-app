'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import {
  Eye, EyeOff, Lock, Shield, User, ArrowRight, Mail, Sparkles,
  Check, X, ShieldCheck, Flame,
} from 'lucide-react'
import { WarlandAuthLayout } from '@/components/auth/warland-auth-layout'

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
  const strengthColors = ['#DC2626', '#FF6B1A', '#F5B342', '#FFD27A', '#84CC16', '#FFD27A']
  const strengthLabels = ['Too Short', 'Very Weak', 'Weak', 'Fair', 'Strong', 'Legendary']
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
        setSuccess('Stronghold forged! Redirecting to login…')
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
    <WarlandAuthLayout>
      {/* ── Form Card ── */}
      <div className="wl-card rounded-2xl overflow-hidden">
        {/* Ornate corner brackets */}
        <span className="wl-corner wl-corner-tl" />
        <span className="wl-corner wl-corner-tr" />
        <span className="wl-corner wl-corner-bl" />
        <span className="wl-corner wl-corner-br" />

        {/* Top gold-foil bar */}
        <div
          className="h-1.5 relative"
          style={{
            background:
              'linear-gradient(90deg, #B8841C 0%, #F5B342 20%, #FFD27A 50%, #F5B342 80%, #B8841C 100%)',
            boxShadow: '0 0 16px rgba(245, 179, 66, 0.4)',
          }}
        >
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
            <Flame
              className="h-3.5 w-3.5"
              style={{ color: '#FF6B1A', filter: 'drop-shadow(0 0 4px rgba(255,107,26,0.8))' }}
            />
          </div>
        </div>

        {/* Header */}
        <div className="px-7 pt-6 pb-4 text-center">
          <h2
            className="wl-font-display text-2xl font-bold mb-1.5"
            style={{ color: '#F5E6D3' }}
          >
            <span className="wl-text-gold">Forge</span>{' '}
            a New Stronghold
          </h2>
          <p className="text-sm" style={{ color: '#8A7860' }}>
            Begin your coded conquest
          </p>

          {/* Features line */}
          <div
            className="flex items-center justify-center gap-4 mt-3 text-[10px]"
            style={{ color: '#8A7860' }}
          >
            <span className="flex items-center gap-1">
              <Check className="w-3 h-3" style={{ color: '#F5B342' }} />
              Isolated Workspace
            </span>
            <span className="flex items-center gap-1">
              <Check className="w-3 h-3" style={{ color: '#FF6B1A' }} />
              End-to-End Sealed
            </span>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-7 pb-7">
          {error && (
            <div
              className="mb-4 p-3 rounded-lg text-sm flex items-center gap-2"
              style={{
                background: 'rgba(220, 38, 38, 0.10)',
                border: '1px solid rgba(220, 38, 38, 0.35)',
                color: '#FCA5A5',
              }}
            >
              <div
                className="w-1.5 h-1.5 rounded-full animate-ping"
                style={{ background: '#DC2626' }}
              />
              {error}
            </div>
          )}

          {success && (
            <div
              className="mb-4 p-3 rounded-lg text-sm flex items-center gap-2"
              style={{
                background: 'rgba(245, 179, 66, 0.10)',
                border: '1px solid rgba(245, 179, 66, 0.35)',
                color: '#FFD27A',
              }}
            >
              <Sparkles className="w-4 h-4" style={{ color: '#F5B342' }} />
              {success}
            </div>
          )}

          {/* Username field */}
          <div className="mb-3">
            <label
              className="block text-[10px] font-semibold mb-1.5 uppercase tracking-[0.2em] wl-font-serif"
              style={{ color: '#C9B89A' }}
            >
              Hero Name
            </label>
            <div className="relative group">
              <div
                className="absolute left-3 top-1/2 -translate-y-1/2"
                style={{ color: '#5C4E3D' }}
              >
                <User className="w-4 h-4" />
              </div>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="wl-input w-full pl-10 pr-4 py-3 rounded-xl text-sm font-mono"
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
            <label
              className="block text-[10px] font-semibold mb-1.5 uppercase tracking-[0.2em] wl-font-serif"
              style={{ color: '#C9B89A' }}
            >
              Raven Address
            </label>
            <div className="relative group">
              <div
                className="absolute left-3 top-1/2 -translate-y-1/2"
                style={{ color: '#5C4E3D' }}
              >
                <Mail className="w-4 h-4" />
              </div>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="wl-input w-full pl-10 pr-4 py-3 rounded-xl text-sm font-mono"
                placeholder="your@email.com"
                required
                maxLength={254}
                autoComplete="email"
              />
            </div>
          </div>

          {/* Password field */}
          <div className="mb-2">
            <label
              className="block text-[10px] font-semibold mb-1.5 uppercase tracking-[0.2em] wl-font-serif"
              style={{ color: '#C9B89A' }}
            >
              Secret Sigil
            </label>
            <div className="relative group">
              <div
                className="absolute left-3 top-1/2 -translate-y-1/2"
                style={{ color: '#5C4E3D' }}
              >
                <Lock className="w-4 h-4" />
              </div>
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="wl-input w-full pl-10 pr-12 py-3 rounded-xl text-sm font-mono"
                placeholder="Forge a strong password"
                required
                maxLength={200}
                autoComplete="new-password"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 transition-colors"
                style={{ color: '#5C4E3D' }}
                onMouseEnter={(e) => (e.currentTarget.style.color = '#F5B342')}
                onMouseLeave={(e) => (e.currentTarget.style.color = '#5C4E3D')}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>

            {/* Strength meter + live checklist */}
            {password.length > 0 && (
              <div
                className="mt-2 p-2.5 rounded-lg"
                style={{
                  background: 'rgba(14, 8, 9, 0.6)',
                  border: '1px solid #3A2624',
                }}
              >
                {/* Strength bars */}
                <div className="flex gap-1 mb-2">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div
                      key={i}
                      className="h-1 flex-1 rounded-full transition-all duration-300"
                      style={{
                        backgroundColor:
                          i < strength ? strengthColors[strengthIndex] : '#3A2624',
                        boxShadow:
                          i < strength
                            ? `0 0 6px ${strengthColors[strengthIndex]}66`
                            : 'none',
                      }}
                    />
                  ))}
                </div>
                {/* Label */}
                <div className="flex items-center justify-between mb-2">
                  <span
                    className="text-[10px] font-semibold uppercase tracking-wider wl-font-serif"
                    style={{ color: strengthColors[strengthIndex] }}
                  >
                    {strengthLabels[strengthIndex]}
                  </span>
                  <span className="text-[10px]" style={{ color: '#5C4E3D' }}>
                    {strength}/{PASSWORD_RULES.length} runes inscribed
                  </span>
                </div>
                {/* Rules checklist */}
                <ul className="grid grid-cols-1 gap-0.5">
                  {PASSWORD_RULES.map((rule, i) => (
                    <li key={i} className="flex items-center gap-1.5 text-[10px]">
                      {ruleStates[i] ? (
                        <Check className="w-3 h-3" style={{ color: '#84CC16' }} />
                      ) : (
                        <X className="w-3 h-3" style={{ color: '#5C4E3D' }} />
                      )}
                      <span
                        style={{ color: ruleStates[i] ? '#F5E6D3' : '#8A7860' }}
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
          <div className="mb-5">
            <label
              className="block text-[10px] font-semibold mb-1.5 uppercase tracking-[0.2em] wl-font-serif"
              style={{ color: '#C9B89A' }}
            >
              Confirm Sigil
            </label>
            <div className="relative group">
              <div
                className="absolute left-3 top-1/2 -translate-y-1/2"
                style={{ color: '#5C4E3D' }}
              >
                <Shield className="w-4 h-4" />
              </div>
              <input
                type={showPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="wl-input w-full pl-10 pr-10 py-3 rounded-xl text-sm font-mono"
                placeholder="Re-enter your password"
                required
                maxLength={200}
                autoComplete="new-password"
              />
              {confirmPassword && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  {password === confirmPassword ? (
                    <Check className="w-4 h-4" style={{ color: '#84CC16' }} />
                  ) : (
                    <X className="w-4 h-4" style={{ color: '#DC2626' }} />
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Submit button — gold foil */}
          <button
            type="submit"
            disabled={loading || (password.length > 0 && !isPasswordValid)}
            className="wl-btn-gold w-full py-3.5 rounded-xl font-semibold text-sm relative flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <span className="relative z-10 flex items-center justify-center gap-2">
              {loading ? (
                <>
                  <div
                    className="w-4 h-4 border-2 rounded-full animate-spin"
                    style={{ borderColor: 'rgba(26,15,8,0.3)', borderTopColor: '#1A0F08' }}
                  />
                  Forging stronghold…
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  Forge Account
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </>
              )}
            </span>
          </button>

          {/* Ornate divider */}
          <div className="wl-divider my-5">
            <span className="wl-divider-gem" />
          </div>

          {/* Login link */}
          <div className="text-center">
            <span className="text-sm" style={{ color: '#8A7860' }}>
              Already a hero?{' '}
            </span>
            <button
              type="button"
              onClick={() => router.push('/login')}
              className="text-sm font-semibold hover:underline inline-flex items-center gap-1.5 wl-font-serif tracking-wide"
              style={{ color: '#F5B342' }}
            >
              <ArrowRight className="w-3 h-3 rotate-180" />
              Enter the Stronghold
            </button>
          </div>
        </form>
      </div>

      {/* Security note */}
      <p
        className="text-center text-[10px] mt-4 flex items-center justify-center gap-1.5 wl-font-serif italic"
        style={{ color: '#5C4E3D' }}
      >
        <ShieldCheck className="w-3 h-3" style={{ color: '#F5B342' }} />
        Passwords are forged with bcrypt(12). Plaintext is forbidden.
      </p>
    </WarlandAuthLayout>
  )
}

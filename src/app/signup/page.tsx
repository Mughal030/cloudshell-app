'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Eye, EyeOff, Lock, Shield, User, ArrowRight, Mail, UserPlus, Sparkles, Check } from 'lucide-react'
import Image from 'next/image'

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
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 })

  const handleMouseMove = (e: React.MouseEvent) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = (e.clientX - rect.left - rect.width / 2) / rect.width
    const y = (e.clientY - rect.top - rect.height / 2) / rect.height
    setMousePos({ x, y })
  }

  // Password strength
  const getPasswordStrength = () => {
    let score = 0
    if (password.length >= 6) score++
    if (password.length >= 8) score++
    if (/[A-Z]/.test(password)) score++
    if (/[0-9]/.test(password)) score++
    if (/[^A-Za-z0-9]/.test(password)) score++
    return score
  }

  const strength = getPasswordStrength()
  const strengthColors = ['var(--nx-error)', 'var(--nx-warning)', 'var(--nx-warning)', 'var(--nx-success)', 'var(--nx-accent-teal)']
  const strengthLabels = ['Very Weak', 'Weak', 'Fair', 'Strong', 'Very Strong']

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccess('')

    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters')
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
        setTimeout(() => router.push('/login'), 2000)
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
    <div className="min-h-screen bg-[#080A12] flex items-center justify-center overflow-hidden relative py-8" onMouseMove={handleMouseMove}>
      {/* Animated 3D Background */}
      <div className="absolute inset-0 overflow-hidden">
        {/* Floating 3D Shapes */}
        {Array.from({ length: 25 }).map((_, i) => (
          <div
            key={i}
            className="absolute opacity-[0.07]"
            style={{
              left: `${(i * 13) % 100}%`,
              top: `${(i * 19) % 100}%`,
              width: `${15 + (i % 5) * 12}px`,
              height: `${15 + (i % 5) * 12}px`,
              border: `1px solid ${['#6366F1', '#00E5C0', '#C084FC', '#34D399'][i % 4]}`,
              borderRadius: i % 3 === 0 ? '4px' : i % 3 === 1 ? '50%' : '30%',
              transform: `perspective(500px) rotateX(${mousePos.y * 25 + i * 18}deg) rotateY(${mousePos.x * 25 + i * 14}deg)`,
              animation: `nx-float ${10 + (i % 6) * 2}s ease-in-out infinite ${i * 0.3}s`,
              transition: 'transform 0.3s ease-out',
            }}
          />
        ))}

        {/* Gradient Orbs */}
        <div className="absolute top-1/3 left-1/5 w-[500px] h-[500px] bg-[#6366F1]/[0.04] rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-1/3 right-1/5 w-[500px] h-[500px] bg-[#00E5C0]/[0.04] rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1.5s' }} />
        <div className="absolute top-2/3 left-1/2 w-80 h-80 bg-[#C084FC]/[0.04] rounded-full blur-3xl animate-pulse" style={{ animationDelay: '3s' }} />

        {/* Grid Lines */}
        <div className="absolute inset-0 opacity-[0.02]"
          style={{
            backgroundImage: `
              linear-gradient(rgba(99,102,241,0.4) 1px, transparent 1px),
              linear-gradient(90deg, rgba(99,102,241,0.4) 1px, transparent 1px)
            `,
            backgroundSize: '50px 50px',
          }}
        />
      </div>

      {/* Main Signup Card */}
      <div
        className="relative z-10 w-full max-w-md mx-4"
        style={{
          transform: `perspective(1000px) rotateY(${mousePos.x * 2}deg) rotateX(${-mousePos.y * 2}deg)`,
          transition: 'transform 0.2s ease-out',
        }}
      >
        {/* Card */}
        <div className="relative bg-[var(--nx-bg-secondary)]/80 backdrop-blur-xl border border-[var(--nx-border)]/60 rounded-2xl shadow-2xl overflow-hidden nx-gradient-border"
          style={{
            boxShadow: `
              0 0 40px rgba(99,102,241,0.06),
              0 0 80px rgba(0,229,192,0.03),
              0 25px 50px rgba(0,0,0,0.5),
              inset 0 1px 0 rgba(255,255,255,0.04)
            `,
          }}
        >
          {/* Top Glow Bar — indigo→teal flow */}
          <div className="h-1 bg-gradient-to-r from-[#6366F1] via-[#00E5C0] to-[#6366F1] animate-pulse" />

          {/* Header */}
          <div className="p-8 pb-4 text-center">
            {/* Jasbol Logo */}
            <div className="mx-auto w-20 h-20 mb-4 relative">
              <Image src="/jasbol-hack-logo.png" alt="Jasbol Hack" width={80} height={80} className="rounded-2xl" priority
                style={{
                  filter: 'drop-shadow(0 0 12px rgba(99,102,241,0.3)) drop-shadow(0 0 24px rgba(0,229,192,0.15))',
                }}
              />
            </div>

            <h1 className="text-2xl font-bold mb-1">
              <span className="bg-gradient-to-r from-[#6366F1] to-[#00E5C0] bg-clip-text text-transparent">Join</span> <span className="bg-gradient-to-r from-[#00E5C0] to-[#6366F1] bg-clip-text text-transparent">Jasbol</span> <span className="text-white">Hack</span>
            </h1>
            <p className="text-[var(--nx-text-secondary)] text-sm">Create your secure account</p>

            {/* Features */}
            <div className="flex items-center justify-center gap-4 mt-3 text-[10px] text-[var(--nx-text-secondary)]">
              <span className="flex items-center gap-1"><Check className="w-3 h-3 text-[#6366F1]" />Isolated Workspace</span>
              <span className="flex items-center gap-1"><Check className="w-3 h-3 text-[#00E5C0]" />End-to-End Encrypted</span>
            </div>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="px-8 pb-8">
            {error && (
              <div className="mb-4 p-3 rounded-lg bg-[var(--nx-error)]/10 border border-[var(--nx-error)]/20 text-[var(--nx-error)] text-sm flex items-center gap-2">
                <div className="w-1 h-1 rounded-full bg-[var(--nx-error)] animate-ping" />
                {error}
              </div>
            )}

            {success && (
              <div className="mb-4 p-3 rounded-lg bg-[#6366F1]/10 border border-[#6366F1]/20 text-[#6366F1] text-sm flex items-center gap-2">
                <Sparkles className="w-4 h-4" />
                {success}
              </div>
            )}

            {/* Username Field */}
            <div className="mb-4">
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
                  placeholder="Choose a username"
                  required
                  autoComplete="username"
                />
              </div>
            </div>

            {/* Email Field */}
            <div className="mb-4">
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
                  autoComplete="email"
                />
              </div>
            </div>

            {/* Password Field */}
            <div className="mb-3">
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
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--nx-text-dim)] hover:text-[#6366F1] transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {/* Password Strength */}
              {password.length > 0 && (
                <div className="mt-2">
                  <div className="flex gap-1 mb-1">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <div
                        key={i}
                        className="h-1 flex-1 rounded-full transition-all duration-300"
                        style={{
                          backgroundColor: i < strength ? strengthColors[strength - 1] : 'var(--nx-border)',
                        }}
                      />
                    ))}
                  </div>
                  <span className="text-[10px]" style={{ color: strengthColors[strength - 1] || 'var(--nx-text-dim)' }}>
                    {strengthLabels[strength - 1] || 'Too short'}
                  </span>
                </div>
              )}
            </div>

            {/* Confirm Password */}
            <div className="mb-6">
              <label className="block text-xs font-medium text-[var(--nx-text-secondary)] mb-1.5 uppercase tracking-wider">Confirm Password</label>
              <div className="relative group">
                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--nx-text-dim)] group-focus-within:text-[#6366F1] transition-colors">
                  <Shield className="w-4 h-4" />
                </div>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-[var(--nx-bg-primary)] border border-[var(--nx-border)] rounded-xl text-[var(--nx-text)] text-sm placeholder-[var(--nx-text-dim)] focus:outline-none focus:border-[#6366F1]/50 focus:ring-1 focus:ring-[#6366F1]/20 transition-all"
                  placeholder="Confirm your password"
                  required
                  autoComplete="new-password"
                />
                {confirmPassword && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    {password === confirmPassword ? (
                      <Check className="w-4 h-4 text-[var(--nx-accent-teal)]" />
                    ) : (
                      <div className="w-2 h-2 rounded-full bg-[var(--nx-error)]" />
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Signup Button — indigo→teal gradient */}
            <button
              type="submit"
              disabled={loading}
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
            <div className="flex items-center gap-3 mt-6 mb-4">
              <div className="flex-1 h-px bg-[var(--nx-border)]" />
              <span className="text-[10px] text-[var(--nx-text-dim)] uppercase tracking-wider">Already have an account?</span>
              <div className="flex-1 h-px bg-[var(--nx-border)]" />
            </div>

            {/* Login Link */}
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

        {/* 3D Shadow */}
        <div className="absolute -bottom-4 left-4 right-4 h-8 bg-[#6366F1]/5 blur-xl rounded-full" />
      </div>
    </div>
  )
}

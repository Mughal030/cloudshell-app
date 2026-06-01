'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Eye, EyeOff, Shield, Lock, User, ArrowRight, Fingerprint, Zap } from 'lucide-react'

export default function LoginPage() {
  const router = useRouter()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 })

  const handleMouseMove = (e: React.MouseEvent) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = (e.clientX - rect.left - rect.width / 2) / rect.width
    const y = (e.clientY - rect.top - rect.height / 2) / rect.height
    setMousePos({ x, y })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
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
      }
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#0a0e17] flex items-center justify-center overflow-hidden relative" onMouseMove={handleMouseMove}>
      {/* Animated 3D Background */}
      <div className="absolute inset-0 overflow-hidden">
        {/* Floating 3D Cubes */}
        {Array.from({ length: 20 }).map((_, i) => (
          <div
            key={i}
            className="absolute opacity-10"
            style={{
              left: `${(i * 17) % 100}%`,
              top: `${(i * 23) % 100}%`,
              width: `${20 + (i % 4) * 15}px`,
              height: `${20 + (i % 4) * 15}px`,
              border: `1px solid ${i % 2 === 0 ? '#00ff41' : '#0ea5e9'}`,
              borderRadius: i % 3 === 0 ? '4px' : '50%',
              transform: `perspective(500px) rotateX(${mousePos.y * 20 + i * 15}deg) rotateY(${mousePos.x * 20 + i * 12}deg) translateZ(${Math.sin(Date.now() / 1000 + i) * 10}px)`,
              animation: `float3d ${8 + (i % 5) * 2}s ease-in-out infinite ${i * 0.5}s`,
              transition: 'transform 0.3s ease-out',
            }}
          />
        ))}

        {/* Gradient Orbs */}
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-[#00ff41]/5 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-[#0ea5e9]/5 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
        <div className="absolute top-1/2 left-1/2 w-64 h-64 bg-purple-500/5 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '2s' }} />

        {/* Grid Lines */}
        <div className="absolute inset-0 opacity-5"
          style={{
            backgroundImage: `
              linear-gradient(rgba(0,255,65,0.3) 1px, transparent 1px),
              linear-gradient(90deg, rgba(0,255,65,0.3) 1px, transparent 1px)
            `,
            backgroundSize: '60px 60px',
          }}
        />
      </div>

      {/* Main Login Card */}
      <div
        className="relative z-10 w-full max-w-md mx-4"
        style={{
          transform: `perspective(1000px) rotateY(${mousePos.x * 3}deg) rotateX(${-mousePos.y * 3}deg)`,
          transition: 'transform 0.2s ease-out',
        }}
      >
        {/* Card */}
        <div className="relative bg-[#0d1117]/80 backdrop-blur-xl border border-[#21262d] rounded-2xl shadow-2xl overflow-hidden"
          style={{
            boxShadow: `
              0 0 40px rgba(0,255,65,0.05),
              0 0 80px rgba(14,165,233,0.03),
              0 25px 50px rgba(0,0,0,0.5),
              inset 0 1px 0 rgba(255,255,255,0.05)
            `,
          }}
        >
          {/* Top Glow Bar */}
          <div className="h-1 bg-gradient-to-r from-[#00ff41] via-[#0ea5e9] to-[#00ff41] animate-pulse" />

          {/* Header */}
          <div className="p-8 pb-4 text-center">
            {/* 3D Logo */}
            <div className="mx-auto w-20 h-20 mb-4 relative">
              <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-[#00ff41]/20 to-[#0ea5e9]/20 border border-[#00ff41]/30"
                style={{
                  transform: 'perspective(200px) rotateX(5deg) rotateY(-5deg)',
                  boxShadow: '0 10px 30px rgba(0,255,65,0.15)',
                }}
              >
                <div className="flex items-center justify-center h-full">
                  <Shield className="w-10 h-10 text-[#00ff41]" />
                </div>
              </div>
            </div>

            <h1 className="text-2xl font-bold text-white mb-1">
              <span className="text-[#00ff41]">Jasbol</span> Hack
            </h1>
            <p className="text-[#8b949e] text-sm">Secure Access Terminal</p>

            {/* Security Badge */}
            <div className="inline-flex items-center gap-1.5 mt-3 px-3 py-1 rounded-full bg-[#00ff41]/10 border border-[#00ff41]/20">
              <Lock className="w-3 h-3 text-[#00ff41]" />
              <span className="text-[10px] text-[#00ff41] font-medium tracking-wider uppercase">Encrypted Connection</span>
            </div>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="px-8 pb-8">
            {error && (
              <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm flex items-center gap-2">
                <div className="w-1 h-1 rounded-full bg-red-400 animate-ping" />
                {error}
              </div>
            )}

            {/* Username Field */}
            <div className="mb-4">
              <label className="block text-xs font-medium text-[#8b949e] mb-1.5 uppercase tracking-wider">Username</label>
              <div className="relative group">
                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-[#484f58] group-focus-within:text-[#00ff41] transition-colors">
                  <User className="w-4 h-4" />
                </div>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-[#161b22] border border-[#21262d] rounded-xl text-white text-sm placeholder-[#484f58] focus:outline-none focus:border-[#00ff41]/50 focus:ring-1 focus:ring-[#00ff41]/20 transition-all"
                  placeholder="Enter your username"
                  required
                  autoComplete="username"
                />
              </div>
            </div>

            {/* Password Field */}
            <div className="mb-6">
              <label className="block text-xs font-medium text-[#8b949e] mb-1.5 uppercase tracking-wider">Password</label>
              <div className="relative group">
                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-[#484f58] group-focus-within:text-[#00ff41] transition-colors">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-10 pr-12 py-3 bg-[#161b22] border border-[#21262d] rounded-xl text-white text-sm placeholder-[#484f58] focus:outline-none focus:border-[#00ff41]/50 focus:ring-1 focus:ring-[#00ff41]/20 transition-all"
                  placeholder="Enter your password"
                  required
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#484f58] hover:text-[#00ff41] transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Login Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 rounded-xl font-semibold text-sm relative overflow-hidden group disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                background: 'linear-gradient(135deg, #00ff41, #0ea5e9)',
                boxShadow: '0 4px 15px rgba(0,255,65,0.3), 0 0 30px rgba(0,255,65,0.1)',
              }}
            >
              <span className="relative z-10 flex items-center justify-center gap-2 text-black">
                {loading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
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
              <div className="flex-1 h-px bg-[#21262d]" />
              <span className="text-[10px] text-[#484f58] uppercase tracking-wider">Secure Access</span>
              <div className="flex-1 h-px bg-[#21262d]" />
            </div>

            {/* Signup Link */}
            <div className="text-center">
              <span className="text-[#8b949e] text-sm">Don&apos;t have an account? </span>
              <button
                type="button"
                onClick={() => router.push('/signup')}
                className="text-[#00ff41] text-sm font-medium hover:underline inline-flex items-center gap-1"
              >
                <Zap className="w-3 h-3" />
                Create Account
              </button>
            </div>
          </form>
        </div>

        {/* 3D Shadow underneath card */}
        <div className="absolute -bottom-4 left-4 right-4 h-8 bg-black/30 blur-xl rounded-full" />
      </div>

      {/* CSS Animations */}
      <style jsx>{`
        @keyframes float3d {
          0%, 100% { transform: perspective(500px) translateY(0px) rotateX(var(--rx, 0deg)) rotateY(var(--ry, 0deg)); }
          25% { transform: perspective(500px) translateY(-15px) rotateX(5deg) rotateY(5deg); }
          50% { transform: perspective(500px) translateY(-25px) rotateX(0deg) rotateY(10deg); }
          75% { transform: perspective(500px) translateY(-10px) rotateX(-5deg) rotateY(5deg); }
        }
      `}</style>
    </div>
  )
}

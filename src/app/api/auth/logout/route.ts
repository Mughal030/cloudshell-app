import { NextRequest, NextResponse } from 'next/server'
import { verifyTokenBasic, logout, getClientIp } from '@/lib/auth'

export async function POST(request: NextRequest) {
  // Best-effort logout — invalidate refresh token server-side
  try {
    const ip = getClientIp(request)
    const token =
      request.cookies.get('jasbol-token')?.value ||
      request.cookies.get('__Host-jasbol-token')?.value ||
      request.headers.get('authorization')?.replace('Bearer ', '')

    if (token) {
      const decoded = verifyTokenBasic(token)
      if (decoded) {
        logout(decoded.userId, ip)
      }
    }
  } catch (e) {
    console.error('[Auth] Logout error (non-fatal):', e)
  }

  const isProd = process.env.NODE_ENV === 'production'
  const cookiePrefix = isProd ? '__Host-' : ''
  const response = NextResponse.json({ success: true, message: 'Logged out' })

  // Clear both access token and refresh token cookies
  response.cookies.set(`${cookiePrefix}jasbol-token`, '', {
    httpOnly: true,
    secure: isProd,
    sameSite: 'strict',
    maxAge: 0,
    path: '/',
  })
  response.cookies.set(`${cookiePrefix}jasbol-refresh`, '', {
    httpOnly: true,
    secure: isProd,
    sameSite: 'strict',
    maxAge: 0,
    path: '/',
  })

  return response
}

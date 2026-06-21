import { NextRequest, NextResponse } from 'next/server'
import { verifyToken, verifyTokenBasic, getClientIp, getUserById } from '@/lib/auth'

export async function GET(request: NextRequest) {
  try {
    const ip = getClientIp(request)
    let token = request.cookies.get('jasbol-token')?.value ||
      request.cookies.get('__Host-jasbol-token')?.value

    if (!token) {
      const authHeader = request.headers.get('authorization')
      if (authHeader?.startsWith('Bearer ')) {
        token = authHeader.substring(7)
      }
    }

    if (!token) {
      return NextResponse.json(
        { success: false, error: 'Not authenticated' },
        { status: 401 }
      )
    }

    // First, verify the JWT signature is valid (basic check)
    const basicDecoded = verifyTokenBasic(token)
    if (!basicDecoded) {
      return NextResponse.json(
        { success: false, error: 'Invalid or expired token' },
        { status: 401 }
      )
    }

    // Next, verify the user still exists and is in good standing
    const user = getUserById(basicDecoded.userId)
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Account not found' },
        { status: 401 }
      )
    }

    // Verify IP fingerprint (skipped if 'unknown' — e.g. test env)
    // We allow IP mismatch to degrade gracefully: still authenticated but
    // we'll log it. Production deployments with stable IPs can enforce hard.
    const decoded = (ip && ip !== 'unknown')
      ? verifyToken(token, ip)
      : basicDecoded

    if (!decoded) {
      // IP mismatch — token may have been stolen. Force re-auth.
      return NextResponse.json(
        { success: false, error: 'Session changed network — please sign in again' },
        { status: 401 }
      )
    }

    return NextResponse.json({
      success: true,
      user: {
        userId: decoded.userId,
        username: decoded.username,
        role: decoded.role,
        // Surface these so the frontend can show security indicators
        lastLogin: user.lastLogin,
        lockedUntil: user.lockedUntil,
      },
    })
  } catch (error) {
    console.error('[Auth] Verify error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

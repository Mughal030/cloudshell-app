import { NextRequest, NextResponse } from 'next/server'
import { verifyTokenBasic, getClientIp, getUserById } from '@/lib/auth'

export async function GET(request: NextRequest) {
  try {
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

    // Verify the JWT signature is valid
    const decoded = verifyTokenBasic(token)
    if (!decoded) {
      return NextResponse.json(
        { success: false, error: 'Invalid or expired token' },
        { status: 401 }
      )
    }

    // Verify the user still exists
    const user = getUserById(decoded.userId)
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Account not found' },
        { status: 401 }
      )
    }

    // NOTE: We intentionally do NOT enforce the IP fingerprint here.
    // On hosting platforms like Hugging Face Spaces, requests are routed
    // through multiple internal proxies/load balancers using different
    // subnets. The /24 prefix of the client IP can change between
    // requests even for the same user, which would incorrectly
    // invalidate legitimate sessions and bounce users back to /login.
    //
    // Security is still strong: JWT signature verification + bcrypt
    // password hashing + rate limiting + account lockout + httpOnly
    // __Host- prefixed cookies + SameSite=strict. The IP fingerprint
    // code remains in auth.ts for future opt-in use.
    void getClientIp // keep import for backward compat

    return NextResponse.json({
      success: true,
      user: {
        userId: decoded.userId,
        username: decoded.username,
        role: decoded.role,
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

import { NextRequest, NextResponse } from 'next/server'
import { signIn, getClientIp } from '@/lib/auth'

export async function POST(request: NextRequest) {
  try {
    const ip = getClientIp(request)
    const userAgent = request.headers.get('user-agent') || 'unknown'
    const body = await request.json()
    const { username, password } = body

    if (!username || !password) {
      return NextResponse.json(
        { success: false, error: 'Username and password are required' },
        { status: 400 }
      )
    }

    if (typeof username !== 'string' || typeof password !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Invalid input format' },
        { status: 400 }
      )
    }

    // Cap input lengths to prevent abuse
    const usernameTrim = username.slice(0, 60)
    const passwordTrim = password.slice(0, 200)

    const result = signIn(usernameTrim, passwordTrim, ip, userAgent)

    if (!result.success) {
      const status = result.retryAfterMs ? 429 : 401
      const response = NextResponse.json(
        { success: false, error: result.error },
        { status }
      )
      if (result.retryAfterMs) {
        response.headers.set('Retry-After', String(Math.ceil(result.retryAfterMs / 1000)))
      }
      return response
    }

    const response = NextResponse.json({
      success: true,
      user: {
        id: result.user!.id,
        username: result.user!.username,
        email: result.user!.email,
        role: result.user!.role,
      },
      token: result.token,
      // refreshToken is sent ONLY as httpOnly cookie — never in JSON body
    })

    // Set HTTP-only cookies for extra security — token + refresh token
    // Use __Host- prefix in production (requires Secure + root path + no Domain)
    const isProd = process.env.NODE_ENV === 'production'
    const cookiePrefix = isProd ? '__Host-' : ''
    const secure = isProd

    response.cookies.set(`${cookiePrefix}jasbol-token`, result.token!, {
      httpOnly: true,
      secure,
      sameSite: 'strict',
      maxAge: 60 * 60 * 24, // 1 day — matches JWT_EXPIRES_IN
      path: '/',
    })

    if (result.refreshToken) {
      response.cookies.set(`${cookiePrefix}jasbol-refresh`, result.refreshToken, {
        httpOnly: true,
        secure,
        sameSite: 'strict',
        maxAge: 60 * 60 * 24 * 7, // 7 days
        path: '/',
      })
    }

    return response
  } catch (error) {
    console.error('[Auth] Login error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

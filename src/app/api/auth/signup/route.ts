import { NextRequest, NextResponse } from 'next/server'
import { signUp, getClientIp } from '@/lib/auth'

export async function POST(request: NextRequest) {
  try {
    const ip = getClientIp(request)
    const body = await request.json()
    const { username, email, password } = body

    if (
      typeof username !== 'string' ||
      typeof email !== 'string' ||
      typeof password !== 'string'
    ) {
      return NextResponse.json(
        { success: false, error: 'Invalid input format' },
        { status: 400 }
      )
    }

    // Cap input lengths
    const result = signUp(
      username.slice(0, 60),
      email.slice(0, 254),
      password.slice(0, 200),
      ip
    )

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 400 }
      )
    }

    return NextResponse.json({
      success: true,
      message: 'Account created successfully! Please login.',
      user: {
        id: result.user!.id,
        username: result.user!.username,
        email: result.user!.email,
        role: result.user!.role,
      },
    })
  } catch (error) {
    console.error('[Auth] Signup error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

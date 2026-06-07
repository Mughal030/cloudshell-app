import { NextRequest, NextResponse } from 'next/server'
import { verifyToken, getAllUsers, deleteUser } from '@/lib/auth'

export async function GET(request: NextRequest) {
  try {
    // Verify admin access
    let token = request.cookies.get('jasbol-token')?.value
    if (!token) {
      const authHeader = request.headers.get('authorization')
      if (authHeader?.startsWith('Bearer ')) {
        token = authHeader.substring(7)
      }
    }

    if (!token) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 })
    }

    const decoded = verifyToken(token)
    if (!decoded || decoded.role !== 'admin') {
      return NextResponse.json({ success: false, error: 'Admin access required' }, { status: 403 })
    }

    const users = getAllUsers()
    return NextResponse.json({ success: true, users })
  } catch (error) {
    console.error('[Admin] Get users error:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    // Verify admin access
    let token = request.cookies.get('jasbol-token')?.value
    if (!token) {
      const authHeader = request.headers.get('authorization')
      if (authHeader?.startsWith('Bearer ')) {
        token = authHeader.substring(7)
      }
    }

    if (!token) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 })
    }

    const decoded = verifyToken(token)
    if (!decoded || decoded.role !== 'admin') {
      return NextResponse.json({ success: false, error: 'Admin access required' }, { status: 403 })
    }

    const { userId } = await request.json()
    if (!userId) {
      return NextResponse.json({ success: false, error: 'User ID required' }, { status: 400 })
    }

    const result = deleteUser(userId)
    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error }, { status: 400 })
    }

    return NextResponse.json({ success: true, message: 'User deleted' })
  } catch (error) {
    console.error('[Admin] Delete user error:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

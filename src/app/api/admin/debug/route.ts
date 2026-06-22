import { NextRequest, NextResponse } from 'next/server'
import { existsSync, readFileSync, statSync } from 'fs'
import { join } from 'path'
import { verifyTokenBasic } from '@/lib/auth'

export async function GET(request: NextRequest) {
  try {
    // Require admin auth
    let token = request.cookies.get('jasbol-token')?.value ||
      request.cookies.get('__Host-jasbol-token')?.value
    if (!token) {
      const authHeader = request.headers.get('authorization')
      if (authHeader?.startsWith('Bearer ')) {
        token = authHeader.substring(7)
      }
    }
    if (!token) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }
    const decoded = verifyTokenBasic(token)
    if (!decoded || decoded.role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    const USERS_DIR = process.env.USERS_DIR || join(process.env.APP_HOME || process.env.HOME || '/home/z', '.jasbol-users')
    const USERS_FILE = join(USERS_DIR, 'users.json')
    const AUDIT_FILE = join(USERS_DIR, 'audit.log')

    const result: Record<string, unknown> = {
      env: {
        USERS_DIR: process.env.USERS_DIR || '(not set)',
        APP_HOME: process.env.APP_HOME || '(not set)',
        HOME: process.env.HOME || '(not set)',
        NODE_ENV: process.env.NODE_ENV,
        cwd: process.cwd(),
        pid: process.pid,
      },
      paths: {
        USERS_DIR,
        USERS_FILE,
        AUDIT_FILE,
      },
      files: {} as Record<string, unknown>,
    }

    // Check users.json
    try {
      const exists = existsSync(USERS_FILE)
      result.files.usersJson = {
        exists,
        ...(exists ? {
          size: statSync(USERS_FILE).size,
          mtime: statSync(USERS_FILE).mtime.toISOString(),
          content: readFileSync(USERS_FILE, 'utf-8'),
        } : {}),
      }
    } catch (e) {
      result.files.usersJson = { error: String(e) }
    }

    // Check audit.log (last 100 lines)
    try {
      const exists = existsSync(AUDIT_FILE)
      if (exists) {
        const content = readFileSync(AUDIT_FILE, 'utf-8')
        const lines = content.split('\n').filter(Boolean).slice(-100)
        result.files.auditLog = {
          exists: true,
          size: statSync(AUDIT_FILE).size,
          last100Lines: lines,
        }
      } else {
        result.files.auditLog = { exists: false }
      }
    } catch (e) {
      result.files.auditLog = { error: String(e) }
    }

    return NextResponse.json(result, { status: 200 })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

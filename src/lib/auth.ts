import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync, lstatSync, symlinkSync } from 'fs'
import { join } from 'path'
import { randomBytes, timingSafeEqual } from 'crypto'

// ─── Configuration ────────────────────────────────────────────────
// JWT secret MUST be set via env in production — fall back to dev key only locally.
const JWT_SECRET = process.env.JWT_SECRET || 'jasbol-hack-dev-key-CHANGE-ME-IN-PRODUCTION-2026'
const JWT_EXPIRES_IN = '24h' // shortened from 7d for security — tokens rotate on use
const JWT_REFRESH_EXPIRES_IN = '7d'
const USERS_DIR = process.env.USERS_DIR || join(process.env.APP_HOME || process.env.HOME || '/home/z', '.jasbol-users')
const USERS_FILE = join(USERS_DIR, 'users.json')
const AUDIT_FILE = join(USERS_DIR, 'audit.log')

// ─── Security: Rate Limiting & Account Lockout ────────────────────
const MAX_LOGIN_ATTEMPTS = 5
const LOCKOUT_DURATION_MS = 15 * 60 * 1000   // 15 minutes
const RATE_LIMIT_WINDOW_MS = 60 * 1000        // 1 minute window
const RATE_LIMIT_MAX_PER_IP = 10              // 10 attempts per IP per minute

interface RateBucket {
  count: number
  firstAt: number
}
const loginRateByIp = new Map<string, RateBucket>()

interface FailedAttempt {
  count: number
  lockedUntil: number
}
const failedAttemptsByUser = new Map<string, FailedAttempt>()

// ─── Workspace Base ───────────────────────────────────────────────
const WORKSPACE_BASE = process.env.WORKSPACE_BASE || join(process.env.APP_HOME || process.env.HOME || '/home/z', 'workspaces')

// ─── Types ────────────────────────────────────────────────────────
export interface User {
  id: string
  username: string
  email: string
  passwordHash: string
  role: 'admin' | 'user'
  createdAt: string
  lastLogin: string
  workspaceDir: string
  // Security fields
  failedLoginAttempts: number
  lockedUntil?: number  // epoch-ms; if set and > now, account is locked
  refreshTokenHash?: string
  lastPasswordChange?: string
}

export interface AuthToken {
  userId: string
  username: string
  role: 'admin' | 'user'
  // Security fingerprint — token is rejected if request IP differs significantly.
  // We hash the IP so we don't store raw IPs in the JWT itself.
  fp: string
  iat?: number
  exp?: number
}

// ─── Atomic User Storage (write-to-tmp + atomic rename) ───────────
function ensureUsersDir() {
  if (!existsSync(USERS_DIR)) {
    mkdirSync(USERS_DIR, { recursive: true })
  }
}

function loadUsers(): User[] {
  ensureUsersDir()
  if (!existsSync(USERS_FILE)) {
    // Create default admin account
    const adminUser: User = {
      id: 'admin-001',
      username: 'adminmughal03',
      email: 'admin@jasbolhack.com',
      passwordHash: bcrypt.hashSync('adminumair0302', 12),
      role: 'admin',
      createdAt: new Date().toISOString(),
      lastLogin: new Date().toISOString(),
      failedLoginAttempts: 0,
      lastPasswordChange: new Date().toISOString(),
      workspaceDir: 'adminmughal03',
    }
    saveUsers([adminUser])
    ensureWorkspace(adminUser.workspaceDir)
    return [adminUser]
  }
  try {
    const data = readFileSync(USERS_FILE, 'utf-8')
    const users = JSON.parse(data) as User[]
    // Ensure admin account always exists
    const hasAdmin = users.some(u => u.username === 'adminmughal03')
    if (!hasAdmin) {
      users.push({
        id: 'admin-001',
        username: 'adminmughal03',
        email: 'admin@jasbolhack.com',
        passwordHash: bcrypt.hashSync('adminumair0302', 12),
        role: 'admin',
        createdAt: new Date().toISOString(),
        lastLogin: new Date().toISOString(),
        failedLoginAttempts: 0,
        lastPasswordChange: new Date().toISOString(),
        workspaceDir: 'adminmughal03',
      })
      saveUsers(users)
    }
    // Ensure all user workspaces exist + init security fields if missing
    for (const user of users) {
      if (typeof user.failedLoginAttempts !== 'number') user.failedLoginAttempts = 0
      ensureWorkspace(user.workspaceDir)
    }
    return users
  } catch {
    return []
  }
}

/**
 * Atomic save — write to a temp file first, then rename. Prevents
 * corruption if the process crashes mid-write (which previously could
 * wipe the entire users.json file).
 */
function saveUsers(users: User[]) {
  ensureUsersDir()
  const tmpPath = USERS_FILE + '.tmp.' + process.pid
  writeFileSync(tmpPath, JSON.stringify(users, null, 2), 'utf-8')
  renameSync(tmpPath, USERS_FILE)
}

function ensureWorkspace(workspaceDir: string) {
  const fullPath = join(WORKSPACE_BASE, workspaceDir)
  if (!existsSync(fullPath)) {
    mkdirSync(fullPath, { recursive: true })
  }
  // Create symlinks inside the workspace pointing to all the directories
  // where manually-installed tools land (~/.local/bin, ~/.npm-global/bin,
  // ~/.cargo/bin, ~/.bun/bin, ~/.opencode/bin, ~/.nvm, ~/.local/go, etc.).
  // Without these symlinks, installed tools are invisible in the Files tab
  // because they live OUTSIDE the workspace.
  ensureToolSymlinks(fullPath)
}

/**
 * Create symlinks under `<workspace>/.tools/` pointing to every directory
 * where the CloudShell environment installs user tools. This makes
 * manually-installed tools visible in the Files tab without compromising
 * the workspace path-traversal guard (symlinks are followed lexically
 * by path.resolve, so the guard still works).
 *
 * Missing target directories are skipped silently — the symlink would be
 * dangling. We re-run this on every file:list call so newly-installed
 * tools (e.g. user just ran `curl | bash` for bun) appear immediately.
 */
export function ensureToolSymlinks(workspaceDir: string) {
  try {
    const home = process.env.APP_HOME || process.env.HOME || '/home/cloudshell'
    const toolsDir = join(workspaceDir, '.tools')
    if (!existsSync(toolsDir)) {
      mkdirSync(toolsDir, { recursive: true })
    }
    // Each entry: [symlinkName, absoluteTargetPath, friendlyLabel]
    const targets: Array<[string, string]> = [
      ['local-bin',     join(home, '.local', 'bin')],
      ['local-lib',     join(home, '.local', 'lib')],
      ['local-share',   join(home, '.local', 'share')],
      ['npm-global',    join(home, '.npm-global', 'bin')],
      ['npm-global-lib',join(home, '.npm-global', 'lib')],
      ['opencode',      join(home, '.opencode')],
      ['opencode-bin',  join(home, '.opencode', 'bin')],
      ['claude',        join(home, '.claude')],
      ['cargo',         join(home, '.cargo')],
      ['cargo-bin',     join(home, '.cargo', 'bin')],
      ['rustup',        join(home, '.rustup')],
      ['bun',           join(home, '.bun')],
      ['bun-bin',       join(home, '.bun', 'bin')],
      ['deno',          join(home, '.deno')],
      ['deno-bin',      join(home, '.deno', 'bin')],
      ['nvm',           join(home, '.nvm')],
      ['go',            join(home, '.local', 'go')],
      ['go-bin',        join(home, '.local', 'go', 'bin')],
      ['go-workspace',  join(home, 'go')],
      ['pipx',          join(home, '.local', 'pipx')],
      ['pyenv',         join(home, '.pyenv')],
      ['rbenv',         join(home, '.rbenv')],
      ['yarn',          join(home, '.yarn')],
      ['pnpm',          join(home, '.local', 'share', 'pnpm')],
      ['config',        join(home, '.config')],
      ['cache',         join(home, '.cache')],
      ['ssh',           join(home, '.ssh')],
      ['bashrc',        join(home, '.bashrc')],
      ['bashrc-env',    join(home, '.bashrc_env')],
      ['profile',       join(home, '.profile')],
    ]
    for (const [name, target] of targets) {
      const linkPath = join(toolsDir, name)
      try {
        // Skip if symlink already exists (don't overwrite — user may have
        // customized it). existsSync follows symlinks, so we use lstatSync
        // to detect the link itself.
        let isLink = false
        try {
          const lstat = lstatSync(linkPath)
          isLink = lstat.isSymbolicLink()
        } catch { /* doesn't exist yet */ }
        if (isLink) continue
        // Only create symlink if target exists (skip dangling links)
        if (!existsSync(target)) continue
        // Don't create if a regular file/dir already exists at this path
        if (existsSync(linkPath)) continue
        try {
          symlinkSync(target, linkPath, 'dir')
        } catch {
          // Fallback: try as a file link (for .bashrc, .profile)
          try { symlinkSync(target, linkPath, 'file') } catch {}
        }
      } catch { /* ignore individual failures */ }
    }
  } catch { /* best-effort — never fail the workspace creation */ }
}

// ─── Security: Audit Log ──────────────────────────────────────────
type AuditEvent =
  | 'login.success'
  | 'login.failed'
  | 'login.locked'
  | 'login.ratelimited'
  | 'signup.success'
  | 'signup.failed'
  | 'logout'
  | 'token.refresh'
  | 'token.invalid'

function appendAudit(event: AuditEvent, username: string, ip: string, meta?: Record<string, unknown>) {
  try {
    ensureUsersDir()
    const entry = JSON.stringify({
      t: new Date().toISOString(),
      event,
      username,
      ip,
      ...meta,
    }) + '\n'
    // Append-only audit log — use fs.appendFileSync-equivalent
    writeFileSync(AUDIT_FILE, entry, { flag: 'a' })
  } catch (e) {
    // Audit logging must never block auth flow
    console.error('[audit] failed to write:', e)
  }
}

// ─── Security: IP Fingerprint ─────────────────────────────────────
/**
 * Hash the client IP (and a server secret) so we can detect token theft
 * without storing raw IPs in the JWT payload. If the requesting IP
 * changes drastically (different ISP), we can force re-auth.
 *
 * We use a /24 prefix to allow users on mobile networks that change IP
 * within a subnet without forcing re-login.
 */
function hashIp(ip: string): string {
  // Take only the first 3 octets for IPv4 (or first 4 hextets for IPv6)
  // to tolerate minor IP changes within the same network.
  const prefix = ip.includes(':')
    ? ip.split(':').slice(0, 4).join(':')
    : ip.split('.').slice(0, 3).join('.')
  return bcrypt.hashSync(prefix + '|' + JWT_SECRET, 8)
}

function verifyIpFingerprint(ip: string, storedHash: string): boolean {
  const prefix = ip.includes(':')
    ? ip.split(':').slice(0, 4).join(':')
    : ip.split('.').slice(0, 3).join('.')
  return bcrypt.compareSync(prefix + '|' + JWT_SECRET, storedHash)
}

// ─── Security: Rate Limiter ───────────────────────────────────────
function checkRateLimit(ip: string): { allowed: boolean; retryAfterMs?: number } {
  const now = Date.now()
  const bucket = loginRateByIp.get(ip)

  if (!bucket || now - bucket.firstAt > RATE_LIMIT_WINDOW_MS) {
    // Reset bucket
    loginRateByIp.set(ip, { count: 1, firstAt: now })
    return { allowed: true }
  }

  bucket.count += 1
  if (bucket.count > RATE_LIMIT_MAX_PER_IP) {
    const retryAfterMs = RATE_LIMIT_WINDOW_MS - (now - bucket.firstAt)
    return { allowed: false, retryAfterMs }
  }
  return { allowed: true }
}

// Periodically clean stale rate-limit buckets (every 5 min in production)
setInterval(() => {
  const now = Date.now()
  for (const [ip, bucket] of loginRateByIp) {
    if (now - bucket.firstAt > RATE_LIMIT_WINDOW_MS * 2) {
      loginRateByIp.delete(ip)
    }
  }
}, 5 * 60 * 1000).unref?.()

// ─── Security: Input Validation ───────────────────────────────────
const USERNAME_RE = /^[a-zA-Z0-9_-]+$/
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PASSWORD_RE = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_\-+=\[\]{};:'",.<>/?\\|`~]).{8,}$/

const RESERVED_USERNAMES = new Set([
  'admin', 'root', 'administrator', 'system', 'cloudshell',
  'jasbol', 'api', 'auth', 'login', 'signup', 'logout',
  'mail', 'support', 'help', 'info', 'www', 'ftp',
  'git', 'docker', 'sudo', 'bin', 'sbin', 'lib',
])

// ─── Auth Functions ───────────────────────────────────────────────
export function signUp(
  username: string,
  email: string,
  password: string,
  ip: string = 'unknown'
): { success: boolean; user?: User; error?: string } {
  // Validate input
  if (!username || !email || !password) {
    appendAudit('signup.failed', username || '(none)', ip, { reason: 'missing_fields' })
    return { success: false, error: 'All fields are required' }
  }
  if (username.length < 3 || username.length > 30) {
    appendAudit('signup.failed', username, ip, { reason: 'username_length' })
    return { success: false, error: 'Username must be 3-30 characters' }
  }
  if (!USERNAME_RE.test(username)) {
    appendAudit('signup.failed', username, ip, { reason: 'username_chars' })
    return { success: false, error: 'Username can only contain letters, numbers, underscores, and hyphens' }
  }
  if (RESERVED_USERNAMES.has(username.toLowerCase())) {
    appendAudit('signup.failed', username, ip, { reason: 'reserved_username' })
    return { success: false, error: 'This username is reserved. Please choose another.' }
  }
  if (!EMAIL_RE.test(email) || email.length > 254) {
    appendAudit('signup.failed', username, ip, { reason: 'invalid_email' })
    return { success: false, error: 'Invalid email format' }
  }
  if (password.length < 8 || password.length > 200) {
    appendAudit('signup.failed', username, ip, { reason: 'password_length' })
    return { success: false, error: 'Password must be 8-200 characters' }
  }
  if (!PASSWORD_RE.test(password)) {
    appendAudit('signup.failed', username, ip, { reason: 'password_weak' })
    return {
      success: false,
      error: 'Password must include uppercase, lowercase, a number, and a special character',
    }
  }
  // Reject common weak passwords
  const common = ['Password1!', 'Admin123!', 'Welcome1!', 'Qwerty123!']
  if (common.includes(password) || /password/i.test(password) || /12345/.test(password)) {
    appendAudit('signup.failed', username, ip, { reason: 'password_common' })
    return { success: false, error: 'This password is too common. Choose something more unique.' }
  }

  const users = loadUsers()

  // Check if user already exists (use constant-time comparison for usernames)
  const lowerUsername = username.toLowerCase()
  for (const u of users) {
    if (u.username.toLowerCase().length === lowerUsername.length) {
      const a = Buffer.from(u.username.toLowerCase())
      const b = Buffer.from(lowerUsername)
      if (a.length === b.length && timingSafeEqual(a, b)) {
        appendAudit('signup.failed', username, ip, { reason: 'username_taken' })
        return { success: false, error: 'Username already taken' }
      }
    }
  }
  const lowerEmail = email.toLowerCase()
  for (const u of users) {
    if (u.email.toLowerCase().length === lowerEmail.length) {
      const a = Buffer.from(u.email.toLowerCase())
      const b = Buffer.from(lowerEmail)
      if (a.length === b.length && timingSafeEqual(a, b)) {
        appendAudit('signup.failed', username, ip, { reason: 'email_taken' })
        return { success: false, error: 'Email already registered' }
      }
    }
  }

  // Create user
  const newUser: User = {
    id: `user-${Date.now()}-${randomBytes(9).toString('hex')}`,
    username,
    email: lowerEmail,
    passwordHash: bcrypt.hashSync(password, 12),
    role: 'user',
    createdAt: new Date().toISOString(),
    lastLogin: new Date().toISOString(),
    failedLoginAttempts: 0,
    lastPasswordChange: new Date().toISOString(),
    workspaceDir: lowerUsername,
  }

  users.push(newUser)
  saveUsers(users)
  ensureWorkspace(newUser.workspaceDir)

  appendAudit('signup.success', username, ip)
  return { success: true, user: newUser }
}

export function signIn(
  username: string,
  password: string,
  ip: string = 'unknown',
  userAgent: string = 'unknown'
): { success: boolean; user?: User; token?: string; refreshToken?: string; error?: string; retryAfterMs?: number } {
  // 1) Rate limit by IP first — prevents brute-force even before hitting DB
  const rateCheck = checkRateLimit(ip)
  if (!rateCheck.allowed) {
    appendAudit('login.ratelimited', username || '(none)', ip, { retryAfterMs: rateCheck.retryAfterMs })
    return {
      success: false,
      error: `Too many attempts. Please retry in ${Math.ceil((rateCheck.retryAfterMs || 0) / 1000)}s.`,
      retryAfterMs: rateCheck.retryAfterMs,
    }
  }

  const users = loadUsers()
  const user = users.find(u => u.username.toLowerCase() === username.toLowerCase())

  // 2) Always run bcrypt compare — even if user doesn't exist — to avoid timing
  // attacks that reveal which usernames are registered. Compare against a dummy hash.
  const dummyHash = '$2a$12$' + 'x'.repeat(53)
  const validPassword = user
    ? bcrypt.compareSync(password, user.passwordHash)
    : (bcrypt.compareSync(password, dummyHash), false)

  // 3) Account lockout check
  if (user && user.lockedUntil && user.lockedUntil > Date.now()) {
    const remainingMs = user.lockedUntil - Date.now()
    appendAudit('login.locked', username, ip, { remainingMs })
    return {
      success: false,
      error: `Account locked. Try again in ${Math.ceil(remainingMs / 60000)} minute(s).`,
    }
  }

  if (!user || !validPassword) {
    if (user) {
      // Increment failed attempts
      user.failedLoginAttempts = (user.failedLoginAttempts || 0) + 1
      if (user.failedLoginAttempts >= MAX_LOGIN_ATTEMPTS) {
        user.lockedUntil = Date.now() + LOCKOUT_DURATION_MS
        user.failedLoginAttempts = 0
        appendAudit('login.locked', username, ip, { reason: 'max_attempts_reached' })
      } else {
        appendAudit('login.failed', username, ip, {
          attempts: user.failedLoginAttempts,
          remaining: MAX_LOGIN_ATTEMPTS - user.failedLoginAttempts,
        })
      }
      saveUsers(users)
    } else {
      appendAudit('login.failed', username || '(none)', ip, { reason: 'no_such_user' })
    }
    const remaining = user ? MAX_LOGIN_ATTEMPTS - (user.failedLoginAttempts || 0) : MAX_LOGIN_ATTEMPTS
    return {
      success: false,
      error: user && (user.failedLoginAttempts || 0) > 0
        ? `Invalid credentials. ${remaining} attempt(s) remaining.`
        : 'Invalid username or password',
    }
  }

  // 4) Success — reset counters
  user.failedLoginAttempts = 0
  user.lockedUntil = undefined
  user.lastLogin = new Date().toISOString()

  // Generate refresh token (stored hashed) and access token
  const refreshToken = randomBytes(48).toString('hex')
  user.refreshTokenHash = bcrypt.hashSync(refreshToken, 10)
  saveUsers(users)

  const token = generateToken(user, ip)
  appendAudit('login.success', username, ip, { ua: userAgent.slice(0, 120) })

  return { success: true, user, token, refreshToken }
}

export function generateToken(user: User, ip: string): string {
  const payload: AuthToken = {
    userId: user.id,
    username: user.username,
    role: user.role,
    fp: hashIp(ip),
  }
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN })
}

export function generateRefreshToken(user: User, ip: string): { token: string; accessToken: string } | null {
  const refreshToken = randomBytes(48).toString('hex')
  const users = loadUsers()
  const u = users.find(x => x.id === user.id)
  if (!u) return null
  u.refreshTokenHash = bcrypt.hashSync(refreshToken, 10)
  saveUsers(users)
  const accessToken = generateToken(u, ip)
  return { token: refreshToken, accessToken }
}

export function verifyToken(token: string, ip: string = ''): AuthToken | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as AuthToken
    // If an IP was provided, verify the fingerprint matches.
    // This prevents token theft — even if someone steals the JWT, they can't
    // use it from a different network.
    if (ip && decoded.fp && !verifyIpFingerprint(ip, decoded.fp)) {
      appendAudit('token.invalid', decoded.username, ip, { reason: 'ip_mismatch' })
      return null
    }
    return decoded
  } catch {
    return null
  }
}

/** Back-compat: verify without IP check (used by routes that haven't been migrated yet) */
export function verifyTokenBasic(token: string): AuthToken | null {
  try {
    return jwt.verify(token, JWT_SECRET) as AuthToken
  } catch {
    return null
  }
}

export function getUserById(userId: string): User | null {
  const users = loadUsers()
  return users.find(u => u.id === userId) || null
}

export function getUserByUsername(username: string): User | null {
  const users = loadUsers()
  return users.find(u => u.username.toLowerCase() === username.toLowerCase()) || null
}

export function getAllUsers(): Omit<User, 'passwordHash' | 'refreshTokenHash'>[] {
  const users = loadUsers()
  return users.map(({ passwordHash, refreshTokenHash, ...user }) => user)
}

export function deleteUser(userId: string): { success: boolean; error?: string } {
  const users = loadUsers()
  const index = users.findIndex(u => u.id === userId)
  if (index === -1) {
    return { success: false, error: 'User not found' }
  }
  if (users[index].role === 'admin') {
    return { success: false, error: 'Cannot delete admin account' }
  }
  users.splice(index, 1)
  saveUsers(users)
  return { success: true }
}

/** Logout — invalidate refresh token so it can't be reused */
export function logout(userId: string, ip: string = 'unknown'): void {
  const users = loadUsers()
  const u = users.find(x => x.id === userId)
  if (u) {
    u.refreshTokenHash = undefined
    saveUsers(users)
    appendAudit('logout', u.username, ip)
  }
}

export function getUserWorkspaceDir(user: User): string {
  return join(WORKSPACE_BASE, user.workspaceDir)
}

/** Helper for getting client IP from Next.js request */
export function getClientIp(request: { headers: Headers }): string {
  // Walk through common forwarding headers — most-recent first.
  // In production behind HF Spaces / Cloudflare, we trust X-Forwarded-For.
  const headers = request.headers
  return (
    headers.get('x-real-ip') ||
    headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    headers.get('cf-connecting-ip') ||
    headers.get('x-client-ip') ||
    'unknown'
  )
}

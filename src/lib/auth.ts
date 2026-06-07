import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

// ─── Configuration ────────────────────────────────────────────────
const JWT_SECRET = process.env.JWT_SECRET || 'jasbol-hack-super-secret-key-2026-secure'
const JWT_EXPIRES_IN = '7d'
const USERS_DIR = process.env.USERS_DIR || join(process.env.APP_HOME || process.env.HOME || '/home/z', '.jasbol-users')
const USERS_FILE = join(USERS_DIR, 'users.json')

// ─── Workspace Base ───────────────────────────────────────────────
// User workspaces are stored under WORKSPACE_BASE/username
// In Docker: /home/cloudshell/workspaces/username
// In Z.ai dev: /home/z/my-project/workspaces/username
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
}

export interface AuthToken {
  userId: string
  username: string
  role: 'admin' | 'user'
}

// ─── User Storage ─────────────────────────────────────────────────
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
      workspaceDir: 'adminmughal03',
    }
    saveUsers([adminUser])
    // Create admin workspace
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
        workspaceDir: 'adminmughal03',
      })
      saveUsers(users)
    }
    // Ensure all user workspaces exist
    for (const user of users) {
      ensureWorkspace(user.workspaceDir)
    }
    return users
  } catch {
    return []
  }
}

function saveUsers(users: User[]) {
  ensureUsersDir()
  writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf-8')
}

function ensureWorkspace(workspaceDir: string) {
  const fullPath = join(WORKSPACE_BASE, workspaceDir)
  if (!existsSync(fullPath)) {
    mkdirSync(fullPath, { recursive: true })
  }
}

// ─── Auth Functions ───────────────────────────────────────────────
export function signUp(username: string, email: string, password: string): { success: boolean; user?: User; error?: string } {
  const users = loadUsers()

  // Validate input
  if (!username || !email || !password) {
    return { success: false, error: 'All fields are required' }
  }
  if (username.length < 3) {
    return { success: false, error: 'Username must be at least 3 characters' }
  }
  if (password.length < 6) {
    return { success: false, error: 'Password must be at least 6 characters' }
  }
  if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
    return { success: false, error: 'Username can only contain letters, numbers, underscores, and hyphens' }
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { success: false, error: 'Invalid email format' }
  }

  // Check if user already exists
  if (users.some(u => u.username.toLowerCase() === username.toLowerCase())) {
    return { success: false, error: 'Username already taken' }
  }
  if (users.some(u => u.email.toLowerCase() === email.toLowerCase())) {
    return { success: false, error: 'Email already registered' }
  }

  // Create user
  const newUser: User = {
    id: `user-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    username,
    email: email.toLowerCase(),
    passwordHash: bcrypt.hashSync(password, 12),
    role: 'user',
    createdAt: new Date().toISOString(),
    lastLogin: new Date().toISOString(),
    workspaceDir: username.toLowerCase(),
  }

  users.push(newUser)
  saveUsers(users)

  // Create user workspace directory
  ensureWorkspace(newUser.workspaceDir)

  return { success: true, user: newUser }
}

export function signIn(username: string, password: string): { success: boolean; user?: User; token?: string; error?: string } {
  const users = loadUsers()

  const user = users.find(u => u.username.toLowerCase() === username.toLowerCase())
  if (!user) {
    return { success: false, error: 'Invalid username or password' }
  }

  const validPassword = bcrypt.compareSync(password, user.passwordHash)
  if (!validPassword) {
    return { success: false, error: 'Invalid username or password' }
  }

  // Update last login
  user.lastLogin = new Date().toISOString()
  saveUsers(users)

  // Generate JWT
  const token = generateToken(user)

  return { success: true, user, token }
}

export function generateToken(user: User): string {
  const payload: AuthToken = {
    userId: user.id,
    username: user.username,
    role: user.role,
  }
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN })
}

export function verifyToken(token: string): AuthToken | null {
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

export function getAllUsers(): Omit<User, 'passwordHash'>[] {
  const users = loadUsers()
  return users.map(({ passwordHash, ...user }) => user)
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

export function getUserWorkspaceDir(user: User): string {
  return join(WORKSPACE_BASE, user.workspaceDir)
}

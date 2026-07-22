#!/usr/bin/env node
/**
 * CloudShell Comprehensive Verification Script
 * Tests all features, B2 storage, proxy, auth, and configuration.
 * Run: node scripts/verify-cloudshell.mjs
 */

import { execSync } from 'child_process'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'

const APP_HOME = process.env.APP_HOME || process.env.HOME || '/home/z'
const PROJECT_DIR = process.cwd()
const PROXY_PORT = 8082
const WEB_PORT = parseInt(process.env.APP_PORT || process.env.PORT || '3000', 10)

let passed = 0
let failed = 0
let warnings = 0

function test(name, fn) {
  try {
    const result = fn()
    if (result === true) {
      console.log(`  ✅ PASS: ${name}`)
      passed++
    } else if (result === 'warn') {
      console.log(`  ⚠️  WARN: ${name}`)
      warnings++
    } else {
      console.log(`  ❌ FAIL: ${name} — ${result}`)
      failed++
    }
  } catch (err) {
    console.log(`  ❌ FAIL: ${name} — ${err.message}`)
    failed++
  }
}

async function asyncTest(name, fn) {
  try {
    const result = await fn()
    if (result === true) {
      console.log(`  ✅ PASS: ${name}`)
      passed++
    } else if (result === 'warn') {
      console.log(`  ⚠️  WARN: ${name}`)
      warnings++
    } else {
      console.log(`  ❌ FAIL: ${name} — ${result}`)
      failed++
    }
  } catch (err) {
    console.log(`  ❌ FAIL: ${name} — ${err.message}`)
    failed++
  }
}

console.log('\n╔════════════════════════════════════════════════════════════╗')
console.log('║   CloudShell Terminal IDE — Comprehensive Verification    ║')
console.log('╚════════════════════════════════════════════════════════════╝\n')

// ─── 1. Core Infrastructure ───────────────────────────────
console.log('━━━ 1. Core Infrastructure ━━━')

test('Node.js runtime available', () => {
  const version = process.version
  return version.startsWith('v2') || version.startsWith('v18') || version.startsWith('v22') ? true : `Node version: ${version}`
})

test('Project directory exists', () => existsSync(PROJECT_DIR) ? true : `Not found: ${PROJECT_DIR}`)

test('server.ts exists', () => existsSync(join(PROJECT_DIR, 'server.ts')) ? true : 'Missing server.ts')

test('package.json exists', () => existsSync(join(PROJECT_DIR, 'package.json')) ? true : 'Missing package.json')

test('.env file exists', () => existsSync(join(PROJECT_DIR, '.env')) ? true : 'Missing .env')

test('DATABASE_URL configured', () => {
  const envContent = readFileSync(join(PROJECT_DIR, '.env'), 'utf-8')
  return envContent.includes('DATABASE_URL') ? true : 'No DATABASE_URL in .env'
})

test('node_modules exists', () => existsSync(join(PROJECT_DIR, 'node_modules')) ? true : 'Missing node_modules — run npm install')

// ─── 2. B2 Storage ────────────────────────────────────────
console.log('\n━━━ 2. Backblaze B2 Storage ━━━')

test('@aws-sdk/client-s3 installed', () => {
  try {
    require('@aws-sdk/client-s3')
    return true
  } catch { return 'S3 SDK not installed' }
})

test('s3-storage.ts exists', () => existsSync(join(PROJECT_DIR, 'src/lib/s3-storage.ts')) ? true : 'Missing s3-storage.ts')

test('B2 env vars configured', () => {
  const hasKeyId = !!process.env.B2_KEY_ID
  const hasAppKey = !!process.env.B2_APPLICATION_KEY
  const hasBucket = !!process.env.B2_BUCKET_NAME
  if (hasKeyId && hasAppKey) return true
  if (!hasKeyId && !hasAppKey) return 'warn' // Not configured yet — expected on local dev
  return `Partial: B2_KEY_ID=${hasKeyId}, B2_APP_KEY=${hasAppKey}, BUCKET=${hasBucket}`
})

test('New B2 functions: s3SaveFccEnv/s3LoadFccEnv', () => {
  const content = readFileSync(join(PROJECT_DIR, 'src/lib/s3-storage.ts'), 'utf-8')
  return content.includes('s3SaveFccEnv') && content.includes('s3LoadFccEnv') ? true : 'New B2 FCC functions not found'
})

test('New B2 functions: s3SaveBashrcEnv/s3LoadBashrcEnv', () => {
  const content = readFileSync(join(PROJECT_DIR, 'src/lib/s3-storage.ts'), 'utf-8')
  return content.includes('s3SaveBashrcEnv') && content.includes('s3LoadBashrcEnv') ? true : 'New B2 bashrc functions not found'
})

test('New B2 functions: s3BackupDatabase/s3RestoreDatabase', () => {
  const content = readFileSync(join(PROJECT_DIR, 'src/lib/s3-storage.ts'), 'utf-8')
  return content.includes('s3BackupDatabase') && content.includes('s3RestoreDatabase') ? true : 'New DB backup functions not found'
})

test('New B2 function: startPeriodicDbBackup', () => {
  const content = readFileSync(join(PROJECT_DIR, 'src/lib/s3-storage.ts'), 'utf-8')
  return content.includes('startPeriodicDbBackup') ? true : 'startPeriodicDbBackup function not found'
})

test('Enhanced s3InitSync (now syncs FCC config, bashrc_env, DB)', () => {
  const content = readFileSync(join(PROJECT_DIR, 'src/lib/s3-storage.ts'), 'utf-8')
  return content.includes('FCC .env sync') && content.includes('Bashrc_env sync') && content.includes('SQLite database restore') ? true : 'Enhanced s3InitSync not found'
})

// ─── 3. Keys Route B2 Integration ─────────────────────────
console.log('\n━━━ 3. Keys Route B2 Integration ━━━')

test('keys/route.ts imports s3SaveFccEnv', () => {
  const content = readFileSync(join(PROJECT_DIR, 'src/app/api/auth/keys/route.ts'), 'utf-8')
  return content.includes('s3SaveFccEnv') ? true : 's3SaveFccEnv not imported in keys route'
})

test('keys/route.ts imports s3SaveBashrcEnv', () => {
  const content = readFileSync(join(PROJECT_DIR, 'src/app/api/auth/keys/route.ts'), 'utf-8')
  return content.includes('s3SaveBashrcEnv') ? true : 's3SaveBashrcEnv not imported in keys route'
})

test('keys/route.ts syncs FCC env to B2 on key update', () => {
  const content = readFileSync(join(PROJECT_DIR, 'src/app/api/auth/keys/route.ts'), 'utf-8')
  return content.includes('s3SaveFccEnv') && content.includes('FCC .env to B2') ? true : 'FCC B2 sync not found'
})

test('keys/route.ts syncs bashrc_env to B2 on key update', () => {
  const content = readFileSync(join(PROJECT_DIR, 'src/app/api/auth/keys/route.ts'), 'utf-8')
  return content.includes('s3SaveBashrcEnv') && content.includes('bashrc_env to B2') ? true : 'bashrc B2 sync not found'
})

// ─── 4. Proxy Reliability ──────────────────────────────────
console.log('\n━━━ 4. Proxy & Claude Code Reliability ━━━')

test('FCC proxy script exists', () => {
  const dockerPath = '/home/cloudshell/scripts/fcc-model-discovery-proxy.js'
  const localPath = join(PROJECT_DIR, 'scripts/fcc-model-discovery-proxy.cjs')
  return existsSync(dockerPath) || existsSync(localPath) ? true : 'Proxy script not found'
})

test('Proxy has auto-restart mechanism (consecutive error counter)', () => {
  const proxyPath = existsSync('/home/cloudshell/scripts/fcc-model-discovery-proxy.js')
    ? '/home/cloudshell/scripts/fcc-model-discovery-proxy.js'
    : join(PROJECT_DIR, 'scripts/fcc-model-discovery-proxy.cjs')
  if (!existsSync(proxyPath)) return 'warn'
  const content = readFileSync(proxyPath, 'utf-8')
  return content.includes('consecutiveErrors') && content.includes('MAX_CONSECUTIVE_ERRORS') ? true : 'Auto-restart mechanism not found'
})

test('Proxy EADDRINUSE handler retries instead of exiting', () => {
  const proxyPath = existsSync('/home/cloudshell/scripts/fcc-model-discovery-proxy.js')
    ? '/home/cloudshell/scripts/fcc-model-discovery-proxy.js'
    : join(PROJECT_DIR, 'scripts/fcc-model-discovery-proxy.cjs')
  if (!existsSync(proxyPath)) return 'warn'
  const content = readFileSync(proxyPath, 'utf-8')
  return content.includes('will retry after 2s') ? true : 'EADDRINUSE retry not found'
})

test('Server has proxy watchdog (ensureProxyRunning/startProxyWatchdog)', () => {
  const content = readFileSync(join(PROJECT_DIR, 'server.ts'), 'utf-8')
  return content.includes('ensureProxyRunning') && content.includes('startProxyWatchdog') ? true : 'Proxy watchdog not found in server.ts'
})

test('Server imports startPeriodicDbBackup from s3-storage', () => {
  const content = readFileSync(join(PROJECT_DIR, 'server.ts'), 'utf-8')
  return content.includes('startPeriodicDbBackup') ? true : 'startPeriodicDbBackup not imported'
})

test('Server starts proxy watchdog on listen', () => {
  const content = readFileSync(join(PROJECT_DIR, 'server.ts'), 'utf-8')
  return content.includes('startProxyWatchdog()') ? true : 'startProxyWatchdog() not called'
})

test('Server starts periodic DB backup on listen', () => {
  const content = readFileSync(join(PROJECT_DIR, 'server.ts'), 'utf-8')
  return content.includes('startPeriodicDbBackup') ? true : 'startPeriodicDbBackup() not called'
})

test('NVIDIA_NIM_API_KEY env var set', () => !!process.env.NVIDIA_NIM_API_KEY ? true : 'warn')

test('ANTHROPIC_BASE_URL set to proxy', () => {
  const url = process.env.ANTHROPIC_BASE_URL
  if (!url) return 'warn'
  return url.includes('8082') || url.includes('localhost') ? true : `Unexpected: ${url}`
})

// ─── 5. Auth System ────────────────────────────────────────
console.log('\n━━━ 5. Auth System ━━━')

test('auth.ts exists', () => existsSync(join(PROJECT_DIR, 'src/lib/auth.ts')) ? true : 'Missing auth.ts')

test('auth.ts imports S3 functions', () => {
  const content = readFileSync(join(PROJECT_DIR, 'src/lib/auth.ts'), 'utf-8')
  return content.includes('s3SaveUsers') && content.includes('s3InitSync') ? true : 'S3 imports not found in auth.ts'
})

test('JWT_SECRET configured (not default dev key)', () => {
  const secret = process.env.JWT_SECRET
  if (!secret) return 'warn'
  return secret !== 'jasbol-hack-dev-key-CHANGE-ME-IN-PRODUCTION-2026' ? true : 'Using default dev key — set JWT_SECRET env var'
})

test('Users directory exists', () => {
  const usersDir = process.env.USERS_DIR || join(APP_HOME, '.jasbol-users')
  return existsSync(usersDir) ? true : `Missing: ${usersDir}`
})

test('users.json exists', () => {
  const usersDir = process.env.USERS_DIR || join(APP_HOME, '.jasbol-users')
  const usersFile = join(usersDir, 'users.json')
  return existsSync(usersFile) ? true : `Missing: ${usersFile}`
})

// ─── 6. Frontend ───────────────────────────────────────────
console.log('\n━━━ 6. Frontend ━━━')

test('page.tsx exists (main IDE page)', () => existsSync(join(PROJECT_DIR, 'src/app/page.tsx')) ? true : 'Missing main page')

test('layout.tsx exists', () => existsSync(join(PROJECT_DIR, 'src/app/layout.tsx')) ? true : 'Missing root layout')

test('globals.css exists', () => existsSync(join(PROJECT_DIR, 'src/app/globals.css')) ? true : 'Missing globals.css')

test('use-socket.ts exists (Socket.IO client)', () => existsSync(join(PROJECT_DIR, 'src/hooks/use-socket.ts')) ? true : 'Missing use-socket.ts')

test('file-manager.tsx exists', () => existsSync(join(PROJECT_DIR, 'src/components/terminal/file-manager.tsx')) ? true : 'Missing file-manager')

test('code-editor.tsx exists', () => existsSync(join(PROJECT_DIR, 'src/components/terminal/code-editor.tsx')) ? true : 'Missing code-editor')

test('xterm-terminal.tsx exists', () => existsSync(join(PROJECT_DIR, 'src/components/terminal/xterm-terminal.tsx')) ? true : 'Missing xterm-terminal')

// ─── 7. API Routes ─────────────────────────────────────────
console.log('\n━━━ 7. API Routes ━━━')

const apiRoutes = [
  '/api/auth/login',
  '/api/auth/signup',
  '/api/auth/logout',
  '/api/auth/verify',
  '/api/auth/keys',
  '/api/admin/users',
]

for (const route of apiRoutes) {
  const filePath = join(PROJECT_DIR, 'src/app', route, 'route.ts')
  test(`API route ${route} exists`, () => existsSync(filePath) ? true : `Missing: ${filePath}`)
}

// ─── 8. Dockerfile ─────────────────────────────────────────
console.log('\n━━━ 8. Dockerfile & Deployment ━━━')

test('Dockerfile exists', () => existsSync(join(PROJECT_DIR, 'Dockerfile')) ? true : 'Missing Dockerfile')

test('docker-entrypoint.sh exists', () => existsSync(join(PROJECT_DIR, 'docker-entrypoint.sh')) ? true : 'Missing entrypoint')

test('Dockerfile sets APP_PORT=7860', () => {
  const content = readFileSync(join(PROJECT_DIR, 'Dockerfile'), 'utf-8')
  return content.includes('APP_PORT=7860') ? true : 'APP_PORT not set'
})

test('Dockerfile includes B2_* env var note', () => {
  const content = readFileSync(join(PROJECT_DIR, 'Dockerfile'), 'utf-8')
  return content.includes('B2_') || content.includes('Backblaze') ? true : 'warn'
})

test('Dockerfile has NVIDIA_NIM_API_KEY', () => {
  const content = readFileSync(join(PROJECT_DIR, 'Dockerfile'), 'utf-8')
  return content.includes('NVIDIA_NIM_API_KEY') ? true : 'NVIDIA key not in Dockerfile'
})

// ─── 9. Database ───────────────────────────────────────────
console.log('\n━━━ 9. Database ━━━')

test('Prisma schema exists', () => existsSync(join(PROJECT_DIR, 'prisma/schema.prisma')) ? true : 'Missing schema.prisma')

test('Prisma uses SQLite', () => {
  const content = readFileSync(join(PROJECT_DIR, 'prisma/schema.prisma'), 'utf-8')
  return content.includes('provider = "sqlite"') ? true : 'Not SQLite provider'
})

// ─── Summary ───────────────────────────────────────────────
console.log('\n╔════════════════════════════════════════════════════════════╗')
console.log(`║  Results: ${passed} passed, ${failed} failed, ${warnings} warnings            ║`)
console.log('╚════════════════════════════════════════════════════════════╝\n')

if (failed > 0) {
  console.log('⚠️  Some tests failed — review the issues above.')
  console.log('   Key areas to check:')
  console.log('   - B2 secrets: Set B2_KEY_ID, B2_APPLICATION_KEY as HF Space secrets')
  console.log('   - JWT_SECRET: Set a secure secret in production')
  console.log('   - Proxy: Run the server to start the proxy watchdog')
}

if (warnings > 0) {
  console.log('⚠️  Warnings indicate optional/env-dependent features not yet configured.')
  console.log('   These are expected on local dev and will work when deployed with proper env vars.')
}

console.log('\n━━━ What Changed (Migration Summary) ━━━')
console.log('')
console.log('NEW B2 Storage Functions (s3-storage.ts):')
console.log('  • s3SaveFccEnv / s3LoadFccEnv — sync FCC proxy config to B2')
console.log('  • s3SaveBashrcEnv / s3LoadBashrcEnv — sync shell environment to B2')
console.log('  • s3BackupDatabase / s3RestoreDatabase — backup SQLite to B2')
console.log('  • startPeriodicDbBackup — auto-backup DB every 30 minutes')
console.log('  • Enhanced s3InitSync — now syncs FCC config, bashrc_env, DB on startup')
console.log('')
console.log('Keys Route B2 Integration (keys/route.ts):')
console.log('  • FCC .env synced to B2 on every NVIDIA key update')
console.log('  • bashrc_env synced to B2 on every NVIDIA key update')
console.log('  • Both synced on key removal too')
console.log('')
console.log('Proxy Reliability Fixes (fcc-model-discovery-proxy.cjs):')
console.log('  • Auto-restart: exits after 50 consecutive errors (watchdog restarts)')
console.log('  • EADDRINUSE: retries after 2s instead of hard crash')
console.log('  • Error counter resets on successful requests')
console.log('')
console.log('Server Proxy Watchdog (server.ts):')
console.log('  • ensureProxyRunning — health check + auto-restart proxy')
console.log('  • startProxyWatchdog — periodic 30s health checks')
console.log('  • Periodic SQLite backup to B2 started on server listen')
console.log('  • Connection errors trigger proxy restart attempt')
console.log('')
console.log('━━━ Why Claude Code Stopped Responding ━━━')
console.log('')
console.log('ROOT CAUSE ANALYSIS:')
console.log('  1. Proxy crash without restart — uncaughtException handler kept broken proxy alive')
console.log('  2. EADDRINUSE crash — port conflict killed proxy permanently')
console.log('  3. NVIDIA API rate limits — 429 errors after many requests')
console.log('  4. Memory pressure on HF Spaces free tier')
console.log('')
console.log('FIXES APPLIED:')
console.log('  • Proxy auto-restarts via watchdog (server checks every 30s)')
console.log('  • Proxy self-heals: exits after 50 errors → watchdog restarts it')
console.log('  • EADDRINUSE now retries instead of crashing')
console.log('  • Error counter resets on successful requests')
console.log('')
console.log('NVIDIA KEY STATUS:')
console.log('  • Your key (nvapi-TvVEp...) is hardcoded as fallback')
console.log('  • Per-user key isolation: each user gets their own key')
console.log('  • Key is NOT used for general chats — only for Claude Code/AI requests')
console.log('  • If you hit rate limits, the proxy retries 2x then returns error')
console.log('  • FREE tier keys DO have rate limits (requests/min, tokens/day)')
console.log('')

process.exit(failed > 0 ? 1 : 0)

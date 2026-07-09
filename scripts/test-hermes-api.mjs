// Quick smoke test for the Hermes API endpoints.
// Starts the Next.js dev server, waits for it to come up, then pings:
//   1. /api/agents/hermes/config (no token) → should be 401
//   2. /api/agents/hermes/chat (no token)   → should be 401
//   3. Login as admin → get token → GET /config → should return models
//   4. POST /chat with bogus message → should hit upstream (may 502 if key is invalid)
//
// Run with: node scripts/test-hermes-api.mjs
import { spawn } from 'child_process'
import { setTimeout as sleep } from 'timers/promises'

const BASE = 'http://localhost:3000'

async function fetchJson(path, opts = {}) {
  const res = await fetch(BASE + path, opts)
  let body
  try { body = await res.json() } catch { body = null }
  return { status: res.status, body }
}

async function waitForServer(timeoutMs = 60000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      const r = await fetch(BASE + '/api/health').catch(() => null)
      if (r && r.ok) return true
      // /api/health might not exist — try /api/auth/verify which should return 401
      const r2 = await fetch(BASE + '/api/auth/verify').catch(() => null)
      if (r2 && (r2.status === 401 || r2.status === 200)) return true
    } catch {}
    await sleep(1000)
  }
  throw new Error(`Server didn't come up in ${timeoutMs}ms`)
}

async function main() {
  console.log('─ Starting Next.js dev server…')
  const server = spawn('npx', ['next', 'dev', '-p', '3000'], {
    cwd: '/home/z/my-project',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, NODE_ENV: 'development' },
  })
  server.stdout.pipe(process.stdout)
  server.stderr.pipe(process.stderr)

  try {
    console.log('─ Waiting for server…')
    await waitForServer()
    console.log('✓ Server is up')

    // 1) GET /api/agents/hermes/config without token → 401
    let r = await fetchJson('/api/agents/hermes/config')
    console.log(`Test 1 — GET /config (no token): status=${r.status} ${r.status === 401 ? '✓' : '✗'}`)

    // 2) POST /api/agents/hermes/chat without token → 401
    r = await fetchJson('/api/agents/hermes/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'opencode/mimo-v2.5-free', messages: [{ role: 'user', content: 'hi' }] }),
    })
    console.log(`Test 2 — POST /chat (no token): status=${r.status} ${r.status === 401 ? '✓' : '✗'}`)

    // 3) Login as admin
    r = await fetchJson('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'adminmughal03', password: 'adminumair0302' }),
    })
    console.log(`Test 3 — login as admin: status=${r.status}, success=${r.body?.success}`)
    if (!r.body?.success || !r.body?.token) {
      console.log('  ✗ Login failed — aborting')
      console.log('  body:', JSON.stringify(r.body))
      return
    }
    const token = r.body.token
    console.log(`  ✓ Got token (${token.length} chars)`)

    // 4) GET /config with token → should return 6 models
    r = await fetchJson('/api/agents/hermes/config', {
      headers: { Authorization: `Bearer ${token}` },
    })
    console.log(`Test 4 — GET /config (admin token): status=${r.status}`)
    if (r.body?.success) {
      console.log(`  ✓ isAdmin=${r.body.config.isAdmin}, keyConfigured=${r.body.config.keyConfigured}`)
      console.log(`  ✓ keySource=${r.body.config.keySource}`)
      console.log(`  ✓ models count=${r.body.models.length} (expected 6)`)
      r.body.models.forEach(m => console.log(`     - ${m.id} (${m.name})`))
    } else {
      console.log('  ✗ Failed:', JSON.stringify(r.body))
    }

    // 5) POST /chat — should attempt upstream call
    r = await fetchJson('/api/agents/hermes/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        model: 'opencode/mimo-v2.5-free',
        messages: [{ role: 'user', content: 'Say hello in one short sentence.' }],
        stream: false,
      }),
    })
    console.log(`Test 5 — POST /chat (admin token): status=${r.status}`)
    if (r.body?.success) {
      console.log('  ✓ Upstream responded — chat proxy works!')
      // Print first 200 chars of upstream data
      const data = r.body.data
      console.log('  upstream keys:', Object.keys(data || {}))
    } else {
      console.log('  Response:', r.body?.error || '(no error message)')
      console.log('  (This may be expected if the API key is rate-limited or upstream is down)')
    }

    console.log('\n─ Smoke test complete')
  } finally {
    server.kill('SIGTERM')
    await sleep(2000)
    server.kill('SIGKILL')
  }
}

main().catch(e => {
  console.error('Smoke test failed:', e)
  process.exit(1)
})

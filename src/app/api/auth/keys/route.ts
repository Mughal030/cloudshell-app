import { NextRequest, NextResponse } from 'next/server'
import { verifyTokenBasic, setUserApiKey, setUserPreferredProvider, getUserApiKeys, getUserById } from '@/lib/auth'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { execSync, spawn } from 'child_process'

// ─── FCC Proxy Integration ─────────────────────────────────────
// When a user saves their NVIDIA API key via the Settings panel,
// we need to update the fcc proxy's .env file AND restart the proxy
// so it picks up the new key. Without this, the proxy still uses
// the old/empty key and returns HTTP 503.
//
// CRITICAL: The fcc-server uses pydantic-settings which reads env vars
// with HIGHER priority than ~/.fcc/.env. So we MUST pass the key as
// an env var when starting the server, not just write it to the file.
//
// The restart must be robust because:
// 1. The old server might not die on first kill attempt
// 2. nohup ... & inside execSync may not properly detach
// 3. We need to verify the new server is healthy before returning

const APP_HOME = process.env.APP_HOME || '/home/cloudshell'
const FCC_ENV_PATH = join(APP_HOME, '.fcc', '.env')
const FCC_PID_PATH = join(APP_HOME, '.fcc', 'fcc-server.pid')

/** Update a variable in ~/.fcc/.env — mirrors _fcc_update_env from entrypoint */
function updateFccEnv(key: string, value: string) {
  try {
    const dir = join(APP_HOME, '.fcc')
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })

    let content = ''
    if (existsSync(FCC_ENV_PATH)) {
      content = readFileSync(FCC_ENV_PATH, 'utf-8')
      // Remove existing line with this key
      const lines = content.split('\n').filter(line => !line.startsWith(`${key}=`))
      content = lines.join('\n').trimEnd() + '\n'
    }
    // Append new value
    content += `${key}="${value}"\n`
    writeFileSync(FCC_ENV_PATH, content, 'utf-8')
    console.log(`[FCC] Updated ${key} in ${FCC_ENV_PATH}`)
  } catch (err) {
    console.error(`[FCC] Failed to update ${key} in .env:`, err)
  }
}

/** Kill process using ports 8082 and 8083 — tries multiple methods for robustness */
function killPort8082(): boolean {
  let killed = false

  // Method 0: Kill model-discovery proxy by name
  try {
    execSync('pkill -9 -f fcc-model-discovery-proxy 2>/dev/null', { encoding: 'utf-8', timeout: 5000 })
    console.log('[FCC] Killed fcc-model-discovery-proxy processes via pkill')
    killed = true
  } catch {}

  // Method 1: Use PID file if it exists (for fcc-server on 8083)
  try {
    if (existsSync(FCC_PID_PATH)) {
      const pid = readFileSync(FCC_PID_PATH, 'utf-8').trim()
      if (pid && /^\d+$/.test(pid)) {
        try {
          process.kill(parseInt(pid), 9)
          console.log(`[FCC] Killed fcc-server PID ${pid} from PID file`)
          killed = true
        } catch (e: any) {
          if (e.code === 'ESRCH') {
            console.log(`[FCC] PID ${pid} already dead (from PID file)`)
            killed = true
          } else {
            console.warn(`[FCC] Failed to kill PID ${pid}:`, e.message)
          }
        }
      }
      // Clean up PID file
      try { writeFileSync(FCC_PID_PATH, '', 'utf-8') } catch {}
    }
  } catch (err) {
    console.warn('[FCC] PID file method failed:', err)
  }

  // Method 2: Use fuser on both ports
  for (const port of ['8082', '8083']) {
    try {
      execSync(`fuser -k ${port}/tcp 2>/dev/null`, { encoding: 'utf-8', timeout: 5000 })
      console.log(`[FCC] Killed process on port ${port} via fuser`)
      killed = true
    } catch {}
  }

  // Method 3: Use lsof on both ports (backup)
  for (const port of ['8082', '8083']) {
    try {
      const pids = execSync(`lsof -ti:${port} 2>/dev/null`, { encoding: 'utf-8', timeout: 5000 }).trim()
      if (pids) {
        for (const pid of pids.split('\n')) {
          const p = pid.trim()
          if (p && /^\d+$/.test(p)) {
            try {
              process.kill(parseInt(p), 9)
              console.log(`[FCC] Killed PID ${p} on port ${port} via lsof`)
              killed = true
            } catch {}
          }
        }
      }
    } catch {}
  }

  // Method 4: pkill by name
  try {
    execSync('pkill -9 -f fcc-server 2>/dev/null', { encoding: 'utf-8', timeout: 5000 })
    console.log('[FCC] Killed fcc-server processes via pkill')
    killed = true
  } catch {
    // No matching process
  }

  return killed
}

/** Wait for ports 8082 and 8083 to be free (no process listening) */
function waitForPortFree(maxWaitMs: number = 8000): boolean {
  const start = Date.now()
  while (Date.now() - start < maxWaitMs) {
    try {
      // Try to connect — if it fails, port is free
      execSync('bash -c "echo >/dev/tcp/localhost/8082" 2>/dev/null && bash -c "echo >/dev/tcp/localhost/8083" 2>/dev/null', { timeout: 1000 })
      // At least one port still in use, wait
    } catch {
      // Connection refused = at least one port is free — check both
      try {
        execSync('bash -c "echo >/dev/tcp/localhost/8082" 2>/dev/null', { timeout: 500 })
      } catch {
        try {
          execSync('bash -c "echo >/dev/tcp/localhost/8083" 2>/dev/null', { timeout: 500 })
        } catch {
          // Both ports free!
          return true
        }
      }
    }
    // Wait 500ms before retry
    execSync('sleep 0.5', { timeout: 2000 })
  }
  console.warn('[FCC] Ports 8082/8083 still in use after waiting — proceeding anyway')
  return false
}

/** Start fcc-server with the given NVIDIA API key as an env var */
function startFccServer(nvidiaKey: string): boolean {
  // Find fcc-server binary — check common install locations
  const fccPaths = [
    '/usr/local/bin/fcc-server',
    '/home/cloudshell/.local/bin/fcc-server',
    '/root/.local/bin/fcc-server',
    join(APP_HOME, '.local/bin/fcc-server'),
  ]
  let fccBin = 'fcc-server' // fallback to PATH
  for (const p of fccPaths) {
    if (existsSync(p)) { fccBin = p; break }
  }

  const keySuffix = nvidiaKey ? nvidiaKey.slice(-4) : 'EMPTY'
  console.log(`[FCC] Starting fcc-server (${fccBin}) with NVIDIA key ****${keySuffix}`)

  // Write a self-daemonizing wrapper script that properly detaches.
  // We can't use `setsid bash script` because setsid blocks until child exits.
  // Instead, the script double-forks to fully detach from the parent process.
  const startScript = join(APP_HOME, '.fcc', 'start-fcc.sh')
  const scriptContent = `#!/bin/bash
# FCC server start script — double-fork to fully detach from parent process.
# This ensures the proxy keeps running even after the Next.js API call returns.
cd ${APP_HOME}

# Source bashrc_env to pick up other env vars like PATH
source /home/cloudshell/.bashrc_env 2>/dev/null || true

export NVIDIA_NIM_API_KEY="${nvidiaKey.replace(/"/g, '\\"')}"
export PORT=8083
export FCC_OPEN_BROWSER=false

# Kill any leftover processes on ports 8082 and 8083 (race condition protection)
fuser -k 8083/tcp 2>/dev/null || true
fuser -k 8082/tcp 2>/dev/null || true
pkill -f fcc-model-discovery-proxy 2>/dev/null || true
sleep 0.5

# Double-fork: start fcc-server on port 8083 (internal)
(
    nohup ${fccBin} > /tmp/fcc-server.log 2>&1 &
    PID=$!
    echo $PID > ${FCC_PID_PATH}
    disown $PID
    echo "fcc-server started with PID $PID on port 8083"
) &

# Wait for fcc-server to start
sleep 3

# Start model-discovery proxy on port 8082 (public)
if [ -f /home/cloudshell/scripts/fcc-model-discovery-proxy.js ]; then
    FCC_INTERNAL_PORT=8083 FCC_PROXY_PORT=8082 nohup node /home/cloudshell/scripts/fcc-model-discovery-proxy.js > /tmp/fcc-model-proxy.log 2>&1 &
    disown $!
    echo "Model discovery proxy started on port 8082"
fi

# Wait briefly for everything to be ready
sleep 1
echo "All proxy services started"
`
  try {
    writeFileSync(startScript, scriptContent, 'utf-8')
    execSync(`chmod +x ${startScript}`, { timeout: 2000 })
  } catch (err) {
    console.error('[FCC] Failed to write start script:', err)
    return false
  }

  // Execute the start script — the script double-forks so bash returns quickly.
  // Try as cloudshell user first (preferred), fall back to current user.
  try {
    // Try with gosu cloudshell (proper user context)
    const output = execSync(`gosu cloudshell bash ${startScript}`, {
      encoding: 'utf-8',
      timeout: 15000,
      shell: '/bin/bash',
    })
    console.log('[FCC] Start script output (gosu):', output.trim())
  } catch (err: any) {
    console.warn('[FCC] gosu start failed:', err.message?.substring(0, 200))
    // Fallback 1: Try as current user (may be root)
    try {
      const output = execSync(`bash ${startScript}`, {
        encoding: 'utf-8',
        timeout: 15000,
        shell: '/bin/bash',
      })
      console.log('[FCC] Start script output (direct):', output.trim())
    } catch (err2: any) {
      console.error('[FCC] Direct start also failed:', err2.message?.substring(0, 200))
      // Fallback 2: Try inline command
      try {
        execSync(
          `cd ${APP_HOME} && NVIDIA_NIM_API_KEY="${nvidiaKey.replace(/"/g, '\\"')}" PORT=8082 nohup ${fccBin} > /tmp/fcc-server.log 2>&1 & echo $! > ${FCC_PID_PATH}`,
          { encoding: 'utf-8', timeout: 10000, shell: '/bin/bash' }
        )
        console.log('[FCC] Inline start succeeded')
      } catch (err3: any) {
        console.error('[FCC] All start methods failed:', err3.message?.substring(0, 200))
        return false
      }
    }
  }

  return true
}

/** Wait for fcc-server to become healthy on port 8082 */
function waitForFccHealthy(maxWaitMs: number = 15000): boolean {
  const start = Date.now()
  while (Date.now() - start < maxWaitMs) {
    try {
      const health = execSync('curl -s http://localhost:8082/health', { encoding: 'utf-8', timeout: 3000 })
      if (health.includes('healthy')) {
        console.log('[FCC] Health check passed:', health.trim())
        return true
      }
    } catch {
      // Not ready yet
    }
    // Wait 1 second before retry
    try { execSync('sleep 1', { timeout: 2000 }) } catch {}
  }
  console.warn('[FCC] Health check timed out after', maxWaitMs, 'ms')
  return false
}

/** Restart the fcc-server process so it picks up the new NVIDIA key */
function restartFccProxy(nvidiaKey?: string) {
  console.log('[FCC] === Starting proxy restart sequence ===')

  // Step 1: Kill existing fcc-server
  console.log('[FCC] Step 1: Killing existing fcc-server...')
  killPort8082()

  // Step 2: Wait for port to be freed
  console.log('[FCC] Step 2: Waiting for port 8082 to be freed...')
  waitForPortFree(8000)

  // Step 3: Get NVIDIA key from .env if not provided
  const keyToUse = nvidiaKey !== undefined ? nvidiaKey : (() => {
    try {
      const fccEnv = existsSync(FCC_ENV_PATH) ? readFileSync(FCC_ENV_PATH, 'utf-8') : ''
      return fccEnv.match(/NVIDIA_NIM_API_KEY="([^"]*)"/)?.[1] || ''
    } catch {
      return ''
    }
  })()

  // Step 4: Update the .env file with the key
  updateFccEnv('NVIDIA_NIM_API_KEY', keyToUse)

  // Step 5: Also update process.env so that new terminal sessions spawned by server.ts
  // get the key immediately without waiting for the next container restart
  if (keyToUse) {
    process.env.NVIDIA_NIM_API_KEY = keyToUse
    console.log(`[FCC] Updated process.env.NVIDIA_NIM_API_KEY = ****${keyToUse.slice(-4)}`)
  } else {
    delete process.env.NVIDIA_NIM_API_KEY
    console.log('[FCC] Cleared process.env.NVIDIA_NIM_API_KEY')
  }

  // Step 6: Start new fcc-server with key as env var
  console.log('[FCC] Step 3: Starting new fcc-server...')
  const started = startFccServer(keyToUse)
  if (!started) {
    console.error('[FCC] ❌ Failed to start fcc-server!')
    return
  }

  // Step 7: Wait and verify health
  console.log('[FCC] Step 4: Waiting for fcc-server to become healthy...')
  const healthy = waitForFccHealthy(20000)

  if (healthy) {
    console.log('[FCC] ✅ Proxy restart complete — fcc-server is healthy')
    // Verify the running proxy process actually has the key in its environment
    try {
      const pidFile = readFileSync(FCC_PID_PATH, 'utf-8').trim()
      if (pidFile && /^\d+$/.test(pidFile)) {
        const proxyEnv = execSync(`tr '\\0' '\\n' < /proc/${pidFile}/environ 2>/dev/null | grep '^NVIDIA_NIM_API_KEY=' || echo 'NOT_FOUND'`, { encoding: 'utf-8', timeout: 3000 })
        if (proxyEnv.includes('NVIDIA_NIM_API_KEY=') && !proxyEnv.includes('NOT_FOUND')) {
          const proxyKey = proxyEnv.replace('NVIDIA_NIM_API_KEY=', '').trim()
          console.log(`[FCC] ✅ Verified: proxy process has NVIDIA key ****${proxyKey.slice(-4)}`)
        } else {
          console.warn('[FCC] ⚠️ Proxy process does NOT have NVIDIA_NIM_API_KEY in env — proxy may return 503')
        }
      }
    } catch (err) {
      console.warn('[FCC] Could not verify proxy env:', err)
    }
    // Quick test: verify the key actually works by checking if the proxy
    // can connect to NVIDIA (optional, non-blocking)
    try {
      const testResult = execSync(
        `curl -s -w "\\n%{http_code}" -X POST http://localhost:8082/v1/messages ` +
        `-H "Content-Type: application/json" ` +
        `-H "x-api-key: fcc-no-auth" ` +
        `-H "anthropic-version: 2023-06-01" ` +
        `-d '{"model":"nvidia/nemotron-3-super-120b-a12b","messages":[{"role":"user","content":"hi"}],"max_tokens":5,"stream":false}' ` +
        `--connect-timeout 5 --max-time 20 2>&1`,
        { encoding: 'utf-8', timeout: 25000 }
      )
      const httpCode = testResult.trim().split('\n').pop()
      if (httpCode === '200') {
        console.log('[FCC] ✅ NVIDIA API test passed — key is working!')
      } else {
        console.warn('[FCC] ⚠ NVIDIA API test returned HTTP', httpCode, '— key may be invalid or rate-limited')
      }
    } catch (err) {
      console.warn('[FCC] ⚠ NVIDIA API test failed (non-fatal):', err)
    }
  } else {
    console.error('[FCC] ❌ Proxy restart failed — fcc-server not healthy after 20s')
    // Log the fcc-server output for debugging
    try {
      const log = readFileSync('/tmp/fcc-server.log', 'utf-8')
      console.error('[FCC] fcc-server log:', log.slice(-500))
    } catch {}
  }
}

export async function GET(request: NextRequest) {
  try {
    const token = request.headers.get('authorization')?.replace('Bearer ', '') ||
      request.cookies.get('jasbol-token')?.value ||
      request.cookies.get('__Host-jasbol-token')?.value

    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const decoded = verifyTokenBasic(token)
    if (!decoded) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
    }

    const keys = getUserApiKeys(decoded.userId)

    // Check if the fcc proxy is running and has the key
    let proxyRunning = false
    let proxyHasKey = false
    try {
      const health = execSync('curl -s http://localhost:8082/health', { encoding: 'utf-8', timeout: 3000 })
      proxyRunning = health.includes('healthy')
      if (proxyRunning && existsSync(FCC_PID_PATH)) {
        const pid = readFileSync(FCC_PID_PATH, 'utf-8').trim()
        if (pid && /^\d+$/.test(pid)) {
          const envCheck = execSync(`tr '\\0' '\\n' < /proc/${pid}/environ 2>/dev/null | grep '^NVIDIA_NIM_API_KEY=' || echo ''`, { encoding: 'utf-8', timeout: 2000 })
          proxyHasKey = envCheck.includes('NVIDIA_NIM_API_KEY=') && envCheck.replace('NVIDIA_NIM_API_KEY=', '').trim().length > 0
        }
      }
    } catch {
      // Proxy not running or not reachable
    }

    // Mask the keys for security — never return full keys
    return NextResponse.json({
      nvidiaApiKey: keys.nvidiaApiKey ? `${keys.nvidiaApiKey.substring(0, 8)}...${keys.nvidiaApiKey.slice(-4)}` : null,
      nvidiaKeySet: !!keys.nvidiaApiKey,
      openrouterApiKey: keys.openrouterApiKey ? `${keys.openrouterApiKey.substring(0, 8)}...${keys.openrouterApiKey.slice(-4)}` : null,
      openrouterKeySet: !!keys.openrouterApiKey,
      preferredProvider: keys.preferredProvider || 'none',
      proxyRunning,
      proxyHasKey,
    })
  } catch (error) {
    console.error('[API Keys GET] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const token = request.headers.get('authorization')?.replace('Bearer ', '') ||
      request.cookies.get('jasbol-token')?.value ||
      request.cookies.get('__Host-jasbol-token')?.value

    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const decoded = verifyTokenBasic(token)
    if (!decoded) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
    }

    const body = await request.json()
    const { provider, apiKey, preferredProvider } = body as {
      provider?: 'nvidia' | 'openrouter'
      apiKey?: string
      preferredProvider?: 'nvidia' | 'openrouter' | 'none'
    }

    if (provider && apiKey !== undefined) {
      // Special case: __RESTART_PROXY__ means "restart the proxy with the user's existing key"
      if (apiKey === '__RESTART_PROXY__' && provider === 'nvidia') {
        const existingKeys = getUserApiKeys(decoded.userId)
        const keyToUse = existingKeys.nvidiaApiKey || ''
        if (!keyToUse) {
          return NextResponse.json({ error: 'No NVIDIA key saved — save a key first before restarting the proxy' }, { status: 400 })
        }
        console.log(`[API Keys] Proxy restart requested by user ${decoded.username} — using existing key ****${keyToUse.slice(-4)}`)
        updateFccEnv('NVIDIA_NIM_API_KEY', keyToUse)
        // Update bashrc_env
        try {
          const bashrcEnvPath = join(APP_HOME, '.bashrc_env')
          if (existsSync(bashrcEnvPath)) {
            let bashrcContent = readFileSync(bashrcEnvPath, 'utf-8')
            const lines = bashrcContent.split('\n').filter(line => !line.startsWith('export NVIDIA_NIM_API_KEY='))
            lines.push(`export NVIDIA_NIM_API_KEY="${keyToUse}"`)
            writeFileSync(bashrcEnvPath, lines.join('\n'), 'utf-8')
          }
        } catch {}
        // Restart in background
        setTimeout(() => {
          try { restartFccProxy(keyToUse) } catch (err) { console.error('[FCC] Background restart failed:', err) }
        }, 100)
        return NextResponse.json({ success: true, message: 'Proxy restart initiated — it will be ready in ~5 seconds' })
      }

      // Validate key format
      if (apiKey && provider === 'nvidia' && !apiKey.startsWith('nvapi-')) {
        return NextResponse.json({ error: 'NVIDIA API keys must start with "nvapi-"' }, { status: 400 })
      }
      if (apiKey && provider === 'openrouter' && !apiKey.startsWith('sk-or-')) {
        return NextResponse.json({ error: 'OpenRouter API keys must start with "sk-or-"' }, { status: 400 })
      }
      const result = setUserApiKey(decoded.userId, provider, apiKey)
      if (!result.success) {
        return NextResponse.json({ error: result.error }, { status: 400 })
      }

      // ─── FCC Proxy: Update .env and restart when NVIDIA key changes ───
      if (provider === 'nvidia') {
        console.log(`[API Keys] NVIDIA key updated for user ${decoded.username} — updating fcc proxy`)
        // Update ~/.fcc/.env with the new NVIDIA key
        updateFccEnv('NVIDIA_NIM_API_KEY', apiKey || '')
        // Also update ~/.bashrc_env so new terminal sessions get the key
        try {
          const bashrcEnvPath = join(APP_HOME, '.bashrc_env')
          if (existsSync(bashrcEnvPath)) {
            let bashrcContent = readFileSync(bashrcEnvPath, 'utf-8')
            const lines = bashrcContent.split('\n').filter(line => !line.startsWith('export NVIDIA_NIM_API_KEY='))
            if (apiKey) {
              lines.push(`export NVIDIA_NIM_API_KEY="${apiKey}"`)
            }
            writeFileSync(bashrcEnvPath, lines.join('\n'), 'utf-8')
            console.log('[FCC] Updated NVIDIA_NIM_API_KEY in ~/.bashrc_env')
          }
        } catch (err) {
          console.warn('[FCC] Failed to update ~/.bashrc_env:', err)
        }
        // Restart the fcc proxy so it picks up the new key
        // Pass the key directly so the restart uses it as env var (highest priority)
        // Run in background so the API response isn't blocked for 20+ seconds
        const keyForRestart = apiKey || ''
        setTimeout(() => {
          try {
            restartFccProxy(keyForRestart)
          } catch (err) {
            console.error('[FCC] Background restart failed:', err)
          }
        }, 100)
      }
    }

    if (preferredProvider) {
      const result = setUserPreferredProvider(decoded.userId, preferredProvider)
      if (!result.success) {
        return NextResponse.json({ error: result.error }, { status: 400 })
      }
    }

    return NextResponse.json({ success: true, message: 'API key updated' })
  } catch (error) {
    console.error('[API Keys POST] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const token = request.headers.get('authorization')?.replace('Bearer ', '') ||
      request.cookies.get('jasbol-token')?.value ||
      request.cookies.get('__Host-jasbol-token')?.value

    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const decoded = verifyTokenBasic(token)
    if (!decoded) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
    }

    const body = await request.json()
    const { provider } = body as { provider: 'nvidia' | 'openrouter' }

    if (provider) {
      setUserApiKey(decoded.userId, provider, '')
    }

    // ─── FCC Proxy: Clear key from .env when deleted ───
    if (provider === 'nvidia') {
      console.log(`[API Keys] NVIDIA key removed for user ${decoded.username} — updating fcc proxy`)
      updateFccEnv('NVIDIA_NIM_API_KEY', '')
      // Remove from ~/.bashrc_env too
      try {
        const bashrcEnvPath = join(APP_HOME, '.bashrc_env')
        if (existsSync(bashrcEnvPath)) {
          let bashrcContent = readFileSync(bashrcEnvPath, 'utf-8')
          const lines = bashrcContent.split('\n').filter(line => !line.startsWith('export NVIDIA_NIM_API_KEY='))
          writeFileSync(bashrcEnvPath, lines.join('\n'), 'utf-8')
        }
      } catch {}
      // Restart in background (clear key)
      setTimeout(() => {
        try { restartFccProxy('') } catch (err) { console.error('[FCC] Background restart failed:', err) }
      }, 100)
    }

    return NextResponse.json({ success: true, message: 'API key removed' })
  } catch (error) {
    console.error('[API Keys DELETE] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

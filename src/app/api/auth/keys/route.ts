import { NextRequest, NextResponse } from 'next/server'
import { verifyTokenBasic, setUserApiKey, setUserPreferredProvider, getUserApiKeys, getUserById } from '@/lib/auth'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { execSync } from 'child_process'

// ─── FCC Proxy Integration ─────────────────────────────────────
// Architecture (v2 — Per-User Key Isolation):
//   Claude Code → localhost:8082 (full proxy) → NVIDIA NIM API
//
// The proxy on port 8082 is a full Anthropic→NVIDIA translator.
// It extracts the per-user NVIDIA key from the request's x-api-key
// header (which Claude Code sets from ANTHROPIC_AUTH_TOKEN).
//
// Per-user key flow:
//   1. User saves key in Settings → stored in users.json per user
//   2. When terminal is created → user's key is set as ANTHROPIC_AUTH_TOKEN
//   3. When Claude Code makes requests → sends key as x-api-key header
//   4. Proxy extracts key from header → uses it to call NVIDIA API
//   5. Result: each user's requests use ONLY their own key — no leakage
//
// The proxy does NOT need restarting when keys change because
// keys are now per-request, not per-proxy-process.

const APP_HOME = process.env.APP_HOME || '/home/cloudshell'
const FCC_ENV_PATH = join(APP_HOME, '.fcc', '.env')

/** Update a variable in ~/.fcc/.env */
function updateFccEnv(key: string, value: string) {
  try {
    const dir = join(APP_HOME, '.fcc')
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })

    let content = ''
    if (existsSync(FCC_ENV_PATH)) {
      content = readFileSync(FCC_ENV_PATH, 'utf-8')
      const lines = content.split('\n').filter(line => !line.startsWith(`${key}=`))
      content = lines.join('\n').trimEnd() + '\n'
    }
    content += `${key}="${value}"\n`
    writeFileSync(FCC_ENV_PATH, content, 'utf-8')
  } catch (err) {
    console.error(`[FCC] Failed to update ${key} in .env:`, err)
  }
}

/** Restart just the model-discovery proxy on port 8082 (not fcc-server) */
function restartProxy(fallbackKey?: string) {
  console.log('[FCC] Restarting proxy on port 8082...')

  // Kill existing proxy on 8082
  try { execSync('pkill -f fcc-model-discovery-proxy 2>/dev/null', { timeout: 5000 }) } catch {}
  try { execSync('fuser -k 8082/tcp 2>/dev/null', { timeout: 5000 }) } catch {}
  try { execSync('sleep 0.5', { timeout: 2000 }) } catch {}

  // Start proxy with fallback key as env var
  const keyEnv = fallbackKey ? `NVIDIA_NIM_API_KEY="${fallbackKey.replace(/"/g, '\\"')}" ` : ''
  const modelEnv = `ANTHROPIC_MODEL="${process.env.ANTHROPIC_MODEL || 'claude-opus-4-5'}" `
  const proxyScript = '/home/cloudshell/scripts/fcc-model-discovery-proxy.js'

  // Try Docker path first, then local dev path
  const proxyPath = existsSync(proxyScript) ? proxyScript : join(process.cwd(), 'scripts', 'fcc-model-discovery-proxy.js')

  if (existsSync(proxyPath)) {
    try {
      execSync(
        `cd ${APP_HOME} && ${keyEnv}${modelEnv}FCC_PROXY_PORT=8082 nohup node ${proxyPath} > /tmp/fcc-model-proxy.log 2>&1 &`,
        { timeout: 5000, shell: '/bin/bash' }
      )
      console.log('[FCC] Proxy restart initiated')
    } catch (err) {
      console.error('[FCC] Proxy restart failed:', err)
    }
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

    // Check if the proxy is running
    let proxyRunning = false
    let userHasKey = !!keys.nvidiaApiKey
    try {
      const health = execSync('curl -s http://localhost:8082/health', { encoding: 'utf-8', timeout: 3000 })
      proxyRunning = health.includes('healthy')
    } catch {
      // Proxy not running
    }

    // Mask the keys for security — never return full keys
    return NextResponse.json({
      nvidiaApiKey: keys.nvidiaApiKey ? `${keys.nvidiaApiKey.substring(0, 8)}...${keys.nvidiaApiKey.slice(-4)}` : null,
      nvidiaKeySet: !!keys.nvidiaApiKey,
      openrouterApiKey: keys.openrouterApiKey ? `${keys.openrouterApiKey.substring(0, 8)}...${keys.openrouterApiKey.slice(-4)}` : null,
      openrouterKeySet: !!keys.openrouterApiKey,
      preferredProvider: keys.preferredProvider || 'none',
      proxyRunning,
      userHasKey,
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
      // Special case: __RESTART_PROXY__ means "restart the proxy"
      if (apiKey === '__RESTART_PROXY__' && provider === 'nvidia') {
        const existingKeys = getUserApiKeys(decoded.userId)
        const keyToUse = existingKeys.nvidiaApiKey || ''
        if (!keyToUse) {
          return NextResponse.json({ error: 'No NVIDIA key saved — save a key first before restarting the proxy' }, { status: 400 })
        }
        console.log(`[API Keys] Proxy restart requested by user ${decoded.username}`)
        // Update process.env for immediate effect on new terminal sessions
        process.env.NVIDIA_NIM_API_KEY = keyToUse
        // Restart proxy with fallback key
        setTimeout(() => {
          try { restartProxy(keyToUse) } catch (err) { console.error('[FCC] Proxy restart failed:', err) }
        }, 100)
        return NextResponse.json({ success: true, message: 'Proxy restart initiated' })
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

      // When NVIDIA key changes, update .env and process.env for immediate effect
      if (provider === 'nvidia') {
        console.log(`[API Keys] NVIDIA key updated for user ${decoded.username} — key: ****${(apiKey || '').slice(-4) || 'EMPTY'}`)

        // Update ~/.fcc/.env
        updateFccEnv('NVIDIA_NIM_API_KEY', apiKey || '')

        // Update ~/.bashrc_env so new terminal sessions get the key
        try {
          const bashrcEnvPath = join(APP_HOME, '.bashrc_env')
          if (existsSync(bashrcEnvPath)) {
            let bashrcContent = readFileSync(bashrcEnvPath, 'utf-8')
            const lines = bashrcContent.split('\n').filter(line => !line.startsWith('export NVIDIA_NIM_API_KEY='))
            if (apiKey) {
              lines.push(`export NVIDIA_NIM_API_KEY="${apiKey}"`)
            }
            writeFileSync(bashrcEnvPath, lines.join('\n'), 'utf-8')
          }
        } catch {}

        // Update process.env so new terminals get the key immediately
        if (apiKey) {
          process.env.NVIDIA_NIM_API_KEY = apiKey
        } else {
          delete process.env.NVIDIA_NIM_API_KEY
        }

        // No proxy restart needed — per-user keys are extracted from request headers
        // The proxy's fallback key is only used for users without a personal key
        // Still, update the proxy's fallback key for health checks and users without keys
        setTimeout(() => {
          try { restartProxy(apiKey || undefined) } catch (err) { console.error('[FCC] Proxy restart failed:', err) }
        }, 100)
      }
    }

    if (preferredProvider) {
      const result = setUserPreferredProvider(decoded.userId, preferredProvider)
      if (!result.success) {
        return NextResponse.json({ error: result.error }, { status: 400 })
      }
    }

    return NextResponse.json({ success: true, message: 'API key updated — per-user key isolation active' })
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

    if (provider === 'nvidia') {
      console.log(`[API Keys] NVIDIA key removed for user ${decoded.username}`)
      updateFccEnv('NVIDIA_NIM_API_KEY', '')
      // Remove from ~/.bashrc_env
      try {
        const bashrcEnvPath = join(APP_HOME, '.bashrc_env')
        if (existsSync(bashrcEnvPath)) {
          let bashrcContent = readFileSync(bashrcEnvPath, 'utf-8')
          const lines = bashrcContent.split('\n').filter(line => !line.startsWith('export NVIDIA_NIM_API_KEY='))
          writeFileSync(bashrcEnvPath, lines.join('\n'), 'utf-8')
        }
      } catch {}
    }

    return NextResponse.json({ success: true, message: 'API key removed' })
  } catch (error) {
    console.error('[API Keys DELETE] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { verifyTokenBasic, setUserApiKey, setUserPreferredProvider, getUserApiKeys, getUserById } from '@/lib/auth'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { execSync } from 'child_process'

// ─── FCC Proxy Integration ─────────────────────────────────────
// When a user saves their NVIDIA API key via the Settings panel,
// we need to update the fcc proxy's .env file AND restart the proxy
// so it picks up the new key. Without this, the proxy still uses
// the old/empty key and returns HTTP 503.

const APP_HOME = process.env.APP_HOME || process.env.HOME || '/home/z'
const FCC_ENV_PATH = join(APP_HOME, '.fcc', '.env')

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

/** Restart the fcc-server process so it picks up the new .env */
function restartFccProxy() {
  try {
    // Kill existing fcc-server on port 8082
    try {
      execSync('lsof -ti:8082 | xargs kill -9 2>/dev/null', { encoding: 'utf-8', timeout: 5000 })
      console.log('[FCC] Killed existing fcc-server on port 8082')
    } catch {
      // No process on port 8082 — that's fine
    }

    // Wait a moment for port to be released
    execSync('sleep 1', { timeout: 3000 })

    // Start fcc-server in background — use full path since the Next.js
    // server process may not have the cloudshell user's PATH
    const fccEnv = existsSync(FCC_ENV_PATH) ? readFileSync(FCC_ENV_PATH, 'utf-8') : ''
    const nvidiaKey = fccEnv.match(/NVIDIA_NIM_API_KEY="([^"]*)"/)?.[1] || ''

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

    execSync(
      `cd ${APP_HOME} && NVIDIA_NIM_API_KEY="${nvidiaKey}" PORT=8082 nohup ${fccBin} > /tmp/fcc-server.log 2>&1 &`,
      { encoding: 'utf-8', timeout: 10000, shell: '/bin/bash' }
    )
    console.log(`[FCC] Restarted fcc-server (${fccBin}) with updated NVIDIA key`)

    // Wait and verify health
    execSync('sleep 3', { timeout: 5000 })
    try {
      const health = execSync('curl -s http://localhost:8082/health', { encoding: 'utf-8', timeout: 5000 })
      console.log('[FCC] Health check after restart:', health.trim())
    } catch {
      console.warn('[FCC] Health check failed after restart — proxy may need more time')
    }
  } catch (err) {
    console.error('[FCC] Failed to restart fcc proxy:', err)
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
    // Mask the keys for security — never return full keys
    return NextResponse.json({
      nvidiaApiKey: keys.nvidiaApiKey ? `${keys.nvidiaApiKey.substring(0, 8)}...${keys.nvidiaApiKey.slice(-4)}` : null,
      nvidiaKeySet: !!keys.nvidiaApiKey,
      openrouterApiKey: keys.openrouterApiKey ? `${keys.openrouterApiKey.substring(0, 8)}...${keys.openrouterApiKey.slice(-4)}` : null,
      openrouterKeySet: !!keys.openrouterApiKey,
      preferredProvider: keys.preferredProvider || 'none',
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
        restartFccProxy()
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
      restartFccProxy()
    }

    return NextResponse.json({ success: true, message: 'API key removed' })
  } catch (error) {
    console.error('[API Keys DELETE] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

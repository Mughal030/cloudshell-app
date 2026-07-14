/**
 * FCC Model Discovery Proxy v4 — Thin Forwarding Layer
 *
 * Architecture (REVERTED to two-layer for reliability):
 *   Claude Code → localhost:8082 (this proxy)
 *                     │
 *                     ├── GET /v1/models → served locally (Claude-compatible model list)
 *                     │
 *                     └── POST /v1/messages → forwarded to fcc-server on localhost:8083
 *                                                  → fcc-server translates Anthropic↔NVIDIA
 *                                                  → NVIDIA NIM API (integrate.api.nvidia.com)
 *
 * WHY v4 (revert from v3):
 *   v3 went "direct-to-NVIDIA" with custom translation code that:
 *   - Stripped tool_use/tool_result blocks (lost context)
 *   - Flattened thinking blocks to plain text (confused the model)
 *   - Had poor streaming SSE translation (caused "ok ok ok" loops)
 *   fcc-server is a PROPER Python translator built specifically for
 *   Anthropic↔OpenAI format conversion. It handles tool calls,
 *   thinking blocks, streaming, etc. correctly. We just add /v1/models
 *   on top because fcc-server doesn't have that endpoint.
 *
 * Per-user key isolation:
 *   - The user's NVIDIA key is injected via the X-User-NVIDIA-Key header
 *     by server.ts when creating terminal sessions
 *   - Claude Code sends ANTHROPIC_AUTH_TOKEN as x-api-key header
 *   - This proxy passes the key to fcc-server which uses it for NVIDIA API calls
 *
 * Environment variables:
 *   FCC_PROXY_PORT     - Port where this proxy listens (default: 8082)
 *   FCC_SERVER_PORT    - Port where fcc-server listens (default: 8083)
 *   NVIDIA_NIM_API_KEY - Fallback NVIDIA API key
 *   ANTHROPIC_MODEL    - Default model (default: claude-opus-4-5)
 */

const http = require('http')

const FCC_PROXY_PORT = parseInt(process.env.FCC_PROXY_PORT || '8082', 10)
const FCC_SERVER_PORT = parseInt(process.env.FCC_SERVER_PORT || '8083', 10)
const FCC_SERVER_HOST = '127.0.0.1'
const DEFAULT_MODEL = process.env.ANTHROPIC_MODEL || 'claude-opus-4-5'
const FALLBACK_KEY = process.env.NVIDIA_NIM_API_KEY || ''

// ─── Claude-Compatible Model List ──────────────────────────────
// Model IDs start with "claude-" so Claude Code's discovery filter doesn't
// reject them. Each ID contains capability-triggering substrings.
// fcc-server maps these Claude IDs to real NVIDIA model IDs via its own config.
const CLAUDE_MODELS = [
  {
    id: 'claude-opus-4-5',
    display_name: 'GLM 5.2 (Opus)',
    nvidiaModel: 'z-ai/glm-5.2',
    description: 'Most capable model — best for complex tasks (NVIDIA NIM)',
    context_window: 16384,
    max_tokens: 16384,
    created_at: '2025-01-01',
  },
  {
    id: 'claude-sonnet-4-5',
    display_name: 'Llama 3.3 Nemotron Super 49B (Sonnet)',
    nvidiaModel: 'nvidia/llama-3.3-nemotron-super-49b-v1',
    description: 'Balanced performance and speed — recommended for most tasks',
    context_window: 4096,
    max_tokens: 4096,
    created_at: '2025-01-01',
  },
  {
    id: 'claude-sonnet-4-5-mini',
    display_name: 'Phi-4 (Sonnet Mini)',
    nvidiaModel: 'nvidia/phi-4',
    description: 'Fast and efficient — good for quick tasks',
    context_window: 4096,
    max_tokens: 4096,
    created_at: '2025-01-01',
  },
  {
    id: 'claude-opus-4',
    display_name: 'Nemotron 3 Super 120B (Opus)',
    nvidiaModel: 'nvidia/nemotron-3-super-120b-a12b',
    description: 'Large NVIDIA model — best for complex tasks',
    context_window: 4096,
    max_tokens: 4096,
    created_at: '2025-01-01',
  },
  {
    id: 'claude-sonnet-4',
    display_name: 'Llama 3.1 Nemotron 70B (Sonnet)',
    nvidiaModel: 'nvidia/llama-3.1-nemotron-70b-instruct',
    description: 'Balanced model for general use',
    context_window: 4096,
    max_tokens: 4096,
    created_at: '2025-01-01',
  },
  {
    id: 'claude-deepseek-r1',
    display_name: 'DeepSeek R1 (Reasoning)',
    nvidiaModel: 'deepseek-ai/deepseek-r1',
    description: 'DeepSeek reasoning model — best for math and logic',
    context_window: 4096,
    max_tokens: 4096,
    created_at: '2025-01-01',
  },
  {
    id: 'anthropic-mistral-large',
    display_name: 'Mistral Large 2411',
    nvidiaModel: 'nvidia/mistral-large-2411',
    description: 'Mistral Large via NVIDIA NIM',
    context_window: 4096,
    max_tokens: 4096,
    created_at: '2025-01-01',
  },
]

// ─── Extract NVIDIA API Key from Request ───────────────────
// Used to inject the per-user key into fcc-server's request
function extractNvidiaKey(req) {
  // 1. Check custom per-user header (set by server.ts when proxying)
  const customKey = req.headers['x-user-nvidia-key']
  if (customKey && typeof customKey === 'string' && customKey.startsWith('nvapi-')) return customKey

  // 2. Check x-api-key (Claude Code sends ANTHROPIC_AUTH_TOKEN here)
  const xApiKey = req.headers['x-api-key']
  if (xApiKey && typeof xApiKey === 'string' && xApiKey.startsWith('nvapi-')) return xApiKey

  // 3. Check Authorization header
  const authHeader = req.headers['authorization'] || ''
  if (typeof authHeader === 'string') {
    if (authHeader.startsWith('Bearer nvapi-')) return authHeader.replace('Bearer ', '')
    if (authHeader.startsWith('nvapi-')) return authHeader
  }

  // 4. No per-user key found — fcc-server will use its own default
  return null
}

// ─── Collect Request Body ──────────────────────────────
function collectBody(req) {
  return new Promise((resolve, reject) => {
    let body = []
    req.on('data', chunk => body.push(chunk))
    req.on('end', () => resolve(Buffer.concat(body)))
    req.on('error', reject)
  })
}

// ─── Forward request to fcc-server ──────────────────────
function forwardToFccServer(req, res, bodyBuffer) {
  return new Promise((resolve, reject) => {
    const rawUrl = req.url || '/'
    const method = req.method || 'GET'

    // Build headers for fcc-server — forward original headers but
    // inject the per-user NVIDIA key if available
    const forwardHeaders = { ...req.headers }
    delete forwardHeaders['host']
    delete forwardHeaders['connection']
    forwardHeaders['host'] = `${FCC_SERVER_HOST}:${FCC_SERVER_PORT}`

    // If we found a per-user NVIDIA key, inject it so fcc-server uses it
    const userKey = extractNvidiaKey(req)
    if (userKey) {
      // fcc-server reads the key from its config, but we can override
      // by setting the Authorization header to the NVIDIA key
      forwardHeaders['authorization'] = `Bearer ${userKey}`
      // Also set x-api-key for fcc-server to pick up
      forwardHeaders['x-api-key'] = userKey
    }

    const options = {
      hostname: FCC_SERVER_HOST,
      port: FCC_SERVER_PORT,
      path: rawUrl,
      method: method,
      headers: forwardHeaders,
      timeout: 300000, // 5 minutes — NVIDIA NIM can take 60+ seconds
    }

    const fccReq = http.request(options, (fccRes) => {
      // Stream the response back to the client as-is
      // fcc-server already speaks Anthropic API format, so no translation needed!
      res.writeHead(fccRes.statusCode, fccRes.headers)
      fccRes.pipe(res)
      fccRes.on('end', resolve)
      fccRes.on('error', reject)
    })

    fccReq.on('error', (err) => {
      console.error(`[FCC-Proxy] fcc-server connection error: ${err.code || err.message}`)
      if (!res.headersSent) {
        res.writeHead(502, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({
          type: 'error',
          error: {
            type: 'api_error',
            message: `fcc-server not reachable on port ${FCC_SERVER_PORT}. Is it running? (run: fcc-start)`,
          },
        }))
      }
      reject(err)
    })

    fccReq.on('timeout', () => {
      console.error(`[FCC-Proxy] fcc-server request timeout`)
      fccReq.destroy()
      if (!res.headersSent) {
        res.writeHead(504, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({
          type: 'error',
          error: { type: 'timeout_error', message: 'fcc-server request timed out.' },
        }))
      }
      reject(new Error('timeout'))
    })

    // Forward the request body
    if (bodyBuffer && bodyBuffer.length > 0) {
      fccReq.write(bodyBuffer)
    }
    fccReq.end()
  })
}

// ─── Main Request Handler ──────────────────────────────
async function handleRequest(req, res) {
  const rawUrl = req.url || '/'
  const method = req.method || 'GET'
  const urlPath = rawUrl.split('?')[0]

  // ─── Handle GET /v1/models (Claude Code model discovery) ────────
  // This is the ONLY endpoint we handle locally — everything else
  // gets forwarded to fcc-server which handles the proper translation.
  if ((urlPath === '/v1/models' || urlPath === '/models') && method === 'GET') {
    const response = {
      object: 'list',
      data: CLAUDE_MODELS.map(m => ({
        id: m.id,
        display_name: m.display_name,
        type: 'model',
        created_at: m.created_at,
        max_tokens: m.max_tokens,
      })),
      first_id: CLAUDE_MODELS[0]?.id || '',
      has_more: false,
      last_id: CLAUDE_MODELS[CLAUDE_MODELS.length - 1]?.id || '',
    }
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, x-api-key, anthropic-version, Authorization, X-User-NVIDIA-Key',
    })
    res.end(JSON.stringify(response))
    console.log(`[FCC-Proxy] GET /v1/models → ${CLAUDE_MODELS.length} models (Claude-compatible IDs)`)
    return
  }

  // ─── Handle CORS preflight ────────────────────────────────
  if (method === 'OPTIONS') {
    res.writeHead(200, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, x-api-key, anthropic-version, Authorization, X-User-NVIDIA-Key',
      'Access-Control-Max-Age': '86400',
    })
    res.end()
    return
  }

  // ─── Health check ──────────────────────────────────────────
  if (urlPath === '/health' && method === 'GET') {
    // Check if fcc-server is reachable
    let fccHealthy = false
    try {
      fccHealthy = await new Promise((resolve) => {
        const healthReq = http.get(`http://${FCC_SERVER_HOST}:${FCC_SERVER_PORT}/health`, (healthRes) => {
          resolve(healthRes.statusCode === 200)
        })
        healthReq.on('error', () => resolve(false))
        healthReq.setTimeout(3000, () => { healthReq.destroy(); resolve(false) })
      })
    } catch {}

    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({
      status: 'healthy',
      proxy: 'fcc-model-discovery-proxy-v4',
      architecture: 'two-layer (proxy → fcc-server → NVIDIA NIM)',
      fcc_server: fccHealthy ? 'running' : 'NOT RUNNING',
      fcc_server_port: FCC_SERVER_PORT,
      models_available: CLAUDE_MODELS.length,
      default_model: DEFAULT_MODEL,
      has_fallback_key: !!FALLBACK_KEY,
    }))
    return
  }

  // ─── Forward ALL other requests to fcc-server ──────────────────
  // This includes POST /v1/messages which fcc-server handles with
  // proper Anthropic↔OpenAI/NVIDIA translation (tool calls, thinking, etc.)
  try {
    const bodyBuffer = await collectBody(req)

    // Log the forwarded request
    if (urlPath === '/v1/messages' || urlPath === '/messages') {
      const userKey = extractNvidiaKey(req)
      const keySuffix = userKey ? userKey.slice(-4) : 'none'
      let bodyJson = {}
      try { bodyJson = JSON.parse(bodyBuffer.toString()) } catch {}
      console.log(`[FCC-Proxy] POST /v1/messages → fcc-server:${FCC_SERVER_PORT} (model: ${bodyJson.model || 'unknown'}, key: ****${keySuffix}, stream: ${bodyJson.stream ?? false})`)
    } else {
      console.log(`[FCC-Proxy] ${method} ${urlPath} → fcc-server:${FCC_SERVER_PORT}`)
    }

    await forwardToFccServer(req, res, bodyBuffer)
  } catch (err) {
    console.error(`[FCC-Proxy] Forward error: ${err.message}`)
    if (!res.headersSent) {
      res.writeHead(502, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({
        type: 'error',
        error: {
          type: 'api_error',
          message: 'Could not reach fcc-server. Please run: fcc-start',
        },
      }))
    }
  }
}

// ─── Start the proxy server ─────────────────────────────────
process.on('uncaughtException', (err) => {
  console.error('[FCC-Proxy] Uncaught exception (non-fatal):', err.message)
})
process.on('unhandledRejection', (reason) => {
  console.error('[FCC-Proxy] Unhandled rejection (non-fatal):', reason)
})

const server = http.createServer((req, res) => {
  handleRequest(req, res).catch(err => {
    console.error('[FCC-Proxy] Unhandled error:', err)
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ type: 'error', error: { type: 'api_error', message: 'Internal error' } }))
    }
  })
})

server.listen(FCC_PROXY_PORT, '0.0.0.0', () => {
  console.log(`[FCC-Proxy-v4] Listening on port ${FCC_PROXY_PORT}`)
  console.log(`[FCC-Proxy-v4] Architecture: two-layer (proxy → fcc-server → NVIDIA NIM)`)
  console.log(`[FCC-Proxy-v4] GET /v1/models → served locally (${CLAUDE_MODELS.length} Claude-compatible models)`)
  console.log(`[FCC-Proxy-v4] POST /v1/messages → forwarded to fcc-server on port ${FCC_SERVER_PORT}`)
  console.log(`[FCC-Proxy-v4] fcc-server handles proper Anthropic↔NVIDIA translation`)
  console.log(`[FCC-Proxy-v4] Default model: ${DEFAULT_MODEL}`)
  console.log(`[FCC-Proxy-v4] Model mapping (Claude ID → NVIDIA ID):`)
  for (const m of CLAUDE_MODELS) {
    console.log(`[FCC-Proxy-v4]   ${m.id.padEnd(28)} → ${m.nvidiaModel}`)
  }
  console.log(`[FCC-Proxy-v4] Per-user key isolation: ENABLED`)
  console.log(`[FCC-Proxy-v4] Endpoints: /v1/models (local), /v1/messages (→fcc-server), /health`)
  console.log(`[FCC-Proxy-v4] Fallback key: ${FALLBACK_KEY ? '****' + FALLBACK_KEY.slice(-4) : 'NONE'}`)
})

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`[FCC-Proxy-v4] Port ${FCC_PROXY_PORT} already in use!`)
    console.error(`[FCC-Proxy-v4] Kill the existing process: fuser -k ${FCC_PROXY_PORT}/tcp`)
    process.exit(1)
  }
  console.error(`[FCC-Proxy-v4] Server error:`, err)
  process.exit(1)
})

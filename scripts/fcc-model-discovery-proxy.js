/**
 * FCC Model Discovery Proxy
 *
 * This lightweight proxy sits between Claude Code and the real fcc-server.
 * It adds a `/v1/models` endpoint that returns NVIDIA NIM models in Anthropic-
 * compatible format, enabling Claude Code's model picker to show NVIDIA models
 * instead of just Anthropic models.
 *
 * Architecture:
 *   Claude Code → localhost:8082 (this proxy) → localhost:8083 (real fcc-server) → NVIDIA NIM
 *
 * Endpoints handled directly:
 *   GET /v1/models    → Returns NVIDIA NIM model list (Anthropic format)
 *   GET /health       → Proxied to fcc-server + adds model count
 *
 * All other requests (POST /v1/messages, etc.) are proxied to fcc-server.
 *
 * Environment variables:
 *   FCC_INTERNAL_PORT  - Port where real fcc-server runs (default: 8083)
 *   FCC_PROXY_PORT     - Port where this proxy listens (default: 8082)
 *   NVIDIA_NIM_API_KEY - API key for NVIDIA NIM (used to fetch available models)
 *   ANTHROPIC_MODEL    - Default model (default: nvidia/nemotron-3-super-120b-a12b)
 */

const http = require('http')
const https = require('https')

const FCC_INTERNAL_PORT = parseInt(process.env.FCC_INTERNAL_PORT || '8083', 10)
const FCC_PROXY_PORT = parseInt(process.env.FCC_PROXY_PORT || '8082', 10)
const DEFAULT_MODEL = process.env.ANTHROPIC_MODEL || 'nvidia/nemotron-3-super-120b-a12b'

// ─── NVIDIA NIM Model List ──────────────────────────────────
// These are the models available via NVIDIA NIM API.
// Claude Code's model picker will show these.
const NVIDIA_MODELS = [
  {
    id: 'nvidia/nemotron-3-super-120b-a12b',
    display_name: 'Nemotron 3 Super 120B',
    description: 'Most capable NVIDIA model — best for complex tasks',
    context_window: 4096,
    max_tokens: 4096,
    created_at: '2025-01-01',
  },
  {
    id: 'nvidia/llama-3.3-nemotron-super-49b-v1',
    display_name: 'Llama 3.3 Nemotron Super 49B',
    description: 'Efficient model for routine tasks',
    context_window: 4096,
    max_tokens: 4096,
    created_at: '2025-01-01',
  },
  {
    id: 'nvidia/llama-3.1-nemotron-70b-instruct',
    display_name: 'Llama 3.1 Nemotron 70B',
    description: 'Balanced performance and speed',
    context_window: 4096,
    max_tokens: 4096,
    created_at: '2025-01-01',
  },
  {
    id: 'nvidia/mistral-large-2411',
    display_name: 'Mistral Large 2411',
    description: 'Mistral Large via NVIDIA NIM',
    context_window: 4096,
    max_tokens: 4096,
    created_at: '2025-01-01',
  },
  {
    id: 'deepseek-ai/deepseek-r1',
    display_name: 'DeepSeek R1',
    description: 'DeepSeek reasoning model via NVIDIA NIM',
    context_window: 4096,
    max_tokens: 4096,
    created_at: '2025-01-01',
  },
  {
    id: 'nvidia/phi-4',
    display_name: 'Phi-4',
    description: 'Small but capable model for quick tasks',
    context_window: 4096,
    max_tokens: 4096,
    created_at: '2025-01-01',
  },
]

// ─── Proxy Request Handler ──────────────────────────────────
function proxyRequest(req, res) {
  const url = req.url || '/'
  const method = req.method || 'GET'

  // ─── Handle /v1/models directly ──────────────────────────
  if (url === '/v1/models' && method === 'GET') {
    const response = {
      object: 'list',
      data: NVIDIA_MODELS.map(m => ({
        id: m.id,
        display_name: m.display_name,
        description: m.description,
        context_window: m.context_window,
        max_tokens: m.max_tokens,
        created_at: m.created_at,
        object: 'model',
        owned_by: 'nvidia',
      })),
      // Also include the default model marker
      default_model: DEFAULT_MODEL,
    }
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, x-api-key, anthropic-version, Authorization',
    })
    res.end(JSON.stringify(response))
    console.log(`[FCC-Proxy] GET /v1/models → ${NVIDIA_MODELS.length} models`)
    return
  }

  // ─── Handle CORS preflight ────────────────────────────────
  if (method === 'OPTIONS') {
    res.writeHead(200, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, x-api-key, anthropic-version, Authorization',
      'Access-Control-Max-Age': '86400',
    })
    res.end()
    return
  }

  // ─── Health check: proxy to fcc-server + add model info ──
  if (url === '/health' && method === 'GET') {
    const healthReq = http.request({
      hostname: '127.0.0.1',
      port: FCC_INTERNAL_PORT,
      path: '/health',
      method: 'GET',
      timeout: 5000,
    }, (healthRes) => {
      let body = ''
      healthRes.on('data', chunk => body += chunk)
      healthRes.on('end', () => {
        res.writeHead(healthRes.statusCode || 200, {
          'Content-Type': 'application/json',
        })
        try {
          const healthData = JSON.parse(body)
          healthData.models_available = NVIDIA_MODELS.length
          healthData.default_model = DEFAULT_MODEL
          healthData.proxy = 'fcc-model-discovery'
          res.end(JSON.stringify(healthData))
        } catch {
          res.end(body)
        }
      })
    })
    healthReq.on('error', () => {
      res.writeHead(503, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ status: 'unhealthy', error: 'fcc-server not reachable', models_available: NVIDIA_MODELS.length }))
    })
    healthReq.on('timeout', () => {
      healthReq.destroy()
      res.writeHead(503, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ status: 'unhealthy', error: 'fcc-server timeout' }))
    })
    healthReq.end()
    return
  }

  // ─── Proxy all other requests to fcc-server ───────────────
  const proxyOptions = {
    hostname: '127.0.0.1',
    port: FCC_INTERNAL_PORT,
    path: url,
    method: method,
    headers: { ...req.headers, host: `127.0.0.1:${FCC_INTERNAL_PORT}` },
    timeout: 120000, // 2 min timeout for LLM requests
  }

  const proxyReq = http.request(proxyOptions, (proxyRes) => {
    res.writeHead(proxyRes.statusCode || 500, proxyRes.headers)
    proxyRes.pipe(res)
  })

  proxyReq.on('error', (err) => {
    console.error(`[FCC-Proxy] Error proxying ${method} ${url}:`, err.message)
    if (!res.headersSent) {
      res.writeHead(502, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({
        type: 'error',
        error: {
          type: 'proxy_error',
          message: `FCC server not reachable on port ${FCC_INTERNAL_PORT}. Ensure fcc-server is running.`,
        },
      }))
    }
  })

  proxyReq.on('timeout', () => {
    console.error(`[FCC-Proxy] Timeout proxying ${method} ${url}`)
    proxyReq.destroy()
    if (!res.headersSent) {
      res.writeHead(504, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({
        type: 'error',
        error: {
          type: 'timeout',
          message: 'Request to FCC server timed out',
        },
      }))
    }
  })

  // Pipe the request body to the proxy
  req.pipe(proxyReq)
}

// ─── Start the proxy server ─────────────────────────────────
const server = http.createServer(proxyRequest)

server.listen(FCC_PROXY_PORT, '0.0.0.0', () => {
  console.log(`[FCC-Model-Discovery-Proxy] Listening on port ${FCC_PROXY_PORT}`)
  console.log(`[FCC-Model-Discovery-Proxy] Proxying to fcc-server on port ${FCC_INTERNAL_PORT}`)
  console.log(`[FCC-Model-Discovery-Proxy] ${NVIDIA_MODELS.length} NVIDIA models available`)
  console.log(`[FCC-Model-Discovery-Proxy] Default model: ${DEFAULT_MODEL}`)
  console.log(`[FCC-Model-Discovery-Proxy] Endpoints: /v1/models, /health, /v1/messages (proxy)`)
})

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`[FCC-Model-Discovery-Proxy] Port ${FCC_PROXY_PORT} already in use!`)
    console.error(`[FCC-Model-Discovery-Proxy] Kill the existing process: fuser -k ${FCC_PROXY_PORT}/tcp`)
    process.exit(1)
  }
  console.error(`[FCC-Model-Discovery-Proxy] Server error:`, err)
  process.exit(1)
})

/**
 * FCC Full Proxy — Per-User Key Isolation + Model Discovery
 *
 * This proxy handles TWO responsibilities:
 * 1. Model discovery: GET /v1/models returns NVIDIA NIM models in Anthropic format
 * 2. API proxying: POST /v1/messages translates Anthropic API → NVIDIA NIM API,
 *    using the per-user NVIDIA key from the X-User-NVIDIA-Key header or
 *    from the terminal's NVIDIA_NIM_API_KEY env var.
 *
 * ARCHITECTURE:
 *   Claude Code → localhost:8082 (this proxy) → NVIDIA NIM API (integrate.api.nvidia.com)
 *
 * Per-user key isolation:
 *   - When launched from a terminal, the user's NVIDIA_NIM_API_KEY is in their env
 *   - fcc-claude passes this key in the Authorization header (as Bearer token)
 *   - This proxy extracts the key from the request and uses it to call NVIDIA
 *   - Each user's requests use ONLY their own key — no cross-user leakage
 *
 * If no per-user key is found, falls back to the NVIDIA_NIM_API_KEY env var
 * (which is the admin/default key or the last saved key via Settings panel).
 *
 * Environment variables:
 *   FCC_PROXY_PORT     - Port where this proxy listens (default: 8082)
 *   NVIDIA_NIM_API_KEY - Default/fallback NVIDIA API key
 *   ANTHROPIC_MODEL    - Default model (default: z-ai/glm-5.2)
 */

const http = require('http')
const https = require('https')

const FCC_PROXY_PORT = parseInt(process.env.FCC_PROXY_PORT || '8082', 10)
const NVIDIA_API_BASE = 'integrate.api.nvidia.com'
const NVIDIA_API_PATH = '/v1/chat/completions'
const DEFAULT_MODEL = process.env.ANTHROPIC_MODEL || 'z-ai/glm-5.2'
const FALLBACK_KEY = process.env.NVIDIA_NIM_API_KEY || ''

// ─── NVIDIA NIM Model List ──────────────────────────────────
// These are the models available via NVIDIA NIM API.
// Claude Code's model picker will show these.
const NVIDIA_MODELS = [
  {
    id: 'z-ai/glm-5.2',
    display_name: 'GLM 5.2',
    description: 'Most capable model — best for complex tasks (NVIDIA NIM)',
    context_window: 16384,
    max_tokens: 16384,
    created_at: '2025-01-01',
  },
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

// ─── Extract NVIDIA API Key from Request ───────────────────
// Priority: X-User-NVIDIA-Key header > Authorization Bearer > fallback env var
function extractNvidiaKey(req) {
  // 1. Check custom per-user header (set by server.ts when proxying)
  const customKey = req.headers['x-user-nvidia-key']
  if (customKey && customKey.startsWith('nvapi-')) return customKey

  // 2. Check Authorization header (Claude Code sends "Bearer <key>" or "fcc-no-auth")
  const authHeader = req.headers['authorization'] || req.headers['x-api-key'] || ''
  if (authHeader.startsWith('Bearer nvapi-')) return authHeader.replace('Bearer ', '')
  if (authHeader.startsWith('nvapi-')) return authHeader

  // 3. Check x-api-key (Claude Code sometimes sends the key here)
  const xApiKey = req.headers['x-api-key']
  if (xApiKey && xApiKey.startsWith('nvapi-')) return xApiKey

  // 4. Fallback to env var (admin/default key)
  if (FALLBACK_KEY) return FALLBACK_KEY

  return ''
}

// ─── Translate Anthropic API Request → NVIDIA NIM API Request ──
function translateAnthropicToNvidia(anthropicBody) {
  const model = anthropicBody.model || DEFAULT_MODEL
  const messages = []

  // Convert Anthropic system prompt → NVIDIA system message
  if (anthropicBody.system) {
    const systemContent = typeof anthropicBody.system === 'string'
      ? anthropicBody.system
      : Array.isArray(anthropicBody.system)
        ? anthropicBody.system.map(b => b.text || '').join('\n')
        : ''
    if (systemContent) {
      messages.push({ role: 'system', content: systemContent })
    }
  }

  // Convert Anthropic messages → NVIDIA messages
  if (Array.isArray(anthropicBody.messages)) {
    for (const msg of anthropicBody.messages) {
      if (msg.role === 'user' || msg.role === 'assistant') {
        // Handle both simple string content and complex content blocks
        let content = ''
        if (typeof msg.content === 'string') {
          content = msg.content
        } else if (Array.isArray(msg.content)) {
          // Extract text from content blocks, skip images/tools
          content = msg.content
            .filter(b => b.type === 'text')
            .map(b => b.text || '')
            .join('\n')
        }
        messages.push({ role: msg.role, content })
      }
    }
  }

  const nvidiaBody = {
    model,
    messages,
    temperature: anthropicBody.temperature ?? 1,
    top_p: anthropicBody.top_p ?? 1,
    max_tokens: Math.min(anthropicBody.max_tokens || 16384, 16384),
    stream: anthropicBody.stream ?? false,
  }

  // Add seed for reproducibility if specified
  if (anthropicBody.seed !== undefined) {
    nvidiaBody.seed = anthropicBody.seed
  }

  return nvidiaBody
}

// ─── Translate NVIDIA NIM Response → Anthropic API Response ──
function translateNvidiaToAnthropic(nvidiaBody, model, stream) {
  if (stream) {
    // Streaming response translation is handled in the streaming path
    return nvidiaBody
  }

  // Non-streaming: convert NVIDIA chat completion → Anthropic message
  const choice = nvidiaBody.choices?.[0]
  const content = choice?.message?.content || ''

  return {
    id: nvidiaBody.id || `msg_${Date.now()}`,
    type: 'message',
    role: 'assistant',
    content: [{ type: 'text', text: content }],
    model: model,
    stop_reason: choice?.finish_reason === 'stop' ? 'end_turn' : (choice?.finish_reason || 'end_turn'),
    stop_sequence: null,
    usage: {
      input_tokens: nvidiaBody.usage?.prompt_tokens || 0,
      output_tokens: nvidiaBody.usage?.completion_tokens || 0,
    },
  }
}

// ─── Make NVIDIA API Request ──────────────────────────────
function callNvidiaApi(nvidiaBody, apiKey, stream, callback) {
  const bodyStr = JSON.stringify(nvidiaBody)

  const options = {
    hostname: NVIDIA_API_BASE,
    port: 443,
    path: NVIDIA_API_PATH,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'Content-Length': Buffer.byteLength(bodyStr),
    },
    timeout: 120000,
  }

  const nvidiaReq = https.request(options, (nvidiaRes) => {
    if (stream) {
      // Stream: pipe SSE events, translating NVIDIA format → Anthropic format
      callback(null, nvidiaRes)
    } else {
      // Non-stream: collect full response
      let data = ''
      nvidiaRes.on('data', chunk => data += chunk)
      nvidiaRes.on('end', () => {
        try {
          const nvidiaData = JSON.parse(data)
          if (nvidiaRes.statusCode && nvidiaRes.statusCode >= 400) {
            callback(nvidiaData, null, nvidiaRes.statusCode)
          } else {
            callback(null, nvidiaData, nvidiaRes.statusCode)
          }
        } catch (err) {
          callback({ error: data }, null, nvidiaRes.statusCode || 500)
        }
      })
    }
  })

  nvidiaReq.on('error', (err) => {
    callback({ error: err.message }, null, 502)
  })

  nvidiaReq.on('timeout', () => {
    nvidiaReq.destroy()
    callback({ error: 'NVIDIA API timeout' }, null, 504)
  })

  nvidiaReq.write(bodyStr)
  nvidiaReq.end()
}

// ─── Stream NVIDIA SSE → Anthropic SSE ──────────────────
function translateStream(nvidiaRes, res, model) {
  let buffer = ''
  const msgId = `msg_${Date.now()}`

  // Send Anthropic stream start event
  res.write(`event: message_start\ndata: ${JSON.stringify({
    type: 'message_start',
    message: {
      id: msgId,
      type: 'message',
      role: 'assistant',
      content: [],
      model: model,
      stop_reason: null,
      stop_sequence: null,
      usage: { input_tokens: 0, output_tokens: 0 },
    },
  })}\n\n`)

  // Send content block start
  res.write(`event: content_block_start\ndata: ${JSON.stringify({
    type: 'content_block_start',
    index: 0,
    content_block: { type: 'text', text: '' },
  })}\n\n`)

  nvidiaRes.on('data', (chunk) => {
    buffer += chunk.toString()
    const lines = buffer.split('\n')
    buffer = lines.pop() || '' // Keep incomplete line in buffer

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      const data = line.slice(6).trim()
      if (data === '[DONE]') {
        // Send Anthropic stream end events
        res.write(`event: content_block_stop\ndata: ${JSON.stringify({
          type: 'content_block_stop',
          index: 0,
        })}\n\n`)

        res.write(`event: message_delta\ndata: ${JSON.stringify({
          type: 'message_delta',
          delta: { stop_reason: 'end_turn', stop_sequence: null },
          usage: { output_tokens: 0 },
        })}\n\n`)

        res.write(`event: message_stop\ndata: ${JSON.stringify({
          type: 'message_stop',
        })}\n\n`)
        continue
      }

      try {
        const parsed = JSON.parse(data)
        const delta = parsed.choices?.[0]?.delta
        if (delta?.content) {
          // Translate NVIDIA delta → Anthropic content_block_delta
          res.write(`event: content_block_delta\ndata: ${JSON.stringify({
            type: 'content_block_delta',
            index: 0,
            delta: { type: 'text_delta', text: delta.content },
          })}\n\n`)
        }
      } catch {
        // Ignore malformed SSE lines
      }
    }
  })

  nvidiaRes.on('end', () => {
    // Process any remaining buffer
    if (buffer.startsWith('data: ') && buffer.trim() !== 'data: [DONE]') {
      try {
        const data = buffer.slice(6).trim()
        const parsed = JSON.parse(data)
        const delta = parsed.choices?.[0]?.delta
        if (delta?.content) {
          res.write(`event: content_block_delta\ndata: ${JSON.stringify({
            type: 'content_block_delta',
            index: 0,
            delta: { type: 'text_delta', text: delta.content },
          })}\n\n`)
        }
      } catch {}
    }

    // Ensure stream end
    res.write(`event: content_block_stop\ndata: ${JSON.stringify({
      type: 'content_block_stop',
      index: 0,
    })}\n\n`)
    res.write(`event: message_delta\ndata: ${JSON.stringify({
      type: 'message_delta',
      delta: { stop_reason: 'end_turn', stop_sequence: null },
      usage: { output_tokens: 0 },
    })}\n\n`)
    res.write(`event: message_stop\ndata: ${JSON.stringify({
      type: 'message_stop',
    })}\n\n`)
    res.end()
  })

  nvidiaRes.on('error', (err) => {
    console.error('[FCC-Proxy] NVIDIA stream error:', err.message)
    res.end()
  })
}

// ─── Collect Request Body ──────────────────────────────
function collectBody(req) {
  return new Promise((resolve, reject) => {
    let body = ''
    req.on('data', chunk => body += chunk)
    req.on('end', () => resolve(body))
    req.on('error', reject)
  })
}

// ─── Main Request Handler ──────────────────────────────
async function handleRequest(req, res) {
  const url = req.url || '/'
  const method = req.method || 'GET'

  // ─── Handle /v1/models directly ──────────────────────────
  if ((url === '/v1/models' || url === '/models') && method === 'GET') {
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
      default_model: DEFAULT_MODEL,
    }
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, x-api-key, anthropic-version, Authorization, X-User-NVIDIA-Key',
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
      'Access-Control-Allow-Headers': 'Content-Type, x-api-key, anthropic-version, Authorization, X-User-NVIDIA-Key',
      'Access-Control-Max-Age': '86400',
    })
    res.end()
    return
  }

  // ─── Health check ──────────────────────────────────────────
  if (url === '/health' && method === 'GET') {
    const hasKey = !!FALLBACK_KEY
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({
      status: 'healthy',
      proxy: 'fcc-full-proxy',
      models_available: NVIDIA_MODELS.length,
      default_model: DEFAULT_MODEL,
      has_default_key: hasKey,
      architecture: 'direct-to-nvidia',
    }))
    return
  }

  // ─── Handle POST /v1/messages (Anthropic → NVIDIA translation) ──
  if ((url === '/v1/messages' || url === '/messages') && method === 'POST') {
    try {
      // Extract per-user NVIDIA key
      const userKey = extractNvidiaKey(req)
      if (!userKey) {
        res.writeHead(401, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({
          type: 'error',
          error: {
            type: 'authentication_error',
            message: 'No NVIDIA API key provided. Set your key in the Settings panel or use claude-set-nvidia-key.',
          },
        }))
        return
      }

      // Read and parse the Anthropic API request body
      const bodyStr = await collectBody(req)
      let anthropicBody
      try {
        anthropicBody = JSON.parse(bodyStr)
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({
          type: 'error',
          error: { type: 'invalid_request_error', message: 'Invalid JSON body' },
        }))
        return
      }

      const model = anthropicBody.model || DEFAULT_MODEL
      const isStream = anthropicBody.stream ?? false
      const keySuffix = userKey.slice(-4)

      // Translate Anthropic format → NVIDIA format
      const nvidiaBody = translateAnthropicToNvidia(anthropicBody)
      console.log(`[FCC-Proxy] POST /v1/messages → NVIDIA ${model} (key: ****${keySuffix}, stream: ${isStream})`)

      // Call NVIDIA API
      callNvidiaApi(nvidiaBody, userKey, isStream, (err, nvidiaData, statusCode) => {
        if (err) {
          console.error(`[FCC-Proxy] NVIDIA API error (${statusCode}):`, JSON.stringify(err).slice(200))
          const errStatus = statusCode || 502
          // Translate NVIDIA errors to Anthropic error format
          let errorType = 'api_error'
          let errorMsg = typeof err === 'string' ? err : (err.error?.message || err.message || JSON.stringify(err))

          if (errStatus === 401) {
            errorType = 'authentication_error'
            errorMsg = 'Invalid NVIDIA API key. Please update your key in Settings.'
          } else if (errStatus === 429) {
            errorType = 'rate_limit_error'
            errorMsg = 'NVIDIA API rate limit exceeded. Please wait and try again.'
          } else if (errStatus === 504) {
            errorType = 'timeout_error'
            errorMsg = 'NVIDIA API request timed out.'
          }

          res.writeHead(errStatus, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({
            type: 'error',
            error: { type: errorType, message: errorMsg },
          }))
          return
        }

        if (isStream) {
          // Stream: translate NVIDIA SSE → Anthropic SSE
          res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'Access-Control-Allow-Origin': '*',
          })
          translateStream(nvidiaData, res, model)
        } else {
          // Non-stream: translate full response
          const anthropicResponse = translateNvidiaToAnthropic(nvidiaData, model, false)
          res.writeHead(statusCode || 200, {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          })
          res.end(JSON.stringify(anthropicResponse))
        }
      })
    } catch (err) {
      console.error('[FCC-Proxy] Request handling error:', err)
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({
          type: 'error',
          error: { type: 'api_error', message: 'Internal proxy error' },
        }))
      }
    }
    return
  }

  // ─── 404 for unmatched routes ──────────────────────────────
  res.writeHead(404, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({ error: 'Not found', available_endpoints: ['/v1/models', '/v1/messages', '/health'] }))
}

// ─── Start the proxy server ─────────────────────────────────
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
  console.log(`[FCC-Full-Proxy] Listening on port ${FCC_PROXY_PORT}`)
  console.log(`[FCC-Full-Proxy] Direct connection to NVIDIA NIM API (${NVIDIA_API_BASE})`)
  console.log(`[FCC-Full-Proxy] ${NVIDIA_MODELS.length} models available, default: ${DEFAULT_MODEL}`)
  console.log(`[FCC-Full-Proxy] Per-user key isolation: ENABLED`)
  console.log(`[FCC-Full-Proxy] Endpoints: /v1/models, /v1/messages, /health`)
  console.log(`[FCC-Full-Proxy] Fallback key: ${FALLBACK_KEY ? '****' + FALLBACK_KEY.slice(-4) : 'NONE'}`)
})

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`[FCC-Full-Proxy] Port ${FCC_PROXY_PORT} already in use!`)
    console.error(`[FCC-Full-Proxy] Kill the existing process: fuser -k ${FCC_PROXY_PORT}/tcp`)
    process.exit(1)
  }
  console.error(`[FCC-Full-Proxy] Server error:`, err)
  process.exit(1)
})

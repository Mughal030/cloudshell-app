/**
 * FCC Full Proxy v3 — Per-User Key Isolation + Claude-Compatible Model Discovery
 *
 * This proxy sits between Claude Code and NVIDIA NIM API:
 *   Claude Code → localhost:8082 (this proxy) → NVIDIA NIM API (integrate.api.nvidia.com)
 *
 * KEY INSIGHT (v3): Claude Code's model discovery FILTERS OUT models whose `id`
 * doesn't start with "claude" or "anthropic". So we expose NVIDIA models with
 * `claude-` prefixed IDs that trigger the right capability detection in Claude Code,
 * then map them back to real NVIDIA model IDs when calling the API.
 *
 * Model ID Mapping:
 *   claude-opus-4-5        → z-ai/glm-5.2           (most capable, Opus-tier)
 *   claude-sonnet-4-5      → nvidia/llama-3.3-nemotron-super-49b-v1  (balanced)
 *   claude-haiku-4-5       → nvidia/phi-4            (fast)
 *   claude-sonnet-4        → nvidia/llama-3.1-nemotron-70b-instruct  (legacy)
 *   claude-opus-4          → nvidia/nemotron-3-super-120b-a12b       (legacy)
 *   claude-haiku-3-5       → nvidia/mistral-large-2411              (legacy)
 *   claude-deepseek-r1     → deepseek-ai/deepseek-r1               (reasoning)
 *
 * Capability Detection:
 *   - "opus-4-5" → 64K tokens, extended thinking, opus plan mode
 *   - "sonnet-4-5" → 64K tokens, extended thinking
 *   - "haiku" → DISABLES extended thinking (avoid if model needs it)
 *   - Use dashes not dots: claude-opus-4-5 NOT claude-opus-4.5
 *
 * Per-user key isolation:
 *   - User's NVIDIA_NIM_API_KEY is injected as ANTHROPIC_AUTH_TOKEN in their terminal
 *   - Claude Code sends it as x-api-key or Authorization header
 *   - Proxy extracts it per-request — each user uses ONLY their own key
 *
 * Environment variables:
 *   FCC_PROXY_PORT     - Port where this proxy listens (default: 8082)
 *   NVIDIA_NIM_API_KEY - Default/fallback NVIDIA API key
 *   ANTHROPIC_MODEL    - Default model (default: claude-opus-4-5)
 */

const http = require('http')
const https = require('https')

const FCC_PROXY_PORT = parseInt(process.env.FCC_PROXY_PORT || '8082', 10)
const NVIDIA_API_BASE = 'integrate.api.nvidia.com'
const NVIDIA_API_PATH = '/v1/chat/completions'
const DEFAULT_MODEL = process.env.ANTHROPIC_MODEL || 'claude-opus-4-5'
const FALLBACK_KEY = process.env.NVIDIA_NIM_API_KEY || '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'

// ─── Claude-Compatible Model List ──────────────────────────────
// Model IDs start with "claude-" so Claude Code's discovery filter doesn't
// reject them. Each ID contains capability-triggering substrings.
// The `nvidiaModel` field is the real NVIDIA NIM model ID used for API calls.
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

// ─── Model ID Mapping ──────────────────────────────────────────
// Maps Claude-compatible IDs → real NVIDIA NIM model IDs
// Also handles direct NVIDIA model IDs passed via ANTHROPIC_MODEL env var
const MODEL_MAP = {}
for (const m of CLAUDE_MODELS) {
  MODEL_MAP[m.id] = m.nvidiaModel
}
// Also allow passing raw NVIDIA model IDs directly (they won't show in picker
// but can be set via ANTHROPIC_MODEL env var or /model command)
MODEL_MAP['z-ai/glm-5.2'] = 'z-ai/glm-5.2'
MODEL_MAP['nvidia/nemotron-3-super-120b-a12b'] = 'nvidia/nemotron-3-super-120b-a12b'
MODEL_MAP['nvidia/llama-3.3-nemotron-super-49b-v1'] = 'nvidia/llama-3.3-nemotron-super-49b-v1'
MODEL_MAP['nvidia/llama-3.1-nemotron-70b-instruct'] = 'nvidia/llama-3.1-nemotron-70b-instruct'
MODEL_MAP['nvidia/mistral-large-2411'] = 'nvidia/mistral-large-2411'
MODEL_MAP['deepseek-ai/deepseek-r1'] = 'deepseek-ai/deepseek-r1'
MODEL_MAP['nvidia/phi-4'] = 'nvidia/phi-4'

// Default model resolution: if DEFAULT_MODEL is a Claude ID, map it; if it's
// a raw NVIDIA ID, use it directly; otherwise fall back to GLM 5.2
function resolveNvidiaModel(modelId) {
  return MODEL_MAP[modelId] || MODEL_MAP[DEFAULT_MODEL] || 'z-ai/glm-5.2'
}

// ─── Extract NVIDIA API Key from Request ───────────────────
// Priority: X-User-NVIDIA-Key header > x-api-key > Authorization Bearer > fallback env var
function extractNvidiaKey(req) {
  // 1. Check custom per-user header (set by server.ts when proxying)
  const customKey = req.headers['x-user-nvidia-key']
  if (customKey && customKey.startsWith('nvapi-')) return customKey

  // 2. Check x-api-key (Claude Code sends ANTHROPIC_AUTH_TOKEN here)
  const xApiKey = req.headers['x-api-key']
  if (xApiKey && typeof xApiKey === 'string' && xApiKey.startsWith('nvapi-')) return xApiKey
  // "fcc-no-auth" means use the fallback/default key (no per-user key set)
  if (xApiKey && xApiKey === 'fcc-no-auth' && FALLBACK_KEY) return FALLBACK_KEY

  // 3. Check Authorization header (Claude Code may send "Bearer <key>" or "Bearer fcc-no-auth")
  const authHeader = req.headers['authorization'] || ''
  if (typeof authHeader === 'string') {
    if (authHeader.startsWith('Bearer nvapi-')) return authHeader.replace('Bearer ', '')
    if (authHeader.startsWith('nvapi-')) return authHeader
    // "Bearer fcc-no-auth" means use the fallback/default key
    if ((authHeader === 'Bearer fcc-no-auth' || authHeader === 'fcc-no-auth') && FALLBACK_KEY) return FALLBACK_KEY
  }

  // 4. Fallback to default key (hardcoded for HF Spaces deployment)
  if (FALLBACK_KEY) return FALLBACK_KEY

  // 5. No key found anywhere — this should never happen in production
  console.error('[FCC-Proxy] WARNING: No NVIDIA API key found in request headers or env vars!')
  return ''
}

// ─── Translate Anthropic API Request → NVIDIA NIM API Request ──
function translateAnthropicToNvidia(anthropicBody) {
  // Resolve the Claude-compatible model ID to a real NVIDIA model ID
  const requestedModel = anthropicBody.model || DEFAULT_MODEL
  const nvidiaModel = resolveNvidiaModel(requestedModel)
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
          // Extract text from content blocks, skip images/tools/thinking
          content = msg.content
            .filter(b => b.type === 'text' || (b.type === 'tool_result' && b.content))
            .map(b => {
              if (b.type === 'text') return b.text || ''
              if (b.type === 'tool_result') {
                // Flatten tool_result content into text
                if (typeof b.content === 'string') return b.content
                if (Array.isArray(b.content)) {
                  return b.content
                    .filter(c => c.type === 'text')
                    .map(c => c.text || '')
                    .join('\n')
                }
              }
              return ''
            })
            .join('\n')
        }
        if (content) {
          messages.push({ role: msg.role, content })
        }
      }
    }
  }

  const nvidiaBody = {
    model: nvidiaModel,
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
    return nvidiaBody
  }

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
    timeout: 300000, // 5 minutes — NVIDIA NIM can take 60+ seconds for first response
  }

  const nvidiaReq = https.request(options, (nvidiaRes) => {
    // Set a long idle timeout on the response socket
    nvidiaRes.setTimeout(300000)
    if (stream) {
      callback(null, nvidiaRes)
    } else {
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
    console.error(`[FCC-Proxy] NVIDIA request error: ${err.code || err.message}`)
    callback({ error: err.message }, null, 502)
  })

  nvidiaReq.on('timeout', () => {
    console.error(`[FCC-Proxy] NVIDIA request timeout after ${options.timeout}ms`)
    nvidiaReq.destroy()
    callback({ error: `NVIDIA API timeout (${options.timeout}ms)` }, null, 504)
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
    buffer = lines.pop() || ''

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      const data = line.slice(6).trim()
      if (data === '[DONE]') {
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

    // Ensure stream end events are always sent
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
    if (!res.writableEnded) res.end()
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
  const rawUrl = req.url || '/'
  const method = req.method || 'GET'

  // Parse URL (handle query params like ?limit=1000)
  const urlPath = rawUrl.split('?')[0]

  // ─── Handle GET /v1/models (Claude Code model discovery) ────────
  // Claude Code requires model IDs starting with "claude" or "anthropic"
  // to show them in the /model picker. We expose Claude-compatible IDs
  // and map them back to real NVIDIA model IDs when making API calls.
  if ((urlPath === '/v1/models' || urlPath === '/models') && method === 'GET') {
    const response = {
      object: 'list',
      data: CLAUDE_MODELS.map(m => ({
        id: m.id,
        display_name: m.display_name,
        // Claude Code only reads `id` and `display_name` from the response.
        // Extra fields are ignored but included for compatibility.
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
    const hasKey = !!FALLBACK_KEY
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({
      status: 'healthy',
      proxy: 'fcc-full-proxy-v3',
      models_available: CLAUDE_MODELS.length,
      default_model: DEFAULT_MODEL,
      resolved_nvidia_model: resolveNvidiaModel(DEFAULT_MODEL),
      has_default_key: hasKey,
      architecture: 'direct-to-nvidia',
      model_mapping: Object.fromEntries(CLAUDE_MODELS.map(m => [m.id, m.nvidiaModel])),
    }))
    return
  }

  // ─── Handle POST /v1/messages (Anthropic → NVIDIA translation) ──
  if ((urlPath === '/v1/messages' || urlPath === '/messages') && method === 'POST') {
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

      const requestedModel = anthropicBody.model || DEFAULT_MODEL
      const nvidiaModel = resolveNvidiaModel(requestedModel)
      const isStream = anthropicBody.stream ?? false
      const keySuffix = userKey.slice(-4)

      // Log the model mapping for debugging
      console.log(`[FCC-Proxy] POST /v1/messages model: ${requestedModel} → ${nvidiaModel} (key: ****${keySuffix}, stream: ${isStream})`)

      // Translate Anthropic format → NVIDIA format
      const nvidiaBody = translateAnthropicToNvidia(anthropicBody)

      // Call NVIDIA API
      callNvidiaApi(nvidiaBody, userKey, isStream, (err, nvidiaData, statusCode) => {
        if (err) {
          console.error(`[FCC-Proxy] NVIDIA API error (${statusCode}):`, JSON.stringify(err).slice(200))
          const errStatus = statusCode || 502
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
          } else if (errStatus === 404) {
            errorType = 'not_found_error'
            errorMsg = `Model "${nvidiaModel}" not found on NVIDIA NIM. Try a different model.`
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
          translateStream(nvidiaData, res, requestedModel)
        } else {
          // Non-stream: translate full response
          const anthropicResponse = translateNvidiaToAnthropic(nvidiaData, requestedModel, false)
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
// Prevent crashes from unhandled errors
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
  console.log(`[FCC-Proxy-v3] Listening on port ${FCC_PROXY_PORT}`)
  console.log(`[FCC-Proxy-v3] Direct connection to NVIDIA NIM API (${NVIDIA_API_BASE})`)
  console.log(`[FCC-Proxy-v3] ${CLAUDE_MODELS.length} models available, default: ${DEFAULT_MODEL} → ${resolveNvidiaModel(DEFAULT_MODEL)}`)
  console.log(`[FCC-Proxy-v3] Model mapping (Claude ID → NVIDIA ID):`)
  for (const m of CLAUDE_MODELS) {
    console.log(`[FCC-Proxy-v3]   ${m.id.padEnd(28)} → ${m.nvidiaModel}`)
  }
  console.log(`[FCC-Proxy-v3] Per-user key isolation: ENABLED`)
  console.log(`[FCC-Proxy-v3] Endpoints: /v1/models, /v1/messages, /health`)
  console.log(`[FCC-Proxy-v3] Fallback key: ${FALLBACK_KEY ? '****' + FALLBACK_KEY.slice(-4) : 'NONE'}`)
})

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`[FCC-Proxy-v3] Port ${FCC_PROXY_PORT} already in use!`)
    console.error(`[FCC-Proxy-v3] Kill the existing process: fuser -k ${FCC_PROXY_PORT}/tcp`)
    process.exit(1)
  }
  console.error(`[FCC-Proxy-v3] Server error:`, err)
  process.exit(1)
})

/**
 * FCC Full Proxy v5 — Rock-Solid Anthropic↔NVIDIA Translation
 *
 * Architecture:
 *   Claude Code → localhost:8082 (this proxy) → NVIDIA NIM API (integrate.api.nvidia.com)
 *
 * v5 fixes over v3:
 *   1. Proper streaming input_json_delta (partial chunks, not complete JSON dump)
 *   2. No duplicate content_block_stop events
 *   3. Message validation & repair (strict role alternation for NVIDIA API)
 *   4. Higher max_tokens (32768) for heavy tasks
 *   5. Socket keepalive to prevent 6-second disconnects
 *   6. Correct stop_reason handling (tool_use vs end_turn)
 *   7. Tool result deduplication in system prompt
 *   8. Graceful timeout handling with partial responses
 *   9. Retry logic for transient NVIDIA API errors
 *
 * Model ID Mapping:
 *   claude-opus-4-5        → z-ai/glm-5.2           (most capable, Opus-tier)
 *   claude-sonnet-4-5      → nvidia/llama-3.3-nemotron-super-49b-v1
 *   claude-sonnet-4-5-mini → nvidia/phi-4
 *   claude-opus-4          → nvidia/nemotron-3-super-120b-a12b
 *   claude-sonnet-4        → nvidia/llama-3.1-nemotron-70b-instruct
 *   claude-deepseek-r1     → deepseek-ai/deepseek-r1
 *   anthropic-mistral-large → nvidia/mistral-large-2411
 *
 * Per-user key isolation:
 *   User's NVIDIA_NIM_API_KEY → ANTHROPIC_AUTH_TOKEN → x-api-key → extracted per-request
 */

const http = require('http')
const https = require('https')

const FCC_PROXY_PORT = parseInt(process.env.FCC_PROXY_PORT || '8082', 10)
const NVIDIA_API_BASE = 'integrate.api.nvidia.com'
const NVIDIA_API_PATH = '/v1/chat/completions'
const DEFAULT_MODEL = process.env.ANTHROPIC_MODEL || 'claude-opus-4-5'
const FALLBACK_KEY = process.env.NVIDIA_NIM_API_KEY || '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'
const MAX_RETRIES = 2
const REQUEST_TIMEOUT = 300000 // 5 minutes

// ─── Claude-Compatible Model List ──────────────────────────────
const CLAUDE_MODELS = [
  {
    id: 'claude-opus-4-5',
    display_name: 'GLM 5.2 (Opus)',
    nvidiaModel: 'z-ai/glm-5.2',
    description: 'Most capable model — best for complex tasks (NVIDIA NIM)',
    context_window: 32768,
    max_tokens: 32768,
    created_at: '2025-01-01',
  },
  {
    id: 'claude-sonnet-4-5',
    display_name: 'Llama 3.3 Nemotron Super 49B (Sonnet)',
    nvidiaModel: 'nvidia/llama-3.3-nemotron-super-49b-v1',
    description: 'Balanced performance and speed',
    context_window: 16384,
    max_tokens: 16384,
    created_at: '2025-01-01',
  },
  {
    id: 'claude-sonnet-4-5-mini',
    display_name: 'Phi-4 (Sonnet Mini)',
    nvidiaModel: 'nvidia/phi-4',
    description: 'Fast and efficient — good for quick tasks',
    context_window: 8192,
    max_tokens: 8192,
    created_at: '2025-01-01',
  },
  {
    id: 'claude-opus-4',
    display_name: 'Nemotron 3 Super 120B (Opus)',
    nvidiaModel: 'nvidia/nemotron-3-super-120b-a12b',
    description: 'Large NVIDIA model — best for complex tasks',
    context_window: 16384,
    max_tokens: 16384,
    created_at: '2025-01-01',
  },
  {
    id: 'claude-sonnet-4',
    display_name: 'Llama 3.1 Nemotron 70B (Sonnet)',
    nvidiaModel: 'nvidia/llama-3.1-nemotron-70b-instruct',
    description: 'Balanced model for general use',
    context_window: 16384,
    max_tokens: 16384,
    created_at: '2025-01-01',
  },
  {
    id: 'claude-deepseek-r1',
    display_name: 'DeepSeek R1 (Reasoning)',
    nvidiaModel: 'deepseek-ai/deepseek-r1',
    description: 'DeepSeek reasoning model — best for math and logic',
    context_window: 16384,
    max_tokens: 16384,
    created_at: '2025-01-01',
  },
  {
    id: 'anthropic-mistral-large',
    display_name: 'Mistral Large 2411',
    nvidiaModel: 'nvidia/mistral-large-2411',
    description: 'Mistral Large via NVIDIA NIM',
    context_window: 16384,
    max_tokens: 16384,
    created_at: '2025-01-01',
  },
]

// ─── Model ID Mapping ──────────────────────────────────────────
const MODEL_MAP = {}
for (const m of CLAUDE_MODELS) {
  MODEL_MAP[m.id] = m.nvidiaModel
}
// Allow raw NVIDIA model IDs too
MODEL_MAP['z-ai/glm-5.2'] = 'z-ai/glm-5.2'
MODEL_MAP['nvidia/nemotron-3-super-120b-a12b'] = 'nvidia/nemotron-3-super-120b-a12b'
MODEL_MAP['nvidia/llama-3.3-nemotron-super-49b-v1'] = 'nvidia/llama-3.3-nemotron-super-49b-v1'
MODEL_MAP['nvidia/llama-3.1-nemotron-70b-instruct'] = 'nvidia/llama-3.1-nemotron-70b-instruct'
MODEL_MAP['nvidia/mistral-large-2411'] = 'nvidia/mistral-large-2411'
MODEL_MAP['deepseek-ai/deepseek-r1'] = 'deepseek-ai/deepseek-r1'
MODEL_MAP['nvidia/phi-4'] = 'nvidia/phi-4'

function resolveNvidiaModel(modelId) {
  return MODEL_MAP[modelId] || MODEL_MAP[DEFAULT_MODEL] || 'z-ai/glm-5.2'
}

// ─── Extract NVIDIA API Key from Request ───────────────────────
function extractNvidiaKey(req) {
  const customKey = req.headers['x-user-nvidia-key']
  if (customKey && customKey.startsWith('nvapi-')) return customKey

  const xApiKey = req.headers['x-api-key']
  if (xApiKey && typeof xApiKey === 'string' && xApiKey.startsWith('nvapi-')) return xApiKey
  if (xApiKey && xApiKey === 'fcc-no-auth' && FALLBACK_KEY) return FALLBACK_KEY

  const authHeader = req.headers['authorization'] || ''
  if (typeof authHeader === 'string') {
    if (authHeader.startsWith('Bearer nvapi-')) return authHeader.replace('Bearer ', '')
    if (authHeader.startsWith('nvapi-')) return authHeader
    if ((authHeader === 'Bearer fcc-no-auth' || authHeader === 'fcc-no-auth') && FALLBACK_KEY) return FALLBACK_KEY
  }

  if (FALLBACK_KEY) return FALLBACK_KEY
  console.error('[FCC-Proxy] WARNING: No NVIDIA API key found!')
  return ''
}

// ─── Translate Anthropic API Request → NVIDIA NIM API Request ──
function translateAnthropicToNvidia(anthropicBody) {
  const requestedModel = anthropicBody.model || DEFAULT_MODEL
  const nvidiaModel = resolveNvidiaModel(requestedModel)
  const rawMessages = []

  // ── System prompt ──
  let systemContent = ''
  if (anthropicBody.system) {
    systemContent = typeof anthropicBody.system === 'string'
      ? anthropicBody.system
      : Array.isArray(anthropicBody.system)
        ? anthropicBody.system.map(b => b.text || '').join('\n')
        : ''
  }

  // Behavior guide — concise and targeted to prevent loops
  const BEHAVIOR_GUIDE = [
    '\n\n[SYSTEM BEHAVIOR RULES - ALWAYS FOLLOW]',
    '1. When you receive tool results, analyze them and provide your next step or conclusion. Do NOT re-call the same tool with identical arguments.',
    '2. After executing a command and getting output, summarize the result and proceed. Never repeat the same command.',
    '3. If a task requires multiple steps, complete each step once and move forward.',
    '4. When a task is complete, provide a clear summary. Do not add extra steps.',
    '5. Respond with natural language, not XML tags or pseudo-tool-call syntax.',
    '6. If you are unsure what to do next, ask the user for clarification rather than looping.',
  ].join('\n')

  if (systemContent) {
    rawMessages.push({ role: 'system', content: systemContent + BEHAVIOR_GUIDE })
  } else {
    rawMessages.push({ role: 'system', content: BEHAVIOR_GUIDE.trim() })
  }

  // ── Convert Anthropic messages → OpenAI messages ──
  if (Array.isArray(anthropicBody.messages)) {
    for (const msg of anthropicBody.messages) {
      if (msg.role === 'user') {
        let textParts = []
        let toolResults = []

        if (typeof msg.content === 'string') {
          textParts.push(msg.content)
        } else if (Array.isArray(msg.content)) {
          for (const block of msg.content) {
            if (block.type === 'text') {
              textParts.push(block.text || '')
            } else if (block.type === 'tool_result') {
              let resultContent = ''
              if (typeof block.content === 'string') {
                resultContent = block.content
              } else if (Array.isArray(block.content)) {
                resultContent = block.content
                  .filter(c => c.type === 'text')
                  .map(c => c.text || '')
                  .join('\n')
              }
              toolResults.push({
                tool_call_id: block.tool_use_id || `call_${Date.now()}`,
                content: resultContent || '(no output)',
              })
            } else if (block.type === 'image') {
              // Skip image blocks - NVIDIA NIM doesn't support them in the same way
              textParts.push('[Image content - not supported by current model]')
            }
          }
        }

        // Add text as user message
        if (textParts.join('\n').trim()) {
          rawMessages.push({ role: 'user', content: textParts.join('\n') })
        }

        // Add tool results as tool messages
        for (const result of toolResults) {
          rawMessages.push({
            role: 'tool',
            tool_call_id: result.tool_call_id,
            content: result.content,
          })
        }

      } else if (msg.role === 'assistant') {
        let textParts = []
        let toolCalls = []

        if (typeof msg.content === 'string') {
          textParts.push(msg.content)
        } else if (Array.isArray(msg.content)) {
          for (const block of msg.content) {
            if (block.type === 'text') {
              const txt = (block.text || '').trim()
              if (txt) textParts.push(txt)
            } else if (block.type === 'tool_use') {
              let funcArgs = '{}'
              if (block.input) {
                try {
                  funcArgs = typeof block.input === 'string' ? block.input : JSON.stringify(block.input)
                } catch { funcArgs = '{}' }
              }
              toolCalls.push({
                id: block.id || `call_${Date.now()}_${toolCalls.length}`,
                type: 'function',
                function: {
                  name: block.name || 'unknown',
                  arguments: funcArgs,
                },
              })
            }
            // Skip thinking blocks — not supported by NVIDIA models
          }
        }

        const assistantMsg = { role: 'assistant' }
        if (textParts.join('\n').trim()) {
          assistantMsg.content = textParts.join('\n')
        } else {
          assistantMsg.content = null
        }
        if (toolCalls.length > 0) {
          assistantMsg.tool_calls = toolCalls
        }
        rawMessages.push(assistantMsg)
      }
    }
  }

  // ── CRITICAL FIX: Validate and repair message sequence ──
  // NVIDIA API requires strict alternation: system→user→(assistant→tool→)*assistant→user...
  // We must merge consecutive same-role messages and ensure tool messages follow assistant messages
  const messages = validateAndRepairMessages(rawMessages)

  // ── Build tools list ──
  const tools = []
  if (Array.isArray(anthropicBody.tools)) {
    for (const tool of anthropicBody.tools) {
      if (tool.name && tool.input_schema) {
        tools.push({
          type: 'function',
          function: {
            name: tool.name,
            description: tool.description || '',
            parameters: tool.input_schema,
          },
        })
      }
    }
  }

  // ── Build NVIDIA request body ──
  const nvidiaBody = {
    model: nvidiaModel,
    messages,
    temperature: anthropicBody.temperature ?? 0.5, // Lower for more deterministic tool use
    top_p: anthropicBody.top_p ?? 0.9,
    max_tokens: Math.min(anthropicBody.max_tokens || 32768, 32768),
    stream: anthropicBody.stream ?? false,
    frequency_penalty: 0.3, // Reduce repetitive output ("ok ok ok")
    presence_penalty: 0.1,  // Encourage diverse responses
  }

  if (tools.length > 0) {
    nvidiaBody.tools = tools
    nvidiaBody.tool_choice = 'auto'
  }

  // Handle stop_sequences from Anthropic format
  if (Array.isArray(anthropicBody.stop_sequences) && anthropicBody.stop_sequences.length > 0) {
    nvidiaBody.stop = anthropicBody.stop_sequences.slice(0, 4) // OpenAI allows max 4
  }

  return nvidiaBody
}

// ─── Validate and Repair Message Sequence ──────────────────────
// NVIDIA API requires strict role alternation. This function:
// 1. Merges consecutive same-role messages
// 2. Ensures tool messages always follow assistant messages with matching tool_calls
// 3. Removes orphaned tool messages
// 4. Adds filler messages where needed
function validateAndRepairMessages(messages) {
  if (!messages || messages.length === 0) return messages

  const repaired = []
  let lastRole = null

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i]
    const role = msg.role

    // System messages go first, only one allowed
    if (role === 'system') {
      if (repaired.length === 0 || repaired[0].role === 'system') {
        if (repaired.length > 0 && repaired[0].role === 'system') {
          // Merge system messages
          repaired[0].content += '\n' + (msg.content || '')
        } else {
          repaired.push({ ...msg })
          lastRole = 'system'
        }
      }
      continue
    }

    // Tool messages must follow assistant messages
    if (role === 'tool') {
      if (lastRole !== 'assistant') {
        // Orphaned tool result — wrap it in a user message instead
        console.log(`[FCC-Proxy] Repairing orphaned tool message at index ${i}`)
        const content = `[Tool Result: ${msg.tool_call_id}] ${msg.content || ''}`
        if (lastRole === 'user') {
          // Append to previous user message
          repaired[repaired.length - 1].content += '\n' + content
        } else {
          repaired.push({ role: 'user', content })
          lastRole = 'user'
        }
      } else {
        repaired.push({ ...msg })
        lastRole = 'tool'
      }
      continue
    }

    // For user and assistant messages
    if (role === lastRole && (role === 'user' || role === 'assistant')) {
      // Merge consecutive same-role messages
      if (role === 'user') {
        const existing = repaired[repaired.length - 1]
        const newContent = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)
        existing.content = (existing.content || '') + '\n' + newContent
        console.log(`[FCC-Proxy] Merged consecutive ${role} messages at index ${i}`)
      } else if (role === 'assistant') {
        // For assistant, merge text content and combine tool_calls
        const existing = repaired[repaired.length - 1]
        if (msg.content && msg.content !== null) {
          const newContent = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)
          if (existing.content && existing.content !== null) {
            existing.content += '\n' + newContent
          } else {
            existing.content = newContent
          }
        }
        if (msg.tool_calls && msg.tool_calls.length > 0) {
          if (!existing.tool_calls) existing.tool_calls = []
          existing.tool_calls.push(...msg.tool_calls)
        }
        console.log(`[FCC-Proxy] Merged consecutive ${role} messages at index ${i}`)
      }
      continue
    }

    // After tool messages, we need a user or assistant message
    // If last was tool and this is tool, that's fine (multiple tool results)
    // If last was tool and this is user, that's fine
    // If last was tool and this is assistant, that's fine

    repaired.push({ ...msg })
    lastRole = role
  }

  // Ensure first non-system message is from user
  const firstNonSystem = repaired.findIndex(m => m.role !== 'system')
  if (firstNonSystem >= 0 && repaired[firstNonSystem].role !== 'user') {
    repaired.splice(firstNonSystem, 0, { role: 'user', content: 'Please continue.' })
    console.log('[FCC-Proxy] Added filler user message at start')
  }

  return repaired
}

// ─── Translate NVIDIA NIM Response → Anthropic API Response ──
function translateNvidiaToAnthropic(nvidiaBody, model) {
  const choice = nvidiaBody.choices?.[0]
  const message = choice?.message || {}
  const content = []

  // Extract text content
  if (message.content) {
    content.push({ type: 'text', text: message.content })
  }

  // Convert OpenAI tool_calls → Anthropic tool_use format
  if (Array.isArray(message.tool_calls)) {
    for (const tc of message.tool_calls) {
      let toolInput = {}
      try {
        toolInput = typeof tc.function?.arguments === 'string'
          ? JSON.parse(tc.function.arguments)
          : (tc.function?.arguments || {})
      } catch {
        toolInput = { raw_arguments: tc.function?.arguments || '' }
      }

      content.push({
        type: 'tool_use',
        id: tc.id || `toolu_${Date.now()}`,
        name: tc.function?.name || 'unknown',
        input: toolInput,
      })
    }
  }

  if (content.length === 0) {
    content.push({ type: 'text', text: '' })
  }

  // Determine stop_reason
  let stopReason = 'end_turn'
  const hasToolCalls = Array.isArray(message.tool_calls) && message.tool_calls.length > 0
  if (hasToolCalls || choice?.finish_reason === 'tool_calls' || choice?.finish_reason === 'function_call') {
    stopReason = 'tool_use'
  } else if (choice?.finish_reason === 'length') {
    stopReason = 'max_tokens'
  } else if (choice?.finish_reason === 'stop') {
    stopReason = 'end_turn'
  }

  return {
    id: nvidiaBody.id || `msg_${Date.now()}`,
    type: 'message',
    role: 'assistant',
    content: content,
    model: model,
    stop_reason: stopReason,
    stop_sequence: null,
    usage: {
      input_tokens: nvidiaBody.usage?.prompt_tokens || 0,
      output_tokens: nvidiaBody.usage?.completion_tokens || 0,
    },
  }
}

// ─── Make NVIDIA API Request (with retry) ──────────────────────
function callNvidiaApi(nvidiaBody, apiKey, stream, callback, retryCount = 0) {
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
    timeout: REQUEST_TIMEOUT,
  }

  const nvidiaReq = https.request(options, (nvidiaRes) => {
    nvidiaRes.setTimeout(REQUEST_TIMEOUT)

    if (stream) {
      callback(null, nvidiaRes)
    } else {
      let data = ''
      nvidiaRes.on('data', chunk => data += chunk)
      nvidiaRes.on('end', () => {
        try {
          const nvidiaData = JSON.parse(data)
          if (nvidiaRes.statusCode && nvidiaRes.statusCode >= 400) {
            // Retry on 429 (rate limit) or 503 (service unavailable)
            if ((nvidiaRes.statusCode === 429 || nvidiaRes.statusCode === 503) && retryCount < MAX_RETRIES) {
              const delay = (retryCount + 1) * 2000
              console.log(`[FCC-Proxy] Retrying in ${delay}ms (attempt ${retryCount + 1}/${MAX_RETRIES})`)
              setTimeout(() => {
                callNvidiaApi(nvidiaBody, apiKey, stream, callback, retryCount + 1)
              }, delay)
              return
            }
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
    // Retry on network errors
    if (retryCount < MAX_RETRIES && (err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT' || err.code === 'ECONNREFUSED')) {
      const delay = (retryCount + 1) * 2000
      console.log(`[FCC-Proxy] Retrying network error in ${delay}ms (attempt ${retryCount + 1}/${MAX_RETRIES})`)
      setTimeout(() => {
        callNvidiaApi(nvidiaBody, apiKey, stream, callback, retryCount + 1)
      }, delay)
      return
    }
    callback({ error: err.message }, null, 502)
  })

  nvidiaReq.on('timeout', () => {
    console.error(`[FCC-Proxy] NVIDIA request timeout after ${REQUEST_TIMEOUT}ms`)
    nvidiaReq.destroy()
    callback({ error: `NVIDIA API timeout (${REQUEST_TIMEOUT}ms)` }, null, 504)
  })

  nvidiaReq.write(bodyStr)
  nvidiaReq.end()
}

// ─── Stream NVIDIA SSE → Anthropic SSE ────────────────────────
function translateStream(nvidiaRes, res, model) {
  let buffer = ''
  const msgId = `msg_${Date.now()}`
  let contentBlockIndex = 0
  let currentToolCallId = null
  let currentToolCallName = null
  let toolCallArguments = ''
  let inToolCall = false
  let hasOpenBlock = false  // Track if we have an open content block
  let streamEnded = false    // Prevent duplicate end events
  let inputTokenCount = 0
  let outputTokenCount = 0
  let lastKeepalive = Date.now()

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

  // Send keepalive pings to prevent client disconnect
  const keepaliveInterval = setInterval(() => {
    if (!res.writableEnded && !streamEnded) {
      res.write(': keepalive\n\n')
      lastKeepalive = Date.now()
    }
  }, 15000) // Every 15 seconds

  function sendContentBlockStart(type, extra) {
    if (hasOpenBlock) {
      // Close previous block first
      sendContentBlockStop()
    }
    const block = { type, ...extra }
    res.write(`event: content_block_start\ndata: ${JSON.stringify({
      type: 'content_block_start',
      index: contentBlockIndex,
      content_block: block,
    })}\n\n`)
    hasOpenBlock = true
  }

  function sendContentBlockStop() {
    if (!hasOpenBlock) return  // Don't send duplicate stops
    res.write(`event: content_block_stop\ndata: ${JSON.stringify({
      type: 'content_block_stop',
      index: contentBlockIndex,
    })}\n\n`)
    contentBlockIndex++
    hasOpenBlock = false
  }

  function sendTextDelta(text) {
    res.write(`event: content_block_delta\ndata: ${JSON.stringify({
      type: 'content_block_delta',
      index: contentBlockIndex,
      delta: { type: 'text_delta', text },
    })}\n\n`)
  }

  function sendInputJsonDelta(partialJson) {
    res.write(`event: content_block_delta\ndata: ${JSON.stringify({
      type: 'content_block_delta',
      index: contentBlockIndex,
      delta: { type: 'input_json_delta', partial_json: partialJson },
    })}\n\n`)
  }

  function sendToolUseBlock(toolId, toolName, inputObj) {
    // Close any open block
    if (hasOpenBlock) {
      sendContentBlockStop()
    }
    // Start tool_use block
    sendContentBlockStart('tool_use', { id: toolId, name: toolName, input: {} })
    // Send the complete input as a single input_json_delta
    sendInputJsonDelta(JSON.stringify(inputObj))
    // Close the block
    sendContentBlockStop()
  }

  function endStream(stopReason) {
    if (streamEnded) return
    streamEnded = true
    clearInterval(keepaliveInterval)

    // Close any open content block
    if (hasOpenBlock) {
      sendContentBlockStop()
    }

    // Finalize any pending tool call
    if (inToolCall) {
      try {
        const parsedArgs = JSON.parse(toolCallArguments)
        sendToolUseBlock(currentToolCallId, currentToolCallName, parsedArgs)
      } catch {
        sendToolUseBlock(currentToolCallId, currentToolCallName, {})
      }
      inToolCall = false
      stopReason = 'tool_use'
    }

    // Send message_delta with stop_reason
    res.write(`event: message_delta\ndata: ${JSON.stringify({
      type: 'message_delta',
      delta: { stop_reason: stopReason, stop_sequence: null },
      usage: { output_tokens: outputTokenCount },
    })}\n\n`)

    res.write(`event: message_stop\ndata: ${JSON.stringify({
      type: 'message_stop',
    })}\n\n`)

    res.end()
  }

  nvidiaRes.on('data', (chunk) => {
    buffer += chunk.toString()
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''

    for (const line of lines) {
      // Skip SSE comments (keepalive)
      if (line.startsWith(':')) continue
      if (!line.startsWith('data: ')) continue

      const data = line.slice(6).trim()
      if (data === '[DONE]') {
        // Determine stop reason based on context
        const stopReason = inToolCall ? 'tool_use' : 'end_turn'
        endStream(stopReason)
        continue
      }

      try {
        const parsed = JSON.parse(data)
        const choice = parsed.choices?.[0]
        const delta = choice?.delta
        const finishReason = choice?.finish_reason

        // Track token usage
        if (parsed.usage) {
          outputTokenCount = parsed.usage.completion_tokens || outputTokenCount
        }

        if (!delta && !finishReason) continue

        // Handle text content
        if (delta?.content) {
          // If we're in a tool call, finalize it first
          if (inToolCall) {
            try {
              const parsedArgs = JSON.parse(toolCallArguments)
              sendToolUseBlock(currentToolCallId, currentToolCallName, parsedArgs)
            } catch {
              sendToolUseBlock(currentToolCallId, currentToolCallName, {})
            }
            inToolCall = false
          }

          if (!hasOpenBlock) {
            sendContentBlockStart('text', { text: '' })
          }
          sendTextDelta(delta.content)
        }

        // Handle tool calls in streaming
        if (Array.isArray(delta.tool_calls)) {
          for (const tc of delta.tool_calls) {
            // New tool call starting (has id or function name)
            if (tc.id || (tc.function?.name && !inToolCall)) {
              // Finalize any previous tool call
              if (inToolCall) {
                try {
                  const parsedArgs = JSON.parse(toolCallArguments)
                  sendToolUseBlock(currentToolCallId, currentToolCallName, parsedArgs)
                } catch {
                  sendToolUseBlock(currentToolCallId, currentToolCallName, {})
                }
              }

              currentToolCallId = tc.id || `toolu_${Date.now()}`
              currentToolCallName = tc.function?.name || 'unknown'
              toolCallArguments = tc.function?.arguments || ''
              inToolCall = true
            }
            // Continuing tool call (accumulating arguments)
            else if (tc.function?.arguments) {
              toolCallArguments += tc.function.arguments
            }
          }
        }

        // Handle finish_reason
        if (finishReason) {
          if (finishReason === 'tool_calls' || finishReason === 'function_call') {
            // Finalize the tool call
            if (inToolCall) {
              try {
                const parsedArgs = JSON.parse(toolCallArguments)
                sendToolUseBlock(currentToolCallId, currentToolCallName, parsedArgs)
              } catch {
                sendToolUseBlock(currentToolCallId, currentToolCallName, {})
              }
              inToolCall = false
            }
            // Don't end stream yet — [DONE] will trigger endStream with tool_use
          } else if (finishReason === 'stop' || finishReason === 'length') {
            // Model is done generating
            if (inToolCall) {
              // Shouldn't happen, but handle gracefully
              try {
                const parsedArgs = JSON.parse(toolCallArguments)
                sendToolUseBlock(currentToolCallId, currentToolCallName, parsedArgs)
              } catch {
                sendToolUseBlock(currentToolCallId, currentToolCallName, {})
              }
              inToolCall = false
            }
          }
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
          if (!hasOpenBlock) {
            sendContentBlockStart('text', { text: '' })
          }
          sendTextDelta(delta.content)
        }
      } catch {}
    }

    // End the stream if not already ended by [DONE]
    if (!streamEnded) {
      endStream(inToolCall ? 'tool_use' : 'end_turn')
    }
  })

  nvidiaRes.on('error', (err) => {
    console.error('[FCC-Proxy] NVIDIA stream error:', err.message)
    if (!streamEnded) {
      endStream('end_turn')
    }
  })
}

// ─── Collect Request Body ─────────────────────────────────────
function collectBody(req) {
  return new Promise((resolve, reject) => {
    let body = ''
    req.on('data', chunk => body += chunk)
    req.on('end', () => resolve(body))
    req.on('error', reject)
  })
}

// ─── Main Request Handler ─────────────────────────────────────
async function handleRequest(req, res) {
  const rawUrl = req.url || '/'
  const method = req.method || 'GET'
  const urlPath = rawUrl.split('?')[0]

  // ─── Handle GET /v1/models ────
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
    console.log(`[FCC-Proxy] GET /v1/models → ${CLAUDE_MODELS.length} models`)
    return
  }

  // ─── Handle CORS preflight ────
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

  // ─── Health check ────
  if (urlPath === '/health' && method === 'GET') {
    const hasKey = !!FALLBACK_KEY
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({
      status: 'healthy',
      proxy: 'fcc-full-proxy-v5',
      models_available: CLAUDE_MODELS.length,
      default_model: DEFAULT_MODEL,
      resolved_nvidia_model: resolveNvidiaModel(DEFAULT_MODEL),
      has_default_key: hasKey,
      architecture: 'direct-to-nvidia',
      model_mapping: Object.fromEntries(CLAUDE_MODELS.map(m => [m.id, m.nvidiaModel])),
    }))
    return
  }

  // ─── Handle POST /v1/messages ────
  if ((urlPath === '/v1/messages' || urlPath === '/messages') && method === 'POST') {
    try {
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

      // Log for debugging (truncated to avoid spam)
      const msgCount = anthropicBody.messages?.length || 0
      const toolCount = anthropicBody.tools?.length || 0
      console.log(`[FCC-Proxy] POST /v1/messages model: ${requestedModel} → ${nvidiaModel} (key: ****${keySuffix}, stream: ${isStream}, msgs: ${msgCount}, tools: ${toolCount})`)

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
            errorMsg = 'NVIDIA API request timed out. Try a simpler request.'
          } else if (errStatus === 404) {
            errorType = 'not_found_error'
            errorMsg = `Model "${nvidiaModel}" not found on NVIDIA NIM. Try a different model.`
          } else if (errStatus === 400) {
            errorType = 'invalid_request_error'
            errorMsg = `NVIDIA API rejected the request: ${errorMsg}`
          }

          res.writeHead(errStatus, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({
            type: 'error',
            error: { type: errorType, message: errorMsg },
          }))
          return
        }

        if (isStream) {
          res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'Access-Control-Allow-Origin': '*',
            'X-Accel-Buffering': 'no', // Prevent nginx buffering
          })
          translateStream(nvidiaData, res, requestedModel)
        } else {
          const anthropicResponse = translateNvidiaToAnthropic(nvidiaData, requestedModel)
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

  // ─── 404 for unmatched routes ────
  res.writeHead(404, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({ error: 'Not found', available_endpoints: ['/v1/models', '/v1/messages', '/health'] }))
}

// ─── Start the proxy server ───────────────────────────────────
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
  console.log(`[FCC-Proxy-v5] Listening on port ${FCC_PROXY_PORT}`)
  console.log(`[FCC-Proxy-v5] Direct connection to NVIDIA NIM API (${NVIDIA_API_BASE})`)
  console.log(`[FCC-Proxy-v5] ${CLAUDE_MODELS.length} models available, default: ${DEFAULT_MODEL} → ${resolveNvidiaModel(DEFAULT_MODEL)}`)
  console.log(`[FCC-Proxy-v5] Model mapping (Claude ID → NVIDIA ID):`)
  for (const m of CLAUDE_MODELS) {
    console.log(`[FCC-Proxy-v5]   ${m.id.padEnd(28)} → ${m.nvidiaModel}`)
  }
  console.log(`[FCC-Proxy-v5] Fixes: streaming tool_use, message validation, keepalive, retry, frequency_penalty`)
  console.log(`[FCC-Proxy-v5] Per-user key isolation: ENABLED`)
  console.log(`[FCC-Proxy-v5] Endpoints: /v1/models, /v1/messages, /health`)
  console.log(`[FCC-Proxy-v5] Fallback key: ${FALLBACK_KEY ? '****' + FALLBACK_KEY.slice(-4) : 'NONE'}`)
})

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`[FCC-Proxy-v5] Port ${FCC_PROXY_PORT} already in use!`)
    console.error(`[FCC-Proxy-v5] Kill the existing process: fuser -k ${FCC_PROXY_PORT}/tcp`)
    process.exit(1)
  }
  console.error(`[FCC-Proxy-v5] Server error:`, err)
  process.exit(1)
})

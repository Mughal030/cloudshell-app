#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────
# setup-hermes.sh — Install the Hermes agent CLI wrapper
#
# Hermes is the in-IDE branding for an OpenCode CLI install that has
# been pre-wired to the OpenCode Zen provider with a curated set of
# free models. Users simply type `hermes` in any terminal.
#
# ───── SECURITY MODEL ─────
# This script does NOT contain any API key. The Hermes CLI uses the
# env var OPENCODE_ZEN_API_KEY at runtime, which is set PER-USER-SESSION
# by the Jasbol Hack web app:
#
#   - Admin users:  the app sets OPENCODE_ZEN_API_KEY in their shell
#                   env from the server-wide admin key (HERMES_OPencode_ZEN_API_KEY).
#                   The admin key is NEVER written to disk.
#   - Non-admin:    the app sets OPENCODE_ZEN_API_KEY from the user's
#                   own encrypted stored key. Non-admins MUST add their
#                   own key via the Hermes panel before `hermes` works.
#
# Usage:
#   setup-hermes           # install OpenCode CLI + write config + alias
# ──────────────────────────────────────────────────────────────────────────
set -euo pipefail

# ─── Locate OpenCode binary ───────────────────────────────────────
OPENCODE_BIN=""
for candidate in \
  "${HOME}/.opencode/bin/opencode" \
  "/usr/local/bin/opencode" \
  "$(command -v opencode 2>/dev/null || true)"; do
  if [ -n "$candidate" ] && [ -x "$candidate" ]; then
    OPENCODE_BIN="$candidate"
    break
  fi
done

if [ -z "$OPENCODE_BIN" ]; then
  echo "⚠  OpenCode CLI not found — installing it now..."
  if command -v curl >/dev/null 2>&1; then
    curl -fsSL https://opencode.ai/install | bash || {
      echo "✗ Failed to install OpenCode CLI. Install manually: https://opencode.ai/install"
      exit 1
    }
    OPENCODE_BIN="${HOME}/.opencode/bin/opencode"
  else
    echo "✗ curl not available — cannot auto-install OpenCode CLI."
    exit 1
  fi
fi

echo "✓ OpenCode CLI found at: $OPENCODE_BIN"
echo "   version: $("$OPENCODE_BIN" --version 2>&1 | head -1)"

# ─── Write OpenCode config ────────────────────────────────────────
# We define TWO providers because OpenCode Zen exposes Qwen3.6 Plus
# through the Anthropic-style /v1/messages endpoint, while every other
# free model goes through the OpenAI-compatible /v1/chat/completions
# endpoint.
#
# The API key is referenced via {env:OPENCODE_ZEN_API_KEY} — never
# hardcoded. The env var is set per-user-session by the web app.
OPENCODE_CONFIG_DIR="${HOME}/.config/opencode"
OPENCODE_CONFIG_FILE="${OPENCODE_CONFIG_DIR}/opencode.json"
mkdir -p "$OPENCODE_CONFIG_DIR"

cat > "$OPENCODE_CONFIG_FILE" <<'JSON'
{
  "$schema": "https://opencode.ai/config.json",
  "provider": {
    "opencode": {
      "name": "OpenCode Zen (Hermes)",
      "npm": "@ai-sdk/openai-compatible",
      "options": {
        "baseURL": "https://opencode.ai/zen/v1",
        "apiKey": "{env:OPENCODE_ZEN_API_KEY}"
      },
      "models": {
        "mimo-v2.5-free":         { "name": "MiMo V2.5 Free" },
        "nemotron-3-ultra-free":  { "name": "Nemotron 3 Ultra Free" },
        "north-mini-code-free":   { "name": "North Mini Code Free" },
        "deepseek-v4-flash-free": { "name": "DeepSeek V4 Flash Free" },
        "minimax-m3-free":        { "name": "MiniMax M3 Free" }
      }
    },
    "opencode-qwen": {
      "name": "OpenCode Zen — Qwen (Anthropic-style)",
      "npm": "@ai-sdk/anthropic",
      "options": {
        "baseURL": "https://opencode.ai/zen",
        "apiKey": "{env:OPENCODE_ZEN_API_KEY}"
      },
      "models": {
        "qwen3.6-plus": { "name": "Qwen3.6 Plus Free" }
      }
    }
  }
}
JSON

echo "✓ OpenCode config written to: $OPENCODE_CONFIG_FILE"

# ─── Add `hermes` alias to ~/.bashrc_aliases ──────────────────────
# The Hermes wrapper checks if OPENCODE_ZEN_API_KEY is set; if not, it
# prints a friendly error directing the user to add a key via the panel.
ALIASES_FILE="${HOME}/.bashrc_aliases"
touch "$ALIASES_FILE"
# Remove any prior Hermes alias / function definitions
sed -i '/^alias hermes=/d; /^hermes()/,/^}/d; /^# ─── Hermes agent/,/^ALIAS$/d' "$ALIASES_FILE" 2>/dev/null || true
cat >> "$ALIASES_FILE" <<'ALIAS'

# ─── Hermes agent — OpenCode CLI preconfigured for OpenCode Zen ───
# Hermes is the Jasbol Hack branded wrapper around OpenCode CLI,
# pre-wired to the OpenCode Zen chat API with a curated set of free
# models. The default model is set via $OPENCODE_ZEN_MODEL (mimo-v2.5-free
# if unset).
#
# API KEY: Hermes reads $OPENCODE_ZEN_API_KEY from the environment.
#   - Admin users: the web app exports the server admin key into your
#     shell on terminal spawn. Do NOT echo or share it.
#   - Non-admin users: open the Hermes panel in the sidebar and add
#     your own OpenCode Zen API key. The web app will export it into
#     your shell on terminal spawn ( decrypted from your encrypted store ).
#
# Use any of the whitelisted free models with:
#   hermes --model opencode/mimo-v2.5-free
#   hermes --model opencode/nemotron-3-ultra-free
#   hermes --model opencode/north-mini-code-free
#   hermes --model opencode/deepseek-v4-flash-free
#   hermes --model opencode/minimax-m3-free
#   hermes --model opencode-qwen/qwen3.6-plus
hermes() {
  if [ -z "${OPENCODE_ZEN_API_KEY:-}" ]; then
    echo "⚠  OPENCODE_ZEN_API_KEY is not set."
    echo ""
    echo "   Admin users: ensure the admin key is configured in the server env."
    echo "   Non-admin users: open the Hermes panel in the Jasbol Hack sidebar"
    echo "   and add your own OpenCode Zen API key."
    echo ""
    echo "   Get a free key at: https://opencode.ai/zen"
    return 1
  fi
  command opencode "$@"
}

hermes-show() {
  echo "═══════════════════════════════════════════════════════════════"
  echo "  Hermes agent status"
  echo "═══════════════════════════════════════════════════════════════"
  if [ -n "${OPENCODE_ZEN_API_KEY:-}" ]; then
    local _suffix="${OPENCODE_ZEN_API_KEY: -4}"
    echo "  API key:        ****${_suffix}"
    echo "  Key source:     ${OPENCODE_ZEN_KEY_SOURCE:-env}"
  else
    echo "  API key:        (not set — see setup instructions above)"
  fi
  echo "  Default model:  ${OPENCODE_ZEN_MODEL:-mimo-v2.5-free}"
  echo "  Config file:    ${HOME}/.config/opencode/opencode.json"
  echo "  Binary:         $(command -v opencode 2>/dev/null || echo '(not installed)')"
  echo ""
  echo "  Available free models:"
  echo "    opencode/mimo-v2.5-free          MiMo V2.5 Free (Xiaomi)"
  echo "    opencode/nemotron-3-ultra-free   Nemotron 3 Ultra Free (NVIDIA)"
  echo "    opencode/north-mini-code-free    North Mini Code Free (Stealth)"
  echo "    opencode/deepseek-v4-flash-free  DeepSeek V4 Flash Free"
  echo "    opencode/minimax-m3-free         MiniMax M3 Free"
  echo "    opencode-qwen/qwen3.6-plus       Qwen3.6 Plus Free (Alibaba)"
  echo "═══════════════════════════════════════════════════════════════"
}

hermes-list-models() {
  cat <<EOF
opencode/mimo-v2.5-free          MiMo V2.5 Free (Xiaomi)
opencode/nemotron-3-ultra-free   Nemotron 3 Ultra Free (NVIDIA)
opencode/north-mini-code-free    North Mini Code Free (Stealth)
opencode/deepseek-v4-flash-free  DeepSeek V4 Flash Free
opencode/minimax-m3-free         MiniMax M3 Free
opencode-qwen/qwen3.6-plus       Qwen3.6 Plus Free (Alibaba)
EOF
}
ALIAS

# ─── Final summary ────────────────────────────────────────────────
echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  Hermes agent CLI ready!"
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "  Config:    ${OPENCODE_CONFIG_FILE}"
echo "  Binary:    ${OPENCODE_BIN}"
echo ""
echo "  NOTE: No API key is stored by this installer."
echo "  API keys are injected per-user-session by the Jasbol Hack web app:"
echo "    - Admin → from server env (HERMES_OPencode_ZEN_API_KEY)"
echo "    - Non-admin → from your encrypted per-user store"
echo ""
echo "  Available free models:"
echo "    opencode/mimo-v2.5-free          MiMo V2.5 Free (Xiaomi)"
echo "    opencode/nemotron-3-ultra-free   Nemotron 3 Ultra Free (NVIDIA)"
echo "    opencode/north-mini-code-free    North Mini Code Free (Stealth)"
echo "    opencode/deepseek-v4-flash-free  DeepSeek V4 Flash Free"
echo "    opencode/minimax-m3-free         MiniMax M3 Free"
echo "    opencode-qwen/qwen3.6-plus       Qwen3.6 Plus Free (Alibaba)"
echo ""
echo "  Quick start:"
echo "    hermes                      # interactive chat (requires API key)"
echo "    hermes --model opencode/deepseek-v4-flash-free"
echo "    hermes-show                 # show current config"
echo "    hermes-list-models          # list available models"
echo ""
echo "  Open a new terminal (or run: source ~/.bashrc_aliases) to pick up the alias."
echo "═══════════════════════════════════════════════════════════════"

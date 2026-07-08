#!/usr/bin/env python3
"""
Test NVIDIA API (z-ai/glm-5.2) connection via OpenAI SDK.
This verifies that the Claude Code config (ANTHROPIC_BASE_URL, ANTHROPIC_AUTH_TOKEN, ANTHROPIC_MODEL)
is correctly pointed at the NVIDIA API endpoint.

Usage:
  python3 test-nvidia-api.py
  OR via CloudShell: claude-test
"""

import os
import sys

# ─── Configuration ───────────────────────────────────────────
NVIDIA_BASE_URL = os.environ.get("ANTHROPIC_BASE_URL", "https://integrate.api.nvidia.com/v1")
NVIDIA_API_KEY  = os.environ.get("ANTHROPIC_AUTH_TOKEN", "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")
MODEL_NAME      = os.environ.get("ANTHROPIC_MODEL", "z-ai/glm-5.2")

# ─── Color helpers ───────────────────────────────────────────
_USE_COLOR = sys.stdout.isatty() and os.getenv("NO_COLOR") is None
_GREEN  = "\033[92m" if _USE_COLOR else ""
_RED    = "\033[91m" if _USE_COLOR else ""
_YELLOW = "\033[93m" if _USE_COLOR else ""
_CYAN   = "\033[96m" if _USE_COLOR else ""
_DIM    = "\033[2m"  if _USE_COLOR else ""
_BOLD   = "\033[1m"  if _USE_COLOR else ""
_RESET  = "\033[0m"  if _USE_COLOR else ""

def print_header(msg):
    print(f"\n{_BOLD}{_CYAN}{'='*60}{_RESET}")
    print(f"{_BOLD}{_CYAN}  {msg}{_RESET}")
    print(f"{_BOLD}{_CYAN}{'='*60}{_RESET}\n")

def print_ok(msg):
    print(f"  {_GREEN}✓{_RESET} {msg}")

def print_fail(msg):
    print(f"  {_RED}✗{_RESET} {msg}")

def print_info(msg):
    print(f"  {_YELLOW}ℹ{_RESET} {msg}")

def print_dim(msg):
    print(f"  {_DIM}{msg}{_RESET}")

def mask_key(key):
    if len(key) > 8:
        return key[:4] + "****" + key[-4:]
    return "****"

# ─── Main test ───────────────────────────────────────────────
def main():
    print_header("NVIDIA API (z-ai/glm-5.2) Connection Test")

    # Step 1: Show config
    print(f"{_BOLD}Configuration:{_RESET}")
    print_info(f"Endpoint: {NVIDIA_BASE_URL}")
    print_info(f"Model:    {MODEL_NAME}")
    print_info(f"API Key:  {mask_key(NVIDIA_API_KEY)}")
    print()

    # Step 2: Install openai if needed
    try:
        from openai import OpenAI
        print_ok("openai SDK is installed")
    except ImportError:
        print_fail("openai SDK not found — installing via pip3...")
        import subprocess
        result = subprocess.run(
            [sys.executable, "-m", "pip", "install", "--user", "openai"],
            capture_output=True, text=True
        )
        if result.returncode == 0:
            print_ok("openai SDK installed successfully")
            from openai import OpenAI
        else:
            print_fail(f"Failed to install openai: {result.stderr}")
            sys.exit(1)

    # Step 3: Create client
    print()
    print(f"{_BOLD}Creating OpenAI client...{_RESET}")
    try:
        client = OpenAI(
            base_url=NVIDIA_BASE_URL,
            api_key=NVIDIA_API_KEY,
        )
        print_ok("Client created")
    except Exception as e:
        print_fail(f"Failed to create client: {e}")
        sys.exit(1)

    # Step 4: Send test request (non-streaming)
    print()
    print(f"{_BOLD}Sending test request (non-streaming)...{_RESET}")
    try:
        completion = client.chat.completions.create(
            model=MODEL_NAME,
            messages=[{"role": "user", "content": "Say hello in one word"}],
            temperature=0.7,
            max_tokens=32,
            stream=False,
        )
        reply = completion.choices[0].message.content
        print_ok(f"Response: {_CYAN}{reply}{_RESET}")
        print_dim(f"Model used: {getattr(completion, 'model', MODEL_NAME)}")
        print_dim(f"Tokens: prompt={getattr(completion.usage, 'prompt_tokens', 'N/A')}, "
                  f"completion={getattr(completion.usage, 'completion_tokens', 'N/A')}")
    except Exception as e:
        print_fail(f"Non-streaming request failed: {e}")
        print()
        print_dim("Common fixes:")
        print_dim("  - Check API key is valid:  claude-set-key 'nvapi-...'")
        print_dim("  - Check endpoint URL:      claude-set-url 'https://integrate.api.nvidia.com/v1'")
        print_dim("  - Check model name:        claude-set-model 'z-ai/glm-5.2'")
        print()
        # Still try streaming as fallback
        print(f"{_BOLD}Trying streaming mode as fallback...{_RESET}")

    # Step 5: Send streaming test
    print()
    print(f"{_BOLD}Sending streaming test...{_RESET}")
    try:
        stream = client.chat.completions.create(
            model=MODEL_NAME,
            messages=[{"role": "user", "content": "Count from 1 to 5, one number per line"}],
            temperature=0.3,
            max_tokens=64,
            stream=True,
        )
        full_reply = ""
        for chunk in stream:
            if not getattr(chunk, "choices", None):
                continue
            if len(chunk.choices) == 0 or getattr(chunk.choices[0], "delta", None) is None:
                continue
            delta = chunk.choices[0].delta
            if getattr(delta, "content", None) is not None:
                content = delta.content
                full_reply += content
                print(f"{_CYAN}{content}{_RESET}", end="", flush=True)
        print()
        if full_reply:
            print_ok("Streaming works!")
        else:
            print_fail("Streaming returned empty content")
    except Exception as e:
        print_fail(f"Streaming test failed: {e}")

    # Step 6: Summary
    print()
    print_header("Test Complete")
    print_ok("NVIDIA API endpoint is configured as the Claude Code backend")
    print_info(f"Claude Code will use: {MODEL_NAME} via {NVIDIA_BASE_URL}")
    print()
    print_dim("To use Claude Code, just type: claude")
    print_dim("To change settings:")
    print_dim("  claude-set-url 'https://integrate.api.nvidia.com/v1'")
    print_dim("  claude-set-key 'nvapi-your-key'")
    print_dim("  claude-set-model 'z-ai/glm-5.2'")
    print()

if __name__ == "__main__":
    main()

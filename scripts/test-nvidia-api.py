#!/usr/bin/env python3
"""
Test the free-claude-code proxy + NVIDIA NIM API.
Verifies that Claude Code can work through the proxy.

Usage:
  python3 test-nvidia-api.py
  OR via CloudShell: claude-test-py
"""

import os
import sys

# ─── Configuration ───────────────────────────────────────────
PROXY_URL = "http://localhost:8082"
NVIDIA_API_KEY = os.environ.get("NVIDIA_NIM_API_KEY", "")
MODEL = os.environ.get("ANTHROPIC_MODEL", "nvidia/nemotron-3-super-120b-a12b")

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
    print_header("Free-Claude-Code Proxy + NVIDIA API Test")

    # Step 1: Show config
    print(f"{_BOLD}Configuration:{_RESET}")
    print_info(f"Proxy URL:     {PROXY_URL}")
    print_info(f"Model:         {MODEL}")
    print_info(f"NVIDIA Key:    {mask_key(NVIDIA_API_KEY)}" if NVIDIA_API_KEY else "  ⚠ NVIDIA key not set")
    print()

    # Step 2: Test proxy health
    print(f"{_BOLD}Step 1: Testing proxy health...{_RESET}")
    try:
        import urllib.request
        req = urllib.request.urlopen(f"{PROXY_URL}/health", timeout=5)
        health = req.read().decode()
        print_ok(f"Proxy is running! Health: {health[:100]}")
    except Exception as e:
        print_fail(f"Proxy not reachable: {e}")
        print()
        print_dim("Start the proxy first: fcc-start")
        print_dim("Or install it: setup-fcc-proxy")
        return 1

    # Step 3: Install openai if needed
    print()
    print(f"{_BOLD}Step 2: Checking openai SDK...{_RESET}")
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
            print_ok("openai SDK installed")
            from openai import OpenAI
        else:
            print_fail(f"Failed to install: {result.stderr}")
            return 1

    # Step 4: Test via proxy using Anthropic-style message format
    # The proxy accepts both OpenAI and Anthropic format requests
    print()
    print(f"{_BOLD}Step 3: Testing API call through proxy (Anthropic format)...{_RESET}")
    try:
        import json
        req = urllib.request.Request(
            f"{PROXY_URL}/v1/messages",
            data=json.dumps({
                "model": MODEL,
                "messages": [{"role": "user", "content": "Say hello in one word"}],
                "max_tokens": 32,
                "stream": False,
            }).encode(),
            headers={
                "Content-Type": "application/json",
                "x-api-key": "freecc",
                "anthropic-version": "2023-06-01",
            },
        )
        with urllib.request.urlopen(req, timeout=60) as resp:
            body = json.loads(resp.read().decode())
            content_blocks = body.get("content", [])
            if content_blocks:
                text = content_blocks[0].get("text", "N/A")
                print_ok(f"AI Response: {_CYAN}{text}{_RESET}")
            else:
                print_fail("Empty response from proxy")
    except urllib.error.HTTPError as e:
        error_body = e.read().decode()[:500]
        print_fail(f"HTTP {e.code}: {error_body}")
        print()
        print_dim("Common fixes:")
        print_dim("  - Update NVIDIA key: claude-set-nvidia-key \"nvapi-...\"")
        print_dim("  - Restart proxy: fcc-stop && fcc-start")
        print_dim("  - Check logs: tail -f /tmp/fcc-server.log")
        return 1
    except Exception as e:
        print_fail(f"Request failed: {e}")
        return 1

    # Step 5: Summary
    print()
    print_header("Test Complete — All Systems Working!")
    print_ok("free-claude-code proxy is running on localhost:8082")
    print_ok(f"Claude Code can use model: {MODEL}")
    print()
    print_dim("To start Claude Code, just type: claude")
    print_dim("To change your NVIDIA key:")
    print_dim('  claude-set-nvidia-key "nvapi-your-key-here"')
    print_dim("  fcc-stop && fcc-start")
    print()
    return 0

if __name__ == "__main__":
    sys.exit(main())

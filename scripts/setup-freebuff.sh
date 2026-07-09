#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────
# setup-freebuff.sh — Preinstall the FreeBuff security toolkit
#
# FreeBuff is Jasbol Hack's curated bundle of free, open-source security
# and bug-bounty tools. It installs a curated set of CLI tools commonly
# used by security researchers — all from official apt/pip/GitHub
# releases, no shady mirrors.
#
# After install, the `freebuff` command opens an interactive menu.
#
# Tools installed (all free & open-source):
#   - nmap           Network scanner
#   - masscan        Fast port scanner
#   - nikto          Web vulnerability scanner
#   - sqlmap         SQL injection tool
#   - dirb           Directory bruteforcer
#   - gobuster       Directory/file bruteforcer (Go)
#   - ffuf           Web fuzzer (Go)
#   - httpx          HTTP prober (Go)
#   - subfinder      Subdomain finder (Go)
#   - nuclei         Vulnerability scanner (Go)
#   - whatweb        Web tech identifier
#   - wpscan         WordPress scanner (Ruby)
#   - theharvester   Email/subdomain harvester (Python)
#   - recon-ng       Web recon framework (Python)
#   - dnsenum        DNS enumeration
#   - dnsrecon       DNS enumeration (Python)
#   - whois          WHOIS lookup
#   - curl, jq, httpie  HTTP utilities
#   - binwalk        Firmware analysis
#   - exiftool       Metadata extraction
#   - hashcat        Hash cracker
#   - john           Hash cracker (John the Ripper)
#
# Usage:
#   setup-freebuff                 # install everything (full bundle)
#   setup-freebuff --minimal       # install only the lightweight tools
#   setup-freebuff --list          # list installed/available tools
# ──────────────────────────────────────────────────────────────────────────
set -euo pipefail

MINIMAL=0
LIST_ONLY=0
case "${1:-}" in
  --minimal) MINIMAL=1 ;;
  --list)    LIST_ONLY=1 ;;
  --help|-h)
    echo "Usage: setup-freebuff [--minimal|--list|--help]"
    echo "  --minimal   Install only lightweight Python/CLI tools"
    echo "  --list      List tools and exit"
    exit 0
    ;;
esac

# ─── Tool definitions ─────────────────────────────────────────────
# Format: "name|install_command|category|description"
TOOLS=(
  "nmap|sudo apt-get install -y nmap|scanner|Network scanner"
  "masscan|sudo apt-get install -y masscan|scanner|Fast port scanner"
  "nikto|sudo apt-get install -y nikto|web|Web vulnerability scanner"
  "sqlmap|sudo apt-get install -y sqlmap|web|SQL injection tool"
  "dirb|sudo apt-get install -y dirb|web|Directory bruteforcer"
  "whatweb|sudo apt-get install -y whatweb|web|Web tech identifier"
  "dnsenum|sudo apt-get install -y dnsenum|recon|DNS enumeration"
  "whois|sudo apt-get install -y whois|recon|WHOIS lookup"
  "curl|sudo apt-get install -y curl|util|HTTP utility"
  "jq|sudo apt-get install -y jq|util|JSON processor"
  "httpie|sudo apt-get install -y httpie|util|HTTP client"
  "binwalk|sudo apt-get install -y binwalk|firmware|Firmware analyzer"
  "exiftool|sudo apt-get install -y libimage-exiftool-perl|firmware|Metadata extractor"
  "john|sudo apt-get install -y john|crack|Hash cracker"
  "hashcat|sudo apt-get install -y hashcat|crack|GPU hash cracker"
  "theharvester|pip3 install --user theHarvester|recon|Email/subdomain harvester"
  "recon-ng|pip3 install --user recon-ng|recon|Web recon framework"
  "dnsrecon|pip3 install --user dnsrecon|recon|DNS enumeration"
  "wpscan|sudo gem install wpscan|web|WordPress scanner"
)

# Go-based tools (installed via `go install` — only if Go is available)
GO_TOOLS=(
  "gobuster|github.com/OJ/gobuster/v3@latest|web|Directory bruteforcer"
  "ffuf|github.com/ffuf/ffuf/v2@latest|web|Web fuzzer"
  "httpx|github.com/projectdiscovery/httpx/cmd/httpx@latest|recon|HTTP prober"
  "subfinder|github.com/projectdiscovery/subfinder/v2/cmd/subfinder@latest|recon|Subdomain finder"
  "nuclei|github.com/projectdiscovery/nuclei/v3/cmd/nuclei@latest|recon|Vulnerability scanner"
)

if [ "$LIST_ONLY" = "1" ]; then
  echo "═══════════════════════════════════════════════════════════════"
  echo "  FreeBuff — Security Toolkit Inventory"
  echo "═══════════════════════════════════════════════════════════════"
  echo ""
  echo "  APT/Pip/Ruby tools:"
  for t in "${TOOLS[@]}"; do
    IFS='|' read -r name _ cat desc <<< "$t"
    status="missing"
    command -v "$name" >/dev/null 2>&1 && status="installed"
    printf "  %-14s %-10s %-10s %s\n" "$name" "[$status]" "[$cat]" "$desc"
  done
  echo ""
  echo "  Go-based tools:"
  for t in "${GO_TOOLS[@]}"; do
    IFS='|' read -r name _ cat desc <<< "$t"
    status="missing"
    command -v "$name" >/dev/null 2>&1 && status="installed"
    printf "  %-14s %-10s %-10s %s\n" "$name" "[$status]" "[$cat]" "$desc"
  done
  echo ""
  echo "═══════════════════════════════════════════════════════════════"
  exit 0
fi

echo "═══════════════════════════════════════════════════════════════"
echo "  FreeBuff — Installing security toolkit"
echo "  Mode: $([ "$MINIMAL" = "1" ] && echo "minimal (lightweight only)" || echo "full")"
echo "═══════════════════════════════════════════════════════════════"
echo ""

# ─── Update apt once (saves time) ─────────────────────────────────
if [ "$(id -u)" = "0" ] || sudo -n true 2>/dev/null; then
  echo "→ Updating apt cache…"
  sudo apt-get update -qq 2>&1 | tail -2 || echo "  (apt update failed — will try install anyway)"
fi

# ─── Install apt/pip/ruby tools ───────────────────────────────────
INSTALLED=0
FAILED=0
for t in "${TOOLS[@]}"; do
  IFS='|' read -r name cmd cat desc <<< "$t"

  # Skip heavy tools in minimal mode
  if [ "$MINIMAL" = "1" ]; then
    case "$name" in
      masscan|nikto|sqlmap|wpscan|hashcat|john|binwalk|exiftool|recon-ng|theharvester)
        echo "  ⊘ skip $name (minimal mode)"
        continue ;;
    esac
  fi

  if command -v "$name" >/dev/null 2>&1; then
    echo "  ✓ $name already installed"
    continue
  fi

  echo "  → installing $name…"
  if eval "$cmd" >/dev/null 2>&1; then
    echo "    ✓ $name installed"
    INSTALLED=$((INSTALLED+1))
  else
    echo "    ✗ $name failed"
    FAILED=$((FAILED+1))
  fi
done

# ─── Install Go tools (only in full mode + if Go is available) ────
if [ "$MINIMAL" = "0" ] && command -v go >/dev/null 2>&1; then
  echo ""
  echo "→ Installing Go-based tools…"
  for t in "${GO_TOOLS[@]}"; do
    IFS='|' read -r name pkg cat desc <<< "$t"
    if command -v "$name" >/dev/null 2>&1; then
      echo "  ✓ $name already installed"
      continue
    fi
    echo "  → installing $name…"
    if go install "$pkg" >/dev/null 2>&1; then
      echo "    ✓ $name installed"
      INSTALLED=$((INSTALLED+1))
    else
      echo "    ✗ $name failed"
      FAILED=$((FAILED+1))
    fi
  done
elif [ "$MINIMAL" = "0" ]; then
  echo ""
  echo "  ⊘ Go not installed — skipping Go-based tools (gobuster, ffuf, httpx, subfinder, nuclei)"
  echo "    Install Go first: curl -fsSL https://go.dev/dl/go1.22.0.linux-amd64.tar.gz | tar -C ~/.local -xzf -"
fi

# ─── Install the `freebuff` shell menu function ───────────────────
ALIASES_FILE="${HOME}/.bashrc_aliases"
touch "$ALIASES_FILE"
# Remove any prior FreeBuff function
sed -i '/^freebuff()/,/^}/d' "$ALIASES_FILE" 2>/dev/null || true
cat >> "$ALIASES_FILE" <<'ALIAS'

# ─── FreeBuff — Interactive security toolkit menu ─────────────────
freebuff() {
  echo "═══════════════════════════════════════════════════════════════"
  echo "  FreeBuff — Security Toolkit"
  echo "═══════════════════════════════════════════════════════════════"
  echo ""
  echo "  Available tools:"
  echo "    1. nmap          — Network scanner"
  echo "    2. masscan       — Fast port scanner"
  echo "    3. nikto         — Web vulnerability scanner"
  echo "    4. sqlmap        — SQL injection"
  echo "    5. gobuster      — Directory bruteforcer"
  echo "    6. ffuf          — Web fuzzer"
  echo "    7. httpx         — HTTP prober"
  echo "    8. subfinder     — Subdomain finder"
  echo "    9. nuclei        — Vulnerability scanner"
  echo "   10. whatweb       — Web tech identifier"
  echo "   11. wpscan        — WordPress scanner"
  echo "   12. theharvester  — Email/subdomain harvester"
  echo "   13. recon-ng      — Web recon framework"
  echo "   14. dnsenum       — DNS enumeration"
  echo "   15. dnsrecon      — DNS enumeration (Python)"
  echo "   16. whois         — WHOIS lookup"
  echo "   17. binwalk       — Firmware analyzer"
  echo "   18. exiftool      — Metadata extractor"
  echo "   19. john          — Hash cracker"
  echo "   20. hashcat       — GPU hash cracker"
  echo "    s. setup-freebuff         — reinstall/refresh tools"
  echo "    l. setup-freebuff --list  — list installed tools"
  echo "    q. quit"
  echo ""
  read -p "  Select tool [1-20/s/l/q]: " choice
  case "$choice" in
    1) nmap -h ;;
    2) masscan --help ;;
    3) nikto -H ;;
    4) sqlmap --help ;;
    5) gobuster --help ;;
    6) ffuf -h ;;
    7) httpx --help ;;
    8) subfinder --help ;;
    9) nuclei --help ;;
    10) whatweb --help ;;
    11) wpscan --help ;;
    12) theHarvester --help ;;
    13) recon-ng --help ;;
    14) dnsenum --help ;;
    15) dnsrecon --help ;;
    16) whois --help ;;
    17) binwalk --help ;;
    18) exiftool ;;
    19) john ;;
    20) hashcat --help ;;
    s) setup-freebuff ;;
    l) setup-freebuff --list ;;
    q) return 0 ;;
    *) echo "  Invalid choice" ;;
  esac
}
ALIAS

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  FreeBuff install complete!"
echo "  Installed: $INSTALLED    Failed: $FAILED"
echo "  Type 'freebuff' in a new terminal to open the menu."
echo "  Run 'setup-freebuff --list' to see all available tools."
echo "═══════════════════════════════════════════════════════════════"

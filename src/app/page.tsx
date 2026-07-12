'use client'

import { useState, useEffect, useCallback, memo } from 'react'
import dynamic from 'next/dynamic'
import Image from 'next/image'
import {
  Terminal, Sun, Moon, Plus, X,
  Wifi, WifiOff, Wrench, FolderTree,
  SquareTerminal, LogOut, Shield, User, Package,
  Cpu, Database, Cloud, Code2, Sparkles, Zap,
  ChevronDown, ChevronUp,
  Globe, ScanLine, Bug, KeyRound, Smartphone, Network,
  Search, FileSearch, List, Boxes, Rocket,
  Settings, Eye, EyeOff, Trash2, CheckCircle2, AlertCircle,
} from 'lucide-react'
import { useTheme } from 'next-themes'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Input } from '@/components/ui/input'
import { useSocket } from '@/hooks/use-socket'
import { FileManager } from '@/components/terminal/file-manager'
import { ToolStatus } from '@/components/terminal/tool-status'
import { PackageSidebar } from '@/components/terminal/package-sidebar'

// Lazy-load heavy panels — they only mount when their tab is activated.
// This cuts initial JS parse/execute time and avoids spawning socket requests
// for panels the user never opens.
const CodeEditor = dynamic(() => import('@/components/terminal/code-editor').then(m => ({ default: m.CodeEditor })), {
  ssr: false,
  loading: () => <div className="flex items-center justify-center h-full text-xs text-[var(--nx-text-dim)]">Loading editor...</div>,
})

const XtermTerminal = dynamic(
  () => import('@/components/terminal/xterm-terminal').then(mod => ({ default: mod.XtermTerminal })),
  { ssr: false, loading: () => <div className="w-full h-full bg-[#060816]" /> }
)
// Memoize so terminal instances don't re-render when parent state changes
const MemoizedXtermTerminal = memo(XtermTerminal)

// ─── Quick Install Toolkit (ALL sudo/apt/docker-FREE) ───────────────
// Every command below runs as the regular cloudshell user with NO root,
// NO apt, NO docker. Installations go to ~/.local/bin, ~/.npm-global/bin,
// ~/.cargo/bin, ~/.bun/bin, etc. — all on PATH via the entrypoint.
//
// Tools that traditionally need sudo/apt have been replaced with
// no-root alternatives: pip3 --user, npm -g, gem --user-install,
// direct binary downloads, git clone, Go install, etc.
const QUICK_INSTALL = {
  'AI & CLI Tools': [
    { name: 'Claude Code', cmd: 'setup-claude-code', icon: 'sparkles' },
    { name: 'FCC Proxy Setup', cmd: 'setup-fcc-proxy', icon: 'zap' },
    { name: 'Start Claude (fcc-claude)', cmd: 'fcc-claude', icon: 'sparkles' },
    { name: 'Test Claude+Proxy', cmd: 'claude-test', icon: 'zap' },
    { name: 'OpenAI Python SDK', cmd: 'pip3 install --user openai && echo "openai SDK installed"', icon: 'code' },
    { name: 'TypeScript', cmd: 'npm install -g typescript && echo "TypeScript installed to ~/.npm-global!"', icon: 'code' },
    { name: 'Vercel CLI', cmd: 'npm install -g vercel && echo "Vercel CLI installed!"', icon: 'cloud' },
    { name: 'Netlify CLI', cmd: 'npm install -g netlify-cli && echo "Netlify CLI installed!"', icon: 'cloud' },
    { name: 'AWS CLI v2', cmd: 'pip3 install --user awscli && echo "AWS CLI installed to ~/.local/bin/aws"', icon: 'cloud' },
    { name: 'GitHub CLI (gh)', cmd: 'GH_VER=$(curl -s https://api.github.com/repos/cli/cli/releases/latest | grep -oP \'"tag_name":\\s*"v\\K[^"]+\') && curl -fsSL "https://github.com/cli/cli/releases/download/v${GH_VER}/gh_${GH_VER}_linux_amd64.tar.gz" -o /tmp/gh.tgz && tar -xzf /tmp/gh.tgz -C /tmp && cp /tmp/gh_${GH_VER}_linux_amd64/bin/gh ~/.local/bin/gh && chmod +x ~/.local/bin/gh && rm -rf /tmp/gh* && echo "gh v${GH_VER} installed to ~/.local/bin/gh"', icon: 'code' },
    { name: 'Cloudflare Wrangler', cmd: 'npm install -g wrangler && echo "Wrangler installed to ~/.npm-global/bin"', icon: 'cloud' },
    { name: 'Supabase CLI', cmd: 'SB_VER=$(curl -s https://api.github.com/repos/supabase/cli/releases/latest | grep -oP \'"tag_name":\\s*"v\\K[^"]+\') && curl -fsSL "https://github.com/supabase/cli/releases/download/v${SB_VER}/supabase_linux_amd64.tar.gz" -o /tmp/sb.tgz && tar -xzf /tmp/sb.tgz -C ~/.local/bin supabase && chmod +x ~/.local/bin/supabase && rm /tmp/sb.tgz && echo "Supabase CLI v${SB_VER} installed"', icon: 'cloud' },
  ],
  'Dev Tools': [
    { name: 'Node.js (nvm)', cmd: 'curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash && source ~/.bashrc && nvm install --lts', icon: 'node' },
    { name: 'Rust', cmd: 'curl --proto "=https" --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y && source $HOME/.cargo/env', icon: 'lang' },
    { name: 'Bun', cmd: 'curl -fsSL https://bun.sh/install | bash && source ~/.bashrc', icon: 'node' },
    { name: 'Deno', cmd: 'curl -fsSL https://deno.land/install.sh | sh', icon: 'lang' },
    { name: 'Go', cmd: 'curl -fsSL https://go.dev/dl/go1.22.0.linux-amd64.tar.gz | tar -C ~/.local -xzf - && echo "export PATH=$HOME/.local/go/bin:$PATH" >> ~/.bashrc && echo "Go installed to ~/.local/go"', icon: 'lang' },
    { name: 'Python pip pkgs', cmd: 'pip3 install --user pipx httpx requests rich && echo "pip pkgs installed to ~/.local/bin"', icon: 'lang' },
    { name: 'pipx (Python apps)', cmd: 'pip3 install --user pipx && ~/.local/bin/pipx ensurepath && echo "pipx installed to ~/.local/bin"', icon: 'lang' },
    { name: 'pnpm', cmd: 'npm install -g pnpm && echo "pnpm installed to ~/.npm-global/bin"', icon: 'node' },
    { name: 'yarn', cmd: 'npm install -g yarn && echo "yarn installed to ~/.npm-global/bin"', icon: 'node' },
    { name: 'turborepo', cmd: 'npm install -g turbo && echo "turbo installed"', icon: 'node' },
    { name: 'tsx (TS runner)', cmd: 'npm install -g tsx && echo "tsx installed"', icon: 'code' },
    { name: 'esbuild', cmd: 'npm install -g esbuild && echo "esbuild installed"', icon: 'code' },
  ],
  'Databases': [
    { name: 'PostgreSQL Client', cmd: 'pip3 install --user pgcli && echo "pgcli installed to ~/.local/bin"', icon: 'db' },
    { name: 'MySQL Client', cmd: 'pip3 install --user mycli && echo "mycli installed to ~/.local/bin"', icon: 'db' },
    { name: 'Redis Tools', cmd: 'pip3 install --user iredis && echo "iredis installed to ~/.local/bin"', icon: 'db' },
    { name: 'SQLite Browser', cmd: 'pip3 install --user sqlite-web && echo "sqlite-web installed to ~/.local/bin"', icon: 'db' },
    { name: 'SQL Utils', cmd: 'pip3 install --user sqlfluff sqlparse && echo "SQL utils installed to ~/.local/bin"', icon: 'db' },
    { name: 'MongoDB Client', cmd: 'npm install -g mongosh && echo "mongosh installed to ~/.npm-global/bin"', icon: 'db' },
    { name: 'Prisma ORM', cmd: 'npm install -g prisma && echo "Prisma installed"', icon: 'db' },
    { name: 'Drizzle ORM', cmd: 'npm install -g drizzle-kit && echo "Drizzle Kit installed"', icon: 'db' },
  ],
  'Recon & OSINT': [
    { name: 'theHarvester', cmd: 'pip3 install --user theHarvester && echo "theHarvester installed to ~/.local/bin"', icon: 'globe' },
    { name: 'Sherlock', cmd: 'pip3 install --user sherlock-project && echo "Sherlock installed to ~/.local/bin"', icon: 'globe' },
    { name: 'Maigret', cmd: 'pip3 install --user maigret && echo "Maigret installed to ~/.local/bin"', icon: 'globe' },
    { name: 'Holehe', cmd: 'pip3 install --user holehe && echo "Holehe installed to ~/.local/bin"', icon: 'globe' },
    { name: 'Socialscan', cmd: 'pip3 install --user socialscan && echo "socialscan installed to ~/.local/bin"', icon: 'globe' },
    { name: 'Shodan CLI', cmd: 'pip3 install --user shodan && echo "shodan installed to ~/.local/bin"', icon: 'globe' },
    { name: 'Censys CLI', cmd: 'pip3 install --user censys && echo "censys installed to ~/.local/bin"', icon: 'globe' },
    { name: 'Subfinder', cmd: 'curl -fsSL "https://github.com/projectdiscovery/subfinder/releases/download/v2.6.6/subfinder_2.6.6_linux_amd64.zip" -o /tmp/sf.zip && cd /tmp && unzip -o sf.zip subfinder && mv subfinder ~/.local/bin/ && chmod +x ~/.local/bin/subfinder && rm /tmp/sf.zip && echo "subfinder installed to ~/.local/bin"', icon: 'globe' },
    { name: 'Assetfinder', cmd: 'curl -fsSL "https://github.com/tomnomnom/assetfinder/releases/download/v0.1.1/assetfinder-linux-amd64-0.1.1.tgz" -o /tmp/af.tgz && tar -xzf /tmp/af.tgz -C ~/.local/bin assetfinder && chmod +x ~/.local/bin/assetfinder && rm /tmp/af.tgz && echo "assetfinder installed to ~/.local/bin"', icon: 'globe' },
    { name: 'Amass', cmd: 'curl -fsSL "https://github.com/owasp-amass/amass/releases/download/v4.2.0/amass_linux_amd64.zip" -o /tmp/am.zip && cd /tmp && unzip -o am.zip && mv amass_linux_amd64/amass ~/.local/bin/ && chmod +x ~/.local/bin/amass && rm -rf /tmp/am* /tmp/amass_linux_amd64 && echo "amass installed to ~/.local/bin"', icon: 'globe' },
    { name: 'Sublist3r', cmd: 'cd ~/.local && git clone https://github.com/aboul3la/Sublist3r.git ~/.local/Sublist3r && pip3 install --user -r ~/.local/Sublist3r/requirements.txt && ln -sf ~/.local/Sublist3r/sublist3r.py ~/.local/bin/sublist3r && chmod +x ~/.local/bin/sublist3r && echo "Sublist3r installed"', icon: 'globe' },
    { name: 'DNSrecon', cmd: 'pip3 install --user dnsrecon && echo "dnsrecon installed to ~/.local/bin"', icon: 'globe' },
    { name: 'WhatWeb', cmd: 'gem install --user-install whatweb && echo "whatweb installed via gem"', icon: 'globe' },
    { name: 'Wappalyzer', cmd: 'npm install -g wappalyzer && echo "wappalyzer installed"', icon: 'globe' },
  ],
  'Web Scanners': [
    { name: 'Nikto', cmd: 'git clone --depth 1 https://github.com/sullo/nikto.git ~/.local/nikto && ln -sf ~/.local/nikto/nikto.pl ~/.local/bin/nikto && chmod +x ~/.local/bin/nikto && echo "nikto installed to ~/.local/bin"', icon: 'scan' },
    { name: 'Gobuster', cmd: 'curl -fsSL "https://github.com/OJ/gobuster/releases/download/v3.6.0/gobuster_3.6.0_linux_amd64.tar.gz" -o /tmp/gb.tgz && tar -xzf /tmp/gb.tgz -C ~/.local/bin gobuster && chmod +x ~/.local/bin/gobuster && rm /tmp/gb.tgz && echo "gobuster installed to ~/.local/bin"', icon: 'scan' },
    { name: 'ffuf', cmd: 'curl -fsSL "https://github.com/ffuf/ffuf/releases/download/v2.1.0/ffuf_2.1.0_linux_amd64.tar.gz" -o /tmp/ff.tgz && tar -xzf /tmp/ff.tgz -C ~/.local/bin ffuf && chmod +x ~/.local/bin/ffuf && rm /tmp/ff.tgz && echo "ffuf installed to ~/.local/bin"', icon: 'scan' },
    { name: 'Nuclei', cmd: 'curl -fsSL "https://github.com/projectdiscovery/nuclei/releases/download/v3.3.5/nuclei_3.3.5_linux_amd64.zip" -o /tmp/nc.zip && cd /tmp && unzip -o nc.zip nuclei && mv nuclei ~/.local/bin/ && chmod +x ~/.local/bin/nuclei && rm /tmp/nc.zip && echo "nuclei installed to ~/.local/bin"', icon: 'scan' },
    { name: 'Katana', cmd: 'curl -fsSL "https://github.com/projectdiscovery/katana/releases/download/v1.1.0/katana_1.1.0_linux_amd64.zip" -o /tmp/kn.zip && cd /tmp && unzip -o kn.zip katana && mv katana ~/.local/bin/ && chmod +x ~/.local/bin/katana && rm /tmp/kn.zip && echo "katana installed to ~/.local/bin"', icon: 'scan' },
    { name: 'httpx', cmd: 'curl -fsSL "https://github.com/projectdiscovery/httpx/releases/download/v1.6.7/httpx_1.6.7_linux_amd64.zip" -o /tmp/hx.zip && cd /tmp && unzip -o hx.zip httpx && mv httpx ~/.local/bin/ && chmod +x ~/.local/bin/httpx && rm /tmp/hx.zip && echo "httpx installed to ~/.local/bin"', icon: 'scan' },
    { name: 'gau (gauplus)', cmd: 'curl -fsSL "https://github.com/bp0lr/gauplus/releases/download/v2.2/gauplus_2.2_linux_amd64.tar.gz" -o /tmp/gau.tgz && tar -xzf /tmp/gau.tgz -C ~/.local/bin gauplus && chmod +x ~/.local/bin/gauplus && ln -sf ~/.local/bin/gauplus ~/.local/bin/gau && rm /tmp/gau.tgz && echo "gau installed to ~/.local/bin"', icon: 'scan' },
    { name: 'Waybackurls', cmd: 'curl -fsSL "https://github.com/tomnomnom/waybackurls/releases/download/v0.0.1/waybackurls-linux-amd64-0.0.1.tgz" -o /tmp/wb.tgz && tar -xzf /tmp/wb.tgz -C ~/.local/bin waybackurls && chmod +x ~/.local/bin/waybackurls && rm /tmp/wb.tgz && echo "waybackurls installed to ~/.local/bin"', icon: 'scan' },
    { name: 'WPScan', cmd: 'gem install --user-install wpscan && echo "wpscan installed via gem (run: wpscan --update)"', icon: 'scan' },
    { name: 'Joomscan', cmd: 'git clone --depth 1 https://github.com/rezasp/joomscan.git ~/.local/joomscan && ln -sf ~/.local/joomscan/joomscan.pl ~/.local/bin/joomscan && chmod +x ~/.local/bin/joomscan && echo "joomscan installed"', icon: 'scan' },
    { name: 'Droopescan', cmd: 'pip3 install --user droopescan && echo "droopescan installed to ~/.local/bin"', icon: 'scan' },
    { name: 'CMSmap', cmd: 'git clone --depth 1 https://github.com/dionach/CMSmap.git ~/.local/CMSmap && pip3 install --user -r ~/.local/CMSmap/requirements.txt && ln -sf ~/.local/CMSmap/cmsmap.py ~/.local/bin/cmsmap && chmod +x ~/.local/bin/cmsmap && echo "CMSmap installed"', icon: 'scan' },
    { name: 'WhatWeb', cmd: 'gem install --user-install whatweb && echo "whatweb installed via gem"', icon: 'scan' },
    { name: 'Corsy', cmd: 'pip3 install --user corsy && echo "corsy installed to ~/.local/bin"', icon: 'scan' },
  ],
  'Exploitation': [
    { name: 'sqlmap', cmd: 'git clone --depth 1 https://github.com/sqlmapproject/sqlmap.git ~/.local/sqlmap && ln -sf ~/.local/sqlmap/sqlmap.py ~/.local/bin/sqlmap && chmod +x ~/.local/bin/sqlmap && echo "sqlmap installed to ~/.local/bin"', icon: 'exploit' },
    { name: 'searchsploit', cmd: 'git clone --depth 1 https://gitlab.com/exploit-database/exploitdb.git ~/.local/exploitdb && ln -sf ~/.local/exploitdb/searchsploit ~/.local/bin/searchsploit && chmod +x ~/.local/bin/searchsploit && echo "searchsploit installed (run: searchsploit --update)"', icon: 'exploit' },
    { name: 'PayloadsAllTheThings', cmd: 'git clone --depth 1 https://github.com/swisskyrepo/PayloadsAllTheThings.git ~/.local/PayloadsAllTheThings && echo "PayloadsAllTheThings cloned to ~/.local/PayloadsAllTheThings"', icon: 'exploit' },
    { name: 'SecLists', cmd: 'git clone --depth 1 https://github.com/danielmiessler/SecLists.git ~/.local/SecLists && echo "SecLists cloned to ~/.local/SecLists (wordlists in ~/.local/SecLists/)"', icon: 'exploit' },
    { name: 'Responder', cmd: 'git clone --depth 1 https://github.com/SpiderLabs/Responder.git ~/.local/Responder && pip3 install --user -r ~/.local/Responder/requirements.txt && ln -sf ~/.local/Responder/Responder.py ~/.local/bin/responder && chmod +x ~/.local/bin/responder && echo "responder installed"', icon: 'exploit' },
    { name: 'mitm6', cmd: 'pip3 install --user mitm6 && echo "mitm6 installed to ~/.local/bin"', icon: 'exploit' },
    { name: 'BeEF-XSS', cmd: 'git clone --depth 1 https://github.com/beefproject/beef.git ~/.local/beef && cd ~/.local/beef && bundle install --path ~/.local/bundle && echo "BeEF installed at ~/.local/beef (run: ./beef)"', icon: 'exploit' },
    { name: 'Commix', cmd: 'git clone --depth 1 https://github.com/commixproject/commix.git ~/.local/commix && ln -sf ~/.local/commix/commix.py ~/.local/bin/commix && chmod +x ~/.local/bin/commix && echo "commix installed"', icon: 'exploit' },
  ],
  'Crypto & Hashing': [
    { name: 'Hashcat', cmd: 'curl -fsSL "https://hashcat.net/files/hashcat-6.2.6.7z" -o /tmp/hc.7z && cd ~/.local && 7z x /tmp/hc.7z -o~/.local/hashcat && ln -sf ~/.local/hashcat/hashcat-6.2.6/hashcat.bin ~/.local/bin/hashcat && chmod +x ~/.local/bin/hashcat && rm /tmp/hc.7z && echo "hashcat installed to ~/.local/bin (binary-only, no GPU acceleration)"', icon: 'crypto' },
    { name: 'John the Ripper', cmd: 'curl -fsSL "https://github.com/openwall/john-packages/releases/download/jumbo-dev/john-latest-linux-x86-64.tar.xz" -o /tmp/john.tar.xz && mkdir -p ~/.local/john && tar -xJf /tmp/john.tar.xz -C ~/.local/john && ln -sf ~/.local/john/run/john ~/.local/bin/john && chmod +x ~/.local/bin/john && rm /tmp/john.tar.xz && echo "john installed to ~/.local/bin"', icon: 'crypto' },
    { name: 'hashid', cmd: 'pip3 install --user hashid && echo "hashid installed to ~/.local/bin"', icon: 'crypto' },
    { name: 'Hash-Buster', cmd: 'git clone --depth 1 https://github.com/s0md3v/Hash-Buster.git ~/.local/Hash-Buster && ln -sf ~/.local/Hash-Buster/hash.py ~/.local/bin/hash-buster && chmod +x ~/.local/bin/hash-buster && echo "hash-buster installed"', icon: 'crypto' },
    { name: 'CyberChef', cmd: 'git clone --depth 1 https://github.com/gchq/CyberChef.git ~/.local/CyberChef && echo "CyberChef cloned to ~/.local/CyberChef (open build/index.html in browser)"', icon: 'crypto' },
  ],
  'Cloud Tools': [
    { name: 'AWS CLI v2', cmd: 'pip3 install --user awscli && echo "awscli installed to ~/.local/bin/aws"', icon: 'cloud' },
    { name: 'Azure CLI', cmd: 'pip3 install --user azure-cli && echo "az installed to ~/.local/bin/az"', icon: 'cloud' },
    { name: 'Google Cloud SDK', cmd: 'curl -fsSL https://dl.google.com/dl/cloudsdk/channels/rapid/downloads/google-cloud-cli-linux-x86_64.tar.gz | tar -xz -C ~/.local && ~/.local/google-cloud-sdk/install.sh --quiet --rc-path ~/.bashrc && echo "gcloud installed to ~/.local/google-cloud-sdk/bin"', icon: 'cloud' },
    { name: 'Prowler', cmd: 'pip3 install --user prowler && echo "prowler installed to ~/.local/bin"', icon: 'cloud' },
    { name: 'CloudSploit', cmd: 'git clone --depth 1 https://github.com/aquasecurity/cloudsploit.git ~/.local/cloudsploit && pip3 install --user -r ~/.local/cloudsploit/requirements.txt && echo "cloudsploit installed at ~/.local/cloudsploit (run: node index.js)"', icon: 'cloud' },
    { name: 'ScoutSuite', cmd: 'pip3 install --user scoutsuite && echo "scoutsuite installed to ~/.local/bin"', icon: 'cloud' },
    { name: 'Terraform', cmd: 'curl -fsSL "https://releases.hashicorp.com/terraform/1.9.5/terraform_1.9.5_linux_amd64.zip" -o /tmp/tf.zip && unzip -o /tmp/tf.zip -d ~/.local/bin terraform && chmod +x ~/.local/bin/terraform && rm /tmp/tf.zip && echo "terraform installed to ~/.local/bin"', icon: 'cloud' },
    { name: 'kubectl', cmd: 'curl -fsSL "https://dl.k8s.io/release/$(curl -sL https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl" -o ~/.local/bin/kubectl && chmod +x ~/.local/bin/kubectl && echo "kubectl installed to ~/.local/bin"', icon: 'cloud' },
    { name: 'Helm', cmd: 'curl -fsSL https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash && echo "helm installed to ~/.local/bin"', icon: 'cloud' },
    { name: 'S3Scanner', cmd: 'pip3 install --user s3scanner && echo "s3scanner installed to ~/.local/bin"', icon: 'cloud' },
  ],
  'Mobile & RE': [
    { name: 'apktool', cmd: 'curl -fsSL "https://github.com/iBotPeaches/Apktool/releases/download/v2.10.0/apktool_2.10.0.jar" -o ~/.local/bin/apktool.jar && printf "#!/bin/bash\\njava -jar ~/.local/bin/apktool.jar \\"\\$@\\"\\n" > ~/.local/bin/apktool && chmod +x ~/.local/bin/apktool && echo "apktool installed to ~/.local/bin"', icon: 'mobile' },
    { name: 'jadx', cmd: 'curl -fsSL "https://github.com/skylot/jadx/releases/download/v1.5.0/jadx-1.5.0.zip" -o /tmp/jadx.zip && unzip -o /tmp/jadx.zip -d ~/.local/jadx && ln -sf ~/.local/jadx/bin/jadx ~/.local/bin/jadx && ln -sf ~/.local/jadx/bin/jadx-gui ~/.local/bin/jadx-gui && chmod +x ~/.local/bin/jadx* && rm /tmp/jadx.zip && echo "jadx installed to ~/.local/bin"', icon: 'mobile' },
    { name: 'Frida Tools', cmd: 'pip3 install --user frida-tools && echo "frida-tools installed to ~/.local/bin"', icon: 'mobile' },
    { name: 'Objection', cmd: 'pip3 install --user objection && echo "objection installed to ~/.local/bin"', icon: 'mobile' },
    { name: 'Radare2', cmd: 'git clone --depth 1 https://github.com/radareorg/radare2.git ~/.local/radare2 && cd ~/.local/radare2 && sys/install.sh --prefix=~/.local && echo "radare2 installed to ~/.local/bin"', icon: 'mobile' },
    { name: 'Ghidra', cmd: 'curl -fsSL "https://github.com/NationalSecurityAgency/ghidra/releases/download/Ghidra_11.2_build/ghidra_11.2_PUBLIC_20240919.zip" -o /tmp/ghidra.zip && unzip -o /tmp/ghidra.zip -d ~/.local && ln -sf ~/.local/ghidra_11.2_PUBLIC/ghidraRun ~/.local/bin/ghidra && chmod +x ~/.local/bin/ghidra && rm /tmp/ghidra.zip && echo "ghidra installed to ~/.local/bin (requires JDK)"', icon: 'mobile' },
    { name: 'MobSF', cmd: 'git clone --depth 1 https://github.com/MobSF/Mobile-Security-Framework-MobSF.git ~/.local/MobSF && pip3 install --user -r ~/.local/MobSF/requirements.txt && echo "MobSF installed at ~/.local/MobSF (run: ./run.sh)"', icon: 'mobile' },
  ],
  'Network Scanners': [
    { name: 'nmap (python-nmap)', cmd: 'pip3 install --user python-nmap && echo "python-nmap installed (use nmap from python; raw nmap needs apt — try masscan instead)"', icon: 'network' },
    { name: 'Masscan', cmd: 'curl -fsSL "https://github.com/robertdavidgraham/masscan/releases/download/v2.2.3/masscan-2.2.3-linux-x86_64.tar.xz" -o /tmp/mc.tar.xz && tar -xJf /tmp/mc.tar.xz -C ~/.local/bin masscan && chmod +x ~/.local/bin/masscan && rm /tmp/mc.tar.xz && echo "masscan installed to ~/.local/bin"', icon: 'network' },
    { name: 'RustScan', cmd: 'curl -fsSL "https://github.com/RustScan/RustScan/releases/download/2.3.0/rustscan-2.3.0-x86_64-linux.zip" -o /tmp/rs.zip && unzip -o /tmp/rs.zip -d ~/.local/bin rustscan && chmod +x ~/.local/bin/rustscan && rm /tmp/rs.zip && echo "rustscan installed to ~/.local/bin"', icon: 'network' },
    { name: 'Naabu', cmd: 'curl -fsSL "https://github.com/projectdiscovery/naabu/releases/download/v2.3.2/naabu_2.3.2_linux_amd64.zip" -o /tmp/na.zip && cd /tmp && unzip -o na.zip naabu && mv naabu ~/.local/bin/ && chmod +x ~/.local/bin/naabu && rm /tmp/na.zip && echo "naabu installed to ~/.local/bin"', icon: 'network' },
    { name: 'ZMap', cmd: 'pip3 install --user zmap-nope --no-deps && echo "zmap-wrapper installed (raw zmap needs apt)"', icon: 'network' },
    { name: 'Httpx-core', cmd: 'pip3 install --user httpx && echo "httpx-python installed to ~/.local/bin (for the Go httpx, see Web Scanners)"', icon: 'network' },
  ],
  'Forensics & Misc': [
    { name: 'Binwalk', cmd: 'pip3 install --user binwalk && echo "binwalk installed to ~/.local/bin"', icon: 'forensic' },
    { name: 'Foremost', cmd: 'curl -fsSL "https://github.com/kellerfchild/foremost-static/releases/download/v1.5.7/foremost-1.5.7-linux-x86_64" -o ~/.local/bin/foremost && chmod +x ~/.local/bin/foremost && echo "foremost installed to ~/.local/bin"', icon: 'forensic' },
    { name: 'Volatility', cmd: 'pip3 install --user volatility3 && echo "volatility3 installed to ~/.local/bin (vol)"', icon: 'forensic' },
    { name: 'Capa', cmd: 'curl -fsSL "https://github.com/mandiant/capa/releases/download/v7.4.0/capa-v7.4.0-linux.zip" -o /tmp/capa.zip && unzip -o /tmp/capa.zip -d ~/.local/bin capa && chmod +x ~/.local/bin/capa && rm /tmp/capa.zip && echo "capa installed to ~/.local/bin"', icon: 'forensic' },
    { name: 'YARA', cmd: 'pip3 install --user yara-python && echo "yara-python installed (for the yara binary, build from source: github.com/VirusTotal/yara)"', icon: 'forensic' },
    { name: 'FlareVM-Tools', cmd: 'pip3 install --user pefile && echo "pefile installed to ~/.local/bin (PE file parser)"', icon: 'forensic' },
    { name: 'gron', cmd: 'pip3 install --user gron && echo "gron installed (flatten JSON for grep)"', icon: 'forensic' },
    { name: 'jc', cmd: 'pip3 install --user jc && echo "jc installed (CLI output to JSON)"', icon: 'forensic' },
    { name: 'csvkit', cmd: 'pip3 install --user csvkit && echo "csvkit installed to ~/.local/bin"', icon: 'forensic' },
    { name: 'httpie', cmd: 'pip3 install --user httpie && echo "httpie installed to ~/.local/bin (better curl)"', icon: 'forensic' },
  ],
  'Wordlists & Dictionaries': [
    { name: 'SecLists (full)', cmd: 'git clone https://github.com/danielmiessler/SecLists.git ~/.local/SecLists && echo "SecLists installed (~/.local/SecLists/)"', icon: 'list' },
    { name: 'RockYou', cmd: 'mkdir -p ~/.local/wordlists && curl -fsSL "https://github.com/brannondorsey/naive-hashcat/releases/download/data/rockyou.txt" -o ~/.local/wordlists/rockyou.txt && echo "rockyou.txt installed to ~/.local/wordlists/"', icon: 'list' },
    { name: 'FuzzDB', cmd: 'git clone --depth 1 https://github.com/fuzzdb-project/fuzzdb.git ~/.local/fuzzdb && echo "fuzzdb installed to ~/.local/fuzzdb/"', icon: 'list' },
    { name: 'Bo0oM SecLists', cmd: 'git clone --depth 1 https://github.com/danielmiessler/SecLists.git ~/.local/SecLists-minimal && echo "SecLists minimal cloned"', icon: 'list' },
    { name: 'PayloadsBox', cmd: 'git clone --depth 1 https://github.com/payloadbox/payloads.git ~/.local/payloads && echo "payloads cloned to ~/.local/payloads/"', icon: 'list' },
  ],
  'Container & Infra': [
    { name: 'k3d (k3s in Docker)', cmd: 'curl -s https://raw.githubusercontent.com/k3d-io/k3d/main/install.sh | bash && echo "k3d installed to ~/.local/bin"', icon: 'container' },
    { name: 'k9s', cmd: 'curl -fsSL "https://github.com/derailed/k9s/releases/download/v0.32.5/k9s_Linux_amd64.tar.gz" -o /tmp/k9s.tgz && tar -xzf /tmp/k9s.tgz -C ~/.local/bin k9s && chmod +x ~/.local/bin/k9s && rm /tmp/k9s.tgz && echo "k9s installed to ~/.local/bin"', icon: 'container' },
    { name: 'kubectx + kubens', cmd: 'curl -fsSL "https://github.com/ahmetb/kubectx/releases/download/v0.9.5/kubectx_v0.9.5_linux_x86_64.tar.gz" -o /tmp/ktx.tgz && tar -xzf /tmp/ktx.tgz -C ~/.local/bin kubectx && curl -fsSL "https://github.com/ahmetb/kubectx/releases/download/v0.9.5/kubens_v0.9.5_linux_x86_64.tar.gz" -o /tmp/kns.tgz && tar -xzf /tmp/kns.tgz -C ~/.local/bin kubens && chmod +x ~/.local/bin/kubectx ~/.local/bin/kubens && rm /tmp/k*.tgz && echo "kubectx + kubens installed"', icon: 'container' },
    { name: 'lazydocker', cmd: 'curl -fsSL "https://github.com/jesseduffield/lazydocker/releases/download/v0.23.3/lazydocker_0.23.3_Linux_x86_64.tar.gz" -o /tmp/ld.tgz && tar -xzf /tmp/ld.tgz -C ~/.local/bin lazydocker && chmod +x ~/.local/bin/lazydocker && rm /tmp/ld.tgz && echo "lazydocker installed to ~/.local/bin"', icon: 'container' },
    { name: 'dive (image inspector)', cmd: 'curl -fsSL "https://github.com/wagoodman/dive/releases/download/v0.12.0/dive_0.12.0_linux_amd64.tar.gz" -o /tmp/dv.tgz && tar -xzf /tmp/dv.tgz -C ~/.local/bin dive && chmod +x ~/.local/bin/dive && rm /tmp/dv.tgz && echo "dive installed to ~/.local/bin"', icon: 'container' },
    { name: 'caddy', cmd: 'curl -fsSL "https://github.com/caddyserver/caddy/releases/download/v2.8.4/caddy_2.8.4_linux_amd64.tar.gz" -o /tmp/cd.tgz && tar -xzf /tmp/cd.tgz -C ~/.local/bin caddy && chmod +x ~/.local/bin/caddy && rm /tmp/cd.tgz && echo "caddy installed to ~/.local/bin"', icon: 'container' },
    { name: 'traefik', cmd: 'curl -fsSL "https://github.com/traefik/traefik/releases/download/v3.1.4/traefik_v3.1.4_linux_amd64.tar.gz" -o /tmp/tr.tgz && tar -xzf /tmp/tr.tgz -C ~/.local/bin traefik && chmod +x ~/.local/bin/traefik && rm /tmp/tr.tgz && echo "traefik installed to ~/.local/bin"', icon: 'container' },
  ],
  'Productivity': [
    { name: 'fzf', cmd: 'git clone --depth 1 https://github.com/junegunn/fzf.git ~/.fzf && ~/.fzf/install --all --no-update-rc && echo "fzf installed to ~/.fzf/bin"', icon: 'productivity' },
    { name: 'ripgrep', cmd: 'curl -fsSL "https://github.com/BurntSushi/ripgrep/releases/download/14.1.0/ripgrep-14.1.0-x86_64-unknown-linux-musl.tar.gz" -o /tmp/rg.tgz && tar -xzf /tmp/rg.tgz -C ~/.local/bin --strip-components=1 ripgrep-14.1.0-x86_64-unknown-linux-musl/rg && chmod +x ~/.local/bin/rg && rm /tmp/rg.tgz && echo "ripgrep installed to ~/.local/bin/rg"', icon: 'productivity' },
    { name: 'fd', cmd: 'curl -fsSL "https://github.com/sharkdp/fd/releases/download/v10.1.0/fd-v10.1.0-x86_64-unknown-linux-musl.tar.gz" -o /tmp/fd.tgz && tar -xzf /tmp/fd.tgz -C ~/.local/bin --strip-components=1 fd-v10.1.0-x86_64-unknown-linux-musl/fd && chmod +x ~/.local/bin/fd && rm /tmp/fd.tgz && echo "fd installed to ~/.local/bin/fd"', icon: 'productivity' },
    { name: 'bat (cat clone)', cmd: 'curl -fsSL "https://github.com/sharkdp/bat/releases/download/v0.24.0/bat-v0.24.0-x86_64-unknown-linux-musl.tar.gz" -o /tmp/bat.tgz && tar -xzf /tmp/bat.tgz -C ~/.local/bin --strip-components=1 bat-v0.24.0-x86_64-unknown-linux-musl/bat && chmod +x ~/.local/bin/bat && rm /tmp/bat.tgz && echo "bat installed to ~/.local/bin/bat"', icon: 'productivity' },
    { name: 'eza (ls clone)', cmd: 'curl -fsSL "https://github.com/eza-community/eza/releases/download/v0.19.0/eza_x86_64-unknown-linux-musl.tar.gz" -o /tmp/eza.tgz && tar -xzf /tmp/eza.tgz -C ~/.local/bin eza && chmod +x ~/.local/bin/eza && rm /tmp/eza.tgz && echo "eza installed to ~/.local/bin/eza"', icon: 'productivity' },
    { name: 'delta (git diff)', cmd: 'curl -fsSL "https://github.com/dandavison/delta/releases/download/0.18.2/delta-0.18.2-x86_64-unknown-linux-musl.tar.gz" -o /tmp/dl.tgz && tar -xzf /tmp/dl.tgz -C ~/.local/bin --strip-components=1 delta-0.18.2-x86_64-unknown-linux-musl/delta && chmod +x ~/.local/bin/delta && rm /tmp/dl.tgz && echo "delta installed to ~/.local/bin/delta"', icon: 'productivity' },
    { name: 'ghq (git repos)', cmd: 'curl -fsSL "https://github.com/x-motemen/ghq/releases/download/v1.6.2/ghq_linux_amd64.zip" -o /tmp/ghq.zip && unzip -o /tmp/ghq.zip -d ~/.local/bin ghq && chmod +x ~/.local/bin/ghq && rm /tmp/ghq.zip && echo "ghq installed to ~/.local/bin/ghq"', icon: 'productivity' },
    { name: 'lazygit', cmd: 'curl -fsSL "https://github.com/jesseduffield/lazygit/releases/download/v0.44.2/lazygit_0.44.2_Linux_x86_64.tar.gz" -o /tmp/lg.tgz && tar -xzf /tmp/lg.tgz -C ~/.local/bin lazygit && chmod +x ~/.local/bin/lazygit && rm /tmp/lg.tgz && echo "lazygit installed to ~/.local/bin/lazygit"', icon: 'productivity' },
  ],
}

// ─── Horizontal Menu Items ─────────────────────────────────────────
// Replaces the old vertical sidebar. Each item is a horizontal tab;
// clicking toggles a slide-down panel.
const MENU_ITEMS = [
  { value: 'packages', label: 'Packages', icon: Package },
  { value: 'tools',    label: 'Tools',    icon: Wrench },
  { value: 'files',    label: 'Files',    icon: FolderTree },
  { value: 'quick',    label: 'Toolkit',  icon: Zap },
  { value: 'settings', label: 'Settings', icon: Settings },
] as const

export default function Home() {
  const {
    socket, connected, tools, sessions, activeSessionId, setActiveSessionId,
    latency, createTerminal, destroyTerminal, sendInput, resizeTerminal,
    onOutput, onClearBuffer, checkTools, installTool, readFile, writeFile,
    listFiles, createFolder, deleteFile, renameFile, sendCommandToTerminal,
    onFilesChanged, requestWorkspaceInfo,
  } = useSocket()

  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  // Active horizontal menu tab; null = panel collapsed
  const [activeMenu, setActiveMenu] = useState<string | null>(null)
  const [editorFile, setEditorFile] = useState<string | null>(null)
  const [editorContent, setEditorContent] = useState<string | null>(null)
  const [creatingTerminal, setCreatingTerminal] = useState(false)
  const [currentUser, setCurrentUser] = useState<{userId: string; username: string; role: string} | null>(null)
  const [installedPkgs, setInstalledPkgs] = useState<Set<string>>(new Set())

  // Build installed packages set from tools data
  useEffect(() => {
    const pkgs = new Set<string>()
    tools.forEach(t => { if (t.installed) pkgs.add(t.name) })
    ;['node', 'npm', 'npx', 'python3', 'pip3', 'git', 'curl', 'wget', 'bash', 'vim', 'nano',
      'ssh', 'scp', 'rsync', 'make', 'gcc', 'jq'].forEach(c => pkgs.add(c))
    setInstalledPkgs(pkgs)
  }, [tools])

  useEffect(() => {
    const token = localStorage.getItem('jasbol-token')
    const userStr = localStorage.getItem('jasbol-user')
    if (!token) { window.location.href = '/login'; return }
    if (userStr) { try { setCurrentUser(JSON.parse(userStr)) } catch {} }
    fetch('/api/auth/verify', { headers: { Authorization: `Bearer ${token}` } }).then(res => {
      if (!res.ok) { localStorage.removeItem('jasbol-token'); localStorage.removeItem('jasbol-user'); window.location.href = '/login' }
    }).catch(() => {})
  }, [])

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' })
    localStorage.removeItem('jasbol-token'); localStorage.removeItem('jasbol-user')
    window.location.href = '/login'
  }

  useEffect(() => { setMounted(true) }, [])

  useEffect(() => {
    if (mounted && connected && sessions.length === 0) {
      const timer = setTimeout(() => { if (connected && sessions.length === 0) createTerminal().catch(console.error) }, 1500)
      return () => clearTimeout(timer)
    }
  }, [mounted, connected, sessions.length, createTerminal])

  const handleNewTerminal = async () => {
    setCreatingTerminal(true)
    try { await createTerminal() } catch (err) { console.error('Failed:', err) } finally { setCreatingTerminal(false) }
  }

  const handleFileOpen = useCallback(async (path: string, content?: string) => {
    setEditorFile(path)
    if (content !== undefined) { setEditorContent(content) } else { const result = await readFile(path); setEditorContent(result.content) }
  }, [readFile])

  const handleEditorSave = useCallback(async (path: string, content: string) => {
    const result = await writeFile(path, content); if (!result.error) setEditorContent(content); return result
  }, [writeFile])

  const handleEditorClose = useCallback(() => { setEditorFile(null); setEditorContent(null) }, [])

  const handleMenuClick = (value: string) => {
    setActiveMenu(prev => prev === value ? null : value)
  }

  const isDark = !mounted || theme === 'dark'

  return (
    <div className="flex flex-col h-screen bg-[var(--nx-bg-primary)] text-[var(--nx-text)] overflow-hidden transition-colors duration-200 nx-top-accent">
      {/* ═══ HEADER ═══ */}
      <header className="relative flex items-center justify-between px-4 h-12 bg-[var(--nx-bg-secondary)]/90 backdrop-blur-xl shrink-0 nx-header-accent nx-panel-glow">
        <div className="flex items-center gap-3">
          {/* Logo with premium glow ring */}
          <div className="flex items-center gap-2.5">
            <div className="nx-logo-ring-premium">
              <Image src="/jasbol-hack-logo.png" alt="Jasbol Hack" width={28} height={28} className="rounded-lg" priority />
            </div>
            <h1 className="text-sm font-bold tracking-wide">
              <span style={{ background: 'linear-gradient(135deg, #818CF8 0%, #6366F1 50%, #8B5CF6 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Jasbol</span>
              <span className="text-[var(--nx-text)] ml-0.5">Hack</span>
            </h1>
          </div>

          <Separator orientation="vertical" className="h-5 bg-[var(--nx-border)]" />

          {/* Connection status — premium pill */}
          <div className="flex items-center gap-1.5">
            {mounted && connected ? (
              <div className="nx-status-pill live">
                <span className="nx-status-dot" />
                <span>Live</span>
              </div>
            ) : (
              <div className="nx-status-pill offline">
                <span className="nx-status-dot" />
                <span>{mounted ? 'Offline' : 'Connecting...'}</span>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* New Terminal button */}
          <Button variant="ghost" size="sm" className="h-7 text-xs gap-1.5 text-[var(--nx-text-secondary)] hover:text-[var(--nx-accent)] hover:bg-[var(--nx-accent-glow)] transition-all duration-200 rounded-md nx-press" onClick={handleNewTerminal} disabled={creatingTerminal || !connected}>
            <Plus className="h-3.5 w-3.5" />New Terminal
          </Button>

          <Separator orientation="vertical" className="h-5 bg-[var(--nx-border)]" />

          {/* Theme toggle */}
          <Button variant="ghost" size="icon" className="h-7 w-7 text-[var(--nx-text-secondary)] hover:text-[var(--nx-warning)] hover:bg-[var(--nx-bg-hover)] transition-all duration-200 rounded-md nx-press" onClick={() => setTheme(isDark ? 'light' : 'dark')} disabled={!mounted}>
            {mounted ? (isDark ? <Moon className="h-3.5 w-3.5" /> : <Sun className="h-3.5 w-3.5" />) : <Sun className="h-3.5 w-3.5 opacity-0" />}
          </Button>

          <Separator orientation="vertical" className="h-5 bg-[var(--nx-border)]" />

          {/* User badge — avatar circle + info */}
          {currentUser && (
            <div className="flex items-center gap-2">
              <div className={`nx-avatar-circle ${currentUser.role === 'admin' ? 'admin' : ''}`}>
                {currentUser.username.charAt(0).toUpperCase()}
              </div>
              <div className="flex items-center gap-1 nx-hover-lift">
                {currentUser.role === 'admin' ? <Shield className="h-3 w-3 text-[var(--nx-accent)]" /> : <User className="h-3 w-3 text-[var(--nx-accent-teal)]" />}
                <span className="text-[10px] font-medium">{currentUser.username}</span>
                {currentUser.role === 'admin' && <span className="text-[8px] px-1.5 py-0.5 rounded-md font-bold tracking-wider" style={{ background: 'linear-gradient(135deg, rgba(129, 140, 248, 0.18), rgba(99, 102, 241, 0.12))', color: '#818CF8' }}>ADMIN</span>}
              </div>
              <Button variant="ghost" size="icon" className="h-7 w-7 text-[var(--nx-text-muted)] hover:text-[var(--nx-error)] hover:bg-[var(--nx-error)]/10 transition-all duration-200 rounded-md nx-press" onClick={handleLogout} title="Logout">
                <LogOut className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}
        </div>
      </header>

      {/* ═══ HORIZONTAL MENU BAR — Frosted Glass Nav ═══ */}
      <nav className="nx-glass-nav flex items-center gap-1 px-3 h-10 shrink-0 overflow-x-auto">
        {MENU_ITEMS.map(({ value, label, icon: Icon }) => {
          const isActive = activeMenu === value
          return (
            <button
              key={value}
              onClick={() => handleMenuClick(value)}
              className={`nx-nav-item nx-press shrink-0 ${isActive ? 'active' : ''}`}
              aria-pressed={isActive}
            >
              <Icon className={`h-3.5 w-3.5 transition-all duration-200 ${isActive ? 'text-[var(--nx-accent)]' : ''}`} />
              <span>{label}</span>
              {isActive ? <ChevronUp className="h-3 w-3 ml-0.5 opacity-60" /> : <ChevronDown className="h-3 w-3 ml-0.5 opacity-40" />}
            </button>
          )
        })}
        <div className="flex-1" />
        <span className="text-[10px] text-[var(--nx-text-dim)] pr-2 hidden sm:inline opacity-50">Click a tab to expand panel</span>
      </nav>

      {/* ═══ SLIDE-DOWN PANEL (horizontal, full-width) ═══ */}
      {activeMenu && (
        <div
          className="nx-slide-panel shrink-0"
          style={{ height: 450 }}
        >
          <div className="h-full flex flex-col overflow-hidden min-h-0">
            <div className="flex items-center justify-between px-4 h-8 border-b border-[var(--nx-border)]/50 shrink-0">
              <span className="text-[10px] font-semibold text-[var(--nx-text-muted)] uppercase tracking-widest">
                {MENU_ITEMS.find(m => m.value === activeMenu)?.label}
              </span>
              <button
                className="nx-close-subtle text-[var(--nx-text-muted)] inline-flex items-center justify-center"
                onClick={() => setActiveMenu(null)}
              >
                <X className="h-3 w-3" />
              </button>
            </div>
            <div className="flex-1 overflow-hidden min-h-0">
              {activeMenu === 'packages' && (
                <PackageSidebar installedPackages={installedPkgs} sendCommandToTerminal={sendCommandToTerminal} connected={connected} />
              )}
              {activeMenu === 'tools' && (
                <ToolStatus tools={tools} checkTools={checkTools} onInstall={installTool} sendCommandToTerminal={sendCommandToTerminal} loading={!mounted || !connected} />
              )}
              {activeMenu === 'files' && (
                <FileManager
                  listFiles={listFiles}
                  onFileOpen={handleFileOpen}
                  connected={connected}
                  writeFile={writeFile}
                  createFolder={createFolder}
                  deleteFile={deleteFile}
                  renameFile={renameFile}
                  onFilesChanged={onFilesChanged}
                  requestWorkspaceInfo={requestWorkspaceInfo}
                  sendCommandToTerminal={sendCommandToTerminal}
                />
              )}
              {activeMenu === 'quick' && (
                <QuickInstallPanel sendCommandToTerminal={sendCommandToTerminal} connected={connected} />
              )}
              {activeMenu === 'settings' && (
                <SettingsPanel />
              )}
            </div>
          </div>
        </div>
      )}

      {/* ═══ MAIN CONTENT (terminal + editor) ═══ */}
      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 flex flex-col overflow-hidden">
          <ResizablePanelGroup direction="vertical" className="flex-1">
            <ResizablePanel defaultSize={65} minSize={30}>
              <div className="flex flex-col h-full">
                {/* Terminal Tab Bar — VS Code Style */}
                <div className="nx-vs-tabbar shrink-0">
                  <ScrollArea className="flex-1">
                    <div className="flex items-end h-full">
                      {sessions.map((session) => {
                        const isActiveTab = activeSessionId === session.sessionId
                        return (
                          <div key={session.sessionId}
                            className={`nx-vs-tab group ${isActiveTab ? 'active' : ''}`}
                            onClick={() => setActiveSessionId(session.sessionId)}>
                            <SquareTerminal className={`h-3 w-3 shrink-0 transition-colors duration-200 ${isActiveTab ? 'text-[var(--nx-accent)]' : ''}`} />
                            <span className="truncate max-w-24">{session.label}</span>
                            <span className="text-[8px] text-[var(--nx-text-dim)] shrink-0">{session.sessionId.substring(0, 4)}</span>
                            <span role="button" tabIndex={0}
                              className={`nx-tab-close ml-0.5 inline-flex items-center justify-center ${isActiveTab ? 'opacity-40' : ''}`}
                              onClick={(e) => { e.stopPropagation(); destroyTerminal(session.sessionId) }}
                              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); destroyTerminal(session.sessionId) } }}>
                              <X className="h-2.5 w-2.5" />
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  </ScrollArea>
                  <Button variant="ghost" size="icon" className="h-7 w-7 mx-1 mb-0.5 text-[var(--nx-text-muted)] hover:text-[var(--nx-accent)] hover:bg-[var(--nx-accent-glow)] shrink-0 transition-all duration-200 rounded-md nx-press" onClick={handleNewTerminal} disabled={creatingTerminal || !connected}>
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                </div>

                {/* Terminal Content */}
                <div className="flex-1 bg-[var(--nx-bg-primary)] overflow-hidden relative">
                  {sessions.length === 0 ? (
                    <div className="nx-empty-splash">
                      <div className="relative z-10 flex flex-col items-center">
                        {/* Logo splash */}
                        <div className="nx-logo-ring-premium mb-6">
                          <Image src="/jasbol-hack-logo.png" alt="Jasbol Hack" width={56} height={56} className="rounded-xl" priority />
                        </div>
                        <Terminal className="h-12 w-12 mb-4 opacity-25" style={{ color: 'var(--nx-accent)' }} />
                        <p className="text-xl font-bold mb-2 nx-gradient-text-premium">
                          {mounted && connected ? 'No Terminal Sessions' : 'Connecting...'}
                        </p>
                        <p className="text-xs text-[var(--nx-text-dim)] mb-6 max-w-xs text-center">
                          {mounted && connected ? 'Launch your first terminal to start hacking' : 'Establishing WebSocket connection'}
                        </p>
                        {mounted && connected && (
                          <button
                            className="nx-start-btn"
                            onClick={handleNewTerminal}
                            disabled={!connected}
                          >
                            <Plus className="h-4 w-4" />Start Terminal
                          </button>
                        )}
                      </div>
                    </div>
                  ) : (
                    sessions.map((session) => (
                      <MemoizedXtermTerminal key={session.sessionId} sessionId={session.sessionId} onOutput={onOutput} onClearBuffer={onClearBuffer} sendInput={sendInput} resizeTerminal={resizeTerminal} isActive={activeSessionId === session.sessionId} installedPackages={installedPkgs} />
                    ))
                  )}
                </div>
              </div>
            </ResizablePanel>

            <ResizableHandle withHandle className="bg-[var(--nx-border)] hover:bg-[var(--nx-accent)]/30 transition-colors duration-200" />
            <ResizablePanel defaultSize={35} minSize={15}>
              <div className="h-full bg-[var(--nx-bg-primary)] border-t border-[var(--nx-border)]">
                <CodeEditor filePath={editorFile} fileContent={editorContent} onSave={handleEditorSave} onRun={sendCommandToTerminal} onClose={handleEditorClose} readFile={readFile} />
              </div>
            </ResizablePanel>
          </ResizablePanelGroup>
        </div>
      </div>

      {/* ═══ STATUS BAR — Premium ═══ */}
      <footer className="nx-status-bar flex items-center justify-between px-3 h-7 text-[10px] text-[var(--nx-text-muted)] shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <SquareTerminal className="h-2.5 w-2.5 text-[var(--nx-accent)]" />
            <span className="font-semibold">bash</span>
          </div>
          <Separator orientation="vertical" className="h-3 bg-[var(--nx-border)]" />
          <span className="text-[var(--nx-text-dim)]">/workspace</span>
          <Separator orientation="vertical" className="h-3 bg-[var(--nx-border)]" />

          {/* Environment indicators — premium pills */}
          <div className="nx-env-indicator">
            <span className="nx-env-indicator-dot" style={{ background: '#34D399' }} />
            <span>Node</span>
          </div>
          <div className="nx-env-indicator">
            <span className="nx-env-indicator-dot" style={{ background: '#A5B4FC' }} />
            <span>Py</span>
          </div>

          {/* Session ID — pill */}
          {activeSessionId && (
            <>
              <Separator orientation="vertical" className="h-3 bg-[var(--nx-border)]" />
              <span className="nx-session-pill text-[var(--nx-text-dim)]">session:{activeSessionId.substring(0, 8)}</span>
            </>
          )}
          <Separator orientation="vertical" className="h-3 bg-[var(--nx-border)]" />
          <span>{sessions.length} tab{sessions.length !== 1 ? 's' : ''}</span>
        </div>
        <div className="flex items-center gap-3">
          {/* Latency — premium pill */}
          {mounted && connected && latency > 0 && (
            <span className={`nx-latency-pill ${latency > 300 ? 'error' : latency > 150 ? 'warning' : ''}`}>
              {latency}ms
            </span>
          )}
          {/* Connection indicator */}
          <div className="flex items-center gap-1">
            {mounted && connected ? <Wifi className="h-2.5 w-2.5 text-[var(--nx-success)]" /> : <WifiOff className="h-2.5 w-2.5 text-[var(--nx-error)]" />}
          </div>
          <span className="text-[var(--nx-text-dim)]">Jasbol Hack</span>
        </div>
      </footer>
    </div>
  )
}

// ─── Quick Install Panel ───
function QuickInstallPanel({ sendCommandToTerminal, connected }: { sendCommandToTerminal: (cmd: string) => void; connected: boolean }) {
  const iconMap: Record<string, React.ReactNode> = {
    sparkles: <Sparkles className="h-3 w-3" />,
    code: <Code2 className="h-3 w-3" />,
    cloud: <Cloud className="h-3 w-3" />,
    node: <Cpu className="h-3 w-3" />,
    lang: <Code2 className="h-3 w-3" />,
    db: <Database className="h-3 w-3" />,
    globe: <Globe className="h-3 w-3" />,
    scan: <ScanLine className="h-3 w-3" />,
    exploit: <Bug className="h-3 w-3" />,
    crypto: <KeyRound className="h-3 w-3" />,
    mobile: <Smartphone className="h-3 w-3" />,
    network: <Network className="h-3 w-3" />,
    forensic: <FileSearch className="h-3 w-3" />,
    list: <List className="h-3 w-3" />,
    container: <Boxes className="h-3 w-3" />,
    productivity: <Rocket className="h-3 w-3" />,
  }

  return (
    <ScrollArea className="h-full min-h-0 nx-scroll-aurora">
      <div className="p-4">
        {/* Toolbar header */}
        <div className="flex items-center justify-between mb-4 pb-3 border-b border-[var(--nx-border)]/50">
          <div className="text-[10px] text-[var(--nx-text-dim)] flex items-center gap-1.5">
            <Zap className="h-3 w-3 text-[var(--nx-accent)]" />
            <span className="text-[var(--nx-accent)] font-semibold">Toolkit</span>
            <span className="mx-1 opacity-30">·</span>
            All installs go to <code className="text-[var(--nx-text)] bg-[var(--nx-bg-primary)] px-1.5 py-0.5 rounded text-[9px]">~/.local/bin</code>
            <span className="mx-1 opacity-30">·</span>
            <span className="text-[var(--nx-success)]">no sudo · no apt · no docker</span>
          </div>
          <div className="text-[10px] text-[var(--nx-text-dim)] font-mono">
            {Object.values(QUICK_INSTALL).reduce((acc, items) => acc + items.length, 0)} tools · {Object.keys(QUICK_INSTALL).length} categories
          </div>
        </div>
        {/* Responsive grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
          {Object.entries(QUICK_INSTALL).map(([category, items]) => (
            <div key={category} className="space-y-1.5">
              <h3 className="nx-category-header text-[10px] font-semibold text-[var(--nx-accent)]/80 uppercase tracking-widest px-1">
                {category}
              </h3>
              <div className="space-y-0.5">
                {items.map((item) => (
                  <button key={item.name} className="nx-toolkit-btn w-full flex items-center justify-between px-2 py-1.5 rounded-md text-xs hover:bg-[var(--nx-bg-hover)] disabled:opacity-40" onClick={() => sendCommandToTerminal(item.cmd)} disabled={!connected} title={item.cmd}>
                    <span className="flex items-center gap-2 text-[var(--nx-text)] truncate">
                      <span className="text-[var(--nx-accent-teal)] shrink-0 opacity-70">{iconMap[item.icon] || <Zap className="h-3 w-3" />}</span>
                      <span className="truncate">{item.name}</span>
                    </span>
                    <Zap className="h-3 w-3 text-[var(--nx-accent)] opacity-20 shrink-0" />
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </ScrollArea>
  )
}

// ─── Settings Panel (API Keys, Provider Config) ───
function SettingsPanel() {
  const [nvidiaKey, setNvidiaKey] = useState('')
  const [openrouterKey, setOpenrouterKey] = useState('')
  const [nvidiaKeySet, setNvidiaKeySet] = useState(false)
  const [openrouterKeySet, setOpenrouterKeySet] = useState(false)
  const [preferredProvider, setPreferredProvider] = useState<'nvidia' | 'openrouter' | 'none'>('none')
  const [showNvidiaKey, setShowNvidiaKey] = useState(false)
  const [showOpenrouterKey, setShowOpenrouterKey] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [loaded, setLoaded] = useState(false)

  // Load current key status on mount
  useEffect(() => {
    const token = localStorage.getItem('jasbol-token')
    if (!token) return

    fetch('/api/auth/keys', {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(r => r.json())
      .then(data => {
        setNvidiaKeySet(data.nvidiaKeySet || false)
        setOpenrouterKeySet(data.openrouterKeySet || false)
        setPreferredProvider(data.preferredProvider || 'none')
        setLoaded(true)
      })
      .catch(() => setLoaded(true))
  }, [])

  const getToken = () => localStorage.getItem('jasbol-token')

  const handleSaveKey = async (provider: 'nvidia' | 'openrouter', key: string) => {
    const token = getToken()
    if (!token) { setMessage({ type: 'error', text: 'Not authenticated' }); return }

    setSaving(true)
    setMessage(null)
    try {
      const res = await fetch('/api/auth/keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ provider, apiKey: key })
      })
      const data = await res.json()
      if (data.success) {
        setMessage({ type: 'success', text: `${provider === 'nvidia' ? 'NVIDIA NIM' : 'OpenRouter'} API key saved! Start a new terminal to use it.` })
        if (provider === 'nvidia') { setNvidiaKeySet(true); setNvidiaKey('') }
        else { setOpenrouterKeySet(true); setOpenrouterKey('') }
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to save key' })
      }
    } catch {
      setMessage({ type: 'error', text: 'Network error' })
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteKey = async (provider: 'nvidia' | 'openrouter') => {
    const token = getToken()
    if (!token) return

    setSaving(true)
    try {
      await fetch('/api/auth/keys', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ provider })
      })
      if (provider === 'nvidia') { setNvidiaKeySet(false); setNvidiaKey('') }
      else { setOpenrouterKeySet(false); setOpenrouterKey('') }
      setMessage({ type: 'success', text: `${provider === 'nvidia' ? 'NVIDIA' : 'OpenRouter'} key removed` })
    } catch { setMessage({ type: 'error', text: 'Failed to remove key' }) }
    finally { setSaving(false) }
  }

  const handleSetProvider = async (provider: 'nvidia' | 'openrouter' | 'none') => {
    const token = getToken()
    if (!token) return

    try {
      await fetch('/api/auth/keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ preferredProvider: provider })
      })
      setPreferredProvider(provider)
      setMessage({ type: 'success', text: `Preferred provider set to ${provider === 'none' ? 'None' : provider === 'nvidia' ? 'NVIDIA NIM' : 'OpenRouter'}` })
    } catch { setMessage({ type: 'error', text: 'Failed to update provider' }) }
  }

  return (
    <ScrollArea className="h-full min-h-0 nx-scroll-aurora">
      <div className="p-5 space-y-6 max-w-xl">
        {/* Header */}
        <div className="text-[10px] text-[var(--nx-text-dim)] flex items-center gap-1.5">
          <Settings className="h-3 w-3 text-[var(--nx-accent)]" />
          <span className="text-[var(--nx-accent)] font-semibold">Settings</span>
          <span className="mx-1 opacity-30">·</span>
          Configure your own API keys — other users cannot access your keys
        </div>

        {/* Message */}
        {message && (
          <div className={`flex items-center gap-2 px-3 py-2.5 rounded-lg text-xs border backdrop-blur-sm transition-all duration-200 ${
            message.type === 'success'
              ? 'bg-[var(--nx-success)]/8 border-[var(--nx-success)]/20 text-[var(--nx-success)]'
              : 'bg-[var(--nx-error)]/8 border-[var(--nx-error)]/20 text-[var(--nx-error)]'
          }`}>
            {message.type === 'success' ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0" /> : <AlertCircle className="h-3.5 w-3.5 shrink-0" />}
            <span>{message.text}</span>
            <button className="ml-auto opacity-50 hover:opacity-100 transition-opacity" onClick={() => setMessage(null)}>
              <X className="h-3 w-3" />
            </button>
          </div>
        )}

        {/* Preferred Provider */}
        <div className="space-y-2.5">
          <h3 className="text-xs font-semibold text-[var(--nx-text)] flex items-center gap-2">
            <span className="w-1 h-3 rounded-full bg-gradient-to-b from-[var(--nx-accent)] to-[var(--nx-accent-teal)]" />
            Preferred Provider
          </h3>
          <p className="text-[10px] text-[var(--nx-text-dim)] pl-3">Which AI provider should Claude Code use? Each user brings their own API key.</p>
          <div className="flex gap-2 pl-3">
            {(['nvidia', 'openrouter', 'none'] as const).map(p => (
              <button
                key={p}
                onClick={() => handleSetProvider(p)}
                className={`px-3.5 py-1.5 rounded-full text-xs font-medium transition-all duration-200 border ${
                  preferredProvider === p
                    ? 'bg-gradient-to-r from-[var(--nx-accent)]/15 to-[var(--nx-accent-teal)]/10 border-[var(--nx-accent)]/30 text-[var(--nx-accent)] shadow-[0_0_10px_var(--nx-accent-glow)]'
                    : 'bg-[var(--nx-bg-primary)]/60 border-[var(--nx-border)] text-[var(--nx-text-muted)] hover:border-[var(--nx-accent)]/20 hover:text-[var(--nx-text)] hover:bg-[var(--nx-bg-hover)]'
                }`}
              >
                {p === 'nvidia' ? 'NVIDIA NIM' : p === 'openrouter' ? 'OpenRouter' : 'None'}
              </button>
            ))}
          </div>
        </div>

        {/* NVIDIA NIM API Key */}
        <div className="nx-settings-card space-y-2.5 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="flex items-center justify-center w-7 h-7 rounded-md bg-[var(--nx-accent)]/10">
                <Cpu className="h-4 w-4 text-[var(--nx-accent-teal)]" />
              </div>
              <div>
                <span className="text-xs font-semibold text-[var(--nx-text)]">NVIDIA NIM API Key</span>
                {nvidiaKeySet && (
                  <Badge variant="secondary" className="ml-2 h-4 px-1.5 text-[8px] bg-[var(--nx-success)]/10 text-[var(--nx-success)] border-[var(--nx-success)]/20">
                    SET
                  </Badge>
                )}
              </div>
            </div>
          </div>
          <p className="text-[10px] text-[var(--nx-text-dim)]">
            Get your key from <span className="text-[var(--nx-accent)]">build.nvidia.com</span>. Required for Claude Code via the free-claude-code proxy. Your key is private — only your terminals can use it.
          </p>
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <Input
                type={showNvidiaKey ? 'text' : 'password'}
                value={nvidiaKey}
                onChange={(e) => setNvidiaKey(e.target.value)}
                placeholder={nvidiaKeySet ? 'Key is set — enter new key to replace' : 'nvapi-...'}
                className="h-7 text-xs pr-8 bg-[var(--nx-bg-primary)] border-[var(--nx-border)] text-[var(--nx-text)] focus:border-[var(--nx-accent)] focus:shadow-[0_0_8px_var(--nx-accent-glow)] placeholder-[var(--nx-text-dim)] transition-all duration-200"
              />
              <button
                className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--nx-text-dim)] hover:text-[var(--nx-text)] transition-colors"
                onClick={() => setShowNvidiaKey(!showNvidiaKey)}
              >
                {showNvidiaKey ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
              </button>
            </div>
            <Button
              size="sm"
              className="h-7 text-xs bg-gradient-to-r from-[var(--nx-accent)]/15 to-[var(--nx-accent-teal)]/10 hover:from-[var(--nx-accent)]/25 hover:to-[var(--nx-accent-teal)]/20 text-[var(--nx-accent)] border border-[var(--nx-accent)]/25 transition-all duration-200"
              onClick={() => handleSaveKey('nvidia', nvidiaKey)}
              disabled={saving || !nvidiaKey}
            >
              {saving ? '...' : 'Save'}
            </Button>
            {nvidiaKeySet && (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs text-[var(--nx-error)] hover:bg-[var(--nx-error)]/8 transition-all duration-200"
                onClick={() => handleDeleteKey('nvidia')}
                disabled={saving}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            )}
          </div>
        </div>

        {/* OpenRouter API Key */}
        <div className="nx-settings-card space-y-2.5 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="flex items-center justify-center w-7 h-7 rounded-md bg-[var(--nx-warning)]/10">
                <Globe className="h-4 w-4 text-[var(--nx-warning)]" />
              </div>
              <div>
                <span className="text-xs font-semibold text-[var(--nx-text)]">OpenRouter API Key</span>
                {openrouterKeySet && (
                  <Badge variant="secondary" className="ml-2 h-4 px-1.5 text-[8px] bg-[var(--nx-success)]/10 text-[var(--nx-success)] border-[var(--nx-success)]/20">
                    SET
                  </Badge>
                )}
              </div>
            </div>
          </div>
          <p className="text-[10px] text-[var(--nx-text-dim)]">
            Get your key from <span className="text-[var(--nx-accent)]">openrouter.ai</span>. Alternative provider for Claude Code and other LLMs. Supports many models.
          </p>
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <Input
                type={showOpenrouterKey ? 'text' : 'password'}
                value={openrouterKey}
                onChange={(e) => setOpenrouterKey(e.target.value)}
                placeholder={openrouterKeySet ? 'Key is set — enter new key to replace' : 'sk-or-...'}
                className="h-7 text-xs pr-8 bg-[var(--nx-bg-primary)] border-[var(--nx-border)] text-[var(--nx-text)] focus:border-[var(--nx-accent)] focus:shadow-[0_0_8px_var(--nx-accent-glow)] placeholder-[var(--nx-text-dim)] transition-all duration-200"
              />
              <button
                className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--nx-text-dim)] hover:text-[var(--nx-text)] transition-colors"
                onClick={() => setShowOpenrouterKey(!showOpenrouterKey)}
              >
                {showOpenrouterKey ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
              </button>
            </div>
            <Button
              size="sm"
              className="h-7 text-xs bg-gradient-to-r from-[var(--nx-accent)]/15 to-[var(--nx-accent-teal)]/10 hover:from-[var(--nx-accent)]/25 hover:to-[var(--nx-accent-teal)]/20 text-[var(--nx-accent)] border border-[var(--nx-accent)]/25 transition-all duration-200"
              onClick={() => handleSaveKey('openrouter', openrouterKey)}
              disabled={saving || !openrouterKey}
            >
              {saving ? '...' : 'Save'}
            </Button>
            {openrouterKeySet && (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs text-[var(--nx-error)] hover:bg-[var(--nx-error)]/8 transition-all duration-200"
                onClick={() => handleDeleteKey('openrouter')}
                disabled={saving}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            )}
          </div>
        </div>

        {/* Info box */}
        <div className="p-4 rounded-lg border border-[var(--nx-accent)]/15 bg-[var(--nx-accent)]/5 backdrop-blur-sm text-[10px] text-[var(--nx-text-dim)] space-y-2">
          <div className="font-semibold text-[var(--nx-accent)] text-xs flex items-center gap-1.5">
            <Shield className="h-3 w-3" />
            How it works
          </div>
          <ul className="list-disc pl-4 space-y-0.5">
            <li>Your API keys are stored securely and only used in YOUR terminal sessions</li>
            <li>Other users cannot see or use your keys</li>
            <li>NVIDIA NIM key: Use &quot;fcc-claude&quot; in terminal to start Claude Code</li>
            <li>OpenRouter key: Configure in terminal with &quot;export OPENROUTER_API_KEY=...&quot;</li>
            <li>Changes take effect in NEW terminal sessions (existing terminals keep their env)</li>
          </ul>
        </div>
      </div>
    </ScrollArea>
  )
}

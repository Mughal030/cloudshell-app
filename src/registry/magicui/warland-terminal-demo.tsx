'use client'

import {
  AnimatedSpan,
  WarlandTerminal,
  TypingAnimation,
} from '@/registry/magicui/warland-terminal'

/**
 * Jasbol Hack — Cyberpunk Terminal demo.
 *
 * Plays out a scripted session that shows the kind of work the IDE
 * performs: initializing the workspace, verifying tools, securing the
 * session, ready to hack. Cyberpunk palette: cyan / blue / emerald.
 */
export function WarlandTerminalDemo() {
  return (
    <WarlandTerminal>
      <TypingAnimation
        className="font-semibold"
        style={{ color: '#06B6D4', fontFamily: 'var(--font-jetbrains), monospace' }}
      >
        &gt; jasbol init --workspace ~/projects
      </TypingAnimation>

      <div className="mt-2 space-y-1">
        <AnimatedSpan style={{ color: '#10B981' }} delay={300}>
          <span>✔</span> Booting Cyberpunk Terminal runtime…
        </AnimatedSpan>

        <AnimatedSpan style={{ color: '#10B981' }} delay={700}>
          <span>✔</span> Mounting workspace /home/cloudshell/workspaces/adminmughal03
        </AnimatedSpan>

        <AnimatedSpan style={{ color: '#10B981' }} delay={1100}>
          <span>✔</span> Configuring toolchain — node, python3, git, docker.
        </AnimatedSpan>

        <AnimatedSpan style={{ color: '#10B981' }} delay={1500}>
          <span>✔</span> Loading Claude Code &amp; OpenCode modules.
        </AnimatedSpan>

        <AnimatedSpan style={{ color: '#10B981' }} delay={1900}>
          <span>✔</span> Spawning PTY session (zsh + cyberpunk-syntax).
        </AnimatedSpan>

        <AnimatedSpan style={{ color: '#10B981' }} delay={2300}>
          <span>✔</span> Anchoring file-watcher (live sync ON).
        </AnimatedSpan>

        <AnimatedSpan style={{ color: '#10B981' }} delay={2700}>
          <span>✔</span> Securing session — JWT encrypted with AES-256.
        </AnimatedSpan>

        <AnimatedSpan style={{ color: '#3B82F6' }} delay={3100}>
          <span>▸</span>{' '}
          <span>Isolated environment ready. Zero-trust verified.</span>
        </AnimatedSpan>
      </div>

      <div className="mt-3">
        <TypingAnimation
          style={{ color: '#94A3B8' }}
          delay={3500}
          duration={30}
        >
          Access granted. Welcome to Jasbol Hack.
        </TypingAnimation>
      </div>

      <div className="mt-1">
        <TypingAnimation
          style={{ color: '#64748B' }}
          delay={4400}
          duration={30}
        >
          Type `claude` or `opencode` to engage AI assistants.
        </TypingAnimation>
      </div>

      <div
        className="mt-3 flex items-center gap-1.5 text-xs"
        style={{ color: '#475569' }}
      >
        <span
          className="inline-block h-3.5 w-1.5 animate-pulse"
          style={{ background: '#06B6D4', boxShadow: '0 0 6px rgba(6, 182, 212, 0.7)' }}
        />
        <span style={{ color: '#06B6D4', fontWeight: 600 }}>adminmughal03</span>
        <span style={{ color: '#64748B' }}>@jasbol</span>
        <span style={{ color: '#475569' }}>:</span>
        <span style={{ color: '#3B82F6' }}>~/projects</span>
        <span style={{ color: '#475569' }}>$</span>
      </div>
    </WarlandTerminal>
  )
}

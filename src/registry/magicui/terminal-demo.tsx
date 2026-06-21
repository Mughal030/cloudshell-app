'use client'

import {
  AnimatedSpan,
  Terminal,
  TypingAnimation,
} from '@/registry/magicui/terminal'

/**
 * Jasbol Hack welcome terminal demo — plays out a scripted session that
 * shows the kind of work the IDE performs: bootstrapping the workspace,
 * verifying tools, attaching the editor, ready to go.
 *
 * Aurora Eclipse palette: teal / indigo / pink accents.
 */
export function TerminalDemo() {
  return (
    <Terminal>
      <TypingAnimation className="font-semibold" style={{ color: '#5EEAD4' }}>
        &gt; jasbol init --workspace ~/projects
      </TypingAnimation>

      <div className="mt-2 space-y-1">
        <AnimatedSpan style={{ color: 'var(--nx-success)' }} delay={300}>
          <span>✔</span> Booting Aurora Eclipse runtime…
        </AnimatedSpan>

        <AnimatedSpan style={{ color: 'var(--nx-success)' }} delay={700}>
          <span>✔</span> Mounting workspace /home/cloudshell/workspaces/adminmughal03
        </AnimatedSpan>

        <AnimatedSpan style={{ color: 'var(--nx-success)' }} delay={1100}>
          <span>✔</span> Verifying toolchain — node, python3, git, docker.
        </AnimatedSpan>

        <AnimatedSpan style={{ color: 'var(--nx-success)' }} delay={1500}>
          <span>✔</span> Loading Claude Code &amp; OpenCode CLIs.
        </AnimatedSpan>

        <AnimatedSpan style={{ color: 'var(--nx-success)' }} delay={1900}>
          <span>✔</span> Spawning PTY session (zsh + aurora-syntax).
        </AnimatedSpan>

        <AnimatedSpan style={{ color: 'var(--nx-success)' }} delay={2300}>
          <span>✔</span> Attaching file-watcher (live sync ON).
        </AnimatedSpan>

        <AnimatedSpan style={{ color: 'var(--nx-success)' }} delay={2700}>
          <span>✔</span> Authenticating session — JWT sealed.
        </AnimatedSpan>

        <AnimatedSpan style={{ color: '#818CF8' }} delay={3100}>
          <span>ℹ</span>{' '}
          <span>Isolated workspace ready. Other users cannot access it.</span>
        </AnimatedSpan>
      </div>

      <div className="mt-3">
        <TypingAnimation className="text-[var(--nx-text-muted)]" delay={3500} duration={30}>
          Success! Welcome to Jasbol Hack.
        </TypingAnimation>
      </div>

      <div className="mt-1">
        <TypingAnimation className="text-[var(--nx-text-muted)]" delay={4400} duration={30}>
          Type `claude` or `opencode` to start coding with AI.
        </TypingAnimation>
      </div>

      <div className="mt-3 flex items-center gap-1.5 text-[var(--nx-text-dim)] text-xs">
        <span className="inline-block h-3.5 w-1.5 animate-pulse" style={{ background: '#5EEAD4' }} />
        <span>adminmughal03@jasbol</span>
        <span className="text-[var(--nx-text-muted)]">:</span>
        <span style={{ color: '#818CF8' }}>~/projects</span>
        <span className="text-[var(--nx-text-muted)]">$</span>
      </div>
    </Terminal>
  )
}


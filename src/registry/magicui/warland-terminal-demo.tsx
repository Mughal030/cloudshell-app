'use client'

import {
  AnimatedSpan,
  WarlandTerminal,
  TypingAnimation,
} from '@/registry/magicui/warland-terminal'

/**
 * Jasbol Hack — Warland Forge terminal demo.
 *
 * Plays out a scripted session that shows the kind of work the IDE
 * performs: forging the workspace, verifying tools, sealing the
 * session, ready for battle. Warland palette: gold / ember / crimson.
 */
export function WarlandTerminalDemo() {
  return (
    <WarlandTerminal>
      <TypingAnimation
        className="font-semibold"
        style={{ color: '#F5B342', fontFamily: 'var(--font-jetbrains), monospace' }}
      >
        &gt; jasbol forge --workspace ~/projects
      </TypingAnimation>

      <div className="mt-2 space-y-1">
        <AnimatedSpan style={{ color: '#84CC16' }} delay={300}>
          <span>✔</span> Igniting Warland Forge runtime…
        </AnimatedSpan>

        <AnimatedSpan style={{ color: '#84CC16' }} delay={700}>
          <span>✔</span> Mounting stronghold /home/cloudshell/workspaces/adminmughal03
        </AnimatedSpan>

        <AnimatedSpan style={{ color: '#84CC16' }} delay={1100}>
          <span>✔</span> Tempering toolchain — node, python3, git, docker.
        </AnimatedSpan>

        <AnimatedSpan style={{ color: '#84CC16' }} delay={1500}>
          <span>✔</span> Inscribing Claude Code &amp; OpenCode runes.
        </AnimatedSpan>

        <AnimatedSpan style={{ color: '#84CC16' }} delay={1900}>
          <span>✔</span> Spawning PTY session (zsh + warland-syntax).
        </AnimatedSpan>

        <AnimatedSpan style={{ color: '#84CC16' }} delay={2300}>
          <span>✔</span> Anchoring file-watcher (live sync ON).
        </AnimatedSpan>

        <AnimatedSpan style={{ color: '#84CC16' }} delay={2700}>
          <span>✔</span> Sealing session — JWT inscribed in gold.
        </AnimatedSpan>

        <AnimatedSpan style={{ color: '#FF6B1A' }} delay={3100}>
          <span>◆</span>{' '}
          <span>Isolated stronghold ready. Rival clans cannot breach.</span>
        </AnimatedSpan>
      </div>

      <div className="mt-3">
        <TypingAnimation
          style={{ color: '#C9B89A' }}
          delay={3500}
          duration={30}
        >
          Victory! Welcome to Jasbol Hack.
        </TypingAnimation>
      </div>

      <div className="mt-1">
        <TypingAnimation
          style={{ color: '#8A7860' }}
          delay={4400}
          duration={30}
        >
          Speak `claude` or `opencode` to summon AI allies.
        </TypingAnimation>
      </div>

      <div
        className="mt-3 flex items-center gap-1.5 text-xs"
        style={{ color: '#5C4E3D' }}
      >
        <span
          className="inline-block h-3.5 w-1.5 animate-pulse"
          style={{ background: '#F5B342', boxShadow: '0 0 6px rgba(245, 179, 66, 0.7)' }}
        />
        <span style={{ color: '#F5B342', fontWeight: 600 }}>adminmughal03</span>
        <span style={{ color: '#8A7860' }}>@jasbol</span>
        <span style={{ color: '#5C4E3D' }}>:</span>
        <span style={{ color: '#FF6B1A' }}>~/projects</span>
        <span style={{ color: '#5C4E3D' }}>$</span>
      </div>
    </WarlandTerminal>
  )
}

'use client'

/**
 * WarlandEmbers — animated circuit grid + floating data particles.
 *
 * Renders a subtle animated circuit-line background with small
 * glowing data nodes that pulse and drift. Pure CSS animations,
 * no JS timers, no images.
 *
 * The component creates:
 *   1. Small cyan dots that pulse and drift across the viewport
 *      like data packets traveling along circuit paths
 *   2. Uses the same CSS class names (.wl-embers / .wl-ember)
 *      for backward compatibility with the layout component
 *
 * Performance notes:
 *   - 14 particles is enough to feel atmospheric without being distracting
 *   - Each particle is a 2px radial-gradient dot with a small box-shadow
 *   - Animation uses transform/opacity only (GPU-friendly)
 *   - `pointer-events: none` so they never block clicks
 */
export function WarlandEmbers({ count = 14 }: { count?: number }) {
  // Generate stable random values per particle using their index as seed.
  // Using deterministic values keeps SSR/CSR markup identical (no hydration warnings).
  const particles = Array.from({ length: count }, (_, i) => {
    // Simple seeded pseudo-random: index-based hash
    const rand = (n: number) => {
      const x = Math.sin((i + 1) * 9999 + n * 13.37) * 10000
      return x - Math.floor(x)
    }
    const left = rand(1) * 100 // 0-100% horizontal position
    const drift = (rand(2) - 0.5) * 60 // -30px to +30px horizontal drift
    const duration = 10 + rand(3) * 15 // 10-25s pulse cycle
    const delay = rand(4) * 15 // 0-15s start delay
    const size = 1.5 + rand(5) * 2 // 1.5-3.5px
    return { left, drift, duration, delay, size }
  })

  return (
    <div className="wl-embers" aria-hidden="true">
      {particles.map((p, i) => (
        <span
          key={i}
          className="wl-ember"
          style={{
            left: `${p.left}%`,
            width: `${p.size}px`,
            height: `${p.size}px`,
            // CSS custom props consumed by the @keyframes wl-circuit-pulse
            ['--wl-ember-drift' as string]: `${p.drift}px`,
            animationDuration: `${p.duration}s`,
            animationDelay: `${p.delay}s`,
          }}
        />
      ))}
    </div>
  )
}

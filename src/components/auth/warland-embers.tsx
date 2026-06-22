'use client'

/**
 * WarlandEmbers — floating ember particle field.
 *
 * Renders N CSS-animated ember dots that rise from the bottom of the
 * viewport like sparks from a campfire. Pure CSS animations, no JS
 * timers, no images. Each ember has randomized position, drift, and
 * animation duration via inline CSS variables.
 *
 * Performance notes:
 *   - 16 embers is enough to feel atmospheric without being distracting
 *   - Each ember is a 3px radial-gradient dot with a small box-shadow
 *   - Animation uses transform/opacity only (GPU-friendly)
 *   - `pointer-events: none` so they never block clicks
 */
export function WarlandEmbers({ count = 16 }: { count?: number }) {
  // Generate stable random values per ember using their index as seed.
  // Using deterministic values keeps SSR/CSR markup identical (no hydration warnings).
  const embers = Array.from({ length: count }, (_, i) => {
    // Simple seeded pseudo-random: index-based hash
    const rand = (n: number) => {
      const x = Math.sin((i + 1) * 9999 + n * 13.37) * 10000
      return x - Math.floor(x)
    }
    const left = rand(1) * 100 // 0-100% horizontal position
    const drift = (rand(2) - 0.5) * 80 // -40px to +40px horizontal drift
    const duration = 8 + rand(3) * 12 // 8-20s rise time
    const delay = rand(4) * 20 // 0-20s start delay
    const size = 2 + rand(5) * 3 // 2-5px
    return { left, drift, duration, delay, size }
  })

  return (
    <div className="wl-embers" aria-hidden="true">
      {embers.map((e, i) => (
        <span
          key={i}
          className="wl-ember"
          style={{
            left: `${e.left}%`,
            width: `${e.size}px`,
            height: `${e.size}px`,
            // CSS custom props consumed by the @keyframes wl-ember-rise
            ['--wl-ember-drift' as string]: `${e.drift}px`,
            animationDuration: `${e.duration}s`,
            animationDelay: `${e.delay}s`,
          }}
        />
      ))}
    </div>
  )
}

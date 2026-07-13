import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  // Disable React strict mode in production for faster reconciliation.
  // (Re-render safety checks are only useful during dev.)
  reactStrictMode: false,

  // DO NOT use "standalone" output - our custom server.ts handles everything.
  // Standalone mode conflicts with custom servers using Socket.IO.
  // output: "standalone",
  assetPrefix: undefined,

  // WebSocket-friendly external packages (cannot be bundled)
  serverExternalPackages: ["node-pty", "socket.io", "bcryptjs", "jsonwebtoken"],

  // ─── Speed flags ────────────────────────────────────────────────
  poweredByHeader: false,        // smaller response headers
  compress: true,                // gzip + brotli (default true, kept explicit)
  productionBrowserSourceMaps: false,  // smaller bundles
  // Use SWC minifier (default true, kept explicit for clarity)
  // SWC is 20x faster than Babel + terser for the same output.
  // (Next 14+ enables this by default; flag here for documentation.)

  // Optimize images - skip optimization for faster Docker builds
  // (most assets are local SVG icons, no remote optimization needed)
  images: {
    unoptimized: true,
    formats: ['image/avif', 'image/webp'],
  },

  // Aggressive tree-shaking for icon libraries - cuts initial bundle
  // by ~250KB by only importing the icons actually used.
  experimental: {
    optimizePackageImports: [
      'lucide-react',
      '@radix-ui/react-icons',
      '@radix-ui/react-dialog',
      '@radix-ui/react-dropdown-menu',
      '@radix-ui/react-tabs',
      '@radix-ui/react-tooltip',
      '@radix-ui/react-scroll-area',
      '@radix-ui/react-separator',
      '@radix-ui/react-slot',
      'recharts',
      'date-fns',
    ],
    // Speed up dev: only attribute CLS + LCP web vitals
    // (skips FID/INP/TTFB attribution overhead)
    webVitalsAttribution: ['CLS', 'LCP'],
  },

  // Turbopack root directory — must be set because the project
  // structure has src/app which Turbopack can misinterpret as the root.
  // Points to the directory containing package.json and node_modules.
  // In Docker this will be /app, locally it's wherever the project is.
  turbopack: {
    root: process.cwd(),
  },

  // Cache static assets aggressively in the browser
  async headers() {
    return [
      {
        // Next.js _next/static/* assets are content-hashed → safe to cache forever
        source: '/_next/static/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
      {
        // Public assets (logo, icons) - cached for 1 day
        source: '/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=86400' },
        ],
      },
    ]
  },
};

export default nextConfig;

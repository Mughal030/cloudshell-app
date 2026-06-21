import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,

  // DO NOT use "standalone" output - our custom server.ts handles everything.
  // Standalone mode conflicts with custom servers using Socket.IO.
  // output: "standalone",
  // Ensure static files are served correctly
  assetPrefix: undefined,
  // Handle WebSocket connections in production
  serverExternalPackages: ["node-pty", "socket.io", "bcryptjs", "jsonwebtoken"],
  // Performance optimizations
  poweredByHeader: false,
  compress: true,
  // Strip source maps from production build (smaller bundles, faster loads)
  productionBrowserSourceMaps: false,
  // Optimize images
  images: {
    unoptimized: true, // Skip image optimization for faster builds in Docker
  },
  // experimental.optimizePackageImports handles lucide-react / radix icons
  // tree-shaking correctly (modularizeImports was too aggressive and broke
  // icon name resolution).
  experimental: {
    optimizePackageImports: ['lucide-react', '@radix-ui/react-icons'],
  },
};

export default nextConfig;

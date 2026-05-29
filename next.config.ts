import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  output: "standalone",
  // Ensure static files are served correctly
  assetPrefix: undefined,
  // Handle WebSocket connections in production
  serverExternalPackages: ["node-pty", "socket.io"],
};

export default nextConfig;

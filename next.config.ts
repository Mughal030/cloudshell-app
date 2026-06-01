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
  serverExternalPackages: ["node-pty", "socket.io"],
  turbopack: {
    root: "/home/z/my-project",
  },
};

export default nextConfig;

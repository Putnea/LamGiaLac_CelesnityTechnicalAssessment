import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Required for Docker multi-stage build — produces a minimal standalone server
  output: "standalone",
  async rewrites() {
    const backendUrl = process.env.BACKEND_INTERNAL_URL || "http://localhost:3000";
    return [
      {
        source: "/api/:path*",
        destination: `${backendUrl}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;

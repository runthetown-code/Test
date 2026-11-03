import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Tenant hosts (acme.localhost:3000, custom domains) must be allowed to hit the dev server.
  allowedDevOrigins: ["*.localhost", "*.test"],
  experimental: {
    serverActions: { bodySizeLimit: "5mb" }, // CSV imports and logo uploads
  },
};

export default nextConfig;

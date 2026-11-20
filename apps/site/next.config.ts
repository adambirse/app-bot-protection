import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@cms-bot/db", "@cms-bot/security"],
  serverExternalPackages: ["pg"],
  poweredByHeader: false,
};

export default nextConfig;

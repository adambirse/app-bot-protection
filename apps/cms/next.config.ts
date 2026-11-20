import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@cms-bot/db", "@cms-bot/basic-auth"],
  serverExternalPackages: ["pg"],
};

export default nextConfig;

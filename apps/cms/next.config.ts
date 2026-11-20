import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@cms-bot/db", "@cms-bot/filter-store", "@cms-bot/security"],
  serverExternalPackages: ["pg", "@redis/client"],
  poweredByHeader: false,
  experimental: {
    // Pages are capped at ~10k characters, so no form post needs more than this.
    serverActions: { bodySizeLimit: "64kb" },
  },
};

export default nextConfig;

import type { NextConfig } from "next";
import { fileURLToPath } from "node:url";

/** Where the API listens, seen from this server (Docker: http://api:4000). */
const apiUrl = process.env.API_INTERNAL_URL ?? `http://localhost:${process.env.API_PORT ?? 4000}`;

const config: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: fileURLToPath(new URL("../../", import.meta.url)),
  poweredByHeader: false,
  experimental: {
    // Uploads from the Mac app go through this rewrite in `pnpm dev`. Next caps rewritten
    // bodies at 10 MB and proxies for 30 s by default: match the API's own limit instead.
    proxyClientMaxBodySize: `${Number(process.env.MAX_UPLOAD_MB ?? 4096)}mb`,
    proxyTimeout: 60 * 60 * 1000,
  },
  // In production Caddy sends /api/* straight to the API. This rewrite covers `pnpm dev`
  // and setups without the proxy.
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${apiUrl}/api/:path*` }];
  },
};

export default config;

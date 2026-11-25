import type { NextConfig } from "next";
import { fileURLToPath } from "node:url";

/** Where the API listens, seen from this server (Docker: http://api:4000). */
const apiUrl = process.env.API_INTERNAL_URL ?? `http://localhost:${process.env.API_PORT ?? 4000}`;

const config: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: fileURLToPath(new URL("../../", import.meta.url)),
  poweredByHeader: false,
  // In production Caddy sends /api/* straight to the API. This rewrite covers `pnpm dev`
  // and setups without the proxy.
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${apiUrl}/api/:path*` }];
  },
};

export default config;

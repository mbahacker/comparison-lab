import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: process.cwd(),
  turbopack: { root: process.cwd() },
  poweredByHeader: false,
  serverExternalPackages: ["node:sqlite"],
  outputFileTracingIncludes: { "/*": ["./content/**/*", "./rubric/**/*"] },
  outputFileTracingExcludes: { "/*": ["./data/**/*", "./.env*", "./.npm-cache/**/*", "./worker/data/**/*", "./worker/.cache/**/*", "./.git/**/*", "./tests/**/*", "./docs/**/*"] },
  async headers() {
    return [{ source: "/:path*", headers: [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "no-referrer" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
    ] }];
  },
};

export default nextConfig;

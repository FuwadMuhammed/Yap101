import type { NextConfig } from "next";

// Baseline security headers for every response. No strict CSP yet: the app loads MediaPipe and
// the speech model from CDNs and runs WebAssembly, so a CSP needs its own rollout and testing.
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Nobody may frame the app (clickjacking).
  { key: "X-Frame-Options", value: "DENY" },
  // Camera and mic for this site only; nothing else.
  { key: "Permissions-Policy", value: "camera=(self), microphone=(self), geolocation=(), payment=(), usb=()" },
];

const nextConfig: NextConfig = {
  cacheComponents: true,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;

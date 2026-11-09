import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Next blocks cross-origin requests to dev-only assets by default. The Replit
  // preview is served from a rotating *.replit.dev proxy host, so allow it to
  // reach the dev server. Dev-only; no effect on a production build.
  allowedDevOrigins: ['*.replit.dev', '*.kirk.replit.dev', '*.repl.co'],
  experimental: {
    serverActions: {
      // Curriculum PDFs (≤50 MB) are uploaded through a Server Action in dev;
      // leave headroom for multipart overhead. Replace with resumable client
      // uploads to Storage once real auth lands.
      bodySizeLimit: '55mb',
    },
  },
};

export default nextConfig;

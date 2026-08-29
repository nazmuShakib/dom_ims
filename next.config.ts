import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // The JSON repositories use node:fs. Phase 0/1 must run on the Node runtime,
  // never the Edge runtime. (Moot after Phase 6 — PLAN.md §14.)
  serverExternalPackages: [],
};

export default nextConfig;

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Data architecture ADR D9 (docs/architecture/data-architecture-adr-2026-10-29.md).
  cacheComponents: true,
  partialPrefetching: true,
  // ponytail: standalone deploy boundary — no shared Vercel project
};

export default nextConfig;

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Data architecture ADR D9 (docs/architecture/data-architecture-adr-2026-10-29.md).
  cacheComponents: true,
  partialPrefetching: true,
  // Optimize for static export and performance
  output: 'standalone',
  poweredByHeader: false,
  compress: true,
};

module.exports = nextConfig;

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Optimize for static export and performance
  output: 'standalone',
  poweredByHeader: false,
  compress: true,
};

module.exports = nextConfig;

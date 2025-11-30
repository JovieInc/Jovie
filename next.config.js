/** @type {import('next').NextConfig} */
const path = require('path');

// Bundle analyzer for performance optimization
const withBundleAnalyzer = require('@next/bundle-analyzer')({
  enabled: process.env.ANALYZE === 'true',
});

const nextConfig = {
  turbopack: {},
  typescript: {
    ignoreBuildErrors: false,
  },
  output: 'standalone',
  // Disable static generation to prevent Clerk context issues during build
  trailingSlash: false,
  // Build optimizations
  poweredByHeader: false,
  compress: true,
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'i.scdn.co',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'res.cloudinary.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'images.clerk.dev',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'img.clerk.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'api.qrserver.com',
        port: '',
        pathname: '/**',
      },
    ],
    formats: ['image/avif', 'image/webp'],
    qualities: [25, 50, 75, 85, 100],
    deviceSizes: [640, 750, 828, 1080, 1200],
    imageSizes: [64, 96, 128, 256, 384, 400],
    minimumCacheTTL: 60 * 60 * 24 * 365, // 1 year for better caching
    dangerouslyAllowSVG: true,
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
    // Enable blur placeholders for better UX
    unoptimized: false,
  },
  async headers() {
    const securityHeaders = [
      {
        key: 'X-Frame-Options',
        value: 'DENY',
      },
      {
        key: 'X-Content-Type-Options',
        value: 'nosniff',
      },
      {
        key: 'Referrer-Policy',
        value: 'origin-when-cross-origin',
      },
    ];

    const isProdLike =
      process.env.NODE_ENV === 'production' ||
      process.env.VERCEL_ENV === 'production';

    if (isProdLike) {
      securityHeaders.push({
        key: 'Strict-Transport-Security',
        value: 'max-age=31536000; includeSubDomains; preload',
      });
    }

    securityHeaders.push({
      key: 'Permissions-Policy',
      value: 'camera=(), microphone=(), geolocation=()',
    });
    return [
      {
        // Ensure internal flags endpoint is never cached
        source: '/api/feature-flags',
        headers: [
          ...securityHeaders,
          {
            key: 'Cache-Control',
            value: 'no-store',
          },
        ],
      },
      {
        source: '/api/(.*)',
        headers: [
          ...securityHeaders,
          {
            key: 'Cache-Control',
            value: 'public, max-age=300, s-maxage=300', // 5 minutes
          },
        ],
      },
      {
        // Exclude Vercel Flags discovery endpoint from global cache headers
        source: '/((?!\.well-known/vercel/flags).*)',
        headers: [
          ...securityHeaders,
          {
            key: 'Cache-Control',
            value: 'public, max-age=0, must-revalidate',
          },
        ],
      },
    ];
  },
  experimental: {
    // Disable optimizeCss to avoid critters dependency issues
    // optimizeCss: true,
    optimizePackageImports: ['@headlessui/react', '@heroicons/react'],
    // Build optimizations
    // Turbopack: remove unsupported option
    // forceSwcTransforms: true,
    swcTraceProfiling: false,
    // Web vitals attribution with valid metric names only
    webVitalsAttribution: ['CLS', 'FCP', 'INP', 'LCP', 'TTFB'],
  },
  compiler: {
    // Keep console logs in Vercel Preview builds for debugging
    removeConsole:
      process.env.NODE_ENV === 'production' &&
      process.env.VERCEL_ENV !== 'preview',
  },
  // Webpack optimizations
  webpack: (config, { dev, isServer }) => {
    if (!dev && !isServer) {
      // Optimize bundle size with improved cache strategy
      config.optimization = {
        ...config.optimization,
        splitChunks: {
          chunks: 'all',
          maxSize: 244000, // Reduce chunk size to improve cache serialization
          cacheGroups: {
            vendor: {
              test: /[\\/]node_modules[\\/]/,
              name: 'vendors',
              chunks: 'all',
              maxSize: 244000,
            },
            common: {
              name: 'common',
              minChunks: 2,
              chunks: 'all',
              maxSize: 244000,
            },
          },
        },
      };
    }

    // Exclude PostHog Node.js from Edge Runtime bundles
    if (!isServer) {
      config.externals = config.externals || [];
      config.externals.push({
        'posthog-node': 'commonjs posthog-node',
      });
    }

    // Exclude Storybook files from production builds
    if (!dev) {
      config.module.rules.push({
        test: /\.stories\.(js|jsx|ts|tsx|mdx)$/,
        use: 'ignore-loader',
      });
    }

    // Alias '@jovie/ui' to local package sources so imports resolve in dev/build
    config.resolve = config.resolve || {};
    config.resolve.alias = {
      ...(config.resolve.alias || {}),
      ['@jovie/ui']: path.resolve(__dirname, 'packages/ui'),
    };

    return config;
  },
};

// Enable Vercel Toolbar in Next.js (local/dev)
const withVercelToolbar = require('@vercel/toolbar/plugins/next')();

// Apply plugins in order: bundle analyzer -> vercel toolbar
module.exports = withBundleAnalyzer(withVercelToolbar(nextConfig));

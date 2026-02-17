/** @type {import('next').NextConfig} */
const path = require('path');

// Safely require optional dependencies that may not be installed
function safeRequire(mod) {
  try {
    return require(mod);
  } catch {
    return null;
  }
}

const codecovModule = safeRequire('@codecov/webpack-plugin');
const codecovWebpackPlugin = codecovModule?.codecovWebpackPlugin;

// Read version from canonical source (version.json at monorepo root)
let APP_VERSION = '0.0.0';
try {
  APP_VERSION = require('../../version.json').version;
} catch {
  // version.json may not exist during initial setup
}

// Bundle analyzer for performance optimization
const bundleAnalyzerModule = safeRequire('@next/bundle-analyzer');
const withBundleAnalyzer = bundleAnalyzerModule
  ? bundleAnalyzerModule({ enabled: process.env.ANALYZE === 'true' })
  : (config) => config;

const nextConfig = {
  // Transpile workspace packages for proper module resolution
  transpilePackages: ['@jovie/ui'],
  turbopack: {
    // Resolve aliases matching tsconfig paths for consistent module resolution
    resolveAlias: {
      '@/*': './*',
      '@/components/*': './components/*',
      '@/atoms/*': './components/atoms/*',
      '@/molecules/*': './components/molecules/*',
      '@/organisms/*': './components/organisms/*',
      '@/lib/*': './lib/*',
      '@/types/*': './types/*',
    },
    // Prioritize common extensions for faster resolution
    resolveExtensions: ['.tsx', '.ts', '.jsx', '.js', '.mjs', '.json'],
  },
  // React Compiler: auto-memoization to eliminate render loops and manual useMemo/useCallback
  reactCompiler: true,
  typescript: {
    ignoreBuildErrors: false,
  },
  output: 'standalone',
  // Monorepo root for standalone output file tracing (prevents lockfile detection warnings)
  outputFileTracingRoot: path.join(__dirname, '../../'),
  // Disable static generation to prevent Clerk context issues during build
  trailingSlash: false,
  // Build optimizations
  poweredByHeader: false,
  compress: true,
  // Note: cacheComponents disabled due to incompatibility with runtime='nodejs' in API routes
  // Using traditional caching (unstable_cache) instead
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
        hostname: 'linktr.ee',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'api.qrserver.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: '*.public.blob.vercel-storage.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: '*.blob.vercel-storage.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: '*.mzstatic.com',
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

    const isNonLocalEnv =
      process.env.VERCEL_ENV && process.env.VERCEL_ENV !== 'development';

    if (isNonLocalEnv) {
      securityHeaders.push({
        key: 'Strict-Transport-Security',
        value: 'max-age=31536000; includeSubDomains; preload',
      });
    }

    securityHeaders.push({
      key: 'Permissions-Policy',
      value: 'camera=(), microphone=(), geolocation=()',
    });

    // Cache control header helpers
    const cacheHeaders = {
      immutable: {
        key: 'Cache-Control',
        value: 'public, max-age=31536000, s-maxage=31536000, immutable',
      },
      noStore: {
        key: 'Cache-Control',
        value: 'private, no-cache, no-store, must-revalidate',
      },
      revalidate: {
        key: 'Cache-Control',
        value: 'public, max-age=0, must-revalidate',
      },
    };

    return [
      {
        source: '/api/health/build-info',
        headers: [
          {
            key: 'Cache-Control',
            value: 'no-store, no-cache, must-revalidate',
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
      // Marketing pages (pre-rendered at build) - long-lived cache
      {
        source: '/',
        headers: [...securityHeaders, cacheHeaders.immutable],
      },
      {
        source:
          '/(pricing|support|investors|engagement-engine|link-in-bio|blog|changelog)',
        headers: [...securityHeaders, cacheHeaders.immutable],
      },
      {
        source: '/legal/:path*',
        headers: [...securityHeaders, cacheHeaders.immutable],
      },
      // App routes and dynamic pages - no cache
      {
        source: '/app/:path*',
        headers: [...securityHeaders, cacheHeaders.noStore],
      },
      {
        source:
          '/(go|r|onboarding|account|billing|hud|signin|signup|sso-callback)(.*)',
        headers: [...securityHeaders, cacheHeaders.noStore],
      },
      // Dynamic profile pages - no cache
      {
        source: '/:username/:path*',
        headers: [...securityHeaders, cacheHeaders.revalidate],
      },
      // Catch-all for other routes - revalidate on each request
      {
        source: '/(.*)',
        headers: [...securityHeaders, cacheHeaders.revalidate],
      },
    ];
  },
  async redirects() {
    // VIP username aliases (case-insensitive handling)
    // Add both lowercase and mixed-case variants for each alias
    const vipUsernameRedirects = [
      // Tim White → Tim
      { source: '/timwhite', destination: '/tim', permanent: true },
      { source: '/TimWhite', destination: '/tim', permanent: true },
      { source: '/Timwhite', destination: '/tim', permanent: true },
      { source: '/TIMWHITE', destination: '/tim', permanent: true },
    ];

    return [
      // Legal page redirects
      {
        source: '/privacy',
        destination: '/legal/privacy',
        permanent: true,
      },
      {
        source: '/terms',
        destination: '/legal/terms',
        permanent: true,
      },
      // VIP username redirects
      ...vipUsernameRedirects,
    ];
  },
  async rewrites() {
    return [
      // Rewrite /app/* to /app/dashboard/* for cleaner URLs
      {
        source: '/app/profile',
        destination: '/app/dashboard/profile',
      },
      {
        source: '/app/contacts',
        destination: '/app/dashboard/contacts',
      },
      {
        source: '/app/releases',
        destination: '/app/dashboard/releases',
      },
      {
        source: '/app/tour-dates',
        destination: '/app/dashboard/tour-dates',
      },
      {
        source: '/app/audience',
        destination: '/app/dashboard/audience',
      },
      {
        source: '/app/earnings',
        destination: '/app/dashboard/earnings',
      },
      {
        source: '/app/chat',
        destination: '/app/dashboard/chat',
      },
      {
        source: '/app/analytics',
        destination: '/app/dashboard/analytics',
      },
      {
        source: '/app/insights',
        destination: '/app/dashboard/insights',
      },
    ];
  },
  env: {
    NEXT_PUBLIC_APP_VERSION: APP_VERSION,
    NEXT_PUBLIC_BUILD_SHA: (process.env.VERCEL_GIT_COMMIT_SHA || '').slice(
      0,
      7
    ),
  },
  experimental: {
    // Note: PPR (ppr: 'incremental') was deprecated in Next.js 15.3
    // cacheComponents: true requires additional configuration, disabled for now
    // Turbopack filesystem cache for faster dev server startup
    turbopackFileSystemCacheForDev: true,
    // Disable optimizeCss to avoid critters dependency issues
    // optimizeCss: true,
    optimizePackageImports: [
      '@headlessui/react',
      'lucide-react',
      'simple-icons',
      'web-vitals', // Prevent ChunkLoadError in E2E tests
      '@radix-ui/react-dialog',
      '@radix-ui/react-dropdown-menu',
      '@radix-ui/react-popover',
      '@radix-ui/react-select',
      '@radix-ui/react-tabs',
      '@radix-ui/react-tooltip',
      '@radix-ui/react-avatar',
      '@radix-ui/react-checkbox',
      '@radix-ui/react-switch',
      '@radix-ui/react-toggle',
      '@radix-ui/react-toggle-group',
      '@radix-ui/react-label',
      '@radix-ui/react-separator',
      '@radix-ui/react-slot',
      '@radix-ui/react-alert-dialog',
      '@radix-ui/react-radio-group',
      'clsx',
      'class-variance-authority',
      '@dnd-kit/core',
      '@dnd-kit/sortable',
      '@dnd-kit/utilities',
      'framer-motion',
      'zod',
      '@tanstack/react-table',
      '@tanstack/react-virtual',
    ],
    // Build optimizations
    // Turbopack: remove unsupported option
    // forceSwcTransforms: true,
    swcTraceProfiling: false,
    // Web vitals attribution with valid metric names only
    webVitalsAttribution: ['CLS', 'FCP', 'INP', 'LCP', 'TTFB'],
    // Note: cacheComponents removed due to incompatibility with runtime='nodejs' in API routes
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
          maxSize: 200000, // Smaller chunks reduce serialized cache payloads.
          minSize: 20000,
          cacheGroups: {
            framework: {
              test: /[\\/]node_modules[\\/](react|react-dom|scheduler|next)[\\/]/,
              name: 'framework',
              chunks: 'all',
              priority: 40,
              enforce: true,
            },
            icons: {
              test: /[\\/]node_modules[\\/](simple-icons|lucide-react)[\\/]/,
              name: 'icons',
              chunks: 'all',
              priority: 30,
              maxSize: 180000,
            },
            motion: {
              test: /[\\/]node_modules[\\/]framer-motion[\\/]/,
              name: 'motion',
              chunks: 'all',
              priority: 25,
              maxSize: 180000,
            },
            charts: {
              test: /[\\/]node_modules[\\/]recharts[\\/]/,
              name: 'charts',
              chunks: 'all',
              priority: 25,
              maxSize: 180000,
            },
            vendors: {
              test: /[\\/]node_modules[\\/]/,
              name: 'vendors',
              chunks: 'all',
              priority: 10,
              reuseExistingChunk: true,
              maxSize: 200000,
            },
            common: {
              name: 'common',
              minChunks: 2,
              chunks: 'all',
              priority: 5,
              maxSize: 200000,
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
    // Note: tsconfig paths handle this for TypeScript, but webpack needs explicit alias
    config.resolve = config.resolve || {};
    config.resolve.alias = {
      ...(config.resolve.alias || {}),
      ['@jovie/ui']: path.resolve(__dirname, '../../packages/ui'),
    };

    // Codecov Bundle Analysis plugin - uploads bundle stats during CI builds
    if (codecovWebpackPlugin) {
      config.plugins.push(
        codecovWebpackPlugin({
          enableBundleAnalysis: process.env.CODECOV_TOKEN !== undefined,
          bundleName: 'jovie-web',
          uploadToken: process.env.CODECOV_TOKEN,
        })
      );
    }

    return config;
  },
};

// Enable Vercel Toolbar in Next.js (local/dev only)
// The toolbar plugin must NOT run in production builds because it injects
// client-side code that uses eval(), violating Content Security Policy.
const enableVercelToolbar =
  process.env.NODE_ENV !== 'production' && !process.env.NEXT_DISABLE_TOOLBAR;
const vercelToolbarPlugin = enableVercelToolbar
  ? safeRequire('@vercel/toolbar/plugins/next')
  : null;
const withVercelToolbar = vercelToolbarPlugin
  ? vercelToolbarPlugin()
  : config => config;

// Apply plugins in order: bundle analyzer -> vercel toolbar
module.exports = withBundleAnalyzer(withVercelToolbar(nextConfig));

// Injected content via Sentry wizard below

const sentryNextjs = safeRequire('@sentry/nextjs');

if (sentryNextjs) {
module.exports = sentryNextjs.withSentryConfig(module.exports, {
  // For all available options, see:
  // https://www.npmjs.com/package/@sentry/webpack-plugin#options

  org: 'jovie',
  project: 'jovie-web',

  // Only print logs for uploading source maps in CI
  silent: !process.env.CI,

  // For all available options, see:
  // https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/

  // Upload a larger set of source maps for prettier stack traces (increases build time)
  widenClientFileUpload: true,

  // Route browser requests to Sentry through a Next.js rewrite to circumvent ad-blockers.
  // This can increase your server load as well as your hosting bill.
  // Note: Check that the configured route will not match with your Next.js middleware, otherwise reporting of client-
  // side errors will fail.
  tunnelRoute: '/monitoring',

  // Webpack-specific options (new location for deprecated top-level options)
  webpack: {
    // Automatically tree-shake Sentry logger statements to reduce bundle size
    treeshake: {
      removeDebugLogging: true,
    },
    // Enables automatic instrumentation of Vercel Cron Monitors
    automaticVercelMonitors: true,
  },
});
}

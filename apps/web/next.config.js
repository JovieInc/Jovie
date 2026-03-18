/** @type {import('next').NextConfig} */
const path = require('path');
const withBundleAnalyzer = require('@next/bundle-analyzer')({
  enabled: process.env.ANALYZE === 'true',
});
// Read version from canonical source (version.json at monorepo root)
const { version: APP_VERSION } = require('../../version.json');

const nextConfig = {
  // Transpile workspace packages for proper module resolution
  transpilePackages: ['@jovie/ui'],
  turbopack: {
    // Path aliases are automatically resolved from tsconfig.json paths.
    // Do NOT add resolveAlias entries for @/* — that conflicts with
    // tsconfig resolution and causes "Could not parse module" errors
    // for server-only files (JOV-1062, JOV-1063).
    resolveExtensions: ['.tsx', '.ts', '.jsx', '.js', '.mjs', '.json'],
  },
  // React Compiler: auto-memoization to eliminate render loops and manual useMemo/useCallback
  reactCompiler: true,
  typescript: {
    // CI sets NEXT_IGNORE_TYPECHECK=1 — skip during build since typecheck runs separately
    ignoreBuildErrors: !!process.env.NEXT_IGNORE_TYPECHECK,
  },
  eslint: {
    // CI sets NEXT_IGNORE_ESLINT=1 — skip during build since lint runs separately
    ignoreDuringBuilds: !!process.env.NEXT_IGNORE_ESLINT,
  },
  // Never ship source maps to browsers (Sentry plugin uploads them separately)
  productionBrowserSourceMaps: false,
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
    // Remote image patterns for Next.js image optimization.
    // Keep in sync with constants/platforms/cdn-domains.ts — verified by sync test.
    remotePatterns: [
      // ── Music DSPs ────────────────────────────────────────
      { protocol: 'https', hostname: 'i.scdn.co' }, // Spotify
      { protocol: 'https', hostname: '*.scdn.co' }, // Spotify CDN
      { protocol: 'https', hostname: '*.spotifycdn.com' }, // Spotify CDN
      { protocol: 'https', hostname: '*.mzstatic.com' }, // Apple Music
      { protocol: 'https', hostname: '*.ytimg.com' }, // YouTube / YouTube Music
      { protocol: 'https', hostname: '*.ggpht.com' }, // YouTube channel avatars
      { protocol: 'https', hostname: '*.sndcdn.com' }, // SoundCloud
      { protocol: 'https', hostname: '*.bcbits.com' }, // Bandcamp
      { protocol: 'https', hostname: '*.tidal.com' }, // Tidal
      { protocol: 'https', hostname: '*.dzcdn.net' }, // Deezer
      { protocol: 'https', hostname: 'm.media-amazon.com' }, // Amazon Music
      { protocol: 'https', hostname: '*.ssl-images-amazon.com' }, // Amazon Music CDN
      { protocol: 'https', hostname: '*.sndimg.com' }, // Pandora
      { protocol: 'https', hostname: 'content-images.p-cdn.com' }, // Pandora CDN
      { protocol: 'https', hostname: 'geo-media.beatport.com' }, // Beatport

      // ── Social Networks ───────────────────────────────────
      { protocol: 'https', hostname: '*.cdninstagram.com' }, // Instagram
      { protocol: 'https', hostname: '*.fbcdn.net' }, // Facebook / Instagram CDN
      { protocol: 'https', hostname: '*.fbsbx.com' }, // Facebook
      { protocol: 'https', hostname: '*.twimg.com' }, // Twitter/X
      { protocol: 'https', hostname: '*.tiktokcdn.com' }, // TikTok
      { protocol: 'https', hostname: '*.tiktokcdn-us.com' }, // TikTok US CDN
      { protocol: 'https', hostname: '*.licdn.com' }, // LinkedIn
      { protocol: 'https', hostname: '*.sc-cdn.net' }, // Snapchat
      { protocol: 'https', hostname: '*.pinimg.com' }, // Pinterest
      { protocol: 'https', hostname: '*.redd.it' }, // Reddit
      { protocol: 'https', hostname: '*.redditstatic.com' }, // Reddit

      // ── Creator Platforms ─────────────────────────────────
      { protocol: 'https', hostname: '*.jtvnw.net' }, // Twitch
      { protocol: 'https', hostname: 'cdn.discordapp.com' }, // Discord
      { protocol: 'https', hostname: '*.patreonusercontent.com' }, // Patreon
      { protocol: 'https', hostname: '*.substackcdn.com' }, // Substack
      { protocol: 'https', hostname: 'miro.medium.com' }, // Medium
      { protocol: 'https', hostname: 'avatars.githubusercontent.com' }, // GitHub
      { protocol: 'https', hostname: 'mir-s3-cdn-cf.behance.net' }, // Behance
      { protocol: 'https', hostname: 'cdn.dribbble.com' }, // Dribbble

      // ── Link Aggregators ──────────────────────────────────
      { protocol: 'https', hostname: 'linktr.ee' }, // Linktree
      { protocol: 'https', hostname: '*.linktr.ee' }, // Linktree

      // ── Auth / Avatar Providers ───────────────────────────
      { protocol: 'https', hostname: 'images.clerk.dev' },
      { protocol: 'https', hostname: 'img.clerk.com' },
      { protocol: 'https', hostname: '*.googleusercontent.com' },
      { protocol: 'https', hostname: '*.gravatar.com' },
      { protocol: 'https', hostname: 'images.unsplash.com' },

      // ── Infrastructure ────────────────────────────────────
      { protocol: 'https', hostname: 'api.qrserver.com' },
      { protocol: 'https', hostname: '*.blob.vercel-storage.com' },
      { protocol: 'https', hostname: '*.supabase.co' },
      { protocol: 'https', hostname: '*.supabase.in' },
      { protocol: 'https', hostname: 'vercel.live' },
      { protocol: 'https', hostname: 'vercel.com' },
    ],
    formats: ['image/avif', 'image/webp'],
    qualities: [25, 50, 75, 85, 100],
    deviceSizes: [640, 750, 828, 1080, 1200],
    imageSizes: [64, 96, 128, 256, 384, 400, 1000],
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
      value: 'camera=(), microphone=(), geolocation=(self)',
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
        source: '/(pricing|support|investors|engagement-engine|blog|changelog)',
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
      // Pricing page hidden for founding member launch (JOV-1050)
      {
        source: '/pricing',
        destination: '/',
        permanent: false,
      },
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
      {
        source: '/app/analytics',
        destination: '/app/dashboard/audience',
        permanent: false,
      },
      {
        source: '/app/dashboard/analytics',
        destination: '/app/dashboard/audience',
        permanent: false,
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
        source: '/app/insights',
        destination: '/app/dashboard/insights',
      },
      {
        source: '/app/presence',
        destination: '/app/dashboard/presence',
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
      '@jovie/ui',
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
      'recharts',
      '@tanstack/react-pacer',
      '@sentry/nextjs',
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
};

// Vercel Toolbar: only on Vercel preview deploys (not local dev, not production).
// Opt-in locally with NEXT_ENABLE_TOOLBAR=1 if needed.
const enableVercelToolbar =
  process.env.VERCEL_ENV === 'preview' ||
  process.env.NEXT_ENABLE_TOOLBAR === '1';
const withVercelToolbar = enableVercelToolbar
  ? require('@vercel/toolbar/plugins/next')()
  : config => config;

// Apply plugins in order: bundle analyzer -> vercel toolbar -> sentry
module.exports = withBundleAnalyzer(withVercelToolbar(nextConfig));

// Sentry build plugin: only in production/CI (source map upload, tunnel route).
// The Sentry runtime SDK (sentry.server.config.ts) works independently in dev.
const { withSentryConfig } = require('@sentry/nextjs');

const shouldUseSentryPlugin =
  process.env.NODE_ENV === 'production' ||
  process.env.CI === 'true' ||
  !!process.env.VERCEL_ENV;

module.exports = shouldUseSentryPlugin
  ? withSentryConfig(module.exports, {
      org: 'jovie',
      project: 'jovie-web',
      silent: !process.env.CI,
      widenClientFileUpload: true,
      tunnelRoute: '/monitoring',
    })
  : module.exports;

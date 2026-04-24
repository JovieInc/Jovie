/** @type {import('next').NextConfig} */
const path = require('path');
const withBundleAnalyzer = require('@next/bundle-analyzer')({
  enabled: process.env.ANALYZE === 'true',
});
// Read version from canonical source (version.json at monorepo root)
const { version: APP_VERSION } = require('../../version.json');
const isVercelPreview = process.env.VERCEL_ENV === 'preview';

const nextConfig = {
  // Local and CI E2E runs use loopback hosts (`localhost` and `127.0.0.1`).
  // Allow both so Next dev accepts asset/server-action requests from either host.
  allowedDevOrigins: ['localhost', '127.0.0.1', '::1', '[::1]'],
  // Move dev indicator to top-right so it doesn't overlap the DevToolbar
  devIndicators: {
    position: 'top-right',
  },
  // Transpile workspace packages for proper module resolution
  transpilePackages: ['@jovie/ui', '@clerk/ui'],
  // Keep Remotion's native/renderer packages out of the Next bundler — they
  // load platform-specific compositor binaries at runtime and only execute in
  // the cron route (Node runtime).
  serverExternalPackages: [
    '@remotion/renderer',
    '@remotion/bundler',
    '@remotion/compositor-darwin-arm64',
    '@remotion/compositor-darwin-x64',
    '@remotion/compositor-linux-x64-gnu',
    '@remotion/compositor-linux-x64-musl',
    '@remotion/compositor-linux-arm64-gnu',
    '@remotion/compositor-linux-arm64-musl',
    '@remotion/compositor-win32-x64-msvc',
  ],
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
  // Never ship source maps to browsers (Sentry plugin uploads them separately)
  productionBrowserSourceMaps: false,
  output: isVercelPreview ? undefined : 'standalone',
  // Monorepo root for standalone output file tracing (prevents lockfile detection warnings)
  outputFileTracingRoot: isVercelPreview
    ? undefined
    : path.join(__dirname, '../../'),
  // Note: previously we set outputFileTracingIncludes with globs into
  // node_modules/.pnpm/node_modules/{import,require}-in-the-middle. Those
  // paths start with pnpm's virtual-store symlink layer AND the target
  // directories contain nested symlinks (e.g. to acorn, debug). Vercel's
  // serverless packager rejects serverless function bundles that contain
  // symlinks with "patch_build_4xx: framework produced an invalid
  // deployment package for a Serverless Function", which kept every
  // production deploy in ERROR state from 2026-04-23 onward. The last
  // known-good production deploy (b387eb1, 2026-04-16) shipped without
  // this include and was healthy. If public-route smoke / Lighthouse
  // starts 500ing again because Sentry's interception helpers get
  // externalized, re-introduce the includes via a non-symlinked path
  // (e.g. `.npmrc` public-hoist-pattern or a post-build dereference
  // step) instead of pnpm virtual-store globs.
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
    imageSizes: [64, 96, 128, 256, 384, 400, 1024],
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

    const legacyAppRedirects = [
      { source: '/app/contact', destination: '/app/settings/contacts' },
      { source: '/app/profile', destination: '/app/chat?panel=profile' },
      { source: '/app/contacts', destination: '/app/settings/contacts' },
      {
        source: '/app/earnings',
        destination: '/app/settings/artist-profile?tab=earn#pay',
      },
      {
        source: '/app/tipping',
        destination: '/app/settings/artist-profile?tab=earn#pay',
      },
      { source: '/app/tour-dates', destination: '/app/settings/touring' },
      { source: '/app/dashboard', destination: '/app' },
      { source: '/app/dashboard/overview', destination: '/app' },
      {
        source: '/app/dashboard/earnings',
        destination: '/app/settings/artist-profile?tab=earn#pay',
      },
      {
        source: '/app/dashboard/links',
        destination: '/app/chat?panel=profile',
      },
      {
        source: '/app/dashboard/tipping',
        destination: '/app/settings/artist-profile?tab=earn#pay',
      },
      {
        source: '/app/dashboard/profile',
        destination: '/app/chat?panel=profile',
      },
      { source: '/app/dashboard/chat', destination: '/app/chat' },
      {
        source: '/app/dashboard/contacts',
        destination: '/app/settings/contacts',
      },
      {
        source: '/app/dashboard/tour-dates',
        destination: '/app/settings/touring',
      },
      { source: '/app/settings', destination: '/app/settings/account' },
      {
        source: '/app/settings/profile',
        destination: '/app/settings/artist-profile',
      },
      {
        source: '/app/settings/appearance',
        destination: '/app/settings/account',
      },
      {
        source: '/app/settings/notifications',
        destination: '/app/settings/account',
      },
      {
        source: '/app/settings/delete-account',
        destination: '/app/settings/data-privacy',
      },
      {
        source: '/app/settings/retargeting-ads',
        destination: '/app/settings/audience',
      },
      {
        source: '/app/settings/referral',
        destination: '/app/settings/account',
      },
      {
        source: '/app/referrals',
        destination: '/app/settings/account',
      },
      {
        source: '/app/settings/remove-branding',
        destination: '/app/settings/artist-profile',
      },
      {
        source: '/app/settings/ad-pixels',
        destination: '/app/settings/audience',
      },
      {
        source: '/app/settings/branding',
        destination: '/app/settings/artist-profile',
      },
      {
        source: '/app/admin/waitlist',
        destination: '/app/admin/people?view=waitlist',
      },
      {
        source: '/app/admin/creators',
        destination: '/app/admin/people?view=creators',
      },
      {
        source: '/app/admin/users',
        destination: '/app/admin/people?view=users',
      },
      {
        source: '/app/admin/feedback',
        destination: '/app/admin/people?view=feedback',
      },
      {
        source: '/app/admin/leads',
        destination: '/app/admin/growth?view=leads',
      },
      {
        source: '/app/admin/outreach',
        destination: '/app/admin/growth?view=outreach',
      },
      {
        source: '/app/admin/campaigns',
        destination: '/app/admin/growth?view=campaigns',
      },
      {
        source: '/app/admin/ingest',
        destination: '/app/admin/growth?view=ingest',
      },
    ].map(route => ({
      ...route,
      permanent: false,
    }));

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
      {
        source: '/cookies',
        destination: '/legal/cookies',
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
      ...legacyAppRedirects,
      // Old /tips landing page redirect
      {
        source: '/tips',
        destination: '/pay',
        permanent: true,
      },
      {
        source: '/engagement-engine',
        destination: '/artist-notifications',
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
        source: '/app/releases',
        destination: '/app/dashboard/releases',
      },
      {
        source: '/app/audience',
        destination: '/app/dashboard/audience',
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
    // Build-time env vars — these get inlined into client bundles by Next.js
    NEXT_PUBLIC_APP_VERSION: APP_VERSION,
    NEXT_PUBLIC_BUILD_SHA: (process.env.VERCEL_GIT_COMMIT_SHA || '').slice(
      0,
      7
    ),
    NEXT_PUBLIC_CI: process.env.CI === 'true' ? 'true' : 'false',
    // Clerk JS bundle URL — decoded from the publishable key at build time.
    // For pk_live_ keys, this points to the FAPI domain (CNAME to Clerk CDN)
    // so Clerk JS + chunks load directly from Clerk infrastructure instead of
    // going through the /__clerk middleware proxy which can't serve chunks.
    ...(() => {
      const pk = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || '';
      if (!pk.startsWith('pk_live_')) return {};
      try {
        const b64 = pk.replace(/^pk_live_/, '');
        const host = Buffer.from(b64, 'base64').toString().replace(/\$$/, '');
        if (!host) return {};
        return {
          NEXT_PUBLIC_CLERK_JS_URL: `https://${host}/npm/@clerk/clerk-js@6/dist/clerk.browser.js`,
        };
      } catch {
        return {};
      }
    })(),
  },
  experimental: {
    // Note: PPR (ppr: 'incremental') was deprecated in Next.js 15.3
    // cacheComponents: true requires additional configuration, disabled for now
    // Turbopack filesystem cache for faster dev server startup
    turbopackFileSystemCacheForDev: true,
    // Cache client-side RSC responses to prevent skeleton flashes on navigation.
    // Next.js 15+ defaults dynamic routes to 0s (always re-fetch), which causes
    // unnecessary skeleton loaders on every page switch. Mutations that need
    // immediate RSC refresh can still use router.refresh() selectively.
    staleTimes: {
      dynamic: 30, // Cache dynamic RSC responses for 30s
      static: 300, // Cache static RSC responses for 5 min
    },
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
      'motion',
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

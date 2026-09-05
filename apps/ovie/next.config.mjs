import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { withWorkflow } from 'workflow/next';

const root = path.dirname(fileURLToPath(import.meta.url));

// Compile imported workflow directives even while execution is disabled.
// JOV-6026: workflow execution remains default-off until signed callback
// commissioning authenticates the transport for this private host.
if (process.env.AGENT_OS_WORKFLOWS_ENABLED === 'true') {
  throw new Error(
    'Ovie workflow execution requires verified callback authentication before activation. Keep AGENT_OS_WORKFLOWS_ENABLED disabled.'
  );
}

/** Own deployment config; never load the artist app's build or route tree. */
export const nextConfig = {
  output: 'standalone',
  turbopack: { root: path.resolve(root, '../..') },
  outputFileTracingRoot: path.resolve(root, '../..'),
  outputFileTracingExcludes: {
    '/*': ['../docs/**', '../../node_modules/**/@jovie/docs/**'],
  },
  outputFileTracingIncludes: {
    '/*': [
      '../eve-pilot/identities/**/instructions.md',
      '../../docs/FEATURE_REGISTRY.md',
      '../web/content/**',
      '../web/lib/chat/knowledge/topics/*.md',
      '../web/package.json',
      '../../turbo.json',
      '../../docs/**',
    ],
  },
  transpilePackages: ['@jovie/ui'],
  serverExternalPackages: ['@statsig/statsig-node-core'],
  poweredByHeader: false,
  experimental: { authInterrupts: true },
  images: { unoptimized: true },
  async redirects() {
    return [
      { source: '/', destination: '/hud', permanent: false },
      { source: '/app', destination: 'https://jov.ie/app', permanent: false },
      { source: '/app/ov', destination: '/hud', permanent: false },
      { source: '/app/ov/ops', destination: '/hud', permanent: false },
      { source: '/hud-tv', destination: '/hud?fs=1', permanent: false },
      ...['/support', '/legal/terms', '/legal/privacy'].map(source => ({
        source,
        destination: `https://jov.ie${source}`,
        permanent: false,
      })),
      {
        source: '/app/dashboard/:path*',
        destination: 'https://jov.ie/app/dashboard/:path*',
        permanent: false,
      },
    ];
  },
  async rewrites() {
    return [{ source: '/app/ov/:path*', destination: '/app/admin/:path*' }];
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Robots-Tag', value: 'noindex, nofollow, noarchive' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
    ];
  },
};

export default withWorkflow(nextConfig);

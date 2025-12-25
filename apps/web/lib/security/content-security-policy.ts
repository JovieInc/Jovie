export const SCRIPT_NONCE_HEADER = 'x-nonce';

type BuildCspOptions = {
  nonce: string;
  isDev?: boolean;
};

export const buildContentSecurityPolicy = ({
  nonce,
  isDev = process.env.NODE_ENV === 'development',
}: BuildCspOptions): string => {
  const directives = [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    [
      "script-src 'self'",
      `'nonce-${nonce}'`,
      isDev ? "'unsafe-eval'" : null,
      'https://va.vercel-scripts.com',
      'https://vitals.vercel-insights.com',
      'https://vercel.live',
      'https://clerk.meetjovie.com',
      'https://*.clerk.com',
      'https://*.clerk.accounts.dev',
      'https://cdn.statsig.com',
      'https://*.statsigcdn.com',
    ]
      .filter(Boolean)
      .join(' '),
    "style-src 'self' 'unsafe-inline'",
    [
      "img-src 'self' data: blob:",
      'https://i.scdn.co',
      'https://res.cloudinary.com',
      'https://images.clerk.dev',
      'https://img.clerk.com',
      'https://images.unsplash.com',
      'https://linktr.ee',
      'https://api.qrserver.com',
      'https://*.public.blob.vercel-storage.com',
      'https://*.blob.vercel-storage.com',
    ].join(' '),
    [
      "connect-src 'self'",
      'https://api.statsig.com',
      'https://statsigapi.net',
      'https://featureassets.org',
      'https://prodregistryv2.org',
      'https://cloudflare-dns.com',
      'https://*.statsigcdn.com',
      'https://*.statsig.com',
      'https://va.vercel-scripts.com',
      'https://vitals.vercel-insights.com',
      'https://clerk.meetjovie.com',
      'https://*.clerk.com',
      'https://*.clerk.accounts.dev',
      'https://api.stripe.com',
      'https://*.ingest.sentry.io',
    ].join(' '),
    "font-src 'self' data:",
    "frame-src 'self' https://js.stripe.com https://checkout.stripe.com",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
  ];

  return directives.join('; ');
};

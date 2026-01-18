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
      "'sha256-U8qHNAYVONMkNDz+dKowqI4OkI0neY4A/sKEI0weOO8='", // Clerk inline script hash
      "'sha256-iK+F03M7k3TWfO9vSjPo8wTaJ5NWMGiY6ghQMBSGTkU='", // Theme script hash (next-themes)
      isDev ? "'unsafe-eval'" : null,
      'https://va.vercel-scripts.com',
      'https://vitals.vercel-insights.com',
      'https://vercel.live',
      'https://clerk.jov.ie',
      'https://clerk.com',
      'https://cdn.clerk.com',
      'https://*.clerk.com',
      'https://*.clerk.services',
      'https://*.clerk.accounts.dev',
      'https://cdn.statsig.com',
      'https://*.statsigcdn.com',
      'https://challenges.cloudflare.com', // Clerk Turnstile CAPTCHA
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
      'https://clerk.jov.ie',
      'https://clerk.com',
      'https://cdn.clerk.com',
      'https://*.clerk.com',
      'https://*.clerk.services',
      'https://*.clerk.accounts.dev',
      'https://api.stripe.com',
      'https://*.ingest.sentry.io',
      'wss://*.clerk.com', // Clerk WebSocket connections
      'wss://clerk.jov.ie', // Clerk proxy WebSocket
      'https://jov.ie',
      'https://app.jov.ie',
      'https://meetjovie.com',
      'https://app.meetjovie.com',
      'https://challenges.cloudflare.com', // Clerk Turnstile CAPTCHA
    ].join(' '),
    "font-src 'self' data:",
    "frame-src 'self' https://js.stripe.com https://checkout.stripe.com https://*.clerk.com https://*.clerk.accounts.dev https://clerk.jov.ie https://challenges.cloudflare.com",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
  ];

  return directives.join('; ');
};

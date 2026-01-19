import { CSP_REPORT_GROUP, getCspReportUri } from './csp-reporting';

export const SCRIPT_NONCE_HEADER = 'x-nonce';

type BuildCspOptions = {
  nonce: string;
  isDev?: boolean;
};

/**
 * Builds the array of CSP directives (without report directives).
 * This is the core policy shared by both enforcing and report-only modes.
 */
const buildCspDirectives = ({
  nonce,
  isDev = process.env.NODE_ENV === 'development',
}: BuildCspOptions): string[] => {
  return [
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
      'https://clerk.meetjovie.com',
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
      'https://clerk.meetjovie.com',
      'https://clerk.com',
      'https://cdn.clerk.com',
      'https://*.clerk.com',
      'https://*.clerk.services',
      'https://*.clerk.accounts.dev',
      'https://api.stripe.com',
      'https://*.ingest.sentry.io',
      'wss://*.clerk.com', // Clerk WebSocket connections
      'wss://clerk.jov.ie', // Clerk proxy WebSocket
      'wss://clerk.meetjovie.com', // Clerk proxy WebSocket
      'https://jov.ie',
      'https://app.jov.ie',
      'https://meetjovie.com',
      'https://app.meetjovie.com',
      'https://challenges.cloudflare.com', // Clerk Turnstile CAPTCHA
    ].join(' '),
    "font-src 'self' data:",
    "frame-src 'self' https://js.stripe.com https://checkout.stripe.com https://*.clerk.com https://*.clerk.accounts.dev https://clerk.jov.ie https://clerk.meetjovie.com https://challenges.cloudflare.com",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
  ];
};

/**
 * Builds the enforcing Content-Security-Policy header value.
 * This is the main CSP that blocks resources violating the policy.
 */
export const buildContentSecurityPolicy = (
  options: BuildCspOptions
): string => {
  const directives = buildCspDirectives(options);
  return directives.join('; ');
};

interface BuildCspReportOnlyOptions extends BuildCspOptions {
  /** Pre-computed report URI to avoid duplicate calls to getCspReportUri */
  reportUri?: string | null;
}

/**
 * Builds the Content-Security-Policy-Report-Only header value.
 * This CSP reports violations to Sentry without blocking resources.
 * Useful for monitoring and identifying issues before enforcement.
 */
export const buildContentSecurityPolicyReportOnly = (
  options: BuildCspReportOnlyOptions
): string | null => {
  // Use provided reportUri or fall back to fetching it
  const reportUri = options.reportUri ?? getCspReportUri();
  if (!reportUri) {
    // No reporting configured - skip report-only header
    return null;
  }

  const directives = buildCspDirectives(options);

  // Add reporting directives
  directives.push(`report-uri ${reportUri}`);
  directives.push(`report-to ${CSP_REPORT_GROUP}`);

  return directives.join('; ');
};

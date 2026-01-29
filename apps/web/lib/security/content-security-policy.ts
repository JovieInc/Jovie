import { isDevelopment } from '@/lib/utils/platform-detection/environment';
import { CSP_REPORT_GROUP, getCspReportUri } from './csp-reporting';

export const SCRIPT_NONCE_HEADER = 'x-nonce';

type BuildCspOptions = {
  nonce: string;
  isDev?: boolean;
};

/**
 * SHA-256 hashes for inline scripts injected by third-party libraries.
 * These scripts run before nonces are available (e.g., preventing FOUC).
 *
 * To regenerate hashes when libraries update:
 * 1. Run the app locally: `pnpm --filter=@jovie/web dev`
 * 2. View page source and find the inline <script> tags
 * 3. Copy the script content (without <script> tags)
 * 4. Generate hash: `echo -n 'script content here' | openssl sha256 -binary | base64`
 * 5. Format as: 'sha256-<hash>'
 *
 * Common causes of CSP violations (JOVIE-WEB-52):
 * - Library version updates changing inline script content
 * - Configuration changes affecting script generation
 */
const INLINE_SCRIPT_HASHES = {
  /**
   * Clerk inline script hash (@clerk/nextjs)
   * This script handles Clerk initialization before hydration.
   * Hash may need updating when @clerk/nextjs version changes.
   */
  clerk: "'sha256-U8qHNAYVONMkNDz+dKowqI4OkI0neY4A/sKEI0weOO8='",

  /**
   * next-themes inline script hash (v0.4.6)
   * This script prevents flash of unstyled content (FOUC) by applying
   * the theme class before React hydration.
   * Hash may need updating when next-themes version or ThemeProvider config changes.
   * Config: attribute='class', storageKey='jovie-theme', enableSystem=true
   */
  nextThemes: "'sha256-iK+F03M7k3TWfO9vSjPo8wTaJ5NWMGiY6ghQMBSGTkU='",
};

/**
 * Builds the array of CSP directives (without report directives).
 * This is the core policy shared by both enforcing and report-only modes.
 */
const buildCspDirectives = ({
  nonce,
  isDev = isDevelopment(),
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
      INLINE_SCRIPT_HASHES.clerk,
      INLINE_SCRIPT_HASHES.nextThemes,
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
      'https://challenges.cloudflare.com', // Clerk Turnstile CAPTCHA
      'https://clerk-telemetry.com', // Clerk telemetry (all environments)
      isDev ? 'http://localhost:25011' : null, // Neon local dev controller
    ]
      .filter(Boolean)
      .join(' '),
    "font-src 'self' data:",
    [
      "frame-src 'self'",
      'https://js.stripe.com',
      'https://checkout.stripe.com',
      'https://*.clerk.com',
      'https://*.clerk.accounts.dev',
      'https://clerk.jov.ie',
      'https://challenges.cloudflare.com',
      isDev ? 'https://vercel.live' : null, // Vercel toolbar (dev only)
    ]
      .filter(Boolean)
      .join(' '),
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
  // Use provided reportUri if explicitly set (including null to disable),
  // otherwise fall back to fetching it
  const reportUri =
    options.reportUri !== undefined ? options.reportUri : getCspReportUri();
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

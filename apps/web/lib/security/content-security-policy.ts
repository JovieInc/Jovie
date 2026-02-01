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
 * Pre-computed static CSP directive parts.
 * These are computed once at module load time to avoid repeated string operations.
 * Only the nonce and dev-specific parts are interpolated at runtime.
 */
const STATIC_CSP_PARTS = {
  // Directives that never change
  defaultSrc: "default-src 'self'",
  baseUri: "base-uri 'self'",
  objectSrc: "object-src 'none'",
  frameAncestors: "frame-ancestors 'none'",
  formAction: "form-action 'self'",
  styleSrc: "style-src 'self' 'unsafe-inline'",
  fontSrc: "font-src 'self' data:",
  workerSrc: "worker-src 'self' blob:",
  manifestSrc: "manifest-src 'self'",

  // Pre-computed script-src prefix (before nonce)
  scriptSrcPrefix: "script-src 'self'",
  // Pre-computed script-src suffix (after nonce, excludes dev-only 'unsafe-eval')
  scriptSrcSuffix: [
    INLINE_SCRIPT_HASHES.clerk,
    INLINE_SCRIPT_HASHES.nextThemes,
    'https://va.vercel-scripts.com',
    'https://vitals.vercel-insights.com',
    'https://vercel.live',
    'https://clerk.jov.ie',
    'https://clerk.com',
    'https://cdn.clerk.com',
    'https://*.clerk.com',
    'https://*.clerk.services',
    'https://*.clerk.accounts.dev',
    'https://challenges.cloudflare.com',
  ].join(' '),

  // Pre-computed img-src (fully static)
  imgSrc: [
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

  // Pre-computed connect-src prefix (excludes dev-only localhost)
  connectSrcBase: [
    "connect-src 'self'",
    'https://clerk.jov.ie',
    'https://clerk.com',
    'https://cdn.clerk.com',
    'https://*.clerk.com',
    'https://*.clerk.services',
    'https://*.clerk.accounts.dev',
    'https://api.stripe.com',
    'https://*.ingest.sentry.io',
    'wss://*.clerk.com',
    'wss://clerk.jov.ie',
    'https://jov.ie',
    'https://challenges.cloudflare.com',
    'https://clerk-telemetry.com',
  ].join(' '),

  // Pre-computed frame-src prefix (excludes dev-only vercel.live)
  frameSrcBase: [
    "frame-src 'self'",
    'https://js.stripe.com',
    'https://checkout.stripe.com',
    'https://*.clerk.com',
    'https://*.clerk.accounts.dev',
    'https://clerk.jov.ie',
    'https://challenges.cloudflare.com',
  ].join(' '),
} as const;

/**
 * Builds the array of CSP directives (without report directives).
 * This is the core policy shared by both enforcing and report-only modes.
 *
 * Performance optimized: Static parts are pre-computed at module load time.
 * Only nonce and dev-specific parts are interpolated at runtime.
 */
const buildCspDirectives = ({
  nonce,
  isDev = isDevelopment(),
}: BuildCspOptions): string[] => {
  // Build script-src with nonce and optional dev 'unsafe-eval'
  const scriptSrc = isDev
    ? `${STATIC_CSP_PARTS.scriptSrcPrefix} 'nonce-${nonce}' 'unsafe-eval' ${STATIC_CSP_PARTS.scriptSrcSuffix}`
    : `${STATIC_CSP_PARTS.scriptSrcPrefix} 'nonce-${nonce}' ${STATIC_CSP_PARTS.scriptSrcSuffix}`;

  // Build connect-src with optional dev localhost
  const connectSrc = isDev
    ? `${STATIC_CSP_PARTS.connectSrcBase} http://localhost:25011`
    : STATIC_CSP_PARTS.connectSrcBase;

  // Build frame-src with optional dev vercel.live
  const frameSrc = isDev
    ? `${STATIC_CSP_PARTS.frameSrcBase} https://vercel.live`
    : STATIC_CSP_PARTS.frameSrcBase;

  return [
    STATIC_CSP_PARTS.defaultSrc,
    STATIC_CSP_PARTS.baseUri,
    STATIC_CSP_PARTS.objectSrc,
    STATIC_CSP_PARTS.frameAncestors,
    STATIC_CSP_PARTS.formAction,
    scriptSrc,
    STATIC_CSP_PARTS.styleSrc,
    STATIC_CSP_PARTS.imgSrc,
    connectSrc,
    STATIC_CSP_PARTS.fontSrc,
    frameSrc,
    STATIC_CSP_PARTS.workerSrc,
    STATIC_CSP_PARTS.manifestSrc,
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
    options.reportUri === undefined ? getCspReportUri() : options.reportUri;
  if (!reportUri) {
    // No reporting configured - skip report-only header
    return null;
  }

  const directives = buildCspDirectives(options);

  // Add reporting directives
  directives.push(`report-uri ${reportUri}`, `report-to ${CSP_REPORT_GROUP}`);

  return directives.join('; ');
};

/**
 * Security Headers Configuration Module
 *
 * This module centralizes all security header definitions for the application.
 * It serves as the single source of truth for security headers across next.config.js
 * and middleware.
 *
 * @see https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers
 * @see https://cheatsheetseries.owasp.org/cheatsheets/HTTP_Headers_Cheat_Sheet.html
 */

/**
 * Represents a single HTTP header key-value pair.
 * Compatible with Next.js headers() config format.
 */
export type SecurityHeader = {
  key: string;
  value: string;
};

/**
 * Environment context for header generation.
 * Headers may differ between production and development environments.
 */
export type HeaderEnvironment = {
  /** Whether the app is running in a production or preview environment (not local dev) */
  isProduction: boolean;
  /** Whether the app is running in development mode */
  isDevelopment: boolean;
};

/**
 * Options for building security headers.
 */
export type BuildSecurityHeadersOptions = {
  /** Environment context */
  env?: HeaderEnvironment;
  /** Include production-only headers like HSTS */
  includeProductionHeaders?: boolean;
};

// =============================================================================
// HEADER CONSTANTS
// =============================================================================

/**
 * X-Frame-Options header prevents clickjacking attacks by controlling whether
 * the page can be embedded in frames.
 *
 * @value 'DENY' - Page cannot be displayed in a frame
 * @see https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/X-Frame-Options
 */
export const X_FRAME_OPTIONS: SecurityHeader = {
  key: 'X-Frame-Options',
  value: 'DENY',
};

/**
 * X-Content-Type-Options prevents MIME type sniffing attacks by forcing the
 * browser to respect the declared Content-Type.
 *
 * @value 'nosniff' - Blocks requests if the type is wrong
 * @see https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/X-Content-Type-Options
 */
export const X_CONTENT_TYPE_OPTIONS: SecurityHeader = {
  key: 'X-Content-Type-Options',
  value: 'nosniff',
};

/**
 * Referrer-Policy controls how much referrer information is included with requests.
 *
 * @value 'origin-when-cross-origin' - Full URL for same-origin, origin only for cross-origin
 * @see https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Referrer-Policy
 */
export const REFERRER_POLICY: SecurityHeader = {
  key: 'Referrer-Policy',
  value: 'origin-when-cross-origin',
};

/**
 * Permissions-Policy (formerly Feature-Policy) controls which browser features
 * the page can use.
 *
 * @value Disables camera, microphone, and geolocation access
 * @see https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Permissions-Policy
 */
export const PERMISSIONS_POLICY: SecurityHeader = {
  key: 'Permissions-Policy',
  value: 'camera=(), microphone=(), geolocation=()',
};

/**
 * Strict-Transport-Security (HSTS) forces browsers to always use HTTPS.
 * Prevents SSL stripping attacks and man-in-the-middle attacks.
 *
 * IMPORTANT: Only applied in production/preview environments, NOT in local development.
 * Setting HSTS on localhost can cause persistent browser issues.
 *
 * @value 'max-age=31536000; includeSubDomains; preload'
 *   - max-age: 1 year (31536000 seconds) - required minimum for preload list
 *   - includeSubDomains: Apply to all subdomains
 *   - preload: Request inclusion in browser HSTS preload lists
 * @see https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Strict-Transport-Security
 * @see https://hstspreload.org/
 */
export const STRICT_TRANSPORT_SECURITY: SecurityHeader = {
  key: 'Strict-Transport-Security',
  value: 'max-age=31536000; includeSubDomains; preload',
};

/**
 * HSTS max-age value in seconds (1 year).
 * This is the minimum required for inclusion in browser preload lists.
 */
export const HSTS_MAX_AGE_SECONDS = 31536000;

// =============================================================================
// CROSS-ORIGIN HEADERS
// =============================================================================

/**
 * Cross-Origin-Opener-Policy (COOP) isolates the browsing context from cross-origin
 * popup windows while still allowing OAuth and payment popups to work.
 *
 * IMPORTANT: Only applied in production/preview environments, NOT in local development.
 * This prevents potential development issues with cross-origin resources.
 *
 * @value 'same-origin-allow-popups' - Isolates from cross-origin openers but allows popups
 *   - Protects against Spectre-like attacks via cross-origin isolation
 *   - Allows OAuth popups (e.g., Clerk authentication) to work correctly
 *   - Allows payment popups (e.g., Stripe checkout) to function
 * @see https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Cross-Origin-Opener-Policy
 */
export const CROSS_ORIGIN_OPENER_POLICY: SecurityHeader = {
  key: 'Cross-Origin-Opener-Policy',
  value: 'same-origin-allow-popups',
};

/**
 * Cross-Origin-Resource-Policy (CORP) controls which origins can load this resource.
 * Different values are appropriate for different route types.
 *
 * IMPORTANT: Only applied in production/preview environments, NOT in local development.
 * This prevents potential development issues with cross-origin resources.
 *
 * @see https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Cross-Origin-Resource-Policy
 */

/**
 * CORP with 'same-origin' restricts resources to same-origin requests only.
 * Use for API routes to prevent cross-origin resource embedding.
 *
 * @value 'same-origin' - Only same-origin requests can load the resource
 *   - Protects API responses from being read by cross-origin attackers
 *   - Prevents malicious sites from embedding or reading API data
 *   - Recommended for all API endpoints that return sensitive data
 */
export const CROSS_ORIGIN_RESOURCE_POLICY_SAME_ORIGIN: SecurityHeader = {
  key: 'Cross-Origin-Resource-Policy',
  value: 'same-origin',
};

/**
 * CORP with 'cross-origin' allows resources to be loaded from any origin.
 * Use for public assets like images, fonts, and static files.
 *
 * @value 'cross-origin' - Any origin can load the resource
 *   - Required for CDN-hosted assets that need cross-origin access
 *   - Use only for truly public, non-sensitive resources
 *   - Appropriate for /_next/static/* and public assets
 */
export const CROSS_ORIGIN_RESOURCE_POLICY_CROSS_ORIGIN: SecurityHeader = {
  key: 'Cross-Origin-Resource-Policy',
  value: 'cross-origin',
};

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Detects whether the current environment is a non-local environment (production/preview).
 * Used to determine whether to apply production-only headers like HSTS.
 *
 * @returns true if running in production or preview environment
 */
export function isNonLocalEnvironment(): boolean {
  return !!(process.env.VERCEL_ENV && process.env.VERCEL_ENV !== 'development');
}

/**
 * Gets the current environment context for header generation.
 *
 * @returns Environment context with production and development flags
 */
export function getEnvironmentContext(): HeaderEnvironment {
  const isProduction = isNonLocalEnvironment();
  const isDevelopment = process.env.NODE_ENV === 'development';
  return { isProduction, isDevelopment };
}

/**
 * Builds the base security headers that apply to all routes.
 * Does not include route-specific headers like CSP (handled in middleware).
 *
 * @param options - Optional configuration for header generation
 * @returns Array of security headers compatible with Next.js headers() config
 */
export function buildBaseSecurityHeaders(
  options?: BuildSecurityHeadersOptions
): SecurityHeader[] {
  const env = options?.env ?? getEnvironmentContext();
  const includeProductionHeaders =
    options?.includeProductionHeaders ?? env.isProduction;

  const headers: SecurityHeader[] = [
    X_FRAME_OPTIONS,
    X_CONTENT_TYPE_OPTIONS,
    REFERRER_POLICY,
    PERMISSIONS_POLICY,
  ];

  // Production-only headers:
  // - HSTS: Setting on localhost causes persistent browser HTTPS issues
  // - COOP: May cause development issues with cross-origin resources
  if (includeProductionHeaders) {
    headers.push(STRICT_TRANSPORT_SECURITY);
    headers.push(CROSS_ORIGIN_OPENER_POLICY);
  }

  return headers;
}

/**
 * Builds security headers for API routes.
 * Includes base security headers plus CORP 'same-origin' to prevent cross-origin
 * resource embedding of API responses.
 *
 * @param options - Optional configuration for header generation
 * @returns Array of security headers for API routes
 */
export function buildApiSecurityHeaders(
  options?: BuildSecurityHeadersOptions
): SecurityHeader[] {
  const headers = buildBaseSecurityHeaders(options);
  const env = options?.env ?? getEnvironmentContext();
  const includeProductionHeaders =
    options?.includeProductionHeaders ?? env.isProduction;

  // Add CORP 'same-origin' for API routes in production
  // This prevents cross-origin sites from embedding or reading API responses
  if (includeProductionHeaders) {
    headers.push(CROSS_ORIGIN_RESOURCE_POLICY_SAME_ORIGIN);
  }

  return headers;
}

/**
 * Builds security headers for public static assets.
 * Includes base security headers plus CORP 'cross-origin' to allow
 * assets to be loaded from CDNs and other origins.
 *
 * @param options - Optional configuration for header generation
 * @returns Array of security headers for static assets
 */
export function buildStaticAssetSecurityHeaders(
  options?: BuildSecurityHeadersOptions
): SecurityHeader[] {
  const headers = buildBaseSecurityHeaders(options);
  const env = options?.env ?? getEnvironmentContext();
  const includeProductionHeaders =
    options?.includeProductionHeaders ?? env.isProduction;

  // Add CORP 'cross-origin' for public assets in production
  // This allows CDNs and other sites to load these resources
  if (includeProductionHeaders) {
    headers.push(CROSS_ORIGIN_RESOURCE_POLICY_CROSS_ORIGIN);
  }

  return headers;
}

/**
 * Gets all security headers that should be applied in production.
 * Useful for testing to verify all expected headers are present.
 *
 * @returns Array of all production security headers
 */
export function getProductionSecurityHeaders(): SecurityHeader[] {
  return buildBaseSecurityHeaders({
    env: { isProduction: true, isDevelopment: false },
    includeProductionHeaders: true,
  });
}

/**
 * Gets security headers that should be applied in development.
 * Excludes production-only headers (HSTS, COOP, CORP) to prevent localhost issues.
 *
 * @returns Array of development security headers
 */
export function getDevelopmentSecurityHeaders(): SecurityHeader[] {
  return buildBaseSecurityHeaders({
    env: { isProduction: false, isDevelopment: true },
    includeProductionHeaders: false,
  });
}

/**
 * Validates that a security header configuration is correctly formed.
 * Useful for testing.
 *
 * @param header - The header to validate
 * @returns true if the header has a non-empty key and value
 */
export function isValidSecurityHeader(header: SecurityHeader): boolean {
  return (
    typeof header.key === 'string' &&
    header.key.length > 0 &&
    typeof header.value === 'string' &&
    header.value.length > 0
  );
}

/**
 * Finds a header by its key name in an array of headers.
 * Useful for testing to verify specific headers are present.
 *
 * @param headers - Array of headers to search
 * @param key - The header key to find
 * @returns The matching header or undefined
 */
export function findHeaderByKey(
  headers: SecurityHeader[],
  key: string
): SecurityHeader | undefined {
  return headers.find(h => h.key.toLowerCase() === key.toLowerCase());
}

// =============================================================================
// HEADER KEY CONSTANTS (for consistent reference across the codebase)
// =============================================================================

export const HEADER_KEYS = {
  X_FRAME_OPTIONS: 'X-Frame-Options',
  X_CONTENT_TYPE_OPTIONS: 'X-Content-Type-Options',
  REFERRER_POLICY: 'Referrer-Policy',
  PERMISSIONS_POLICY: 'Permissions-Policy',
  STRICT_TRANSPORT_SECURITY: 'Strict-Transport-Security',
  CROSS_ORIGIN_OPENER_POLICY: 'Cross-Origin-Opener-Policy',
  CROSS_ORIGIN_RESOURCE_POLICY: 'Cross-Origin-Resource-Policy',
  CONTENT_SECURITY_POLICY: 'Content-Security-Policy',
  CONTENT_SECURITY_POLICY_REPORT_ONLY: 'Content-Security-Policy-Report-Only',
  REPORT_TO: 'Report-To',
  REPORTING_ENDPOINTS: 'Reporting-Endpoints',
  X_ROBOTS_TAG: 'X-Robots-Tag',
  CACHE_CONTROL: 'Cache-Control',
} as const;

export type HeaderKey = (typeof HEADER_KEYS)[keyof typeof HEADER_KEYS];

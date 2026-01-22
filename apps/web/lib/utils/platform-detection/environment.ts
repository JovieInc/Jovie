/**
 * Environment Detection
 * Helpers for detecting runtime environment and generating base URLs
 */

/**
 * Production hostnames
 */
const PRODUCTION_HOSTNAMES = ['jov.ie', 'meetjovie.com'];

/**
 * Preview/staging hostnames
 */
const PREVIEW_HOSTNAMES = ['main.jov.ie', 'main.meetjovie.com'];

/**
 * Dynamically get the correct base URL for the current environment
 * This ensures profile links work correctly in local, preview, and production environments
 */
export function getBaseUrl(): string {
  // If we have NEXT_PUBLIC_APP_URL from env, use that first
  if (typeof window !== 'undefined' && window.location) {
    // Client-side: use current origin for local/preview environments
    const { protocol, hostname, port } = window.location;

    const portSuffix = port ? `:${port}` : '';

    // For local development
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return `${protocol}//${hostname}${portSuffix}`;
    }

    // For staging or non-production deployments (e.g., Vercel preview URLs)
    if (
      PREVIEW_HOSTNAMES.includes(hostname) ||
      hostname.includes('vercel.app')
    ) {
      return `${protocol}//${hostname}${portSuffix}`;
    }
  }

  // Server-side or fallback: use environment variable or production profile URL
  return (
    process.env.NEXT_PUBLIC_PROFILE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    'https://jov.ie'
  );
}

/**
 * Check if we're in a development environment
 */
export function isDevelopment(): boolean {
  return process.env.NODE_ENV === 'development';
}

/**
 * Check if we're in a preview environment
 */
export function isPreview(): boolean {
  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname;
    return (
      hostname.includes('vercel.app') || PREVIEW_HOSTNAMES.includes(hostname)
    );
  }
  return process.env.VERCEL_ENV === 'preview';
}

/**
 * Check if we're in production
 */
export function isProduction(): boolean {
  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname;
    return PRODUCTION_HOSTNAMES.includes(hostname);
  }
  return (
    process.env.NODE_ENV === 'production' &&
    process.env.VERCEL_ENV === 'production'
  );
}

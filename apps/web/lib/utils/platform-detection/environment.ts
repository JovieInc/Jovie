/**
 * Environment Detection
 * Helpers for detecting runtime environment and generating base URLs
 */

import { publicEnv } from '@/lib/env-public';

/**
 * Production hostnames
 */
const PRODUCTION_HOSTNAMES = new Set(['jov.ie', 'meetjovie.com']);

/**
 * Preview/staging hostnames
 */
const PREVIEW_HOSTNAMES = new Set(['main.jov.ie', 'main.meetjovie.com']);

/**
 * Dynamically get the base URL for the current browser origin.
 *
 * For profile-related URLs (profile links, QR codes, vCards, etc.), use
 * PROFILE_URL from '@/constants/domains' instead - it always returns the
 * canonical production URL (jov.ie) regardless of the current environment.
 *
 * Use getBaseUrl() only when you need the current origin for same-origin
 * operations (API calls, internal navigation, etc.).
 */
export function getBaseUrl(): string {
  // If we have NEXT_PUBLIC_APP_URL from env, use that first
  if (typeof window !== 'undefined' && globalThis.location) {
    // Client-side: use current origin for local/preview environments
    const { protocol, hostname, port } = globalThis.location;

    const portSuffix = port ? `:${port}` : '';

    // For local development
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return `${protocol}//${hostname}${portSuffix}`;
    }

    // For staging or non-production deployments (e.g., Vercel preview URLs)
    if (PREVIEW_HOSTNAMES.has(hostname) || hostname.includes('vercel.app')) {
      return `${protocol}//${hostname}${portSuffix}`;
    }
  }

  // Server-side or fallback: use environment variable or production profile URL
  return publicEnv.NEXT_PUBLIC_PROFILE_URL || publicEnv.NEXT_PUBLIC_APP_URL;
}

/**
 * Check if we're in a development environment
 */
export function isDevelopment(): boolean {
  // NODE_ENV is injected at build time by Next.js, safe to access directly
  return process.env.NODE_ENV === 'development';
}

/**
 * Check if we're in a preview environment
 */
export function isPreview(): boolean {
  if (typeof window !== 'undefined') {
    const hostname = globalThis.location.hostname;
    return hostname.includes('vercel.app') || PREVIEW_HOSTNAMES.has(hostname);
  }
  // VERCEL_ENV is only available server-side
  return process.env.VERCEL_ENV === 'preview';
}

/**
 * Check if we're in production
 */
export function isProduction(): boolean {
  if (typeof window !== 'undefined') {
    const hostname = globalThis.location.hostname;
    return PRODUCTION_HOSTNAMES.has(hostname);
  }
  return (
    process.env.NODE_ENV === 'production' &&
    process.env.VERCEL_ENV === 'production'
  );
}

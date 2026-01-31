/**
 * Domain Configuration for Jovie
 *
 * Single domain architecture: everything on jov.ie
 * - jov.ie: Homepage, marketing, auth, profiles, and dashboard (at /app/*)
 *
 * Legacy app.jov.ie redirects to jov.ie for backwards compatibility.
 *
 * Environment variables can override defaults for local development or staging.
 */

import { publicEnv } from '@/lib/env-public';

// ============================================================================
// Domain Hostnames (without protocol)
// ============================================================================

/** Profile domain hostname - where public creator profiles and homepage live */
export const PROFILE_HOSTNAME = publicEnv.NEXT_PUBLIC_PROFILE_HOSTNAME;

/** App/dashboard domain hostname (subdomain for dashboard and app) */
export const APP_HOSTNAME = publicEnv.NEXT_PUBLIC_APP_HOSTNAME;

/** Admin email domain - emails ending with this domain get admin access */
export const ADMIN_EMAIL_DOMAIN = publicEnv.NEXT_PUBLIC_ADMIN_EMAIL_DOMAIN;

// ============================================================================
// Full URLs (with protocol)
// ============================================================================

/** Profile base URL - for building profile links */
export const PROFILE_URL = publicEnv.NEXT_PUBLIC_PROFILE_URL;

/** App/dashboard base URL */
export const APP_URL = publicEnv.NEXT_PUBLIC_APP_URL;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Build a full profile URL for a given handle
 * @param handle - The creator's handle/username
 * @returns Full URL like https://jov.ie/handle
 */
export function getProfileUrl(handle: string): string {
  return `${PROFILE_URL}/${handle}`;
}

/**
 * Build a tip page URL for a given handle
 * @param handle - The creator's handle/username
 * @param source - Optional source tracking param (e.g., 'qr' or 'link')
 * @returns Full URL like https://jov.ie/handle/tip?source=qr
 */
export function getTipUrl(handle: string, source?: 'qr' | 'link'): string {
  const baseUrl = `${PROFILE_URL}/${handle}/tip`;
  return source ? `${baseUrl}?source=${source}` : baseUrl;
}

/**
 * Build an app/dashboard URL
 * @param path - Path within the app (e.g., '/profile', '/settings')
 * @returns Full URL like https://jov.ie/app/profile
 */
export function getAppUrl(path: string = ''): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${APP_URL}/app${normalizedPath}`;
}

/**
 * Check if a hostname matches the profile domain
 */
export function isProfileDomain(hostname: string): boolean {
  return (
    hostname === PROFILE_HOSTNAME || hostname === `www.${PROFILE_HOSTNAME}`
  );
}

/**
 * Check if a hostname matches the app domain
 */
export function isAppDomain(hostname: string): boolean {
  return hostname === APP_HOSTNAME;
}

/**
 * Check if we're in a preview/staging environment
 */
export function isPreviewEnvironment(hostname: string): boolean {
  return (
    hostname.includes('vercel.app') ||
    hostname === `main.${PROFILE_HOSTNAME}` ||
    hostname === 'localhost'
  );
}

/**
 * Check if we're in production
 */
export function isProductionEnvironment(hostname: string): boolean {
  return hostname === PROFILE_HOSTNAME || hostname === APP_HOSTNAME;
}

/**
 * Get the appropriate base URL based on the current hostname
 * Useful for generating correct URLs in server components
 */
export function getBaseUrlForHostname(hostname: string): string {
  if (isProfileDomain(hostname)) return PROFILE_URL;
  if (isAppDomain(hostname)) return APP_URL;
  // Fallback for preview/development
  return `https://${hostname}`;
}

// ============================================================================
// Email Addresses (using company domain)
// ============================================================================

export const SUPPORT_EMAIL = `support@${PROFILE_HOSTNAME}`;
export const LEGAL_EMAIL = `legal@${PROFILE_HOSTNAME}`;
export const PRIVACY_EMAIL = `privacy@${PROFILE_HOSTNAME}`;

// ============================================================================
// User Agent for external requests
// ============================================================================

export const INGESTION_USER_AGENT = `jovie-link-ingestion/1.0 (+${PROFILE_URL})`;

// ============================================================================
// Clerk Configuration
// ============================================================================

/** Clerk proxy URL for custom domain setup */
export const CLERK_PROXY_HOSTNAME = 'clerk.jov.ie';
export const CLERK_PROXY_URL = `https://${CLERK_PROXY_HOSTNAME}`;

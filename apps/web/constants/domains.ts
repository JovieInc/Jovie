/**
 * Domain Configuration for Jovie
 *
 * Single-domain architecture: All web traffic on jov.ie
 * - jov.ie: Everything (profiles, marketing, dashboard, auth)
 * - clerk.jov.ie: Clerk authentication proxy
 * - notify.jov.ie: Transactional email sending
 * - meetjovie.com: 301 redirects to jov.ie (legacy)
 *
 * Environment variables can override defaults for local development or staging.
 */

import { publicEnv } from '@/lib/env-public';

// ============================================================================
// Domain Hostnames (without protocol)
// ============================================================================

/** Primary domain hostname - all web traffic */
export const PRIMARY_HOSTNAME =
  process.env.NEXT_PUBLIC_APP_HOSTNAME ?? 'jov.ie';

/** Profile domain hostname (same as primary - single domain) */
export const PROFILE_HOSTNAME =
  process.env.NEXT_PUBLIC_PROFILE_HOSTNAME ?? PRIMARY_HOSTNAME;

/** Marketing/company domain hostname (same as primary - single domain) */
export const MARKETING_HOSTNAME =
  process.env.NEXT_PUBLIC_MARKETING_HOSTNAME ?? PRIMARY_HOSTNAME;

/** App/dashboard domain hostname (same as primary - single domain) */
export const APP_HOSTNAME =
  process.env.NEXT_PUBLIC_APP_HOSTNAME ?? PRIMARY_HOSTNAME;

/** Admin email domain - emails ending with this domain get admin access */
export const ADMIN_EMAIL_DOMAIN =
  process.env.NEXT_PUBLIC_ADMIN_EMAIL_DOMAIN ?? 'jov.ie';

// ============================================================================
// Full URLs (with protocol)
// ============================================================================

/** Primary base URL */
export const PRIMARY_URL = `https://${PRIMARY_HOSTNAME}`;

/** Profile base URL - for building profile links */
export const PROFILE_URL = process.env.NEXT_PUBLIC_PROFILE_URL ?? PRIMARY_URL;

/** Marketing/company base URL */
export const MARKETING_URL =
  process.env.NEXT_PUBLIC_MARKETING_URL ?? PRIMARY_URL;

/** App/dashboard base URL */
export const APP_URL = publicEnv.NEXT_PUBLIC_APP_URL ?? PRIMARY_URL;

// ============================================================================
// Email Domains
// ============================================================================

/** Transactional email sending domain (notifications, confirmations) */
export const TRANSACTIONAL_EMAIL_DOMAIN = 'notify.jov.ie';

/** Marketing email domain (GTM, campaigns) - to be configured later */
export const MARKETING_EMAIL_DOMAIN = 'mail.meetjovie.com';

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
 * @param path - Path within the app (e.g., '/dashboard', '/settings')
 * @returns Full URL like https://jov.ie/dashboard
 */
export function getAppUrl(path: string = ''): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${APP_URL}${normalizedPath}`;
}

/**
 * Build a marketing site URL
 * @param path - Path within marketing site (e.g., '/pricing', '/blog')
 * @returns Full URL like https://jov.ie/pricing
 */
export function getMarketingUrl(path: string = ''): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${MARKETING_URL}${normalizedPath}`;
}

/**
 * Check if a hostname matches the primary domain
 */
export function isPrimaryDomain(hostname: string): boolean {
  return (
    hostname === PRIMARY_HOSTNAME || hostname === `www.${PRIMARY_HOSTNAME}`
  );
}

/**
 * Check if a hostname matches the profile domain
 * @deprecated Use isPrimaryDomain - single domain architecture
 */
export function isProfileDomain(hostname: string): boolean {
  return isPrimaryDomain(hostname);
}

/**
 * Check if a hostname matches the marketing domain
 * @deprecated Use isPrimaryDomain - single domain architecture
 */
export function isMarketingDomain(hostname: string): boolean {
  return isPrimaryDomain(hostname);
}

/**
 * Check if a hostname matches the app domain
 * @deprecated Use isPrimaryDomain - single domain architecture
 */
export function isAppDomain(hostname: string): boolean {
  return isPrimaryDomain(hostname);
}

/**
 * Check if we're in a preview/staging environment
 */
export function isPreviewEnvironment(hostname: string): boolean {
  return (
    hostname.includes('vercel.app') ||
    hostname === `main.${PRIMARY_HOSTNAME}` ||
    hostname === 'localhost'
  );
}

/**
 * Check if we're in production
 */
export function isProductionEnvironment(hostname: string): boolean {
  return hostname === PRIMARY_HOSTNAME;
}

/**
 * Get the appropriate base URL based on the current hostname
 * Useful for generating correct URLs in server components
 */
export function getBaseUrlForHostname(hostname: string): string {
  if (isPrimaryDomain(hostname)) return PRIMARY_URL;
  if (isPreviewEnvironment(hostname)) return `https://${hostname}`;
  // Fallback for any other hostname
  return PRIMARY_URL;
}

// ============================================================================
// Email Addresses (receiving - displayed in UI, legal docs)
// ============================================================================

export const SUPPORT_EMAIL = `support@jov.ie`;
export const LEGAL_EMAIL = `legal@jov.ie`;
export const PRIVACY_EMAIL = `privacy@jov.ie`;

// ============================================================================
// User Agent for external requests
// ============================================================================

export const INGESTION_USER_AGENT = `jovie-link-ingestion/1.0 (+${PRIMARY_URL})`;

// ============================================================================
// Clerk Configuration
// ============================================================================

/** Clerk proxy URL for custom domain setup */
export const CLERK_PROXY_HOSTNAME = `clerk.${PRIMARY_HOSTNAME}`;
export const CLERK_PROXY_URL = `https://${CLERK_PROXY_HOSTNAME}`;

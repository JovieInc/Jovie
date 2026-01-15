/**
 * Domain Configuration for Jovie
 *
 * This file centralizes all domain-related constants for the unified jov.ie setup:
 * - jov.ie: Homepage + Public creator profiles (canonical, indexed)
 * - app.jov.ie: Dashboard + App (authenticated)
 *
 * Note: We use jov.ie for auth (root domain) and app.jov.ie for dashboard.
 * Clerk sessions work across both via cookie domain .jov.ie (no satellite costs).
 *
 * Environment variables can override defaults for local development or staging.
 */

import { publicEnv } from '@/lib/env-public';

// ============================================================================
// Domain Hostnames (without protocol)
// ============================================================================

/** Profile domain hostname - where public creator profiles and homepage live */
export const PROFILE_HOSTNAME =
  process.env.NEXT_PUBLIC_PROFILE_HOSTNAME ?? 'jov.ie';

/** App/dashboard domain hostname (subdomain for dashboard and app) */
export const APP_HOSTNAME =
  process.env.NEXT_PUBLIC_APP_HOSTNAME ?? 'app.jov.ie';

/** Admin email domain - emails ending with this domain get admin access */
export const ADMIN_EMAIL_DOMAIN =
  process.env.NEXT_PUBLIC_ADMIN_EMAIL_DOMAIN ?? 'jov.ie';

// ============================================================================
// Full URLs (with protocol)
// ============================================================================

/** Profile base URL - for building profile links */
export const PROFILE_URL =
  process.env.NEXT_PUBLIC_PROFILE_URL ?? `https://${PROFILE_HOSTNAME}`;

/** App/dashboard base URL */
export const APP_URL =
  publicEnv.NEXT_PUBLIC_APP_URL ?? `https://${APP_HOSTNAME}`;

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
 * @returns Full URL like https://app.jov.ie/dashboard
 */
export function getAppUrl(path: string = ''): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${APP_URL}${normalizedPath}`;
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

/**
 * Domain Configuration for Jovie
 *
 * Single domain architecture: everything on jov.ie
 * - jov.ie: Homepage, marketing, auth, profiles, and dashboard (at /app/*)
 *
 * Environment variables can override defaults for local development or staging.
 */

import { publicEnv } from '@/lib/env-public';

// ============================================================================
// Domain Configuration
// ============================================================================

/** Main domain hostname (jov.ie) */
export const HOSTNAME = publicEnv.NEXT_PUBLIC_PROFILE_HOSTNAME;

/** @deprecated Use HOSTNAME instead */
export const PROFILE_HOSTNAME = HOSTNAME;

/** @deprecated Use HOSTNAME instead - now same as PROFILE_HOSTNAME */
export const APP_HOSTNAME = publicEnv.NEXT_PUBLIC_APP_HOSTNAME;

/** Admin email domain - emails ending with this domain get admin access */
export const ADMIN_EMAIL_DOMAIN = publicEnv.NEXT_PUBLIC_ADMIN_EMAIL_DOMAIN;

/** Base URL (https://jov.ie) */
export const BASE_URL = publicEnv.NEXT_PUBLIC_PROFILE_URL;

/** @deprecated Use BASE_URL instead */
export const PROFILE_URL = BASE_URL;

/** @deprecated Use BASE_URL instead */
export const APP_URL = publicEnv.NEXT_PUBLIC_APP_URL;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Build a full profile URL for a given handle
 * @returns Full URL like https://jov.ie/handle
 */
export function getProfileUrl(handle: string): string {
  return `${BASE_URL}/${handle}`;
}

/**
 * Build a tip page URL for a given handle
 * @returns Full URL like https://jov.ie/handle/tip?source=qr
 */
export function getTipUrl(handle: string, source?: 'qr' | 'link'): string {
  const baseUrl = `${BASE_URL}/${handle}/tip`;
  return source ? `${baseUrl}?source=${source}` : baseUrl;
}

/**
 * Build an app/dashboard URL
 * @returns Full URL like https://jov.ie/app/profile
 */
export function getAppUrl(path: string = ''): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${BASE_URL}/app${normalizedPath}`;
}

/**
 * Check if a hostname matches the main domain
 */
export function isMainDomain(hostname: string): boolean {
  return hostname === HOSTNAME || hostname === `www.${HOSTNAME}`;
}

/** @deprecated Use isMainDomain instead */
export const isProfileDomain = isMainDomain;

/** @deprecated Use isMainDomain instead */
export const isAppDomain = isMainDomain;

/**
 * Check if we're in a preview/staging environment
 */
export function isPreviewEnvironment(hostname: string): boolean {
  return (
    hostname.includes('vercel.app') ||
    hostname === `main.${HOSTNAME}` ||
    hostname === 'localhost'
  );
}

/**
 * Check if we're in production
 */
export function isProductionEnvironment(hostname: string): boolean {
  return hostname === HOSTNAME;
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

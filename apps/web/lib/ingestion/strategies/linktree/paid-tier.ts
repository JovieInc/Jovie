/**
 * Linktree Paid Tier & Verification Detection
 *
 * Detects whether a Linktree profile is on a paid tier by checking for branding,
 * and whether the profile has a verification badge (stronger paid signal).
 */

import {
  LINKTREE_BRANDING_PATTERNS,
  LINKTREE_VERIFICATION_PATTERNS,
} from './config';
import type { LinktreePageProps } from './helpers';

/**
 * Detect if a Linktree profile is on a paid tier by checking for branding.
 * Free tier profiles display "Made with Linktree" or similar branding.
 * Paid tier profiles have this removed.
 *
 * @param html - The HTML content of the Linktree page
 * @returns true if paid tier (no branding), false if free tier (has branding), null if uncertain
 */
export function detectLinktreePaidTier(html: string): boolean | null {
  // Check the footer section specifically (last ~5000 chars) for efficiency
  // Branding is typically at the bottom of the page
  const footerSection = html.slice(-5000);

  for (const pattern of LINKTREE_BRANDING_PATTERNS) {
    if (pattern.test(footerSection) || pattern.test(html)) {
      // Found branding = free tier
      return false;
    }
  }

  // No branding found = likely paid tier
  // But we only confidently say "paid" if we found links (indicating a real profile)
  // This prevents false positives on error pages or empty profiles
  if (html.includes('href=')) {
    return true;
  }

  // Can't determine
  return null;
}

/**
 * Detect if a Linktree profile has a verification badge.
 * Verification requires a paid Linktree plan + identity confirmation.
 * This is a stronger paid-tier signal than branding removal alone.
 *
 * Checks two sources:
 * 1. __NEXT_DATA__ JSON (user.isVerified, account.isVerified/verified)
 * 2. HTML patterns (verification badge markup, aria labels, CSS classes)
 *
 * @param html - The HTML content of the Linktree page
 * @param nextData - Parsed __NEXT_DATA__ props (if available)
 * @returns true if verified, false if not verified, null if uncertain
 */
export function detectLinktreeVerification(
  html: string,
  nextData: LinktreePageProps | null
): boolean | null {
  // 1. Check structured data from __NEXT_DATA__ (most reliable)
  const pageProps = nextData?.props?.pageProps;
  if (pageProps) {
    if (pageProps.user?.isVerified === true) return true;
    if (pageProps.account?.isVerified === true) return true;
    if (pageProps.account?.verified === true) return true;

    // Explicit false means we know they're not verified
    if (
      pageProps.user?.isVerified === false ||
      pageProps.account?.isVerified === false ||
      pageProps.account?.verified === false
    ) {
      return false;
    }
  }

  // 2. Check HTML for verification badge patterns
  for (const pattern of LINKTREE_VERIFICATION_PATTERNS) {
    if (pattern.test(html)) {
      return true;
    }
  }

  // Can't determine from available data
  return null;
}

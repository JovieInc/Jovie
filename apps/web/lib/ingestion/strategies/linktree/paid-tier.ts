/**
 * Linktree Paid Tier & Verification Detection
 *
 * Detects only evidence that can be supported from a public Linktree page.
 * Branding can prove that the footer is visible; its absence cannot prove who
 * pays, which plan is active, or whether access is trialled/bundled.
 */

import {
  LINKTREE_BRANDING_PATTERNS,
  LINKTREE_VERIFICATION_PATTERNS,
} from './config';
import type { LinktreePageProps } from './helpers';

export type LinktreeBadgeType =
  | 'identity_verified'
  | 'commerce_or_feature'
  | 'unknown';

export interface LinktreeBadgeEvidence {
  readonly type: LinktreeBadgeType;
  readonly observed: boolean | null;
}

export function detectLinktreeBadgeEvidence(
  html: string,
  nextData: LinktreePageProps | null
): LinktreeBadgeEvidence {
  const verified = detectLinktreeVerification(html, nextData);
  if (verified !== null) {
    return { type: 'identity_verified', observed: verified };
  }
  if (/commerce|shop|supporter|founder/i.test(html)) {
    return { type: 'commerce_or_feature', observed: true };
  }
  return { type: 'unknown', observed: null };
}

/**
 * Detect if a Linktree profile is on a paid tier by checking for branding.
 * Free tier profiles display "Made with Linktree" or similar branding.
 * Some paid plans may hide this branding, but hiding it is optional.
 *
 * @param html - The HTML content of the Linktree page
 * @returns false when branding is observed, otherwise null (unknown)
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

  // Missing branding is presentation evidence, not billing evidence. It also
  // covers parser/error pages and paid accounts that leave branding enabled.
  return null;
}

/**
 * Detect if a Linktree profile has a verification badge.
 * Badge semantics are identity evidence only. They are deliberately not
 * converted into plan, spend, purchasing-authority, or buy-intent evidence.
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

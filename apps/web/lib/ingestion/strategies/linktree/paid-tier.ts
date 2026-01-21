/**
 * Linktree Paid Tier Detection
 *
 * Detects whether a Linktree profile is on a paid tier by checking for branding.
 */

import { LINKTREE_BRANDING_PATTERNS } from './config';

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

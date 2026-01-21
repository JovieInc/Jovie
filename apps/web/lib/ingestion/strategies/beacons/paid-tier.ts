/**
 * Beacons Paid Tier Detection
 *
 * Detects whether a Beacons profile is on a paid tier by checking for branding.
 */

import { BEACONS_BRANDING_PATTERNS } from './config';

/**
 * Detect if a Beacons profile is on a paid tier by checking for branding.
 * Free tier profiles display "Made with Beacons" or similar branding.
 * Paid tier profiles have this removed.
 *
 * @param html - The HTML content of the Beacons page
 * @returns true if paid tier (no branding), false if free tier (has branding), null if uncertain
 */
export function detectBeaconsPaidTier(html: string): boolean | null {
  // Check the footer section specifically (last ~5000 chars) for efficiency
  const footerSection = html.slice(-5000);

  for (const pattern of BEACONS_BRANDING_PATTERNS) {
    if (pattern.test(footerSection) || pattern.test(html)) {
      // Found branding = free tier
      return false;
    }
  }

  // No branding found = likely paid tier
  // But only say "paid" if we found links (indicating a real profile)
  if (html.includes('href=')) {
    return true;
  }

  return null;
}

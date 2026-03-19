/**
 * Jovie Inbox constants — email domain, category-to-role mapping, territory specificity.
 */

/** The domain used for artist inbound email addresses. */
export const INBOX_DOMAIN = 'jovie.fm';

/** Maximum inbound emails per artist per hour before rate limiting kicks in. */
export const INBOUND_RATE_LIMIT_PER_HOUR = 100;

/**
 * Maps AI email categories to creator contact roles for routing.
 * If a category maps to null, no automatic routing is attempted.
 */
export const CATEGORY_TO_CONTACT_ROLE: Record<string, string | null> = {
  booking: 'bookings',
  music_collaboration: 'music_collaboration',
  brand_partnership: 'brand_partnerships',
  management: 'management',
  business: 'management',
  press: 'press_pr',
  fan_mail: 'fan_general',
  personal: 'fan_general',
  spam: null,
  other: null,
};

/**
 * Territory specificity rankings. Higher number = more specific.
 * When multiple contacts match, the most specific territory wins.
 */
export const TERRITORY_SPECIFICITY: Record<string, number> = {
  // Individual countries
  USA: 100,
  Canada: 100,
  UK: 100,
  Germany: 100,
  France: 100,
  Japan: 100,
  Australia: 100,
  Brazil: 100,
  Mexico: 100,
  // Regions
  'North America': 50,
  'South America': 50,
  'Latin America': 50,
  Europe: 50,
  'Europe (ex-UK)': 50,
  Asia: 50,
  'Australia & New Zealand': 50,
  'Middle East & North Africa': 50,
  Africa: 50,
  Oceania: 50,
  // Catch-all
  Worldwide: 1,
};

/**
 * Get the specificity score for a territory. Unknown territories get a default score.
 */
export function getTerritorySpecificity(territory: string): number {
  return TERRITORY_SPECIFICITY[territory] ?? 75; // Unknown territories are treated as moderately specific
}

/**
 * Normalize email subject by stripping Re:/Fwd: prefixes and trimming whitespace.
 */
export function normalizeSubject(subject: string | null | undefined): string {
  if (!subject) return '';
  return subject
    .replace(/^(re|fw|fwd)\s*:\s*/gi, '')
    .replace(/^(re|fw|fwd)\s*:\s*/gi, '') // Handle double prefixes
    .trim();
}

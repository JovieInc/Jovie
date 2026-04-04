/**
 * Shared seed data helpers.
 *
 * Used by both drizzle-seed.ts and seed-demo-account.ts to generate
 * realistic, plausible analytics data for artist dashboards.
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Referrer URLs matching the production format used by /api/audience/visit */
export const REFERRER_URLS: (string | null)[] = [
  'https://instagram.com',
  'https://twitter.com',
  'https://tiktok.com',
  'https://youtube.com',
  'https://google.com',
  'https://facebook.com',
  null, // direct traffic
];

/**
 * Scale factor per seed artist. 1.0 = max volume (300 audience, 600 clicks).
 * Non-featured artists get lower but non-zero volumes.
 */
export const PROFILE_VOLUME: Record<string, number> = {
  timwhite: 1.0,
  the1975: 0.9,
  coldplay: 0.85,
  billieeilish: 0.8,
  dualipa: 0.75,
  johnmayer: 0.5,
  ladygaga: 0.5,
  edsheeran: 0.5,
  taylorswift: 0.5,
  maneskin: 0.4,
  techtalkdaily: 0.6,
  fitnesswithemma: 0.35,
  creativecorner: 0.3,
};

export const FAN_NAMES = [
  'Sarah M.',
  'James K.',
  'Emma L.',
  'Marcus T.',
  'Olivia R.',
  'Noah P.',
  'Sophia W.',
  'Liam H.',
  'Isabella C.',
  'Ethan B.',
  'Mia D.',
  'Alexander J.',
  'Charlotte F.',
  'Benjamin S.',
  'Amelia G.',
  'Lucas N.',
  'Harper V.',
  'Mason Z.',
  'Evelyn Q.',
  'Logan A.',
  'Avery E.',
  'Jackson Y.',
  'Scarlett I.',
  'Aiden O.',
  'Luna U.',
  'Sebastian X.',
  'Aria W.',
  'Mateo R.',
  'Chloe T.',
  'Jack P.',
  'Penelope H.',
  'Owen F.',
  'Layla M.',
  'Daniel K.',
  'Riley S.',
  'Henry J.',
  'Zoey B.',
  'Samuel D.',
  'Nora G.',
  'Carter L.',
  'Lily N.',
  'Wyatt C.',
  'Eleanor V.',
  'Grayson A.',
  'Hannah Z.',
  'Dylan E.',
  'Addison Q.',
  'Leo I.',
  'Aubrey O.',
  'Jaxon U.',
];

export const EMAIL_DOMAINS = [
  'gmail.com',
  'outlook.com',
  'icloud.com',
  'yahoo.com',
  'proton.me',
];

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

/** Hockey-stick date distribution: bias toward recent dates via x^2 curve. */
export function hockeyStickDate(daysBack: number): Date {
  const d = new Date();
  const offset = Math.floor(daysBack * Math.random() ** 2);
  d.setDate(d.getDate() - offset);
  d.setHours(
    Math.floor(Math.random() * 24),
    Math.floor(Math.random() * 60),
    Math.floor(Math.random() * 60),
    0
  );
  return d;
}

// ---------------------------------------------------------------------------
// Weighted pickers
// ---------------------------------------------------------------------------

/**
 * Pick a referrer URL with realistic distribution.
 * 30% Instagram, 15% Twitter, 15% TikTok, 10% YouTube, 10% Google, 5% Facebook, 15% direct (null).
 */
export function pickWeightedReferrer(): string | null {
  const r = Math.random();
  if (r < 0.3) return 'https://instagram.com';
  if (r < 0.45) return 'https://twitter.com';
  if (r < 0.6) return 'https://tiktok.com';
  if (r < 0.7) return 'https://youtube.com';
  if (r < 0.8) return 'https://google.com';
  if (r < 0.85) return 'https://facebook.com';
  return null; // direct
}

/** Pick a geographic country with realistic distribution. */
export function pickCountry(): string {
  const r = Math.random();
  if (r < 0.4) return 'US';
  if (r < 0.55) return 'GB';
  if (r < 0.65) return 'CA';
  if (r < 0.75) return 'AU';
  const rest = ['DE', 'FR', 'JP', 'BR', 'MX'];
  return rest[Math.floor(Math.random() * rest.length)];
}

/** Pick a city for a given country. */
export function pickCity(country: string): string {
  const cityMap: Record<string, string[]> = {
    US: [
      'Los Angeles',
      'New York',
      'San Francisco',
      'Nashville',
      'Austin',
      'Chicago',
      'Portland',
      'Seattle',
    ],
    GB: ['London', 'Manchester', 'Bristol', 'Brighton'],
    CA: ['Toronto', 'Vancouver', 'Montreal'],
    AU: ['Sydney', 'Melbourne', 'Brisbane'],
    DE: ['Berlin', 'Munich', 'Hamburg'],
    FR: ['Paris', 'Lyon', 'Marseille'],
    JP: ['Tokyo', 'Osaka', 'Kyoto'],
    BR: ['Sao Paulo', 'Rio de Janeiro'],
    MX: ['Mexico City', 'Guadalajara'],
  };
  const cities = cityMap[country] ?? ['Unknown'];
  return cities[Math.floor(Math.random() * cities.length)];
}

/** Generate a fan email from a FAN_NAMES entry. */
export function fanEmail(name: string): string {
  const parts = name.toLowerCase().replace('.', '').split(' ');
  const domain =
    EMAIL_DOMAINS[Math.floor(Math.random() * EMAIL_DOMAINS.length)];
  return `${parts[0]}.${parts[1]}@${domain}`;
}

/**
 * Generate 1-4 referrer history entries with correct `url` key format.
 * Matches the production format used by /api/audience/visit/route.ts:303.
 */
export function generateReferrerHistory(
  baseDate: Date,
  count?: number
): Array<{ url: string; timestamp: string }> {
  const entryCount = count ?? 1 + Math.floor(Math.random() * 3);
  const entries: Array<{ url: string; timestamp: string }> = [];
  for (let r = 0; r < entryCount; r++) {
    const refUrl = pickWeightedReferrer();
    if (refUrl) {
      entries.push({
        url: refUrl,
        timestamp: new Date(
          baseDate.getTime() + r * 86_400_000 * Math.random() * 7
        ).toISOString(),
      });
    }
  }
  return entries;
}

// ---------------------------------------------------------------------------
// Weighted link type picker
// ---------------------------------------------------------------------------

/** Pick a link type with realistic distribution: 60% listen, 20% social, 15% tip, 5% other. */
export function pickWeightedLinkType(): 'listen' | 'social' | 'tip' | 'other' {
  const r = Math.random();
  if (r < 0.6) return 'listen';
  if (r < 0.8) return 'social';
  if (r < 0.95) return 'tip';
  return 'other';
}

/** Pick a device type: 55% mobile, 35% desktop, 10% tablet. */
export function pickDeviceType(): string {
  const r = Math.random();
  if (r < 0.55) return 'mobile';
  if (r < 0.9) return 'desktop';
  return 'tablet';
}

// ---------------------------------------------------------------------------
// Batch insert helper
// ---------------------------------------------------------------------------

/** Split an array into chunks of a given size. */
export function chunk<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

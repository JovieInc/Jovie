/**
 * Canonical public company identity (JOV-6261).
 *
 * General surfaces consume this. Labeled Artists solutions, founder biography,
 * and specialist artist APIs may keep music-domain language. Do not treat this
 * as a nav/taxonomy registry (JOV-4491) or a homepage taste rewrite (JOV-5861).
 *
 * The homepage page body sells the artist profile (EVENT 2026-10-20) from
 * `homepageCopy.ts`; its metadata description and structured data still read
 * this general identity. `homepageHeadline` is the auth brand-panel line.
 * General copy stays generic (Tim, 2026-10-22): do not put a segment list back
 * into support, definition, audiences, or knowsAbout.
 */
export const COMPANY_IDENTITY = {
  productName: 'Jovie',
  headline: 'Presence, relationships, and growth.',
  support: 'One product for any creator.',
  definition:
    'Jovie is one product for presence, relationships, and growth. It helps any creator control how they are found and turn attention into relationships.',
  seoTitle: 'Jovie | Be found. Be understood.',
  seoDescription:
    'Claim your name. Jovie makes you easy to reach, for people and for agents.',
  homepageHeadline: 'Be found. Be understood.',
  /** Canonical public X handle. Retired `@jovieapp` must not return. */
  xHandle: '@meetjovie',
  /** Homepage WebSite schema names. Do not add a product-category alias. */
  schemaAlternateNames: ['Jovie', 'jov.ie'],
  audiences: ['creators'] as const,
  outcomes: ['presence', 'relationships', 'growth'] as const,
  knowsAbout: [
    'Public Profiles',
    'Personal Presence',
    'Audience Relationships',
    'Independent Creators',
    'Smart Links',
    'Public Identity',
  ] as const,
  signupDescription:
    'Create your Jovie account to claim a living profile and turn attention into relationships.',
  disambiguation:
    'Jovie at jov.ie is a separate company from the Jovie childcare franchise at jovie.com.',
} as const;

export type CompanyIdentity = typeof COMPANY_IDENTITY;

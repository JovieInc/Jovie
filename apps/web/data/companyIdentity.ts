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
 */
export const COMPANY_IDENTITY = {
  productName: 'Jovie',
  headline: 'Presence, relationships, and growth.',
  support:
    'One product for artists, founders, authors, creators, and independent experts.',
  definition:
    'Jovie is one product for presence, relationships, and growth. It helps artists, founders, authors, creators, and independent experts control how they are found and turn attention into relationships.',
  seoTitle: 'Jovie | Be found. Be understood.',
  seoDescription:
    'Claim your name. Jovie makes you easy to reach, for people and for agents.',
  homepageHeadline: 'Be found. Be understood.',
  audiences: [
    'artists',
    'founders',
    'authors',
    'creators',
    'independent experts',
  ] as const,
  outcomes: ['presence', 'relationships', 'growth'] as const,
  knowsAbout: [
    'Public Profiles',
    'Personal Presence',
    'Audience Relationships',
    'Independent Creators',
    'Smart Links',
    'Music Marketing',
  ] as const,
  signupDescription:
    'Create your Jovie account to claim a living profile and turn attention into relationships.',
  disambiguation:
    'Jovie at jov.ie is a separate company from the Jovie childcare franchise at jovie.com.',
} as const;

export type CompanyIdentity = typeof COMPANY_IDENTITY;

/**
 * Canonical Pen homepage v3 copy (Tim direction 2026-09-26): the generic,
 * lab-grade identity homepage for founders and investors. The product is
 * "your Jovie profile". No single-ICP wording and no em dashes
 * (canon/VOICE.md).
 */
export const HOMEPAGE_IDENTITY_COPY = {
  seo: {
    title: 'Jovie | Your living identity on the internet',
    description:
      'Your work, your links, your next chapter. Together in your Jovie profile.',
  },
  hero: {
    headline: 'Your living identity on the internet.',
    subhead:
      'Your work, your links, your next chapter. Together in your Jovie profile.',
    // Certified conversion (JOV-5085): the hero action is always the name
    // search, even while the waitlist gate is on.
    search: {
      placeholder: 'Search your name',
      action: 'Find me',
    },
    // Real first-party proof (JOV-6946): the hero shows Tim White's live
    // jov.ie/tim profile, never a fictional placeholder person.
    proofAlt: 'Tim White’s Jovie profile at jov.ie/tim',
  },
} as const;

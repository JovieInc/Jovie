/**
 * Canonical Pen homepage v3 copy (Tim direction 2026-09-26): the generic,
 * lab-grade identity homepage for founders and investors. The product is
 * "your Jovie profile". No single-ICP wording and no em dashes
 * (canon/VOICE.md).
 */
export const HOMEPAGE_IDENTITY_COPY = {
  seo: {
    title: 'Jovie | A living identity for the internet',
    description:
      'Your work, your links, your next chapter. Together in your Jovie profile.',
  },
  hero: {
    eyebrow: 'Jovie / Identity, connected',
    headline: 'A living identity for the internet.',
    subhead:
      'Your work, your links, your next chapter. Together in your Jovie profile.',
    // Waitlist-off fallback: the hero action returns to the existing name
    // search. Waitlist-on renders the one Request access action instead.
    search: {
      placeholder: 'Search your name',
      action: 'Find me',
    },
    // Avery Chen is fictional illustrative content, not a customer or
    // evidence of product behavior. The caption labels it as a preview.
    specimen: {
      handle: 'jov.ie/avery',
      name: 'Avery Chen',
      bio: 'Building tools for a more thoughtful internet.',
      portraitAlt: 'Portrait of Avery Chen, a fictional example profile',
      rows: [
        {
          id: 'work',
          title: 'Fieldnotes',
          detail: 'Tools for thoughtful teams',
        },
        {
          id: 'writing',
          title: 'On building things that matter',
          detail: 'Avery’s latest essay',
        },
      ],
      action: 'Get updates',
      caption: 'Your Jovie profile · Illustrative preview',
    },
  },
} as const;

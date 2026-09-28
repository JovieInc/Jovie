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
    // Certified conversion (JOV-5085): the hero action is always the name
    // search, even while the waitlist gate is on.
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
  // Presence and structure chapters, then the close.
  sections: [
    {
      id: 'presence',
      eyebrow: 'Connected presence',
      headline: 'Your presence, resolved.',
      body: 'The work you share. The places people find you. Bring them together in your Jovie profile.',
      step: {
        headline: 'A clear next step.',
        body: 'Read the work. Start a conversation. Attend an event or send a payment.',
      },
    },
    {
      id: 'structure',
      eyebrow: 'An open system',
      headline: 'Structure that travels.',
      body: 'One identity. Room for everything you do, and whatever comes next.',
      identity: {
        label: '01 / Identity',
        title: 'Your Jovie profile',
        handle: 'jov.ie/you',
      },
      possibilities: {
        label: '02 / Possibilities',
        items: [
          { id: 'profile', title: 'Profile', detail: 'Name, story, work' },
          { id: 'links', title: 'Links', detail: 'One place to explore' },
          { id: 'events', title: 'Events', detail: 'A reason to meet' },
          { id: 'payments', title: 'Payments', detail: 'A direct way to pay' },
        ],
      },
    },
  ],
  close: {
    headline: 'Make it your Jovie profile.',
    action: 'Find your profile',
  },
} as const;

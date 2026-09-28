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

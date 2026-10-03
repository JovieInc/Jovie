/**
 * Canonical Pen homepage v3 copy (Tim direction 2026-09-26): the generic,
 * lab-grade identity homepage for founders and investors. The product is
 * "your Jovie profile". No single-ICP wording and no em dashes
 * (canon/VOICE.md).
 */
export const HOMEPAGE_IDENTITY_COPY = {
  seo: {
    title: 'Jovie | Be found. Be understood.',
    description:
      'Claim your name. Jovie makes you easy to reach, for people and for agents.',
  },
  hero: {
    kicker: 'Jovie',
    headline: 'Be found. Be understood.',
    // JOV-7581: do not claim web research here. profile-monitoring is
    // internal-only and has no public marketing block.
    subhead:
      'Claim your name. Jovie makes you easy to reach, for people and for agents.',
    // Homepage conversion (EVENT 2026-09-28, Tim: link claim replaces the
    // JOV-5085 name search): claim jov.ie/you, then /start with the handle.
    claim: {
      domain: 'jov.ie/',
      placeholder: 'you',
      action: 'Claim',
    },
    // Real first-party proof (JOV-6946, JOV-INV-038 proximal proof): the
    // claim card shows Tim White's real claimed jov.ie/tim, never a
    // fictional placeholder person (Tim 2026-09-28).
    preview: {
      label: 'Claimed',
      name: 'Tim White',
      role: 'Founder, Jovie',
    },
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
  },
} as const;

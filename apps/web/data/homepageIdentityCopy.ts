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
  // Plain answers to the questions a first visit raises. Every answer names a
  // shipped surface: the free plan, jov.ie/you/llms.txt and the read-only
  // profile API (lib/agent/site-llms-guidance.ts).
  faq: {
    heading: 'Questions',
    items: [
      {
        question: 'What is Jovie?',
        answer:
          'Jovie gives you one public profile at jov.ie/you. It holds your name, your story, your work and your links, plus ways to reach you, like events and payments.',
      },
      {
        question: 'How do I claim my name?',
        answer:
          'Type the name you want after jov.ie/ and select Claim. If the name is free, Jovie walks you through setting up the rest of your profile.',
      },
      {
        question: 'Who is Jovie for?',
        answer:
          'Anyone who wants to be easy to find and easy to reach: founders, investors, creators, authors and the people they work with.',
      },
      {
        question: 'What does it mean to be reachable by agents?',
        answer:
          'Every public profile also has a machine-readable summary at jov.ie/you/llms.txt and read-only structured data, so AI assistants can find you and describe you accurately.',
      },
      {
        question: 'Does it cost anything?',
        answer:
          'Your public Jovie profile is free. Paid plans add more tools, and the pricing page lists what each one includes.',
      },
    ],
  },
  close: {
    headline: 'Make it your Jovie profile.',
  },
} as const;

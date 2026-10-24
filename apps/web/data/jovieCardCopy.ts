export const JOVIE_CARD_PUBLICATION_STATE = 'coming-soon' as const;

// An announcement is not product UI proof. Replace this only with an approved
// Wallet depiction; a public-profile capture shows the destination, not Card.
export const JOVIE_CARD_HERO_EVIDENCE = {
  kind: 'planned-description',
  capabilityId: 'jovie-card',
  componentPath: 'apps/web/app/(marketing)/card/JovieCardLanding.tsx',
  testId: 'jovie-card-planned-description',
} as const;

export const JOVIE_CARD_COPY = {
  publication: {
    state: JOVIE_CARD_PUBLICATION_STATE,
    label: 'Coming soon',
    primaryCta: 'Join the list',
    secondaryCta: 'See how it works',
    indexable: true,
    canIssuePasses: false,
  },
  seo: {
    title: 'Jovie Card: Planned for Apple Wallet',
    description:
      'Jovie Card is a planned Apple Wallet card for sharing your music and links in person. Join the list for access updates. Passes are not available yet.',
  },
  hero: {
    headline: 'Your Jovie profile. Ready for the real world.',
    body: 'Jovie Card is a planned Apple Wallet card for sharing your music and links after an introduction. Join the list for access updates.',
    availability: 'Coming soon. Wallet passes are not available yet.',
  },
  sections: {
    howItWorks: 'Show your card. They open your profile',
    howItWorksIntro: 'Here’s the sharing flow we’re planning.',
    introduction: 'An introduction. Not a list of usernames',
    closing: 'Bring your profile into the room',
  },
  steps: [
    {
      title: 'Keep it close',
      body: 'The planned card would live in Apple Wallet.',
    },
    {
      title: 'Show your card',
      body: 'You’d bring up its QR code after an introduction.',
    },
    {
      title: 'Open your profile',
      body: 'They’d scan to find your music and links in their browser.',
    },
  ],
  examples: [
    {
      audience: 'After the set',
      body: 'Give someone you’ve just met one place to find your music and links.',
    },
  ],
  faq: [
    {
      question: 'How will sharing work?',
      answer:
        'The planned card would include a QR code that opens your public Jovie profile. Joining the list signs you up for access updates; it does not issue a pass.',
    },
    {
      question: 'Does the person I meet need Jovie?',
      answer:
        'The plan is for the QR code to open a public web profile, with no Jovie account or app needed to view it.',
    },
    {
      question: 'Will it work with Android?',
      answer:
        'We’re planning browser-based QR sharing, including for people on Android. The card itself is planned for Apple Wallet. Android wallet storage has not been announced.',
    },
    {
      question: 'Who is eligible?',
      answer:
        'Eligibility has not been announced. Joining the list signs you up for access updates. It does not issue a Wallet pass.',
    },
    {
      question: 'How much will Jovie Card cost?',
      answer:
        'Pricing has not been announced. We’ll share approved eligibility and pricing details before any access offer.',
    },
  ],
} as const;

export const JOVIE_CARD_INTEREST_SOURCE =
  `marketing:/card:${JOVIE_CARD_PUBLICATION_STATE}` as const;

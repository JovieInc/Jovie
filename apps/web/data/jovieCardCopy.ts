export const JOVIE_CARD_PUBLICATION_STATE = 'coming-soon' as const;

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
    title: 'Jovie Card — Your profile in Apple Wallet',
    description:
      'Jovie Card is coming to Apple Wallet. Join the list for access updates about sharing your Jovie profile in person.',
  },
  hero: {
    headline: 'Your Jovie profile. Ready for the real world.',
    body: 'We’re bringing your Jovie profile to Apple Wallet—a personal card designed for the people you meet in person. Join the list for access updates.',
  },
  steps: [
    {
      title: 'Keep it close',
      body: 'When access opens, you’ll be able to keep your Jovie profile card in Apple Wallet.',
    },
    {
      title: 'Show your card',
      body: 'Bring up the card when you meet someone and want to share more than a username.',
    },
    {
      title: 'Open your profile',
      body: 'They’ll scan the card to open your public Jovie profile in their browser.',
    },
  ],
  examples: [
    {
      audience: 'Artist',
      body: 'Turn a backstage introduction into one place for your music, story, and next show.',
    },
    {
      audience: 'Founder',
      body: 'Share the context behind what you are building without reciting a string of handles.',
    },
    {
      audience: 'Creator',
      body: 'Give a new collaborator one profile that leads to your work and ways to connect.',
    },
  ],
  faq: [
    {
      question: 'How will sharing work?',
      answer:
        'The planned card will include a QR code that opens your public Jovie profile. The preview on this page is illustrative and does not represent measured leads or a certified rollout.',
    },
    {
      question: 'Does the person I meet need Jovie?',
      answer:
        'No. The planned scan opens a public web profile, so the recipient will not need an account or an app to view it.',
    },
    {
      question: 'Will it work with Android?',
      answer:
        'The card is planned for Apple Wallet. An Android phone can still scan its QR code and open the public profile in a browser; Android wallet storage is not being announced here.',
    },
    {
      question: 'Who is eligible?',
      answer:
        'Eligibility has not been announced. Joining the list only signs you up for access updates and does not unlock or issue a Wallet pass.',
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

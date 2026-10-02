import type { ComparisonData } from './types';

export const linktreeComparison: ComparisonData = {
  slug: 'linktree',
  competitor: 'Linktree',
  title: 'Jovie vs Linktree',
  metaDescription:
    'Compare Jovie and Linktree for artist profiles, music links, contact collection, subscriber updates, and analytics.',
  heroHeadline: 'Jovie vs Linktree',
  heroSubheadline:
    'Both products offer link pages, audience collection, subscriber updates, and analytics. Jovie centers those tools on an artist profile and release workflow.',
  heroImage: {
    src: '/images/hero/compare-linktree.webp',
    alt: 'An abstract field of dark crimson light and shadow.',
  },
  features: [
    {
      name: 'Link-in-bio profile',
      jovie: true,
      competitor: true,
      note: 'Jovie publishes an artist profile; Linktree publishes a customizable link page',
      claimIds: ['jovie.public-profile', 'linktree.link-page'],
    },
    {
      name: 'Music links to streaming services',
      jovie: true,
      competitor: true,
      note: 'Both products publish links that let listeners choose a streaming service',
      claimIds: ['jovie.smart-links', 'linktree.music-links'],
    },
    {
      name: 'Email and contact collection',
      jovie: true,
      competitor: true,
      note: 'Linktree documents contact forms and subscriber sign-ups; Jovie includes audience capture',
      claimIds: ['jovie.contact-collection', 'linktree.contact-collection'],
    },
    {
      name: 'Subscriber update notifications',
      jovie: true,
      competitor: true,
      note: 'Jovie notifications require enrollment; Linktree lets creators send or schedule subscriber notifications',
      claimIds: ['jovie.fan-notifications', 'linktree.notifications'],
    },
    {
      name: 'Analytics and source attribution',
      jovie: true,
      competitor: true,
      note: 'Jovie advanced analytics require enrollment; Linktree documents views, clicks, sources, and subscriber analytics by plan',
      claimIds: ['jovie.analytics', 'linktree.analytics'],
    },
  ],
  faq: [
    {
      question: 'Is Jovie better than Linktree?',
      answer:
        'It depends on the workflow you need. Linktree documents a broad link page with contact forms, subscriptions, music links, and analytics. Jovie centers a public artist profile, release smart links, audience capture, and an enrolled release workspace.',
      claimIds: [
        'jovie.public-profile',
        'jovie.smart-links',
        'jovie.contact-collection',
        'jovie.release-workspace',
        'linktree.link-page',
        'linktree.contact-collection',
        'linktree.notifications',
        'linktree.music-links',
        'linktree.analytics',
      ],
    },
    {
      question: 'How do I replace Linktree with Jovie?',
      answer:
        'Claim a Jovie profile, add your public links, and use the Jovie profile URL in your bio. Check that the artist and release workflows you need are available for your account before switching.',
      claimIds: ['jovie.public-profile', 'jovie.capability-access'],
    },
    {
      question: 'Is Jovie free like Linktree?',
      answer:
        'Jovie offers a free public profile with audience capture. Linktree also documents a Free plan; feature depth and history vary by Linktree plan.',
      claimIds: ['jovie.free-profile', 'linktree.free-plan'],
    },
    {
      question: 'Can I add music links?',
      answer:
        'Yes. Jovie supports release smart links, and Linktree documents Music Links that show available streaming services.',
      claimIds: ['jovie.smart-links', 'linktree.music-links'],
    },
  ],
  bottomLine:
    'There is meaningful overlap. Linktree documents a general link page with audience tools; Jovie centers a public artist profile and music-release workflow. Compare the specific access level and workflow you need, rather than relying on a categorical winner.',
  claimIds: [
    'jovie.public-profile',
    'jovie.release-workspace',
    'jovie.capability-access',
    'linktree.link-page',
    'linktree.contact-collection',
    'linktree.notifications',
    'linktree.analytics',
  ],
};

import type { AlternativeData } from './types';

export const linktreeAlternative: AlternativeData = {
  slug: 'linktree',
  category: 'Linktree',
  title: 'A Linktree Alternative for Artists (2026)',
  metaDescription:
    'Consider Jovie as a Linktree alternative for a public artist profile, release smart links, audience capture, and enrolled artist workflows.',
  heroHeadline: 'A Linktree alternative for artists',
  heroSubheadline:
    'Jovie combines a public artist profile, release smart links, and audience capture. Linktree also offers link pages, contact collection, subscriber notifications, music links, and analytics.',
  heroImage: {
    src: '/images/hero/alternatives-linktree.webp',
    alt: 'Abstract pink light blooming through dark smoke.',
  },
  whySwitch: [
    {
      text: 'Consider Jovie if you want a public artist profile and release smart links in the same product.',
      claimIds: ['jovie.public-profile', 'jovie.smart-links'],
    },
    {
      text: 'Both products collect contacts. Jovie keeps audience capture connected to the artist profile workflow.',
      claimIds: ['jovie.contact-collection', 'linktree.contact-collection'],
    },
    {
      text: 'Both products support subscriber updates. Jovie fan notifications are available to enrolled artists.',
      claimIds: ['jovie.fan-notifications', 'linktree.notifications'],
    },
    {
      text: 'Both products provide analytics. Jovie advanced analytics require enrollment, while Linktree analytics depth varies by plan.',
      claimIds: ['jovie.analytics', 'linktree.analytics'],
    },
  ],
  highlights: [
    {
      title: 'Public artist profile',
      description:
        'Claim a Jovie profile for your work, links, and artist identity.',
      claimIds: ['jovie.public-profile', 'jovie.free-profile'],
    },
    {
      title: 'Release smart links',
      description:
        'Publish release links that remember a fan’s streaming-platform choice.',
      claimIds: ['jovie.smart-links'],
    },
    {
      title: 'Audience capture',
      description:
        'Collect audience contacts from the public profile. Export and advanced CRM capabilities depend on plan access.',
      claimIds: ['jovie.contact-collection', 'jovie.capability-access'],
    },
    {
      title: 'Enrolled artist workflows',
      description:
        'Eligible artists can use fan notifications, advanced analytics, and release-planning tools.',
      claimIds: [
        'jovie.fan-notifications',
        'jovie.analytics',
        'jovie.release-workspace',
      ],
    },
  ],
  faq: [
    {
      question: 'What should I look for in a Linktree alternative?',
      answer:
        'Compare the jobs you actually need. Linktree documents link pages, contact forms, subscriber notifications, music links, and analytics. Jovie combines a public artist profile, release smart links, audience capture, and enrolled artist workflows.',
      claimIds: [
        'jovie.public-profile',
        'jovie.smart-links',
        'jovie.contact-collection',
        'jovie.capability-access',
        'linktree.link-page',
        'linktree.contact-collection',
        'linktree.notifications',
        'linktree.music-links',
        'linktree.analytics',
      ],
    },
    {
      question: 'Is Jovie free?',
      answer:
        'Jovie offers a free public profile with audience capture. Paid and enrolled capabilities have separate access terms.',
      claimIds: ['jovie.free-profile', 'jovie.capability-access'],
    },
    {
      question: 'Can I use Jovie instead of Linktree?',
      answer:
        'Yes, if Jovie covers the workflow you need. Claim a profile, add your public links, and verify access to any enrolled artist capabilities before switching your bio URL.',
      claimIds: ['jovie.public-profile', 'jovie.capability-access'],
    },
  ],
  claimIds: [
    'jovie.public-profile',
    'jovie.smart-links',
    'jovie.contact-collection',
    'jovie.capability-access',
    'linktree.link-page',
    'linktree.contact-collection',
    'linktree.notifications',
    'linktree.music-links',
    'linktree.analytics',
  ],
};

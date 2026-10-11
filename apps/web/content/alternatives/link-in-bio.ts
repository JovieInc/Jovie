import type { AlternativeData } from './types';

export const linkInBioAlternative: AlternativeData = {
  slug: 'link-in-bio',
  category: 'Link in Bio',
  title: 'A Link in Bio for Artists (2026)',
  metaDescription:
    'Use Jovie as an artist link in bio with a public profile, release smart links, audience capture, and enrolled artist workflows.',
  heroHeadline: 'A link in bio for artists',
  heroSubheadline:
    'Jovie combines a public artist profile, release smart links, and audience capture, with additional artist workflows available by access level.',
  heroImage: {
    src: '/images/hero/alternatives-link-in-bio.webp',
    alt: 'A vertical column of purple light through dark smoke.',
  },
  whySwitch: [
    {
      text: 'Choose Jovie when your link in bio should also be your public artist profile.',
      claimIds: ['jovie.public-profile'],
    },
    {
      text: 'Publish release smart links alongside the profile instead of managing a separate release-link product.',
      claimIds: ['jovie.public-profile', 'jovie.smart-links'],
    },
    {
      text: 'Capture audience contacts from the profile; export and advanced CRM capabilities depend on plan access.',
      claimIds: ['jovie.contact-collection', 'jovie.capability-access'],
    },
    {
      text: 'Eligible artists can add fan notifications, advanced analytics, and a release-planning workspace.',
      claimIds: [
        'jovie.fan-notifications',
        'jovie.analytics',
        'jovie.release-workspace',
      ],
    },
  ],
  highlights: [
    {
      title: 'Public artist profile',
      description:
        'Put your work, public links, and artist identity on one claimable profile.',
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
        'Collect audience contacts from the public profile, with plan-specific limits and export access.',
      claimIds: ['jovie.contact-collection', 'jovie.capability-access'],
    },
    {
      title: 'Access-aware workspace',
      description:
        'Fan notifications, advanced analytics, and release planning are available to enrolled artists rather than promised to every account.',
      claimIds: [
        'jovie.fan-notifications',
        'jovie.analytics',
        'jovie.release-workspace',
      ],
    },
  ],
  faq: [
    {
      question: 'What should artists look for in a link-in-bio tool?',
      answer:
        'Start with the job you need to complete: a public profile, release links, audience capture, or an artist workspace. Jovie combines those jobs, with notifications, advanced analytics, and release planning gated by account access.',
      claimIds: [
        'jovie.public-profile',
        'jovie.smart-links',
        'jovie.contact-collection',
        'jovie.capability-access',
      ],
    },
    {
      question: 'Do I need a separate link-in-bio tool if I use Jovie?',
      answer:
        'Not if the Jovie public profile and release-link workflow cover your needs. Claim a profile, add your public links, and verify access to any enrolled artist capabilities you plan to use.',
      claimIds: [
        'jovie.public-profile',
        'jovie.smart-links',
        'jovie.capability-access',
      ],
    },
    {
      question: 'What is included with a Jovie profile?',
      answer:
        'The free offer includes a public profile and audience capture. Release smart links are generally available; notifications, advanced analytics, and release-planning tools require enrollment.',
      claimIds: [
        'jovie.free-profile',
        'jovie.smart-links',
        'jovie.fan-notifications',
        'jovie.analytics',
        'jovie.release-workspace',
      ],
    },
  ],
  claimIds: [
    'jovie.public-profile',
    'jovie.smart-links',
    'jovie.contact-collection',
    'jovie.capability-access',
  ],
};

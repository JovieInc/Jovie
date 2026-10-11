import type { ComparisonData } from './types';

export const linkfireComparison: ComparisonData = {
  slug: 'linkfire',
  competitor: 'Linkfire',
  title: 'Jovie vs Linkfire',
  metaDescription:
    'Compare Jovie and Linkfire for artist profiles, release smart links, pre-saves, audience capture, notifications, and analytics.',
  heroHeadline: 'Jovie vs Linkfire',
  heroSubheadline:
    'Both products support artists with music links, bio pages, audience capture, and analytics. Their access models and surrounding workflows differ.',
  heroImage: {
    src: '/images/hero/compare-linkfire.webp',
    alt: 'An abstract arc of glowing cyan light against black.',
  },
  features: [
    {
      name: 'Smart links for releases',
      jovie: true,
      competitor: true,
      claimIds: ['jovie.smart-links', 'linkfire.smart-links'],
    },
    {
      name: 'Pre-save links',
      jovie: true,
      competitor: true,
      claimIds: ['jovie.pre-save', 'linkfire.pre-save'],
    },
    {
      name: 'Artist profile or bio link',
      jovie: true,
      competitor: true,
      note: 'Jovie publishes an artist profile; Linkfire documents customizable Bio Links',
      claimIds: ['jovie.public-profile', 'linkfire.bio-links'],
    },
    {
      name: 'Email collection',
      jovie: true,
      competitor: true,
      note: 'Jovie includes audience capture; Linkfire lists email collection in its plans and Bio Link guidance',
      claimIds: ['jovie.contact-collection', 'linkfire.email-collection'],
    },
    {
      name: 'Fan notifications',
      jovie: true,
      competitor: true,
      note: 'Jovie notifications require enrollment; Linkfire documents automated pre-save subscription emails for supported services',
      claimIds: ['jovie.fan-notifications', 'linkfire.notifications'],
    },
    {
      name: 'Analytics',
      jovie: true,
      competitor: true,
      note: 'Jovie advanced analytics require enrollment; Linkfire documents link, streaming, channel, and location analytics',
      claimIds: ['jovie.analytics', 'linkfire.analytics'],
    },
    {
      name: 'Free access option',
      jovie: true,
      competitor: true,
      note: 'Jovie offers a free public profile; Linkfire says trial accounts revert to a limited free account',
      claimIds: ['jovie.free-profile', 'linkfire.plans'],
    },
  ],
  faq: [
    {
      question: 'Is Jovie a good alternative to Linkfire?',
      answer:
        'It can be, depending on your workflow. Both support release links, pre-saves, an artist-facing profile or bio link, audience capture, and analytics. Jovie also provides an enrolled release-planning workspace; compare current access and plan details before switching.',
      claimIds: [
        'jovie.smart-links',
        'jovie.pre-save',
        'jovie.public-profile',
        'jovie.contact-collection',
        'jovie.analytics',
        'jovie.release-workspace',
        'linkfire.smart-links',
        'linkfire.pre-save',
        'linkfire.bio-links',
        'linkfire.email-collection',
        'linkfire.analytics',
      ],
    },
    {
      question: 'How much does Linkfire cost vs Jovie?',
      answer:
        'Jovie offers a free public profile, while paid Jovie capabilities have separate access terms. Linkfire publishes paid Pro, Teams, Premium, and Enterprise options, a free trial, and a limited free account after the trial. Check both pricing pages for current terms.',
      claimIds: ['jovie.free-profile', 'jovie.pricing', 'linkfire.plans'],
    },
    {
      question: 'Can I use Jovie if I’m on a label?',
      answer:
        'Jovie’s public artist profile is available to claim, while some workspace capabilities require enrollment. Linkfire publishes plans for solo artists, teams, labels, and enterprise organizations.',
      claimIds: [
        'jovie.public-profile',
        'jovie.capability-access',
        'linkfire.plans',
      ],
    },
  ],
  bottomLine:
    'Jovie and Linkfire overlap on core artist-link workflows. Jovie centers a public artist profile and enrolled release workspace; Linkfire publishes a broader plan ladder for solo artists, teams, and enterprise organizations. The better fit depends on the exact access and team workflow you need.',
  claimIds: [
    'jovie.public-profile',
    'jovie.release-workspace',
    'jovie.capability-access',
    'linkfire.plans',
  ],
};

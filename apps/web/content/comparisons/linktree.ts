import type { ComparisonData } from './types';

export const linktreeComparison: ComparisonData = {
  slug: 'linktree',
  competitor: 'Linktree',
  title: 'Jovie vs Linktree',
  metaDescription:
    'Compare Jovie and Linktree. See why people choose Jovie for a profile that captures visitors, sends automatic updates, and adapts to what they came for.',
  heroHeadline: 'Jovie vs Linktree',
  heroSubheadline:
    'Linktree gives you a static list of links. Jovie gives you a profile that captures visitors and keeps working after they leave. Here’s how they compare.',
  heroImage: {
    src: '/images/hero/compare-linktree.webp',
    alt: 'An abstract field of dark crimson light and shadow.',
  },
  features: [
    {
      name: 'Links that adapt automatically',
      jovie: true,
      competitor: false,
      note: 'Jovie leads with your most current update instead of a fixed list',
    },
    {
      name: 'Automatic update notifications',
      jovie: true,
      competitor: false,
      note: 'Jovie notifies your audience automatically when you publish something new',
    },
    {
      name: 'Contact collection & CRM',
      jovie: true,
      competitor: false,
      note: 'Jovie collects and manages visitor emails and phone numbers',
    },
    {
      name: 'Destination-aware routing',
      jovie: true,
      competitor: false,
      note: 'Jovie routes visitors to the right destination based on context',
    },
    {
      name: 'Link-in-bio page',
      jovie: true,
      competitor: true,
    },
    {
      name: 'Trusted profile destination',
      jovie: true,
      competitor: false,
      note: 'Jovie keeps profiles consistent and recognizable for visitors',
    },
    {
      name: 'Analytics',
      jovie: true,
      competitor: true,
      note: 'Jovie adds audience intelligence and source attribution',
    },
    {
      name: 'AI tools built on your real data',
      jovie: true,
      competitor: false,
      note: 'Jovie AI uses your actual profile data, not a blank prompt',
    },
    {
      name: 'Task management for updates',
      jovie: true,
      competitor: false,
    },
    {
      name: 'Events & dates display',
      jovie: true,
      competitor: false,
      note: 'Show upcoming events directly on your profile',
    },
    {
      name: 'General-purpose for any use case',
      jovie: false,
      competitor: true,
      note: 'Linktree stays the same for every visitor; Jovie adapts to what you share',
    },
  ],
  faq: [
    {
      question: 'Is Jovie better than Linktree?',
      answer:
        'For most people, yes. Linktree is a static list of links. Jovie is a profile that adapts to what you share, captures visitor contacts, sends automatic update notifications, and includes AI tools that understand your actual data. Jovie does what Linktree does, plus everything else you need to grow an audience.',
    },
    {
      question: 'How do I replace Linktree with Jovie?',
      answer:
        'Yes. Create a Jovie profile, add your links, and update your bio link. Your Jovie profile at jov.ie/username replaces your Linktree, with contact capture and automatic update notifications built in.',
    },
    {
      question: 'Is Jovie free like Linktree?',
      answer:
        'Yes, Jovie has a free tier. Create a profile, add links, and collect contacts at no cost. Paid plans add advanced analytics, automatic update notifications, and contact export.',
    },
    {
      question: 'Can I add links to any platform?',
      answer:
        'Yes. Add links to any website, social profile, or destination. Jovie routes visitors to the right one automatically based on context.',
    },
  ],
  bottomLine:
    'Linktree is a fine static link list. But if you want a profile that captures visitors, notifies them automatically, and adapts to what you share, that’s Jovie.',
};

import type { ComparisonData } from './types';

export const linkfireComparison: ComparisonData = {
  slug: 'linkfire',
  competitor: 'Linkfire',
  title: 'Jovie vs Linkfire',
  metaDescription:
    'Compare Jovie and Linkfire for independent musicians. See why artists choose Jovie for smart links, fan notifications, and AI tools without enterprise pricing.',
  heroHeadline: 'Jovie vs Linkfire',
  heroSubheadline:
    'Linkfire is built for labels. Jovie is built for independent artists. Here\u2019s how they compare.',
  features: [
    {
      name: 'Smart links for releases',
      jovie: true,
      competitor: true,
    },
    {
      name: 'Streaming platform routing',
      jovie: true,
      competitor: true,
    },
    {
      name: 'Pre-save links',
      jovie: true,
      competitor: true,
    },
    {
      name: 'Artist profile / link-in-bio',
      jovie: true,
      competitor: false,
      note: 'Linkfire focuses on individual links, not full artist profiles',
    },
    {
      name: 'Fan CRM & contact collection',
      jovie: true,
      competitor: false,
      note: 'Jovie collects and manages fan emails directly',
    },
    {
      name: 'Automatic fan notifications',
      jovie: true,
      competitor: false,
      note: 'Jovie notifies fans when you release new music',
    },
    {
      name: 'AI tools (press releases, strategy)',
      jovie: true,
      competitor: false,
    },
    {
      name: 'Release task management',
      jovie: true,
      competitor: false,
    },
    {
      name: 'Free tier',
      jovie: true,
      competitor: false,
      note: 'Linkfire requires a paid subscription; Jovie has a free tier',
    },
    {
      name: 'Built for independent artists',
      jovie: true,
      competitor: false,
      note: 'Linkfire is designed for labels and distributors',
    },
    {
      name: 'Enterprise label features',
      jovie: false,
      competitor: true,
      note: 'Linkfire has team management, label dashboards, and distributor integrations',
    },
    {
      name: 'Analytics',
      jovie: true,
      competitor: true,
      note: 'Both offer analytics; Jovie adds audience intelligence and fan CRM',
    },
  ],
  faq: [
    {
      question: 'Is Jovie a good alternative to Linkfire?',
      answer:
        'If you\u2019re an independent artist, yes. Linkfire is built for labels and distributors with enterprise pricing. Jovie is built for independent musicians with a free tier, fan CRM, automatic notifications, and AI tools. You get smart links plus everything else you need to run your release.',
    },
    {
      question: 'How much does Linkfire cost vs Jovie?',
      answer:
        'Linkfire requires a paid subscription with no free tier. Jovie has a free tier that includes smart links, artist profiles, and fan collection. Paid plans unlock advanced features.',
    },
    {
      question: 'Can I use Jovie if I\u2019m on a label?',
      answer:
        'Yes. Jovie works for any musician — independent or signed. But if your label already uses Linkfire for campaign-level analytics, Jovie is ideal as your personal artist platform for fan relationships and direct engagement.',
    },
  ],
  bottomLine:
    'Linkfire is powerful for labels managing hundreds of releases. But if you\u2019re an independent artist who needs smart links, a profile, fan data, and release automation without enterprise pricing, Jovie is the better fit.',
};

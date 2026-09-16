import { COMPANY_IDENTITY } from '@/data/companyIdentity';

export const ABOUT_COPY = {
  kicker: 'About',
  headline: COMPANY_IDENTITY.headline,
  support: `${COMPANY_IDENTITY.support} ${COMPANY_IDENTITY.seoDescription}`,
  metadataTitle: `About — ${COMPANY_IDENTITY.headline.replace(/\.$/, '')}`,
  metadataDescription: `${COMPANY_IDENTITY.definition} Founded by Tim White. Not affiliated with Jovie childcare.`,
  openGraphDescription: `${COMPANY_IDENTITY.definition} Founded by Tim White.`,
  organizationDescription: COMPANY_IDENTITY.definition,
  keywords: [
    'Jovie',
    'what is Jovie',
    'Jovie Technology',
    'Tim White Jovie',
    'public profile',
    'personal presence',
    'audience relationships',
  ],
  origin: {
    heading: 'Why Jovie Exists',
    paragraphs: [
      'I spent 15 years in music marketing. Worked with Armada Music, Universal Music, ran digital campaigns for artists like Tory Lanez and Megan Thee Stallion, and drove campaigns for brands like Google and the NFL.',
      'The whole time, I saw the same problem: the people who needed infrastructure the most were the ones who could never afford it. Labels have teams coordinating releases, managing fan data, planning rollouts. Independent artists have themselves and maybe a friend who is decent at Instagram.',
      'Jovie is what I wish existed when I was an artist: one product for presence, relationships, and growth, without reducing you to a category. For musicians, that still means smart links that route fans to the right streaming platform, a profile that converts visitors, audience intelligence, and AI that knows your career data — stream counts, tour dates, collaborations — not a blank prompt.',
    ],
    signoff: '— Tim White, Founder',
  },
  featuresHeading: 'What Jovie Does',
  features: [
    {
      title: 'Living Profile',
      description:
        'Your work, links, and story in one place people can actually find.',
    },
    {
      title: 'Relationships',
      description:
        'Give each person a next step — follow, subscribe, listen, buy, book, or reach out — without one funnel for everyone.',
    },
    {
      title: 'Audience',
      description:
        'See who is paying attention, what brought them, and what they may want next.',
    },
    {
      title: 'Adaptive',
      description:
        'Jovie adapts to your work without reducing you to a category.',
    },
    {
      title: 'For Artists',
      description:
        'Smart links, release notifications, and catalog tools when the work is music.',
    },
    {
      title: 'Payments',
      description:
        // ui-casing-allow: feature list copy with brand name
        'Let people support you directly with tips via Stripe — on your profile or through QR codes.',
    },
  ],
} as const;

export const ABOUT_FAQ_ITEMS = [
  {
    question: 'What is Jovie?',
    answer: `${COMPANY_IDENTITY.definition} Jovie is available at jov.ie.`,
  },
  {
    question: 'Is Jovie related to Jovie childcare or babysitting?',
    answer:
      'No. Jovie at jov.ie and Jovie the childcare franchise (jovie.com) are completely separate, unrelated companies in different industries. Jovie at jov.ie is operated by Jovie Technology Inc. The childcare franchise is operated by Bright Horizons Family Solutions.',
  },
  {
    question: 'Who founded Jovie?',
    answer:
      'Jovie was founded by Tim White, a music marketing veteran with 15+ years of experience working with labels like Armada Music and Universal Music, and running digital campaigns for artists like Tory Lanez and Megan Thee Stallion, and brands like Google and the NFL.',
  },
  {
    question: 'What does Jovie do?',
    answer:
      'Jovie gives you a living profile for your work, links, and story, plus a way to turn attention into a next step. For artists, that includes smart links, audience intelligence, release notifications, and AI that uses your actual career data.',
  },
  {
    question: 'Is Jovie free?',
    answer:
      'Yes, Jovie offers a free tier that lets you create a profile and start from your name. Paid plans unlock advanced analytics, notifications, contact export, and more.',
  },
  {
    question: 'How is Jovie different from Linktree?',
    answer:
      'Linktree is a general-purpose link list. Jovie is a living profile for presence and relationships — work, links, and a next step in one place. For artists, that includes smart links for releases, fan capture, and notifications when new music drops.',
  },
] as const;

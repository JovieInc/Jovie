import { COMPANY_IDENTITY } from '@/data/companyIdentity';

export const ABOUT_COPY = {
  kicker: 'About',
  headline: COMPANY_IDENTITY.headline,
  support: `${COMPANY_IDENTITY.support} ${COMPANY_IDENTITY.seoDescription}`,
  metadataTitle: `About Jovie: ${COMPANY_IDENTITY.headline.replace(/\.$/, '')}`,
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
      'I spent 15 years in music. My first single, "Take Me Over," came out independently in 2014 and went viral. Five singles signed to Armada Music. "The Deep End" with Cosmic Gate premiered on A State of Trance. Along the way I wrote and produced for We Are Loud, Justin Prime, and Orjan Nilsen, engineered for Lauryn Hill, and played more than 500 shows, opening for The Disco Biscuits and playing the final nights at Pacha NYC.',
      'I also ran digital marketing for the NFL, the NBA All-Star Game, Google, Netflix, and Hulu, work that won a Clio Award. The whole time, the same problem kept showing up: the people who needed infrastructure the most were the ones who could never afford it. Labels have teams coordinating releases, managing fan data, planning rollouts. Independent artists have themselves and maybe a friend who is decent at Instagram.',
      'Jovie is what I wish existed when I was an artist: one product for presence, relationships, and growth, without reducing you to a category. For musicians, Jovie routes fans to the right streaming platform, turns profile visits into relationships, surfaces audience signals, and gives AI the context of stream counts, tour dates, and collaborations.',
    ],
    signoff: 'Tim White, Founder',
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
        'Give each person the next step that fits: follow, subscribe, listen, buy, book, or reach out.',
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
        'Let people tip you directly through your profile or a QR code, with payments handled by Stripe.',
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
      'Jovie was founded by Tim White, an artist, producer, and engineer with 15+ years in music: 500+ live shows, five singles signed to Armada Music, songwriting and production for We Are Loud, Justin Prime, and Orjan Nilsen, engineering for Lauryn Hill, and a Clio Award for Hulu Pride Fest 2020.',
  },
  {
    question: 'What does Jovie do?',
    answer:
      'Jovie gives you a living profile for your work, links, and story, plus a way to turn attention into a next step. For artists, that includes smart links, audience intelligence, release notifications, and AI that uses your actual career data.',
  },
  {
    question: 'Is Jovie free?',
    answer:
      'Yes, Jovie offers a free tier that lets you create a profile and start with your name. Paid plans add advanced analytics, notifications, and contact export.',
  },
  {
    question: 'How is Jovie different from Linktree?',
    answer:
      'Linktree is a general-purpose link list. Jovie keeps your work, links, and a clear next step in one living profile. For artists, that includes smart links for releases, fan capture, and notifications when new music drops.',
  },
] as const;

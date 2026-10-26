import { SUPPORT_EMAIL } from '@/constants/domains';
import { APP_ROUTES } from '@/constants/routes';
import { COMPANY_IDENTITY } from '@/data/companyIdentity';

/**
 * /about copy. A general company page (MKT-D16): no segment language, no
 * founder biography (Tim, 2026-10-26). Every sentence is a plain fact that an
 * answer engine can lift whole. The one-sentence definition is derived from
 * COMPANY_IDENTITY.seoDescription so there is a single source of truth.
 */
export const ABOUT_FACTS = {
  founder: 'Tim White',
  operator: 'Jovie Technology Inc.',
  city: 'Los Angeles, California',
  supportEmail: SUPPORT_EMAIL,
  supportPath: '/support',
  /**
   * Verified identity links only (checked 2026-10-26). The GitHub organization
   * exists and links back to jov.ie. The founder channel is linked from the
   * live jov.ie/tim profile. The X handle is the canonical one from companyIdentity.
   */
  organizationSameAs: [
    'https://github.com/JovieInc',
    `https://x.com/${COMPANY_IDENTITY.xHandle.replace(/^@/, '')}`,
  ],
  founderSameAs: ['https://www.youtube.com/@timwhite'],
} as const;

export const ABOUT_DEFINITION =
  'Jovie is a public profile at jov.ie/yourname. It holds your work, your links, and a clear way to contact you, in one place you own, for people and for agents.';

export const ABOUT_COPY = {
  eyebrow: 'About',
  headline: 'A public profile that is easy to find and easy to reach.',
  metadataTitle: 'About Jovie',
  metadataDescription: `Jovie is a public profile that makes any creator easy to find and easy to reach, for people and for agents. Founded by ${ABOUT_FACTS.founder}. Based in Los Angeles.`,
  openGraphDescription: `Jovie is a public profile that makes any creator easy to find and easy to reach. Founded by ${ABOUT_FACTS.founder}.`,
  organizationDescription: COMPANY_IDENTITY.definition,
  keywords: [
    'Jovie',
    'what is Jovie',
    'Jovie Technology Inc.',
    'public profile',
  ],
  sections: [
    {
      id: 'what',
      label: 'What Jovie is',
      text: ABOUT_DEFINITION,
    },
    {
      id: 'why',
      label: 'Why it exists',
      text: 'Attention is spread across platforms you do not control. A profile you own gives people one place to find you, and one clear next step once they do.',
    },
    {
      id: 'who',
      label: 'Who makes it',
      text: `Founded by ${ABOUT_FACTS.founder}. Jovie is operated by ${ABOUT_FACTS.operator}, based in ${ABOUT_FACTS.city}.`,
    },
  ],
  contact: {
    id: 'contact',
    label: 'Contact',
    email: ABOUT_FACTS.supportEmail,
    supportPath: ABOUT_FACTS.supportPath,
    supportLabel: `jov.ie${ABOUT_FACTS.supportPath}`,
  },
  related: {
    id: 'related',
    label: 'Related',
    links: [
      { label: 'Product', href: APP_ROUTES.PRODUCT },
      { label: 'Pricing', href: APP_ROUTES.PRICING },
      { label: 'Changelog', href: APP_ROUTES.CHANGELOG },
    ],
  },
  questionsLabel: 'Questions',
} as const;

export const ABOUT_FAQ_ITEMS = [
  {
    question: 'What is Jovie?',
    answer:
      'Jovie is a public profile for any creator, at jov.ie. It makes you easy to find and easy to reach, for people and for agents.',
  },
  {
    question: 'Who founded Jovie?',
    answer: `Jovie was founded by ${ABOUT_FACTS.founder}.`,
  },
  {
    question: 'Where is Jovie based?',
    answer: `Jovie is operated by ${ABOUT_FACTS.operator}, based in ${ABOUT_FACTS.city}.`,
  },
  {
    question: 'How do I contact Jovie?',
    answer: `Email ${ABOUT_FACTS.supportEmail} or visit jov.ie${ABOUT_FACTS.supportPath}.`,
  },
  {
    question: 'Is Jovie free?',
    answer:
      'Yes. You can create a Jovie profile for free. Paid plans are listed at jov.ie/pricing.',
  },
  {
    question: 'Is Jovie related to Jovie childcare?',
    answer:
      'No. Jovie at jov.ie is a separate company from the childcare franchise at jovie.com.',
  },
] as const;

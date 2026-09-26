import { DOCS_URL, SUPPORT_EMAIL } from '@/constants/domains';

/** Shared support copy. Visible FAQs and their JSON-LD use these same answers. */
export const SUPPORT_SEO_COPY = {
  description:
    'Get help with Jovie. Browse documentation, find answers to common questions, or contact our support team.',
  keywords: [
    'Jovie support',
    'Jovie help',
    'Jovie documentation',
    'Jovie profile help',
    'Jovie account support',
    'Jovie contact',
  ],
} as const;

export const SUPPORT_FAQ_ITEMS = [
  {
    question: 'How do I get started with Jovie?',
    answer: `Start with Find yourself and follow the setup steps for your profile. Full walkthrough at ${DOCS_URL}/getting-started.`,
  },
  {
    question: 'How do music smart links work?',
    answer:
      'When you add a release, Jovie generates a smart link that detects each fan\u2019s preferred streaming platform and routes them there automatically.',
  },
  {
    question: 'How do I upgrade my plan?',
    answer:
      'Head to Settings \u2192 Billing to view available plans and manage your subscription.',
  },
  {
    question: 'How do I contact support?',
    answer: `Email ${SUPPORT_EMAIL} \u2014 we typically respond within one business day.`,
  },
] as const;

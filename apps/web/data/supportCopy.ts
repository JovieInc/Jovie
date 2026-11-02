/** Shared support copy for the /support contact-and-fallback surface. */
export const SUPPORT_SEO_COPY = {
  description:
    'Get help with Jovie. Browse the Help Center for guides and troubleshooting, or contact our support team.',
  keywords: [
    'Jovie support',
    'Jovie help',
    'Jovie documentation',
    'Jovie profile help',
    'Jovie account support',
    'Jovie contact',
  ],
} as const;

/** Visible /support copy. Components render these; no inline JSX strings. */
export const SUPPORT_PAGE_COPY = {
  hero: {
    // ui-casing-allow: sentence-case headings per marketing plan phase 1
    title: "We're here to help.",
    lead: 'Browse the Help Center or reach out to our team.',
  },
  channels: {
    title: 'How Can We Help?',
    helpCenter: {
      title: 'Help Center',
      description: 'Guides, troubleshooting, and walkthroughs.',
      cta: 'Browse the Help Center',
    },
    contact: {
      title: 'Contact Support',
      description:
        'Email our team with the page and search context already attached.',
      cta: 'Contact support',
    },
  },
  email: {
    title: 'Prefer Email?',
    body: 'Write to the team directly.',
  },
} as const;

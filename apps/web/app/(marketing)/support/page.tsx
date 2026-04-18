import type { Metadata } from 'next';
import { FaqSection, MarketingHero } from '@/components/marketing';
import { APP_NAME, BASE_URL } from '@/constants/app';
import { DOCS_URL, SUPPORT_EMAIL } from '@/constants/domains';
import { buildBreadcrumbSchema, buildFaqSchema } from '@/lib/constants/schemas';
import { SupportChannels, SupportCta } from './SupportContent';

const SUPPORT_FAQ_ITEMS = [
  {
    question: 'How do I get started with Jovie?',
    answer: `Create an account, pick your handle, connect Spotify or Apple Music, and set up your profile. Full walkthrough at ${DOCS_URL}/getting-started.`,
  },
  {
    question: 'How do smart links work?',
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
];

export const metadata: Metadata = {
  title: 'Support',
  description:
    'Get help with Jovie. Browse documentation, find answers to common questions, or contact our support team.',
  keywords: [
    'Jovie support',
    'Jovie help',
    'Jovie documentation',
    'music smart links help',
    'artist profile support',
    'Jovie contact',
  ],
  alternates: {
    canonical: `${BASE_URL}/support`,
  },
  openGraph: {
    title: `Support - ${APP_NAME}`,
    description:
      'Get help with Jovie. Browse documentation, find answers to common questions, or contact our support team.',
    url: `${BASE_URL}/support`,
    type: 'website',
  },
};

export const revalidate = false;

const FAQ_SCHEMA = buildFaqSchema(SUPPORT_FAQ_ITEMS);
const BREADCRUMB_SCHEMA = buildBreadcrumbSchema([
  { name: APP_NAME, url: BASE_URL },
  { name: 'Support', url: `${BASE_URL}/support` },
]);

export default function SupportPage() {
  return (
    <>
      <script type='application/ld+json'>{FAQ_SCHEMA}</script>
      <script type='application/ld+json'>{BREADCRUMB_SCHEMA}</script>

      <MarketingHero variant='left'>
        <p className='marketing-kicker'>Support</p>
        <h1 className='marketing-h1-linear mt-6 max-w-[10ch] text-primary-token'>
          We&apos;re here to help.
        </h1>
        <p className='mt-6 max-w-[60ch] text-lg leading-relaxed text-secondary-token'>
          Browse our docs or reach out to our team.
        </p>
      </MarketingHero>

      <SupportChannels />
      <FaqSection items={SUPPORT_FAQ_ITEMS} />
      <SupportCta />
    </>
  );
}

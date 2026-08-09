import { FaqSection, MarketingHero } from '@/components/marketing';
import { DOCS_URL, SUPPORT_EMAIL } from '@/constants/domains';
import {
  SupportChannels,
  SupportCta,
} from '../../app/(marketing)/support/SupportContent';

export const SUPPORT_FAQ_ITEMS = [
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
] as const;

export function SupportPageContent() {
  return (
    <>
      <MarketingHero variant='left'>
        <p className='text-sm font-medium text-tertiary-token'>Support</p>
        <h1 className='mt-6 text-4xl font-semibold tracking-tight text-balance text-primary-token sm:text-5xl lg:text-6xl'>
          We&apos;re Here To Help.
        </h1>
        <p className='mt-6 max-w-xl text-lg leading-relaxed text-secondary-token'>
          Browse our docs or reach out to our team.
        </p>
      </MarketingHero>

      <SupportChannels />
      <FaqSection
        items={[...SUPPORT_FAQ_ITEMS]}
        headingClassName='text-2xl font-semibold tracking-tight text-primary-token'
      />
      <SupportCta />
    </>
  );
}

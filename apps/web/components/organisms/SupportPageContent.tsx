import { FaqSection, MarketingHero } from '@/components/marketing';
import { SUPPORT_FAQ_ITEMS } from '@/data/supportCopy';
import {
  SupportChannels,
  SupportCta,
} from '../../app/(marketing)/support/SupportContent';

export { SUPPORT_FAQ_ITEMS } from '@/data/supportCopy';

export function SupportPageContent() {
  return (
    <>
      <MarketingHero
        variant='left'
        headingId='support-hero-heading'
        testId='support-hero'
      >
        <p className='text-sm font-medium text-tertiary-token'>Support</p>
        <h1
          id='support-hero-heading'
          className='system-b-marketing-route-title mt-6 text-primary-token'
        >
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

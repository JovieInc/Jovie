import { MarketingHero } from '@/components/marketing';
import {
  SupportChannels,
  SupportCta,
} from '../../app/(marketing)/support/SupportContent';

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
          Browse the Help Center or reach out to our team.
        </p>
      </MarketingHero>

      <SupportChannels />
      <SupportCta />
    </>
  );
}

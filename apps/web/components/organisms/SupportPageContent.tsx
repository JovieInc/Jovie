import Image from 'next/image';
import '@/components/marketing/MarketingRouteHero.css';
import {
  FaqSection,
  MarketingContainer,
  MarketingHero,
} from '@/components/marketing';
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
        variant='unstyled'
        headingId='support-hero-heading'
        testId='support-hero'
        className='marketing-hero-dock marketing-hero-dock--inset relative w-full overflow-hidden pt-20 pb-16 sm:pt-24 sm:pb-24 lg:pt-28 lg:pb-32'
      >
        <div className='marketing-route-hero__media' aria-hidden='true'>
          <Image
            src='/images/hero/support-hero.webp'
            alt=''
            fill
            sizes='100vw'
            priority
          />
        </div>
        <div className='marketing-route-hero__scrim' aria-hidden='true' />
        <div
          className='marketing-route-hero__accent marketing-route-hero__accent--blue'
          aria-hidden='true'
        />
        <MarketingContainer
          width='page'
          className='marketing-route-hero__content'
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
        </MarketingContainer>
      </MarketingHero>

      <SupportChannels />
      <FaqSection
        items={[...SUPPORT_FAQ_ITEMS]}
        heading='FAQ'
        headingClassName='text-2xl font-semibold tracking-tight text-primary-token'
      />
      <SupportCta />
    </>
  );
}

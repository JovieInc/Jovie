import { MarketingContainer, MarketingHero } from '@/components/marketing';
import { SUPPORT_PAGE_COPY } from '@/data/supportCopy';
import {
  SupportChannels,
  SupportCta,
} from '../../app/(marketing)/support/SupportContent';

/**
 * /support body. Matte hero (no texture or accent wash): the H1 is the one
 * focal point, then the two help paths, then the direct email fallback.
 */
export function SupportPageContent() {
  return (
    <>
      <MarketingHero
        variant='unstyled'
        headingId='support-hero-heading'
        testId='marketing-section-hero'
        sectionVariant='left-none'
        sectionOwner='apps/web/components/organisms/SupportPageContent.tsx'
        className='relative w-full pt-16 pb-12 sm:pt-20 sm:pb-16'
      >
        <MarketingContainer width='prose'>
          <h1
            id='support-hero-heading'
            className='system-b-marketing-route-title text-primary-token'
          >
            {SUPPORT_PAGE_COPY.hero.title}
          </h1>
          <p className='mt-6 max-w-xl text-lg leading-relaxed text-secondary-token'>
            {SUPPORT_PAGE_COPY.hero.lead}
          </p>
        </MarketingContainer>
      </MarketingHero>

      <SupportChannels />
      <SupportCta />
    </>
  );
}

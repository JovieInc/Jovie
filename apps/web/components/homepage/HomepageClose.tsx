// @coverage-via apps/web/tests/unit/home/HomepageCertifiedSections.test.tsx
'use client';

import { Button } from '@jovie/ui/atoms/button';
import { MarketingCtaSection } from '@/components/site/MarketingCtaSection';
import {
  HOMEPAGE_CERTIFIED_CONTEXT,
  HOMEPAGE_CERTIFIED_EVENTS,
} from '@/data/homepageCertifiedOptimization';
import { HOMEPAGE_LAUNCH_COPY } from '@/data/homepageLaunchCopy';
import { FEATURE_FLAGS } from '@/lib/flags/marketing-static';
import { HomepagePrimaryAction } from './HomepagePrimaryAction';

/** The gated close requests access; the open-state action returns to search. */
export function HomepageClose() {
  const { close } = HOMEPAGE_LAUNCH_COPY.certified;

  function focusProfileSearch() {
    document.getElementById('homepage-name-search')?.focus();
  }

  return (
    <MarketingCtaSection
      className='homepage-close'
      data-testid='marketing-section-cta'
      data-marketing-variant='editorial-search'
      data-homepage-testid='homepage-close'
      data-marketing-owner='apps/web/components/homepage/HomepageClose.tsx'
      data-rhythm='close'
      aria-labelledby='homepage-close-heading'
    >
      <div className='homepage-close__inner'>
        <h2
          id='homepage-close-heading'
          className='homepage-close__headline'
          data-homepage-section-heading
        >
          {close.headline}
        </h2>
        <div className='homepage-close__actions'>
          {FEATURE_FLAGS.WAITLIST_ENABLED ? (
            <HomepagePrimaryAction
              submitTestId='homepage-close-cta'
              submitAnalytics={{
                eventName: HOMEPAGE_CERTIFIED_EVENTS.ACCESS_REQUESTED,
                properties: {
                  ...HOMEPAGE_CERTIFIED_CONTEXT,
                  placement: 'close',
                },
              }}
            />
          ) : (
            <Button
              type='button'
              size='marketing'
              variant='primary'
              onClick={focusProfileSearch}
              data-testid='homepage-close-cta'
            >
              {close.action}
            </Button>
          )}
        </div>
      </div>
    </MarketingCtaSection>
  );
}

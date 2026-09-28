// @coverage-via apps/web/tests/unit/home/HomepageIdentitySections.test.tsx
'use client';

import { Button } from '@jovie/ui/atoms/button';
import { MarketingCtaSection } from '@/components/site/MarketingCtaSection';
import {
  HOMEPAGE_CERTIFIED_CONTEXT,
  HOMEPAGE_CERTIFIED_EVENTS,
} from '@/data/homepageCertifiedOptimization';
import { HOMEPAGE_IDENTITY_COPY } from '@/data/homepageIdentityCopy';
import { FEATURE_FLAGS } from '@/lib/flags/marketing-static';
import { HomepagePrimaryAction } from './HomepagePrimaryAction';
import './HomepageIdentity.css';

/**
 * Canonical Pen v3 close (2026-09-26, dark launch): one headline and the same
 * certified name search action as the hero (JOV-5085). The open-state action
 * returns focus to search.
 */
export function HomepageIdentityClose() {
  const { close } = HOMEPAGE_IDENTITY_COPY;

  function focusProfileSearch() {
    document.getElementById('homepage-name-search')?.focus();
  }

  return (
    <MarketingCtaSection
      className='homepage-identity-close'
      data-testid='marketing-section-cta'
      data-marketing-variant='editorial-search'
      data-homepage-testid='homepage-close'
      data-marketing-owner='apps/web/components/homepage/HomepageIdentityClose.tsx'
      data-rhythm='close'
      aria-labelledby='homepage-close-heading'
    >
      <div className='homepage-identity-close__inner'>
        <h2
          id='homepage-close-heading'
          className='homepage-identity-close__headline'
          data-homepage-section-heading
        >
          {close.headline}
        </h2>
        <div className='homepage-identity-close__actions'>
          {FEATURE_FLAGS.WAITLIST_ENABLED ? (
            <HomepagePrimaryAction
              appearance='editorial'
              inputId='homepage-close-name-search'
              placeholder={HOMEPAGE_IDENTITY_COPY.hero.search.placeholder}
              submitLabel={HOMEPAGE_IDENTITY_COPY.hero.search.action}
              submitTestId='homepage-close-cta'
              submitAnalytics={{
                eventName: HOMEPAGE_CERTIFIED_EVENTS.SEARCH_SUBMITTED,
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

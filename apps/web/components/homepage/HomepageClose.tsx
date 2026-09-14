// @coverage-via apps/web/tests/unit/home/HomepageCertifiedSections.test.tsx
'use client';

import { Check, Copy } from 'lucide-react';
import { Logo } from '@/components/atoms/Logo';
import { HeroSpotifySearch } from '@/components/features/home/HeroSpotifySearch';
import { MarketingCtaSection } from '@/components/site/MarketingCtaSection';
import { BASE_URL } from '@/constants/app';
import { APP_ROUTES } from '@/constants/routes';
import {
  HOMEPAGE_CERTIFIED_CONTEXT,
  HOMEPAGE_CERTIFIED_EVENTS,
} from '@/data/homepageCertifiedOptimization';
import { HOMEPAGE_LAUNCH_COPY } from '@/data/homepageLaunchCopy';
import { useClipboard } from '@/hooks/useClipboard';

const AGENT_ONBOARDING_PAYLOAD = [
  `Use Jovie's read-only public artist context: ${BASE_URL}${APP_ROUTES.CLI}`,
  `Docs: ${BASE_URL}/llms.txt`,
  'No account, API key, writes, or telemetry required.',
].join('\n');

/**
 * Section 9: the close. Repeats the name search under the locked closing
 * lines and gives agents a read-only onboarding payload with a visible
 * clipboard fallback.
 */
export function HomepageClose() {
  const { close } = HOMEPAGE_LAUNCH_COPY.certified;
  const { search } = HOMEPAGE_LAUNCH_COPY.hero;
  const { copy, isError, isSuccess } = useClipboard({
    onError: () => undefined,
  });

  const copyState = isSuccess ? 'copied' : isError ? 'fallback' : 'idle';

  async function copyAgentOnboarding() {
    await copy(AGENT_ONBOARDING_PAYLOAD);
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
        <p className='homepage-close__support'>{close.support}</p>
        <div
          className='homepage-close__search'
          data-testid='homepage-close-search'
        >
          <HeroSpotifySearch
            appearance='editorial'
            inputId='homepage-close-name-search'
            placeholder={search.placeholder}
            submitLabel={search.action}
            submitTestId='homepage-close-cta'
            submitAnalytics={{
              eventName: HOMEPAGE_CERTIFIED_EVENTS.SEARCH_SUBMITTED,
              properties: {
                ...HOMEPAGE_CERTIFIED_CONTEXT,
                placement: 'close',
              },
            }}
          />
        </div>
        <div
          className='homepage-close__actions'
          data-testid='homepage-close-actions'
        >
          <button
            type='button'
            className='homepage-close__copy'
            onClick={() => void copyAgentOnboarding()}
            data-copy-state={copyState}
            aria-label={
              copyState === 'copied'
                ? 'Agent onboarding link copied'
                : 'Copy agent onboarding link'
            }
          >
            <span>
              {copyState === 'copied' ? 'Copied' : 'Onboard your agent'}
            </span>
            {copyState === 'copied' ? (
              <Check aria-hidden='true' size={14} />
            ) : (
              <Copy aria-hidden='true' size={14} />
            )}
          </button>
        </div>
        {copyState === 'fallback' ? (
          <textarea
            aria-label='Agent Onboarding Link'
            className='homepage-close__copy-fallback'
            onFocus={event => event.currentTarget.select()}
            readOnly
            value={AGENT_ONBOARDING_PAYLOAD}
            rows={3}
          />
        ) : null}
        <span className='sr-only' role='status' aria-live='polite'>
          {copyState === 'copied'
            ? 'Agent onboarding link copied.'
            : copyState === 'fallback'
              ? 'Clipboard unavailable. Select the onboarding link below.'
              : ''}
        </span>
        <div className='homepage-close__mark' data-testid='homepage-close-mark'>
          <Logo variant='word' size='xs' aria-hidden />
        </div>
      </div>
    </MarketingCtaSection>
  );
}

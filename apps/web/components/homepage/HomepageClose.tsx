// @coverage-via apps/web/tests/unit/home/HomepageCertifiedSections.test.tsx
'use client';

import { Button } from '@jovie/ui';
import { Check, Copy } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { MarketingCtaSection } from '@/components/site/MarketingCtaSection';
import { BASE_URL } from '@/constants/app';
import { APP_ROUTES } from '@/constants/routes';
import { HOMEPAGE_LAUNCH_COPY } from '@/data/homepageLaunchCopy';

const AGENT_ONBOARDING_PAYLOAD = [
  `Use Jovie's read-only public artist context: ${BASE_URL}${APP_ROUTES.CLI}`,
  `Docs: ${BASE_URL}/llms.txt`,
  'No account, API key, writes, or telemetry required.',
].join('\n');

/** Founder-locked homepage close CTA. */
export function HomepageClose() {
  const { close } = HOMEPAGE_LAUNCH_COPY.certified;
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'fallback'>(
    'idle'
  );

  async function copyAgentOnboardingUrl() {
    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error('clipboard-unavailable');
      }
      await navigator.clipboard.writeText(AGENT_ONBOARDING_PAYLOAD);
      setCopyState('copied');
    } catch {
      setCopyState('fallback');
    }
  }

  function returnToNameSearch() {
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
        {close.support ? (
          <p className='homepage-close__support'>{close.support}</p>
        ) : null}
        <div
          className='homepage-close__actions'
          data-testid='homepage-close-actions'
        >
          <Button asChild size='marketing' variant='primary'>
            <Link
              href='#homepage-name-search'
              onClick={returnToNameSearch}
              data-testid='homepage-close-profile-cta'
            >
              Find your profile
            </Link>
          </Button>
          <button
            type='button'
            className='homepage-close__copy'
            onClick={() => void copyAgentOnboardingUrl()}
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
      </div>
    </MarketingCtaSection>
  );
}

'use client';

import { Button } from '@jovie/ui';
import * as Sentry from '@sentry/nextjs';
import { CheckCircle2, TriangleAlert } from 'lucide-react';
import { useEffect, useState } from 'react';
import { ContentSectionHeader } from '@/components/molecules/ContentSectionHeader';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { StandaloneProductPage } from '@/components/organisms/StandaloneProductPage';

class SentryExampleFrontendError extends Error {
  constructor(message: string | undefined) {
    super(message);
    this.name = 'SentryExampleFrontendError';
  }
}

export function SentryExamplePageClient() {
  const [hasSentError, setHasSentError] = useState(false);
  const [isConnected, setIsConnected] = useState(true);

  useEffect(() => {
    async function checkConnectivity() {
      try {
        const result = await Sentry.diagnoseSdkConnectivity();
        setIsConnected(result !== 'sentry-unreachable');
      } catch (error) {
        console.error('Failed to check Sentry connectivity:', error);
        setIsConnected(false);
      }
    }

    checkConnectivity();
  }, []);

  return (
    <StandaloneProductPage width='md' centered>
      <ContentSurfaceCard surface='details' className='overflow-hidden'>
        <ContentSectionHeader
          density='compact'
          title='Sentry example page'
          subtitle='Throw a sample frontend error and confirm it reaches the Jovie Sentry project.'
        />

        <div className='space-y-5 px-5 py-5 text-center sm:px-6'>
          <div className='space-y-3'>
            <p className='text-[13px] leading-6 text-secondary-token'>
              Click the button below, then confirm the sample error on the{' '}
              <a
                target='_blank'
                rel='noreferrer'
                href='https://jovie.sentry.io/issues/?project=4510479236792320'
                className='underline decoration-(--linear-app-frame-seam) underline-offset-4 transition-colors hover:text-primary-token'
              >
                Issues page
              </a>
              . For setup details, read the{' '}
              <a
                target='_blank'
                rel='noreferrer'
                href='https://docs.sentry.io/platforms/javascript/guides/nextjs/'
                className='underline decoration-(--linear-app-frame-seam) underline-offset-4 transition-colors hover:text-primary-token'
              >
                Next.js docs
              </a>
              {'.'}
            </p>
          </div>

          <div className='flex justify-center'>
            <Button
              type='button'
              size='lg'
              onClick={async () => {
                await Sentry.startSpan(
                  {
                    name: 'Example Frontend/Backend Span',
                    op: 'test',
                  },
                  async () => {
                    const res = await fetch('/api/sentry-example-api');
                    if (!res.ok) {
                      setHasSentError(true);
                    }
                  }
                );
                throw new SentryExampleFrontendError(
                  'This error is raised on the frontend of the example page.'
                );
              }}
              disabled={!isConnected}
            >
              Throw Sample Error
            </Button>
          </div>

          {hasSentError ? (
            <ContentSurfaceCard
              surface='nested'
              className='border-[color-mix(in_oklab,var(--linear-success)_30%,var(--linear-app-frame-seam))] bg-[color-mix(in_oklab,var(--linear-success)_10%,var(--linear-app-content-surface))] p-4'
            >
              <div className='flex items-center justify-center gap-2 text-[13px] font-semibold text-primary-token'>
                <CheckCircle2 className='h-4 w-4 text-[var(--linear-success)]' />
                Error sent to Sentry.
              </div>
            </ContentSurfaceCard>
          ) : null}

          {isConnected ? null : (
            <ContentSurfaceCard
              surface='nested'
              className='border-[color-mix(in_oklab,var(--linear-warning)_30%,var(--linear-app-frame-seam))] bg-[color-mix(in_oklab,var(--linear-warning)_10%,var(--linear-app-content-surface))] p-4'
            >
              <div className='space-y-2 text-center'>
                <div className='flex items-center justify-center gap-2 text-[13px] font-semibold text-primary-token'>
                  <TriangleAlert className='h-4 w-4 text-[var(--linear-warning)]' />
                  Sentry connectivity looks blocked.
                </div>
                <p className='text-[13px] leading-5 text-secondary-token'>
                  Network requests to Sentry may be blocked by an ad blocker or
                  local filtering rule.
                </p>
              </div>
            </ContentSurfaceCard>
          )}
        </div>
      </ContentSurfaceCard>
    </StandaloneProductPage>
  );
}

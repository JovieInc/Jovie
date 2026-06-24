'use client';

import { Button } from '@jovie/ui';
import * as Sentry from '@sentry/nextjs';
import { CheckCircle2 } from 'lucide-react';
import { useState } from 'react';
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
            <p className='text-app leading-6 text-secondary-token'>
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
            >
              Throw Sample Error
            </Button>
          </div>

          {hasSentError ? (
            <ContentSurfaceCard
              surface='nested'
              className='border-[color-mix(in_oklab,var(--linear-success)_30%,var(--linear-app-frame-seam))] bg-[color-mix(in_oklab,var(--linear-success)_10%,var(--linear-app-content-surface))] p-4'
            >
              <div className='flex items-center justify-center gap-2 text-app font-semibold text-primary-token'>
                <CheckCircle2 className='h-4 w-4 text-(--linear-success)' />
                Error sent to Sentry.
              </div>
            </ContentSurfaceCard>
          ) : null}
        </div>
      </ContentSurfaceCard>
    </StandaloneProductPage>
  );
}

'use client';

import { Button } from '@jovie/ui';
import { CheckCircle2 } from 'lucide-react';
import { useCallback, useState } from 'react';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { useLinkVerificationMutation } from '@/lib/queries';

interface InterstitialClientProps {
  readonly shortId: string;
  readonly challengeToken: string;
  readonly titleAlias: string;
  readonly domain: string;
}

export function InterstitialClient({
  shortId,
  challengeToken,
  titleAlias,
  domain,
}: Readonly<InterstitialClientProps>) {
  const [error, setError] = useState<string | null>(null);
  const [isVerified, setIsVerified] = useState(false);

  const { mutate: verifyLink, isPending: isVerifying } =
    useLinkVerificationMutation({
      onSuccess: data => {
        setIsVerified(true);
        setTimeout(() => {
          globalThis.location.replace(data.url);
        }, 1000);
      },
      onError: err => {
        setError(err.message || 'An error occurred');
      },
    });

  const handleContinue = useCallback(() => {
    if (isVerifying) return;
    setError(null);

    verifyLink({
      shortId,
      challengeToken,
      timestamp: Date.now(),
    });
  }, [challengeToken, isVerifying, shortId, verifyLink]);

  if (isVerified) {
    return (
      <div className='space-y-4 text-center'>
        <div className='mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-[color-mix(in_oklab,var(--linear-success)_28%,var(--linear-app-frame-seam))] bg-[color-mix(in_oklab,var(--linear-success)_10%,var(--linear-app-content-surface))]'>
          <CheckCircle2
            className='h-7 w-7 text-[var(--linear-success)]'
            aria-hidden='true'
          />
        </div>
        <p className='text-[13px] font-[560] text-primary-token'>
          Verified. Redirecting...
        </p>
      </div>
    );
  }

  return (
    <div className='space-y-4'>
      <noscript>
        <p className='mb-4 text-[13px] text-[var(--linear-error)]'>
          JavaScript is required to continue to this link.
        </p>
      </noscript>

      <ContentSurfaceCard surface='nested' className='space-y-1.5 p-4'>
        <p className='text-[11px] uppercase tracking-[0.14em] text-tertiary-token'>
          Destination
        </p>
        <p className='text-[13px] font-[560] text-primary-token'>
          {titleAlias}
        </p>
        {domain !== 'External Site' ? (
          <p className='text-[12px] text-tertiary-token'>Domain: {domain}</p>
        ) : null}
      </ContentSurfaceCard>

      {error ? (
        <ContentSurfaceCard
          surface='nested'
          className='border-[color-mix(in_oklab,var(--linear-error)_30%,var(--linear-app-frame-seam))] bg-[color-mix(in_oklab,var(--linear-error)_10%,var(--linear-app-content-surface))] p-4'
        >
          <p className='text-[13px] text-primary-token'>{error}</p>
        </ContentSurfaceCard>
      ) : null}

      <Button
        size='lg'
        className='w-full'
        onClick={handleContinue}
        loading={isVerifying}
      >
        Continue to link
      </Button>

      <p className='text-center text-[12px] text-tertiary-token'>
        By continuing, you acknowledge this link leads to external content.
      </p>
    </div>
  );
}

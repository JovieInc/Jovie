'use client';

import { Button } from '@jovie/ui';
import { CheckCircle2 } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { APP_ROUTES } from '@/constants/routes';
import { page, track } from '@/lib/analytics';

type VerificationState = 'checking' | 'verified' | 'invalid';

export function YoutubeThumbnailSuccessClient({
  founderPriceId,
}: Readonly<{ founderPriceId: string | null }>) {
  const searchParams = useSearchParams();
  const sessionId = searchParams.get('session_id');
  const [verification, setVerification] =
    useState<VerificationState>('checking');

  useEffect(() => {
    page('youtube_thumbnail_checkout_success', {
      page_type: 'billing',
      section: 'success',
      conversion: true,
    });
  }, []);

  useEffect(() => {
    if (!sessionId || !founderPriceId) {
      setVerification('invalid');
      return;
    }

    const controller = new AbortController();
    void fetch(
      `/api/billing/checkout-session?session_id=${encodeURIComponent(sessionId)}`,
      { cache: 'no-store', signal: controller.signal }
    )
      .then(async response => {
        if (!response.ok) return null;
        return (await response.json()) as {
          plan?: string | null;
          priceId?: string | null;
        };
      })
      .then(receipt => {
        if (controller.signal.aborted) return;
        const verified =
          receipt?.plan === 'pro' && receipt.priceId === founderPriceId;
        setVerification(verified ? 'verified' : 'invalid');
        if (verified) {
          track('subscription_success', {
            flow_type: 'youtube_thumbnails_founder',
          });
        }
      })
      .catch(error => {
        if (controller.signal.aborted) return;
        console.error(
          '[youtube-thumbnails] checkout verification failed',
          error
        );
        setVerification('invalid');
      });

    return () => controller.abort();
  }, [founderPriceId, sessionId]);

  if (verification === 'checking') {
    return (
      <div className='mx-auto min-h-80 max-w-xl py-12' aria-live='polite'>
        <div className='h-8 w-64 skeleton rounded-md' />
        <div className='mt-4 h-20 w-full skeleton rounded-md' />
      </div>
    );
  }

  if (verification === 'invalid') {
    return (
      <div className='mx-auto min-h-80 max-w-xl py-12'>
        <h1 className='text-3xl font-semibold text-primary-token'>
          Checkout Confirmation Pending
        </h1>
        <p className='mt-4 leading-7 text-secondary-token'>
          Your receipt is not available yet. Open billing to confirm the
          subscription or try this page again in a moment.
        </p>
        <Button asChild variant='secondary' className='mt-6'>
          <Link href='/billing'>Open billing</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className='mx-auto min-h-80 max-w-xl py-12 text-center'>
      <CheckCircle2
        aria-hidden='true'
        className='mx-auto size-10 text-accent-token'
      />
      <p className='homepage-section-eyebrow mt-5'>Founder access active</p>
      <h1 className='mt-3 text-3xl font-semibold tracking-tight text-primary-token sm:text-4xl'>
        Your Thumbnail Loop Is Unlocked.
      </h1>
      <p className='mt-4 leading-7 text-secondary-token'>
        Approved candidates and workflow requests will land in your Inbox. We
        will not automate a new style or change a real person’s identity.
      </p>
      <Button asChild className='mt-7'>
        <Link href={APP_ROUTES.DASHBOARD}>Open your Inbox</Link>
      </Button>
    </div>
  );
}

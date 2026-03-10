'use client';

import { Button } from '@jovie/ui';
import { CheckCircle } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { APP_ROUTES } from '@/constants/routes';
import { page, track } from '@/lib/analytics';
import { useBillingStatusQuery } from '@/lib/queries/useBillingStatusQuery';

function getVerificationButtonLabel(state: string): string {
  if (state === 'success') return 'Verification requested';
  if (state === 'submitting') return 'Sending request...';
  return 'Request Verification';
}

export default function CheckoutSuccessPage() {
  const [requestState, setRequestState] = useState<
    'idle' | 'submitting' | 'success' | 'error'
  >('idle');
  const { data: billingData } = useBillingStatusQuery();
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    track('subscription_success', {
      flow_type: 'checkout',
      page: 'success',
    });

    page('checkout_success', {
      page_type: 'billing',
      section: 'success',
      conversion: true,
    });
  }, []);

  const handleRequestVerification = async () => {
    if (requestState === 'submitting') {
      return;
    }

    setRequestState('submitting');
    setFeedback(null);

    try {
      const response = await fetch('/api/verification/request', {
        method: 'POST',
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(
          body?.error ??
            'We could not send your request. Please try again in a moment.'
        );
      }

      track('verification_request_submitted', {
        source: 'billing_success',
      });
      setRequestState('success');
      setFeedback('Request sent. Tim has been notified.');
    } catch (error) {
      setRequestState('error');
      setFeedback(
        error instanceof Error
          ? error.message
          : 'We could not send your request. Please try again in a moment.'
      );
    }
  };

  return (
    <div className='flex min-h-[calc(100dvh-4rem)] items-center justify-center'>
      <div className='w-full max-w-xl px-6 text-center'>
        <div className='mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[var(--color-success-subtle)]'>
          <CheckCircle className='h-8 w-8 text-[var(--color-success)]' />
        </div>

        <h1 className='mt-6 text-3xl font-bold text-primary-token'>
          You&apos;re eligible for verification.
        </h1>

        <p className='mt-4 text-lg text-secondary-token'>
          Your Pro plan is active and branding is now removed. If you&apos;d
          like the verified badge, request a quick manual review.
        </p>

        <div className='mt-8 flex flex-col items-center gap-3'>
          {billingData?.isPro ? (
            <Button
              onClick={handleRequestVerification}
              disabled={
                requestState === 'submitting' || requestState === 'success'
              }
            >
              {getVerificationButtonLabel(requestState)}
            </Button>
          ) : null}

          {feedback ? (
            <output className='text-sm text-secondary-token'>{feedback}</output>
          ) : null}

          <Button asChild variant='ghost'>
            <Link href={APP_ROUTES.DASHBOARD}>Go to Dashboard</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

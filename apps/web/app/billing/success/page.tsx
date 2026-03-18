'use client';

import { Button } from '@jovie/ui';
import { BarChart3, Eye, PartyPopper, ShieldCheck, Upload } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ConfettiOverlay } from '@/components/atoms/Confetti';
import { APP_ROUTES } from '@/constants/routes';
import { page, track } from '@/lib/analytics';
import { getPlanDisplayName } from '@/lib/entitlements/registry';
import { useBillingStatusQuery } from '@/lib/queries';

/* ------------------------------------------------------------------ */
/*  Unlocked features                                                 */
/* ------------------------------------------------------------------ */

const UNLOCKED_FEATURES = [
  {
    icon: Eye,
    title: 'Branding Removed',
    description: 'Your profile now shows your brand, not ours.',
  },
  {
    icon: BarChart3,
    title: 'Advanced Analytics',
    description: 'See 90-day trends, audience demographics, and more.',
  },
  {
    icon: Upload,
    title: 'Contact Export',
    description: 'Download your fan list and use it anywhere.',
  },
] as const;

/* ------------------------------------------------------------------ */
/*  Verification helper                                               */
/* ------------------------------------------------------------------ */

function getVerificationButtonLabel(state: string): string {
  if (state === 'success') return 'Verification requested';
  if (state === 'submitting') return 'Sending request...';
  return 'Request Verification';
}

/* ------------------------------------------------------------------ */
/*  Page                                                              */
/* ------------------------------------------------------------------ */

export default function CheckoutSuccessPage() {
  const [requestState, setRequestState] = useState<
    'idle' | 'submitting' | 'success' | 'error'
  >('idle');
  const { data: billingData } = useBillingStatusQuery();
  const [feedback, setFeedback] = useState<string | null>(null);
  const [isVisible, setIsVisible] = useState(false);

  const planName = getPlanDisplayName(billingData?.plan);

  useEffect(() => {
    track('subscription_success', {
      flow_type: 'checkout',
      page: 'success',
    });
    track('checkout_celebration_shown', {
      planType: billingData?.plan ?? 'unknown',
    });
    page('checkout_success', {
      page_type: 'billing',
      section: 'success',
      conversion: true,
    });

    const frame = requestAnimationFrame(() => setIsVisible(true));
    return () => cancelAnimationFrame(frame);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleRequestVerification = async () => {
    if (requestState === 'submitting') return;

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
    <div className='relative flex min-h-[calc(100dvh-4rem)] items-center justify-center overflow-hidden'>
      <ConfettiOverlay />

      {/* Content */}
      <div
        className={`relative z-10 w-full max-w-xl px-6 text-center transition-all duration-700 ease-out ${
          isVisible
            ? 'opacity-100 translate-y-0 scale-100'
            : 'opacity-0 translate-y-8 scale-95'
        }`}
      >
        <div className='mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[var(--color-success-subtle)]'>
          <PartyPopper className='h-8 w-8 text-[var(--color-success)]' />
        </div>

        <h1 className='mt-6 text-3xl font-bold text-primary-token'>
          Welcome to {planName}!
        </h1>

        <p className='mt-3 text-lg text-secondary-token'>
          Your plan is active. Here&apos;s what you just unlocked:
        </p>

        {/* Feature cards */}
        <div className='mt-8 grid gap-4 sm:grid-cols-3'>
          {UNLOCKED_FEATURES.map(feature => (
            <div
              key={feature.title}
              className='rounded-xl border border-subtle bg-surface-1 p-4 text-left'
            >
              <feature.icon
                className='h-5 w-5 text-[var(--linear-accent)]'
                aria-hidden='true'
              />
              <p className='mt-2 text-sm font-medium text-primary-token'>
                {feature.title}
              </p>
              <p className='mt-1 text-xs text-tertiary-token'>
                {feature.description}
              </p>
            </div>
          ))}
        </div>

        {/* CTAs */}
        <div className='mt-8 flex flex-col items-center gap-3'>
          <Button asChild>
            <Link href={APP_ROUTES.DASHBOARD}>Go to Dashboard</Link>
          </Button>

          {billingData?.isPro ? (
            <button
              type='button'
              onClick={handleRequestVerification}
              disabled={
                requestState === 'submitting' || requestState === 'success'
              }
              className='inline-flex items-center gap-1.5 text-sm text-secondary-token transition-colors hover:text-primary-token disabled:opacity-50'
            >
              <ShieldCheck className='h-4 w-4' aria-hidden='true' />
              {getVerificationButtonLabel(requestState)}
            </button>
          ) : null}

          {feedback ? (
            <output className='text-sm text-secondary-token'>{feedback}</output>
          ) : null}
        </div>
      </div>
    </div>
  );
}

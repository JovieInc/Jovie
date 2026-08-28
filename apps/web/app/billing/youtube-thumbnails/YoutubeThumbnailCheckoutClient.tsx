'use client';

import { Button } from '@jovie/ui';
import { ArrowRight, ShieldCheck } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { track } from '@/lib/analytics';
import { useCheckoutMutation } from '@/lib/queries';

export function YoutubeThumbnailCheckoutClient({
  priceId,
}: Readonly<{ priceId: string | null }>) {
  const searchParams = useSearchParams();
  const checkout = useCheckoutMutation();
  const wasCancelled = searchParams.get('checkout') === 'cancel';

  const startCheckout = () => {
    if (!priceId || checkout.isPending) return;

    track('checkout_initiated', {
      flow_type: 'youtube_thumbnails_founder',
      price_id: priceId,
    });

    checkout.mutate(
      { priceId, source: 'youtube_thumbnails' },
      {
        onSuccess: data => {
          track('checkout_redirect', {
            flow_type: 'youtube_thumbnails_founder',
            price_id: priceId,
          });
          globalThis.location.href = data.url;
        },
      }
    );
  };

  const errorMessage = checkout.error
    ? checkout.error instanceof Error
      ? checkout.error.message
      : 'Unable to start checkout.'
    : null;

  return (
    <div className='mx-auto min-h-[28rem] max-w-xl py-8 sm:py-12'>
      <p className='homepage-section-eyebrow'>YouTube Thumbnails</p>
      <h1 className='mt-3 text-3xl font-semibold tracking-tight text-primary-token sm:text-4xl'>
        Founder Access
      </h1>
      <p className='mt-4 text-base leading-7 text-secondary-token'>
        Unlimited candidate generation and up to 10 native YouTube experiment
        starts each month. Your approved identity and style rules stay locked.
      </p>

      <div className='mt-8 border-y border-subtle py-6'>
        <div className='flex items-baseline justify-between gap-4'>
          <span className='text-sm font-medium text-primary-token'>
            Monthly subscription
          </span>
          <span className='text-2xl font-semibold text-primary-token'>
            $29
            <span className='ml-1 text-sm font-normal text-tertiary-token'>
              / month
            </span>
          </span>
        </div>
        <div className='mt-5 flex items-start gap-2 text-sm leading-6 text-secondary-token'>
          <ShieldCheck
            aria-hidden='true'
            className='mt-0.5 size-4 shrink-0 text-accent-token'
          />
          <p>
            New styles and any move to full automation still require your
            explicit approval.
          </p>
        </div>
      </div>

      {wasCancelled ? (
        <p className='mt-5 text-sm text-secondary-token' role='status'>
          Checkout was cancelled. Nothing was charged.
        </p>
      ) : null}
      {errorMessage ? (
        <p className='mt-5 text-sm text-destructive' role='alert'>
          {errorMessage}
        </p>
      ) : null}
      {!priceId ? (
        <p className='mt-5 text-sm text-destructive' role='alert'>
          Founder checkout is temporarily unavailable.
        </p>
      ) : null}

      <Button
        className='mt-6 w-full'
        disabled={!priceId || checkout.isPending}
        onClick={startCheckout}
        size='lg'
      >
        {checkout.isPending ? 'Opening secure checkout…' : 'Continue to Stripe'}
        {!checkout.isPending ? (
          <ArrowRight aria-hidden='true' className='ml-2 size-4' />
        ) : null}
      </Button>
      <p className='mt-3 text-center text-xs text-tertiary-token'>
        Cancel any time. No powered-by link is required on the founder plan.
      </p>
    </div>
  );
}

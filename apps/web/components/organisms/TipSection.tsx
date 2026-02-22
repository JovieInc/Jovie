'use client';

import { Button } from '@jovie/ui';
import { ArrowLeft } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { QRCodeCard } from '@/components/molecules/QRCodeCard';
import { TipSelector } from '@/components/molecules/TipSelector';
import { captureError } from '@/lib/error-tracking';
import { cn } from '@/lib/utils';

const ALLOWED_VENMO_HOSTS = new Set(['venmo.com', 'www.venmo.com']);
const CARD_CLASSES =
  'rounded-2xl border border-subtle bg-surface-1 p-6 shadow-sm';

function ApplePayLogo({ className }: { readonly className?: string }) {
  return (
    <svg
      className={className}
      viewBox='0 0 165 40'
      fill='currentColor'
      aria-hidden='true'
    >
      <path d='M30.927 4.18C29.187 6.166 26.507 7.71 23.827 7.468c-.33-2.615 .952-5.396 2.527-7.139C28.094-1.663 30.97-.2 33.32.042c.28 2.697-.79 5.354-2.394 7.137ZM33.287 8.073c-3.716-.222-6.884 2.113-8.65 2.113-1.8 0-4.518-1.99-7.448-1.941-3.832.058-7.38 2.229-9.346 5.66-4.004 6.864-1.024 17.042 2.83 22.636 1.91 2.764 4.154 5.85 7.134 5.74 2.864-.116 3.938-1.85 7.398-1.85 3.436 0 4.42 1.85 7.432 1.793 3.088-.05 5.018-2.78 6.928-5.56 2.148-3.172 3.022-6.247 3.072-6.412-.066-.033-5.908-2.28-5.958-9.013-.05-5.636 4.6-8.35 4.814-8.497-2.63-3.877-6.72-4.308-8.206-4.416v-.253Z' />
      <path d='M68.264 2.475c7.612 0 12.905 5.242 12.905 12.88 0 7.665-5.396 12.932-13.11 12.932h-8.432v13.39h-6.088V2.474h14.725Zm-8.637 20.612h6.984c5.294 0 8.33-2.86 8.33-7.716 0-4.856-3.036-7.69-8.306-7.69h-7.008v15.406ZM82.783 35.057c0-5.012 3.832-8.1 10.64-8.458l7.872-.44v-2.24c0-3.19-2.14-5.088-5.73-5.088-3.384 0-5.524 1.62-6.036 4.114h-5.576c.308-5.14 4.652-8.924 11.818-8.924 6.934 0 11.382 3.652 11.382 9.36v19.594h-5.628v-4.676h-.128c-1.672 3.14-5.294 5.088-9.05 5.088-5.628 0-9.564-3.472-9.564-8.33Zm18.512-2.522v-2.292l-7.084.416c-3.514.234-5.5 1.826-5.5 4.298 0 2.524 2.064 4.168 5.216 4.168 4.086 0 7.368-2.782 7.368-6.59ZM111.336 49.744V44.86c.41.104 1.336.104 1.798.104 2.576 0 3.96-1.078 4.808-3.862l.514-1.698-10.332-28.016h6.398l7.16 22.36h.102l7.16-22.36h6.242L124.596 41.7c-2.474 6.876-5.32 9.1-11.306 9.1-.462 0-1.542-.078-1.954-.156v-1.1Z' />
    </svg>
  );
}

function VenmoLogo({ className }: { readonly className?: string }) {
  return (
    <svg
      className={className}
      viewBox='0 0 600 128'
      fill='currentColor'
      aria-hidden='true'
    >
      <path d='M110.6 1.64c6.36 10.48 9.24 21.28 9.24 34.96 0 43.56-37.2 100.12-67.4 128H4.44L0 8.12l46.2-4.4 15.04 120.56c13.92-22.72 31.16-58.48 31.16-82.8 0-13.04-2.2-21.88-5.76-29.48L110.6 1.64Z' />
      <path d='M188.04 79.08c0 20.68-9.88 49.88-30.28 70.24l-42.16 3.72 5.88-42.44c-2.64 4.68-8.56 10.08-15.68 10.08-15.04 0-23-16.48-23-34.96 0-32.84 17.12-67.08 47.2-67.08 10.52 0 20.68 4.68 27.32 12.16l-3.08-10.48 43.12-3.48-9.32 62.24Zm-39.24-20.4c-3.68-5.04-8.6-7.56-14.24-7.56-13.64 0-22.6 21.28-22.6 39.48 0 10.76 3.96 18.32 11.52 18.32 7.56 0 14.12-7.88 17.28-15.68l8.04-34.56Z' />
      <path d='M286.24 46.24c0 9.88-2.88 24.6-4.96 33.64l-11.72 54.32h-45l10.28-48.44c.88-4.4 2.6-12.28 2.6-17.32 0-6.96-3.4-9.08-7.84-9.08-6.4 0-12.88 5.6-15.48 17.56L204 134.2h-45.08l18.24-82.88 42.4-3.48-3.12 12.16c8.28-8.84 19.04-14 30.8-14 18 0 29 10.2 29 34.24Z' />
      <path d='M400.28 18.64c9.84 0 24.6 4.68 24.6 25.36 0 6.96-1.04 14.24-2.16 18.64l-11.36 49.72c-13.72 9.32-33.44 15.96-50.56 15.96-31.4 0-45.92-18.96-45.92-42.16 0-34.96 25.04-67.88 65.2-67.88 7.2 0 14.12.92 20.2 2.36v-2Zm-18 28.28c-2.6-.56-4.96-.84-8-0.84-16.84 0-27 17.32-27 33.2 0 11.52 5.28 18.48 14.52 18.48 5 0 10.2-1.32 14.28-3.96l6.2-46.88Z' />
      <path d='M592.68 18.64c17.32 0 34.72 12.16 34.72 37.92 0 37.84-29.76 73.72-68.6 73.72-12.72 0-28.64-5.32-36.2-15.96 0 0 3.56 19.32-34.16 19.32-22.16 0-34.88-13.68-34.88-36.76 0-33.04 20.04-74.52 63.92-74.52 10.52 0 19.48 3.68 24.84 10.2l3.36-10.44h43.4l-14.64 69.32c-.88 4.4-1.48 8.32-1.48 11.12 0 5.28 2.36 7.6 6.36 7.6 9.6 0 21.4-17.88 21.4-41.04 0-31.4-19.4-51.28-52.84-51.28-36.2 0-63.6 28.48-63.6 63.72 0 30.16 18.44 52.24 52.72 52.24 14.52 0 26.44-3.12 40.56-11.52l5.72 5.24c-14.52 12.72-34.56 20.4-55.6 20.4-42.44 0-68.6-26.64-68.6-62.44 0-48.72 36.88-83.44 83.68-83.44 10.56 0 21.24 2.16 29.68 6.36Zm-92.2 32.48c-13.04 0-21.72 19.92-21.72 35.36 0 10.48 4.96 17.56 13.36 17.56 6.08 0 11.88-3.08 15.44-7.12l7.16-33.2c-3.12-8-7.88-12.6-14.24-12.6Z' />
    </svg>
  );
}

function isAllowedVenmoUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === 'https:' && ALLOWED_VENMO_HOSTS.has(parsed.hostname)
    );
  } catch {
    return false;
  }
}

function BackButton({ onClick }: { readonly onClick: () => void }) {
  return (
    <button
      type='button'
      onClick={onClick}
      className='mb-4 inline-flex items-center gap-1 text-sm font-medium text-secondary-token transition-colors hover:text-primary-token'
    >
      <ArrowLeft className='h-4 w-4' aria-hidden /> Back
    </button>
  );
}

interface TipSectionProps {
  readonly handle: string;
  readonly amounts?: number[];
  readonly venmoLink?: string;
  readonly venmoUsername?: string | null;
  readonly onStripePayment?: (amount: number) => Promise<void>;
  readonly onVenmoPayment?: (url: string) => void;
  readonly className?: string;
}

export function TipSection({
  handle,
  amounts = [2, 5, 10],
  venmoLink,
  venmoUsername,
  onStripePayment,
  onVenmoPayment,
  className,
}: TipSectionProps) {
  const [loading, setLoading] = useState<number | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<'stripe' | 'venmo' | null>(
    null
  );

  const handleStripePayment = async (amount: number) => {
    if (!onStripePayment) return;

    setLoading(amount);
    try {
      await onStripePayment(amount);
      toast.success(`Thanks for the $${amount} tip!`, { duration: 5000 });
    } catch (error) {
      captureError('Tip payment failed', error, {
        handle,
        amount,
        paymentMethod: 'stripe',
      });
      toast.error('Payment failed. Please try again.', { duration: 7000 });
    } finally {
      setLoading(null);
    }
  };

  const handleVenmoPayment = (amount: number) => {
    if (!venmoLink || !onVenmoPayment) return;
    if (!isAllowedVenmoUrl(venmoLink)) return;

    const sep = venmoLink.includes('?') ? '&' : '?';
    const url = `${venmoLink}${sep}utm_amount=${amount}&utm_username=${encodeURIComponent(
      venmoUsername ?? ''
    )}`;

    onVenmoPayment(url);
    globalThis.open(url, '_blank', 'noopener,noreferrer');
  };

  const goBack = () => setPaymentMethod(null);

  // No payment methods supported — show QR fallback
  if (!onStripePayment && !venmoLink) {
    const currentUrl =
      typeof window === 'undefined' ? '' : globalThis.location.href;
    return (
      <div className={cn('text-center space-y-4', className)}>
        <QRCodeCard
          data={currentUrl}
          title='Scan to tip via Apple Pay'
          qrSize={192}
        />
      </div>
    );
  }

  // Both methods available, user hasn't chosen yet
  if (onStripePayment && venmoLink && !paymentMethod) {
    return (
      <div className={cn('w-full max-w-sm', className)}>
        <div className={CARD_CLASSES}>
          <h3 className='text-[15px] font-semibold tracking-tight text-center text-primary-token mb-1'>
            Choose payment method
          </h3>
          <p className='text-center text-xs text-secondary-token mb-5'>
            Select how you&apos;d like to send your tip
          </p>
          <div className='space-y-3'>
            <button
              type='button'
              onClick={() => setPaymentMethod('stripe')}
              className='flex w-full items-center justify-center gap-1 rounded-lg bg-black px-4 py-3 text-white transition-opacity hover:opacity-90 active:opacity-80 dark:bg-white dark:text-black'
              aria-label='Pay with Apple Pay or Card'
            >
              <ApplePayLogo className='h-6 w-auto' />
            </button>
            <button
              type='button'
              onClick={() => setPaymentMethod('venmo')}
              className='flex w-full items-center justify-center gap-2 rounded-lg bg-[#008CFF] px-4 py-3 text-white transition-opacity hover:opacity-90 active:opacity-80'
              aria-label='Pay with Venmo'
            >
              <VenmoLogo className='h-5 w-auto' />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Stripe payment flow
  if (paymentMethod === 'stripe' || (onStripePayment && !venmoLink)) {
    return (
      <div className={cn('w-full max-w-sm', className)}>
        <div className={CARD_CLASSES}>
          {paymentMethod && <BackButton onClick={goBack} />}
          <div className='space-y-2.5'>
            {amounts.map(amount => (
              <Button
                key={amount}
                onClick={() => handleStripePayment(amount)}
                className='w-full'
                size='lg'
                loading={loading === amount}
                variant='primary'
              >
                ${amount} Tip
              </Button>
            ))}
          </div>
          <p className='mt-4 text-center text-xs text-tertiary-token'>
            Tips are non-refundable
          </p>
        </div>
      </div>
    );
  }

  // Venmo payment flow
  if (paymentMethod === 'venmo' || (venmoLink && !onStripePayment)) {
    return (
      <div className={cn('w-full max-w-sm', className)}>
        <div className={CARD_CLASSES}>
          {paymentMethod && <BackButton onClick={goBack} />}
          <TipSelector
            amounts={amounts}
            onContinue={handleVenmoPayment}
            paymentLabel='Venmo'
          />
        </div>
      </div>
    );
  }

  return null;
}

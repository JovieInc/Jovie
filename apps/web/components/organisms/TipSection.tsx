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
          <div className='space-y-2.5'>
            <Button
              onClick={() => setPaymentMethod('stripe')}
              className='w-full'
              size='lg'
              variant='primary'
            >
              Apple Pay / Card
            </Button>
            <Button
              onClick={() => setPaymentMethod('venmo')}
              variant='secondary'
              className='w-full'
              size='lg'
            >
              Venmo
            </Button>
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
          <TipSelector amounts={amounts} onContinue={handleVenmoPayment} />
        </div>
      </div>
    );
  }

  return null;
}

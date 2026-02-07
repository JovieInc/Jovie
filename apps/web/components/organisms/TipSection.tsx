'use client';

import { Button } from '@jovie/ui';
import { useState } from 'react';
import { toast } from 'sonner';
import { QRCodeCard } from '@/components/molecules/QRCodeCard';
import { TipSelector } from '@/components/molecules/TipSelector';
import { captureError } from '@/lib/error-tracking';

const ALLOWED_VENMO_HOSTS = new Set(['venmo.com', 'www.venmo.com']);

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

interface TipSectionProps {
  readonly handle: string;
  readonly artistName: string;
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
  className = '',
}: Readonly<TipSectionProps>) {
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

  // If no payment methods are supported, show QR fallback
  if (!onStripePayment && !venmoLink) {
    const currentUrl =
      typeof window === 'undefined' ? '' : globalThis.location.href;
    return (
      <div className={`text-center space-y-4 ${className}`}>
        <QRCodeCard
          data={currentUrl}
          title='Scan to tip via Apple Pay'
          qrSize={192}
        />
      </div>
    );
  }

  // Show payment method selection if both are available
  if (onStripePayment && venmoLink && !paymentMethod) {
    return (
      <div className={`w-full max-w-sm space-y-3 ${className}`}>
        <h3 className='text-lg font-semibold text-center text-gray-900 dark:text-white mb-4'>
          Choose payment method
        </h3>
        <Button
          onClick={() => setPaymentMethod('stripe')}
          className='w-full'
          size='lg'
        >
          Pay with Apple Pay / Card
        </Button>
        <Button
          onClick={() => setPaymentMethod('venmo')}
          variant='outline'
          className='w-full'
          size='lg'
        >
          Pay with Venmo
        </Button>
      </div>
    );
  }

  // Show Stripe payment flow
  if (paymentMethod === 'stripe' || (onStripePayment && !venmoLink)) {
    return (
      <div className={`w-full max-w-sm space-y-3 ${className}`}>
        {paymentMethod && (
          <button
            type='button'
            onClick={() => setPaymentMethod(null)}
            className='text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300 mb-4'
          >
            ← Back to payment methods
          </button>
        )}
        {amounts.map(amount => (
          <Button
            key={amount}
            onClick={() => handleStripePayment(amount)}
            className='w-full'
            size='lg'
            loading={loading === amount}
          >
            ${amount} Tip
          </Button>
        ))}
        <p className='mt-2 text-center text-xs text-gray-500'>
          Tips are non-refundable
        </p>
      </div>
    );
  }

  // Show Venmo payment flow
  if (paymentMethod === 'venmo' || (venmoLink && !onStripePayment)) {
    return (
      <div className={`w-full max-w-sm ${className}`}>
        {paymentMethod && (
          <button
            type='button'
            onClick={() => setPaymentMethod(null)}
            className='text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300 mb-4'
          >
            ← Back to payment methods
          </button>
        )}
        <TipSelector amounts={amounts} onContinue={handleVenmoPayment} />
      </div>
    );
  }

  return null;
}

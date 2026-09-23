'use client';

import { Button } from '@jovie/ui';
import { useEffect, useRef, useState } from 'react';
import { AmountSelector } from '@/components/atoms/AmountSelector';
import { toast } from '@/components/feedback';
import { isAllowedVenmoUrl } from '@/features/profile/utils/venmo';
import { ActionDial } from '@/features/release/ActionDial';
import { track } from '@/lib/analytics';
import { captureError } from '@/lib/error-tracking';
import { cn } from '@/lib/utils';
import { formatDollarAmount } from '@/lib/utils/format-number';

const CARD_CLASSES =
  'rounded-2xl border border-subtle bg-surface-1 p-6 shadow-sm';
const PAY_METHOD_PREFERENCE = 'jovie:pay:method';

function ApplePayLogo({ className }: { readonly className?: string }) {
  return (
    <svg
      className={className}
      viewBox='0 0 40 40'
      fill='currentColor'
      aria-hidden='true'
    >
      <path d='M30.927 4.18C29.187 6.166 26.507 7.71 23.827 7.468c-.33-2.615 .952-5.396 2.527-7.139C28.094-1.663 30.97-.2 33.32.042c.28 2.697-.79 5.354-2.394 7.137ZM33.287 8.073c-3.716-.222-6.884 2.113-8.65 2.113-1.8 0-4.518-1.99-7.448-1.941-3.832.058-7.38 2.229-9.346 5.66-4.004 6.864-1.024 17.042 2.83 22.636 1.91 2.764 4.154 5.85 7.134 5.74 2.864-.116 3.938-1.85 7.398-1.85 3.436 0 4.42 1.85 7.432 1.793 3.088-.05 5.018-2.78 6.928-5.56 2.148-3.172 3.022-6.247 3.072-6.412-.066-.033-5.908-2.28-5.958-9.013-.05-5.636 4.6-8.35 4.814-8.497-2.63-3.877-6.72-4.308-8.206-4.416v-.253Z' />
    </svg>
  );
}

function VenmoLogo({ className }: { readonly className?: string }) {
  return (
    <svg
      className={className}
      viewBox='0 0 120 128'
      fill='currentColor'
      aria-hidden='true'
    >
      <path d='M110.6 1.64c6.36 10.48 9.24 21.28 9.24 34.96 0 43.56-37.2 100.12-67.4 128H4.44L0 8.12l46.2-4.4 15.04 120.56c13.92-22.72 31.16-58.48 31.16-82.8 0-13.04-2.2-21.88-5.76-29.48L110.6 1.64Z' />
    </svg>
  );
}

interface PaySectionProps {
  readonly handle: string;
  readonly amounts?: number[];
  readonly venmoLink?: string;
  readonly venmoUsername?: string | null;
  readonly onStripePayment?: (amount: number) => Promise<void>;
  readonly onVenmoPayment?: (url: string) => void;
  readonly className?: string;
}

export function PaySection({
  handle,
  amounts = [5, 10, 20],
  venmoLink,
  venmoUsername,
  onStripePayment,
  onVenmoPayment,
  className,
}: PaySectionProps) {
  const [loading, setLoading] = useState<number | null>(null);
  const [selectedMethod, setSelectedMethod] = useState<'stripe' | 'venmo'>(
    'stripe'
  );
  const [selectedAmountIndex, setSelectedAmountIndex] = useState(
    Math.floor(Math.max(0, amounts.length - 1) / 2)
  );
  const [customMode, setCustomMode] = useState(false);
  const [customAmount, setCustomAmount] = useState('');
  const customInputRef = useRef<HTMLInputElement>(null);
  const validCustomAmount =
    /^\d{1,3}(\.\d{1,2})?$/.test(customAmount) &&
    Number(customAmount) >= 1 &&
    Number(customAmount) <= 500;
  const selectedAmount = customMode
    ? validCustomAmount
      ? Number(customAmount)
      : 0
    : (amounts[selectedAmountIndex] ?? amounts[0] ?? 0);

  useEffect(() => {
    try {
      if (globalThis.localStorage.getItem(PAY_METHOD_PREFERENCE) === 'venmo') {
        setSelectedMethod('venmo');
      }
    } catch {}
  }, []);

  useEffect(() => {
    if (customMode) customInputRef.current?.focus();
  }, [customMode]);

  const chooseMethod = (id: string) => {
    const next = id === 'venmo' ? 'venmo' : 'stripe';
    setSelectedMethod(next);
    try {
      globalThis.localStorage.setItem(PAY_METHOD_PREFERENCE, next);
    } catch {}
  };

  const handleStripePayment = async (amount: number) => {
    if (!onStripePayment) return;

    // @ts-expect-error - joviePixel is set by JoviePixel component
    if (globalThis.joviePixel?.track) {
      // @ts-expect-error - joviePixel is set by JoviePixel component
      globalThis.joviePixel.track('tip_intent', {
        tipAmount: amount,
        tipMethod: 'stripe',
      });
    }

    setLoading(amount);
    try {
      await onStripePayment(amount);
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
    if (!venmoLink) return;
    if (!isAllowedVenmoUrl(venmoLink)) {
      track('tip_handoff_failed', {
        reason: 'invalid_venmo_url',
        handle,
        venmoLink,
      });
      toast.error('Payment link is not valid.');
      return;
    }

    const sep = venmoLink.includes('?') ? '&' : '?';
    const url = `${venmoLink}${sep}utm_amount=${amount}&utm_username=${encodeURIComponent(
      venmoUsername ?? ''
    )}`;

    // @ts-expect-error - joviePixel is set by JoviePixel component
    if (globalThis.joviePixel?.track) {
      // @ts-expect-error - joviePixel is set by JoviePixel component
      globalThis.joviePixel.track('venmo_link_click', {
        tipAmount: amount,
        tipMethod: 'venmo',
      });
    }

    onVenmoPayment?.(url);
    const win = globalThis.open(url, '_blank', 'noopener,noreferrer');
    if (!win) {
      track('tip_handoff_failed', {
        reason: 'popup_blocked',
        handle,
        amount,
      });
      toast.error(
        'Venmo could not be opened. Please allow pop-ups and try again.'
      );
    }
  };

  const hasVenmo = Boolean(venmoLink && isAllowedVenmoUrl(venmoLink));
  const methods = [
    ...(onStripePayment
      ? [
          {
            id: 'stripe',
            label: 'Apple Pay / Card',
            icon: <ApplePayLogo className='h-5 w-5' />,
          },
        ]
      : []),
    ...(hasVenmo
      ? [
          {
            id: 'venmo',
            label: 'Venmo',
            icon: <VenmoLogo className='h-5 w-5 text-brand-venmo' />,
          },
        ]
      : []),
  ];

  if (methods.length === 0) {
    return (
      <div className={cn('text-center space-y-4', className)}>
        <p className='text-sm text-secondary-token'>
          Payments are not available for this artist yet.
        </p>
      </div>
    );
  }

  const effectiveMethod =
    selectedMethod === 'venmo' && hasVenmo
      ? 'venmo'
      : onStripePayment
        ? 'stripe'
        : 'venmo';

  if (methods.length > 0) {
    return (
      <div className={cn('w-full max-w-sm', className)}>
        <div className={CARD_CLASSES}>
          <h3 className='text-mid font-semibold tracking-tight text-center text-primary-token mb-1'>
            Pay {handle}
          </h3>
          <p className='text-center text-xs text-secondary-token mb-5'>
            Choose an amount and a payment method
          </p>
          {customMode ? (
            <input
              ref={customInputRef}
              type='text'
              inputMode='decimal'
              aria-label='Custom Amount'
              value={customAmount}
              onChange={event => setCustomAmount(event.currentTarget.value)}
              className='h-12 w-full rounded-full border border-subtle bg-surface-2 px-4 text-center text-primary-token focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus'
              placeholder='Amount in dollars'
            />
          ) : (
            <fieldset
              className='m-0 grid grid-cols-3 gap-2 border-0 p-0'
              aria-label='Amount Options'
            >
              {amounts.map((amount, index) => (
                <AmountSelector
                  key={amount}
                  amount={amount}
                  index={index}
                  isSelected={index === selectedAmountIndex}
                  onClick={setSelectedAmountIndex}
                  ariaLabel={`Select ${formatDollarAmount(amount)} payment amount`}
                />
              ))}
            </fieldset>
          )}
          <Button
            type='button'
            variant='ghost'
            size='sm'
            className='mt-2 w-full'
            aria-pressed={customMode}
            onClick={() => {
              if (!customMode && customAmount === '') {
                setCustomAmount(String(selectedAmount));
              }
              setCustomMode(value => !value);
            }}
          >
            Custom Amount
          </Button>
          {customMode && !validCustomAmount ? (
            <p className='mt-1 text-center text-xs text-secondary-token'>
              Enter an amount from $1 to $500.
            </p>
          ) : null}
          <div className='mt-4'>
            <p className='mb-1 text-center text-xs font-medium text-secondary-token'>
              {effectiveMethod === 'venmo' ? 'Venmo' : 'Apple Pay / Card'}
            </p>
            <ActionDial
              options={methods}
              selectedId={effectiveMethod}
              onSelect={chooseMethod}
              onActivate={id => {
                if (selectedAmount <= 0 || loading !== null) return;
                if (id === 'venmo') handleVenmoPayment(selectedAmount);
                else void handleStripePayment(selectedAmount);
              }}
              actionLabel={
                selectedAmount > 0
                  ? `Pay ${formatDollarAmount(selectedAmount)}`
                  : 'Enter an amount'
              }
              groupLabel='Choose a payment method'
              hint={
                methods.length > 1
                  ? 'Swipe to switch methods. Payment starts only when you press Pay.'
                  : 'Payment starts only when you press Pay.'
              }
              disabled={loading !== null || selectedAmount <= 0}
            />
          </div>
        </div>
      </div>
    );
  }

  return null;
}

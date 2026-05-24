'use client';

import { Loader2, Minus, Plus, ShoppingBag } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { PublicMerchCard } from '@/lib/merch/types';
import { cn } from '@/lib/utils';

function formatPrice(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(cents / 100);
}

function variantLabel(variantKey: string): string {
  return variantKey.replaceAll('_', ' ');
}

interface MerchCheckoutFormProps {
  readonly card: PublicMerchCard;
  readonly handle: string;
}

export function MerchCheckoutForm({
  card,
  handle,
}: Readonly<MerchCheckoutFormProps>) {
  const variantKeys = useMemo(
    () => Object.keys(card.printful.variantMap),
    [card.printful.variantMap]
  );
  const [selectedVariantKey, setSelectedVariantKey] = useState(
    variantKeys[0] ?? ''
  );
  const [quantity, setQuantity] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const shippingEstimate = card.pricing.estimatedShippingCostCents;
  const subtotal = card.retailPriceCents * quantity;
  const total = subtotal + shippingEstimate;

  async function submitCheckout() {
    if (!selectedVariantKey || isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch('/api/merch/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          merchCardId: card.id,
          variantKey: selectedVariantKey,
          quantity,
          handle,
        }),
      });

      const payload = (await response.json()) as {
        readonly url?: string;
        readonly error?: string;
      };

      if (!response.ok || !payload.url) {
        throw new Error(
          payload.error ?? 'Checkout is temporarily unavailable.'
        );
      }

      globalThis.location.href = payload.url;
    } catch (checkoutError) {
      setError(
        checkoutError instanceof Error
          ? checkoutError.message
          : 'Checkout is temporarily unavailable.'
      );
      setIsSubmitting(false);
    }
  }

  return (
    <div className='flex min-h-[328px] flex-col rounded-[8px] border border-white/12 bg-black/30 p-4 text-white shadow-[0_22px_80px_rgba(0,0,0,0.32)] backdrop-blur-xl sm:p-5'>
      <div className='flex items-start justify-between gap-4'>
        <div>
          <p className='text-[11px] font-semibold uppercase leading-none text-white/54 [letter-spacing:0]'>
            US shipping
          </p>
          <p className='mt-2 text-[26px] font-semibold leading-none text-white [letter-spacing:0]'>
            {formatPrice(card.retailPriceCents)}
          </p>
        </div>
        <ShoppingBag className='h-5 w-5 shrink-0 text-white/62' />
      </div>

      <div className='mt-6'>
        <p className='text-[12px] font-medium text-white/62'>Size</p>
        <div className='mt-2 grid grid-cols-2 gap-2'>
          {variantKeys.map(variantKey => (
            <button
              type='button'
              key={variantKey}
              onClick={() => setSelectedVariantKey(variantKey)}
              className={cn(
                'h-11 rounded-[6px] border text-[13px] font-semibold capitalize transition-[background-color,border-color,color] duration-subtle',
                selectedVariantKey === variantKey
                  ? 'border-white bg-white text-black'
                  : 'border-white/12 bg-white/[0.04] text-white hover:border-white/24 hover:bg-white/[0.07]'
              )}
            >
              {variantLabel(variantKey)}
            </button>
          ))}
        </div>
      </div>

      <div className='mt-5'>
        <p className='text-[12px] font-medium text-white/62'>Quantity</p>
        <div className='mt-2 flex h-11 w-36 items-center justify-between rounded-[6px] border border-white/12 bg-white/[0.04] px-1'>
          <button
            type='button'
            aria-label='Decrease quantity'
            onClick={() => setQuantity(current => Math.max(1, current - 1))}
            className='flex h-9 w-9 items-center justify-center rounded-[5px] text-white/72 transition-colors duration-subtle hover:bg-white/10 hover:text-white'
          >
            <Minus className='h-4 w-4' />
          </button>
          <span className='w-8 text-center text-[14px] font-semibold text-white'>
            {quantity}
          </span>
          <button
            type='button'
            aria-label='Increase quantity'
            onClick={() => setQuantity(current => Math.min(5, current + 1))}
            className='flex h-9 w-9 items-center justify-center rounded-[5px] text-white/72 transition-colors duration-subtle hover:bg-white/10 hover:text-white'
          >
            <Plus className='h-4 w-4' />
          </button>
        </div>
      </div>

      <div className='mt-6 space-y-2 border-t border-white/10 pt-4 text-[13px]'>
        <div className='flex justify-between gap-4 text-white/64'>
          <span>Item subtotal</span>
          <span>{formatPrice(subtotal)}</span>
        </div>
        <div className='flex justify-between gap-4 text-white/64'>
          <span>Standard shipping</span>
          <span>{formatPrice(shippingEstimate)}</span>
        </div>
        <div className='flex justify-between gap-4 pt-1 text-[15px] font-semibold text-white'>
          <span>Total before tax</span>
          <span>{formatPrice(total)}</span>
        </div>
      </div>

      <button
        type='button'
        disabled={isSubmitting || !selectedVariantKey}
        onClick={submitCheckout}
        className='mt-5 inline-flex h-12 items-center justify-center gap-2 rounded-[6px] bg-white px-4 text-[14px] font-semibold text-black transition-opacity duration-subtle hover:opacity-92 disabled:pointer-events-none disabled:opacity-55'
      >
        {isSubmitting ? <Loader2 className='h-4 w-4 animate-spin' /> : null}
        Checkout
      </button>

      <div className='min-h-[36px] pt-3'>
        {error ? (
          <p className='text-[12px] leading-5 text-red-200'>{error}</p>
        ) : (
          <p className='text-[12px] leading-5 text-white/48'>
            Produced after payment clears.
          </p>
        )}
      </div>
    </div>
  );
}

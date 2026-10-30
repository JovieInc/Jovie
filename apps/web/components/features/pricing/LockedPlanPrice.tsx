'use client';

import { useEffect, useState } from 'react';
import { useAuthSafe } from '@/hooks/useClerkSafe';
import {
  lockDisclosure,
  lockedMonthlyLabel,
  type PriceLockView,
} from '@/lib/billing/price-lock-view';
import { fetchPriceLock } from '@/lib/queries/usePriceLockQuery';

/**
 * The paid plan's price on the static /pricing page. Everyone first gets the
 * list price (the page is static). A signed-in person with a price lock then
 * sees their own locked price and the disclosure, so the pricing page never
 * contradicts the checkout they will get.
 */
export function LockedPlanPrice({
  price,
  cadence,
}: Readonly<{ price: string; cadence?: string | null }>) {
  const { isSignedIn } = useAuthSafe();
  const [lock, setLock] = useState<PriceLockView | null>(null);

  useEffect(() => {
    if (!isSignedIn) return;
    const controller = new AbortController();
    fetchPriceLock({ signal: controller.signal })
      .then(setLock)
      .catch(() => {
        // Keep the list price; checkout still charges the locked price.
      });
    return () => controller.abort();
  }, [isSignedIn]);

  const locked = lockedMonthlyLabel(lock);
  const note = lockDisclosure(lock);
  if (!locked) {
    return (
      <>
        {price}
        {cadence ? <span>{cadence}</span> : null}
      </>
    );
  }
  // lockedMonthlyLabel already carries the cadence (for example "/mo" is part of the label).
  return (
    <>
      <span data-testid='locked-plan-price'>{locked}</span>
      {note ? (
        <span
          data-testid='price-lock-note'
          className='mt-1 block text-xs font-normal text-secondary-token'
        >
          {note}
        </span>
      ) : null}
    </>
  );
}

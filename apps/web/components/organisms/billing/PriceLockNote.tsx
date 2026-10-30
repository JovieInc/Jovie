import {
  lockDisclosure,
  type PriceLockView,
} from '@/lib/billing/price-lock-view';
import type { PriceInterval } from '@/lib/billing/price-versions';

/**
 * Discloses that the person's price is locked. Renders nothing without a lock,
 * so the sentence only ever appears when it is true. The copy comes from
 * `priceLockDisclosure` (lib/billing/price-versions.ts), which the copy lint
 * test covers.
 */
export function PriceLockNote({
  lock,
  interval = 'month',
  className,
}: Readonly<{
  readonly lock: PriceLockView | null | undefined;
  readonly interval?: PriceInterval;
  readonly className?: string;
}>) {
  const text = lockDisclosure(lock ?? null, interval);
  if (!text) return null;
  return (
    <p
      data-testid='price-lock-note'
      className={className ?? 'text-app leading-5 text-secondary-token'}
    >
      {text}
    </p>
  );
}

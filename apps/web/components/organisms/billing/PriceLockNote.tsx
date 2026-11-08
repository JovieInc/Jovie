import {
  lockDisclosure,
  type PriceLockView,
} from '@/lib/billing/price-lock-view';
import type { PriceInterval } from '@/lib/billing/price-versions';

/** Price lock disclosure; renders nothing without a lock. */
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

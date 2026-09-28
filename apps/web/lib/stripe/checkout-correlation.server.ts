import { createHash } from 'node:crypto';
import {
  CHECKOUT_CORRELATION_FIELDS,
  type CheckoutCorrelation,
  hasCheckoutCorrelation,
} from './checkout-correlation';

export function checkoutCorrelationIdempotencyPart(
  correlation: CheckoutCorrelation | null | undefined
): string | undefined {
  if (!hasCheckoutCorrelation(correlation)) return undefined;
  const stable = JSON.stringify(
    CHECKOUT_CORRELATION_FIELDS.map(field => [field, correlation[field] ?? ''])
  );
  return createHash('sha256').update(stable).digest('hex').slice(0, 16);
}

/**
 * Notification Subscription Validation
 *
 * Re-exports from shared validation module for backwards compatibility.
 */
import { normalizeEmail, normalizePhone } from '@/lib/validation/contact';

export function normalizeSubscriptionEmail(
  raw: string | null | undefined
): string | null {
  return normalizeEmail(raw, { strict: true });
}

export function normalizeSubscriptionPhone(
  raw: string | null | undefined
): string | null {
  return normalizePhone(raw);
}

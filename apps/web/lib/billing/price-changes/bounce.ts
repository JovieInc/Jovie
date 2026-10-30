import 'server-only';

import { DrizzleNoticeStore } from './drizzle-store';

const SOFT_BOUNCE_RETRY_MS = 24 * 60 * 60 * 1000;

/**
 * Resend bounce/complaint -> price-change notice row. A bounce means the
 * notice was NOT delivered, so the row stops counting as notified. Idempotent
 * on the provider message id; a no-op for every non-notice email.
 */
export async function recordPriceChangeNoticeBounce(
  providerMessageId: string,
  permanent: boolean,
  now: Date = new Date()
): Promise<boolean> {
  return new DrizzleNoticeStore().recordBounce(providerMessageId, {
    permanent,
    nextAttemptAt: permanent
      ? null
      : new Date(now.getTime() + SOFT_BOUNCE_RETRY_MS),
  });
}

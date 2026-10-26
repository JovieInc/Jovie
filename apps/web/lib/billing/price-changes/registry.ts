/**
 * Declared price changes for existing plans. THE only way to change what an
 * existing subscriber pays: add a record here at least PRICE_CHANGE_NOTICE_DAYS
 * before it takes effect. The CI guard (guard.ts, scripts/check-price-change-guard.ts)
 * rejects any live-price edit without a record that was already merged.
 *
 * Records are append-only once merged (only `cancelledAt` may be added).
 * New prices for brand-new plans do not need a record.
 */

import type { ScheduledPriceChange } from './types';

export const SCHEDULED_PRICE_CHANGES: readonly ScheduledPriceChange[] = [];

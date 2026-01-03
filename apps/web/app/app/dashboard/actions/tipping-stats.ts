/**
 * Tipping statistics types and helpers.
 *
 * @deprecated This file's exports have moved to @/lib/db/server
 * Import from there instead:
 * - import { createEmptyTippingStats, type TippingStats } from '@/lib/db/server';
 *
 * This file remains for backward compatibility and will be removed in a future version.
 *
 * This module provides the TippingStats interface and a factory function
 * for creating empty stats objects. It's dependency-free and imported by
 * other dashboard action modules.
 */

/**
 * Statistics about tips received by a creator profile.
 */
export interface TippingStats {
  /** Total number of tip-related clicks (QR + link combined) */
  tipClicks: number;
  /** Number of tip clicks originating from QR codes */
  qrTipClicks: number;
  /** Number of tip clicks originating from links */
  linkTipClicks: number;
  /** Total number of tips submitted */
  tipsSubmitted: number;
  /** Total amount received in cents (all time) */
  totalReceivedCents: number;
  /** Amount received in cents for the current month */
  monthReceivedCents: number;
}

/**
 * Creates an empty TippingStats object with all values initialized to zero.
 *
 * @returns A TippingStats object with all numeric fields set to 0
 */
export function createEmptyTippingStats(): TippingStats {
  return {
    tipClicks: 0,
    qrTipClicks: 0,
    linkTipClicks: 0,
    tipsSubmitted: 0,
    totalReceivedCents: 0,
    monthReceivedCents: 0,
  };
}

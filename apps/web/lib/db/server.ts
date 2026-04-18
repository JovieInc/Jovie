import 'server-only';

/**
 * Server-safe utilities for dashboard actions.
 *
 * This module uses 'server only' (not 'use server') to allow exporting
 * non-async utility functions and constants without triggering build errors.
 *
 * Following the pattern established in:
 * - lib/entitlements/server.ts
 * - lib/flags/server.ts
 */

import { isProfileComplete } from '@/lib/auth/profile-completeness';
import type { CreatorProfile } from '@/lib/db/schema/profiles';

/**
 * Determines if a creator profile meets the minimum requirements
 * to be considered publishable.
 *
 * Delegates to the canonical isProfileComplete() check. This function
 * adds the null-profile guard on top.
 *
 * @param profile - The creator profile to check, or null
 * @returns true if the profile is publishable, false otherwise
 */
export function profileIsPublishable(profile: CreatorProfile | null): boolean {
  if (!profile) return false;
  return isProfileComplete(profile);
}

/**
 * Selects the most appropriate creator profile to display on the dashboard.
 *
 * Selection priority:
 * 1. First publishable profile found
 * 2. If no publishable profile, the most recently updated profile
 * 3. If update times are equal, the most recently created profile
 *
 * Moved from app/app/dashboard/actions/profile-selection.ts
 *
 * @param profiles - Array of creator profiles to choose from
 * @returns The selected profile (first profile if array has at least one element)
 * @throws May throw if profiles array is empty
 */
export function selectDashboardProfile(
  profiles: CreatorProfile[]
): CreatorProfile {
  // Prefer claimed + publishable profiles to avoid selecting unclaimed
  // pre-populated profiles when a claimed profile exists
  const claimed = profiles.find(p => p.isClaimed && profileIsPublishable(p));
  if (claimed) return claimed;

  const publishable = profiles.find(profileIsPublishable);
  if (publishable) return publishable;

  const byRecency = [...profiles].sort((a, b) => {
    const aUpdated = a.updatedAt ? a.updatedAt.getTime() : 0;
    const bUpdated = b.updatedAt ? b.updatedAt.getTime() : 0;
    if (aUpdated !== bUpdated) return bUpdated - aUpdated;

    const aCreated = a.createdAt ? a.createdAt.getTime() : 0;
    const bCreated = b.createdAt ? b.createdAt.getTime() : 0;
    return bCreated - aCreated;
  });

  return byRecency[0];
}

/**
 * Statistics about tips received by a creator profile.
 *
 * Moved from app/app/dashboard/actions/tipping-stats.ts
 */
export interface TippingStats {
  /** Total number of tip-link visits across all tracked sources */
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
 * Moved from app/app/dashboard/actions/tipping-stats.ts
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

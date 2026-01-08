/**
 * Waitlist Access Utilities
 *
 * @deprecated This file is maintained for backwards compatibility.
 * Import from '@/lib/auth/gate' for new code.
 *
 * The waitlist access functions have been consolidated into the
 * centralized auth gate module for consistency.
 */

import {
  getWaitlistAccess,
  type WaitlistAccessResult,
  type WaitlistStatus,
} from '@/lib/auth/gate';

// Re-export types for backwards compatibility
export type { WaitlistStatus };

export interface WaitlistAccessLookup {
  entryId: string | null;
  status: WaitlistStatus | null;
}

/**
 * @deprecated Use `getWaitlistAccess` from '@/lib/auth/gate' instead.
 */
export async function getWaitlistAccessByEmail(
  emailRaw: string
): Promise<WaitlistAccessLookup> {
  const result: WaitlistAccessResult = await getWaitlistAccess(emailRaw);
  return {
    entryId: result.entryId,
    status: result.status,
  };
}

/**
 * Background sync operations for onboarding
 */

'use server';

import * as Sentry from '@sentry/nextjs';
import { syncAllClerkMetadata } from '@/lib/auth/clerk-sync';
import { syncCanonicalUsernameFromApp } from '@/lib/username/sync';

/**
 * Runs post-onboarding sync operations in the background.
 * Syncs username and Clerk metadata without blocking.
 */
export function runBackgroundSyncOperations(
  userId: string,
  username: string
): void {
  void Promise.allSettled([
    syncCanonicalUsernameFromApp(userId, username),
    syncAllClerkMetadata(userId),
  ]).then(results => {
    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        const context =
          index === 0 ? 'onboarding_username_sync' : 'onboarding_metadata_sync';
        console.error(`[ONBOARDING] ${context} failed:`, result.reason);
        Sentry.captureException(result.reason, {
          tags: { context, username },
          level: 'warning',
        });
      }
    });
  });
}

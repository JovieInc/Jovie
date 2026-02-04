/**
 * Background sync operations for onboarding
 * Note: This is a helper module, not a Server Action file.
 * It's called internally by server actions, not from the client.
 */

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
    const syncContexts = [
      'onboarding_username_sync',
      'onboarding_metadata_sync',
    ];
    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        const context = syncContexts[index];
        Sentry.captureException(result.reason, {
          tags: { context, username },
          level: 'warning',
        });
      }
    });
  });
}

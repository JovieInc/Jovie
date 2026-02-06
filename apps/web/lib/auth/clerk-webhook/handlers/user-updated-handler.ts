/**
 * Handler for Clerk user.updated webhook events.
 *
 * Processes user updates by:
 * - Syncing verified email changes
 *
 * NOTE: Username changes from Clerk are IGNORED.
 * Usernames are stored only in the database - users must change via the app.
 */

import { syncEmailFromClerkByClerkId } from '@/lib/auth/clerk-sync';
import { invalidateProxyUserStateCache } from '@/lib/auth/proxy-state';
import { logger } from '@/lib/utils/logger';
import type {
  ClerkEventType,
  ClerkHandlerResult,
  ClerkWebhookContext,
  ClerkWebhookHandler,
} from '../types';

async function handleUserUpdated(
  context: ClerkWebhookContext
): Promise<ClerkHandlerResult> {
  const { event } = context;
  const user = event.data;

  try {
    // NOTE: Username sync is intentionally removed.
    // Usernames are stored only in the database to eliminate sync overhead.
    // Users must change their username through the Jovie app, not Clerk.

    // Sync email if primary email changed (only verified emails)
    const primaryEmail = user.email_addresses?.find(
      e =>
        e.id === user.primary_email_address_id &&
        e.verification?.status === 'verified'
    )?.email_address;

    if (primaryEmail) {
      const emailResult = await syncEmailFromClerkByClerkId(
        user.id,
        primaryEmail
      );
      if (!emailResult.success) {
        const message = `Failed to sync email for user.updated (userId=${user.id}): ${emailResult.error ?? 'Unknown error'}`;
        logger.warn(message);

        return {
          success: false,
          error: 'Failed to sync email from Clerk',
          message,
        };
      }
    }

    // Invalidate proxy cache so middleware sees fresh state immediately
    // This handles cases where Clerk metadata changes (admin actions, etc.)
    await invalidateProxyUserStateCache(user.id);

    return {
      success: true,
    };
  } catch (error) {
    logger.error(
      `Failed to sync from Clerk for user.updated ${user.id}:`,
      error
    );

    return {
      success: false,
      error: 'Failed to sync from Clerk',
    };
  }
}

/**
 * Singleton handler for user.updated events.
 */
export const userUpdatedHandler: ClerkWebhookHandler = {
  eventTypes: ['user.updated'] as const satisfies readonly ClerkEventType[],
  handle: handleUserUpdated,
};

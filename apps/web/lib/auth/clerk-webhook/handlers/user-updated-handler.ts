/**
 * Handler for Clerk user.updated webhook events.
 *
 * Processes user updates by:
 * - Syncing username changes
 * - Syncing verified email changes
 */

import { syncEmailFromClerkByClerkId } from '@/lib/auth/clerk-sync';
import { syncUsernameFromClerkEvent } from '@/lib/username/sync';
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
    // Sync username
    await syncUsernameFromClerkEvent(
      user.id,
      user.username ?? null,
      user.private_metadata
    );

    // Sync email if primary email changed (only verified emails)
    const primaryEmail = user.email_addresses?.find(
      e =>
        e.id === user.primary_email_address_id &&
        e.verification?.status === 'verified'
    )?.email_address;

    if (primaryEmail) {
      await syncEmailFromClerkByClerkId(user.id, primaryEmail);
    }

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

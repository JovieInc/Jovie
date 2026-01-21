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
    const errors: Array<{ step: 'username' | 'email'; error: string }> = [];

    // Sync username
    try {
      await syncUsernameFromClerkEvent(
        user.id,
        user.username ?? null,
        user.private_metadata
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      errors.push({ step: 'username', error: errorMessage });
    }

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
        errors.push({
          step: 'email',
          error: emailResult.error ?? 'Unknown error',
        });
      }
    }

    if (errors.length > 0) {
      const details = errors.map(e => `${e.step}=${e.error}`).join('; ');
      const message = `Partial Clerk sync failure for user.updated (userId=${user.id}, username=${user.username ?? 'null'}): ${details}`;

      logger.warn(message);

      return {
        success: false,
        error: 'Failed to sync from Clerk',
        message,
      };
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

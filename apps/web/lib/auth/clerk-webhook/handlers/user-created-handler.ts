/**
 * Handler for Clerk user.created webhook events.
 *
 * Processes new user signups by:
 * - Storing full name in private metadata (for display purposes)
 * - Syncing initial Jovie metadata to Clerk
 *
 * NOTE: Username suggestions are generated on-the-fly in the onboarding flow,
 * not stored in Clerk metadata. Usernames are stored only in the database.
 */

import { clerkClient } from '@clerk/nextjs/server';
import { syncAllClerkMetadata } from '@/lib/auth/clerk-sync';
import { notifySlackSignup } from '@/lib/notifications/providers/slack';
import { logger } from '@/lib/utils/logger';
import type {
  ClerkEventType,
  ClerkHandlerResult,
  ClerkWebhookContext,
  ClerkWebhookHandler,
} from '../types';

async function handleUserCreated(
  context: ClerkWebhookContext
): Promise<ClerkHandlerResult> {
  const { event } = context;
  const user = event.data;

  try {
    // Create full name from first + last name (for display purposes)
    const fullName = [user.first_name, user.last_name]
      .filter(Boolean)
      .join(' ')
      .trim();

    // Update user's private metadata with full name only
    // NOTE: suggestedUsername is no longer stored here - it's generated
    // on-the-fly in the onboarding flow to eliminate sync overhead
    if (fullName) {
      const client = await clerkClient();
      await client.users.updateUser(user.id, {
        privateMetadata: {
          ...user.private_metadata,
          fullName,
        },
      });
    }

    // Sync initial Jovie metadata to Clerk
    const syncResult = await syncAllClerkMetadata(user.id);
    if (!syncResult.success) {
      logger.error(
        `Failed to sync Clerk metadata for user ${user.id}:`,
        syncResult.error
      );

      return {
        success: false,
        error: 'Failed to sync Clerk metadata',
        message: syncResult.error ?? 'Unknown error',
      };
    }

    logger.info(`Post-signup processing completed for user ${user.id}`);

    // Send Slack notification for new signup (fire-and-forget)
    const displayName = fullName || user.username || 'A new user';
    const primaryEmail = user.email_addresses?.[0]?.email_address;
    notifySlackSignup(displayName, primaryEmail).catch(err => {
      logger.warn('[user-created] Slack notification failed', err);
    });

    return {
      success: true,
      message: 'User post-signup processing completed',
      fullName,
    };
  } catch (error) {
    logger.error(`Failed to process user.created event for ${user.id}:`, error);

    return {
      success: false,
      error: 'Failed to process user data',
      message: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Singleton handler for user.created events.
 */
export const userCreatedHandler: ClerkWebhookHandler = {
  eventTypes: ['user.created'] as const satisfies readonly ClerkEventType[],
  handle: handleUserCreated,
};

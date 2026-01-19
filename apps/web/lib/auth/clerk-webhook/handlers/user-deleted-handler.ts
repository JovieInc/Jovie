/**
 * Handler for Clerk user.deleted webhook events.
 *
 * Processes user deletion by soft-deleting the associated DB user.
 */

import { handleClerkUserDeleted } from '@/lib/auth/clerk-sync';
import { logger } from '@/lib/utils/logger';
import type {
  ClerkEventType,
  ClerkHandlerResult,
  ClerkWebhookContext,
  ClerkWebhookHandler,
} from '../types';

async function handleUserDeleted(
  context: ClerkWebhookContext
): Promise<ClerkHandlerResult> {
  const { event } = context;
  const user = event.data;

  try {
    const result = await handleClerkUserDeleted(user.id);

    if (!result.success) {
      logger.error(
        `Failed to handle user.deleted for ${user.id}:`,
        result.error
      );

      return {
        success: false,
        error: result.error,
      };
    }

    logger.info(`User deletion processed for ${user.id}`);

    return {
      success: true,
      message: 'User deletion processed',
    };
  } catch (error) {
    logger.error(`Failed to process user.deleted event for ${user.id}:`, error);

    return {
      success: false,
      error: 'Failed to process user deletion',
      message: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Singleton handler for user.deleted events.
 */
export const userDeletedHandler: ClerkWebhookHandler = {
  eventTypes: ['user.deleted'] as const satisfies readonly ClerkEventType[],
  handle: handleUserDeleted,
};

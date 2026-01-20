/**
 * Handler for Clerk user.created webhook events.
 *
 * Processes new user signups by:
 * - Generating a suggested username from name or email
 * - Storing full name in private metadata
 * - Syncing initial Jovie metadata to Clerk
 */

import { randomBytes } from 'node:crypto';
import { clerkClient } from '@clerk/nextjs/server';
import { syncAllClerkMetadata } from '@/lib/auth/clerk-sync';
import { logger } from '@/lib/utils/logger';
import type {
  ClerkEventType,
  ClerkHandlerResult,
  ClerkWebhookContext,
  ClerkWebhookHandler,
} from '../types';

function generateRandomSuffix(length: number): string {
  return randomBytes(Math.ceil(length / 2))
    .toString('hex')
    .slice(0, length);
}

function generateUsernameFromName(firstName: string | null): string {
  if (!firstName) return '';

  const cleaned = firstName.toLowerCase().replaceAll(/[^a-z0-9]/g, '');

  if (cleaned.length < 3) {
    return cleaned + generateRandomSuffix(3);
  }

  return cleaned.substring(0, 20);
}

function generateUsernameFromEmail(email: string): string {
  const localPart = email.split('@')[0];
  const cleaned = localPart.toLowerCase().replaceAll(/[^a-z0-9]/g, '');

  if (cleaned.length < 3) {
    return 'user' + generateRandomSuffix(3);
  }

  return cleaned.substring(0, 20);
}

async function handleUserCreated(
  context: ClerkWebhookContext
): Promise<ClerkHandlerResult> {
  const { event } = context;
  const user = event.data;

  try {
    // Generate suggested username
    let suggestedUsername = '';

    if (user.first_name) {
      suggestedUsername = generateUsernameFromName(user.first_name);
    } else if (user.email_addresses?.[0]?.email_address) {
      suggestedUsername = generateUsernameFromEmail(
        user.email_addresses[0].email_address
      );
    } else {
      suggestedUsername = 'user' + generateRandomSuffix(6);
    }

    // Create full name from first + last name
    const fullName = [user.first_name, user.last_name]
      .filter(Boolean)
      .join(' ')
      .trim();

    // Update user's private metadata
    const client = await clerkClient();
    await client.users.updateUser(user.id, {
      privateMetadata: {
        ...user.private_metadata,
        fullName: fullName || undefined,
        suggestedUsername,
      },
    });

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

    return {
      success: true,
      message: 'User post-signup processing completed',
      fullName,
      suggestedUsername,
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

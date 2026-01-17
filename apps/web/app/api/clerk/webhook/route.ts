import { randomBytes } from 'node:crypto';
import { clerkClient } from '@clerk/nextjs/server';
import { headers } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { Webhook } from 'svix';
import {
  handleClerkUserDeleted,
  syncAllClerkMetadata,
  syncEmailFromClerkByClerkId,
} from '@/lib/auth/clerk-sync';
import { syncUsernameFromClerkEvent } from '@/lib/username/sync';
import { logger } from '@/lib/utils/logger';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

type WebhookEvent = {
  data: {
    id: string;
    username?: string | null;
    primary_email_address_id?: string;
    email_addresses: Array<{
      id: string;
      email_address: string;
      verification: { status: string };
    }>;
    first_name: string | null;
    last_name: string | null;
    private_metadata: Record<string, unknown>;
    public_metadata: Record<string, unknown>;
    deleted?: boolean;
  };
  object: 'event';
  type: 'user.created' | 'user.updated' | 'user.deleted' | string;
};

function generateRandomSuffix(length: number): string {
  return randomBytes(Math.ceil(length / 2))
    .toString('hex')
    .slice(0, length);
}

function generateUsernameFromName(firstName: string | null): string {
  if (!firstName) return '';

  // Convert to lowercase and remove special characters
  const cleaned = firstName.toLowerCase().replaceAll(/[^a-z0-9]/g, '');

  // Ensure minimum length of 3 characters
  if (cleaned.length < 3) {
    return cleaned + generateRandomSuffix(3);
  }

  // Truncate to max 20 characters to leave room for potential suffixes
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

export async function POST(request: NextRequest) {
  try {
    // Verify webhook signature
    const headersList = await headers();
    const svix_id = headersList.get('svix-id');
    const svix_timestamp = headersList.get('svix-timestamp');
    const svix_signature = headersList.get('svix-signature');

    if (!svix_id || !svix_timestamp || !svix_signature) {
      return NextResponse.json(
        { error: 'Missing svix headers' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const body = await request.text();
    const webhook_secret = process.env.CLERK_WEBHOOK_SECRET;

    if (!webhook_secret) {
      logger.error('Missing CLERK_WEBHOOK_SECRET environment variable');
      return NextResponse.json(
        { error: 'Webhook secret not configured' },
        { status: 500, headers: NO_STORE_HEADERS }
      );
    }

    // Create Svix webhook instance
    const wh = new Webhook(webhook_secret);

    let evt: WebhookEvent;

    try {
      evt = wh.verify(body, {
        'svix-id': svix_id,
        'svix-timestamp': svix_timestamp,
        'svix-signature': svix_signature,
      }) as WebhookEvent;
    } catch (err) {
      logger.error('Webhook signature verification failed:', err);
      return NextResponse.json(
        { error: 'Invalid signature' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    // Handle user.created event
    if (evt.type === 'user.created') {
      const { data: user } = evt;

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

        // Update user's private metadata with full name and suggested username
        const client = await clerkClient();
        await client.users.updateUser(user.id, {
          privateMetadata: {
            ...user.private_metadata,
            fullName: fullName || undefined,
            suggestedUsername,
          },
        });

        // Sync initial Jovie metadata to Clerk (user created but not yet in DB)
        await syncAllClerkMetadata(user.id);

        logger.info(`Post-signup processing completed for user ${user.id}`);

        return NextResponse.json(
          {
            success: true,
            message: 'User post-signup processing completed',
            fullName,
            suggestedUsername,
          },
          { headers: NO_STORE_HEADERS }
        );
      } catch (error) {
        logger.error(
          `Failed to process user.created event for ${user.id}:`,
          error
        );

        // Return 200 to prevent Clerk from retrying, but log the error
        return NextResponse.json(
          {
            success: false,
            error: 'Failed to process user data',
            message: error instanceof Error ? error.message : 'Unknown error',
          },
          { status: 200, headers: NO_STORE_HEADERS } // Return 200 to prevent retries for non-critical errors
        );
      }
    }

    if (evt.type === 'user.updated') {
      const { data: user } = evt;

      try {
        // Sync username (existing)
        await syncUsernameFromClerkEvent(
          user.id,
          user.username ?? null,
          user.private_metadata
        );

        // Sync email if primary email changed
        // Only sync verified emails to prevent hijacking
        const primaryEmail = user.email_addresses?.find(
          e =>
            e.id === user.primary_email_address_id &&
            e.verification?.status === 'verified'
        )?.email_address;

        if (primaryEmail) {
          await syncEmailFromClerkByClerkId(user.id, primaryEmail);
        }
      } catch (error) {
        logger.error(
          `Failed to sync from Clerk for user.updated ${user.id}:`,
          error
        );

        // Do not cause Clerk retries on non-critical sync failures
        return NextResponse.json(
          {
            success: false,
            error: 'Failed to sync from Clerk',
          },
          { status: 200, headers: NO_STORE_HEADERS }
        );
      }

      return NextResponse.json(
        { success: true, type: evt.type },
        { headers: NO_STORE_HEADERS }
      );
    }

    // Handle user.deleted event - soft-delete the DB user
    if (evt.type === 'user.deleted') {
      const { data: user } = evt;

      try {
        const result = await handleClerkUserDeleted(user.id);

        if (!result.success) {
          logger.error(
            `Failed to handle user.deleted for ${user.id}:`,
            result.error
          );
          // Return 200 to prevent retries - the user deletion is best-effort
          return NextResponse.json(
            {
              success: false,
              error: result.error,
            },
            { status: 200, headers: NO_STORE_HEADERS }
          );
        }

        logger.info(`User deletion processed for ${user.id}`);

        return NextResponse.json(
          {
            success: true,
            message: 'User deletion processed',
          },
          { headers: NO_STORE_HEADERS }
        );
      } catch (error) {
        logger.error(
          `Failed to process user.deleted event for ${user.id}:`,
          error
        );

        // Return 200 to prevent Clerk from retrying
        return NextResponse.json(
          {
            success: false,
            error: 'Failed to process user deletion',
            message: error instanceof Error ? error.message : 'Unknown error',
          },
          { status: 200, headers: NO_STORE_HEADERS }
        );
      }
    }

    // For other event types, just acknowledge
    return NextResponse.json(
      { success: true, type: evt.type },
      { headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    logger.error('Webhook processing error:', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}

export const runtime = 'nodejs'; // Required for Clerk webhooks

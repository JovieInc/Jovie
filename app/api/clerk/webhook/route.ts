import { clerkClient } from '@clerk/nextjs/server';
import { headers } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { Webhook } from 'svix';

type WebhookEvent = {
  data: {
    id: string;
    email_addresses: Array<{
      email_address: string;
      verification: { status: string };
    }>;
    first_name: string | null;
    last_name: string | null;
    private_metadata: Record<string, unknown>;
    public_metadata: Record<string, unknown>;
  };
  object: 'event';
  type: 'user.created' | 'user.updated' | string;
};

function generateUsernameFromName(firstName: string | null): string {
  if (!firstName) return '';

  // Convert to lowercase and remove special characters
  const cleaned = firstName.toLowerCase().replace(/[^a-z0-9]/g, '');

  // Ensure minimum length of 3 characters
  if (cleaned.length < 3) {
    return cleaned + Math.random().toString(36).substring(2, 5);
  }

  // Truncate to max 20 characters to leave room for potential suffixes
  return cleaned.substring(0, 20);
}

function generateUsernameFromEmail(email: string): string {
  const localPart = email.split('@')[0];
  const cleaned = localPart.toLowerCase().replace(/[^a-z0-9]/g, '');

  if (cleaned.length < 3) {
    return 'user' + Math.random().toString(36).substring(2, 5);
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
        { status: 400 }
      );
    }

    const body = await request.text();
    const webhook_secret = process.env.CLERK_WEBHOOK_SECRET;

    if (!webhook_secret) {
      console.error('Missing CLERK_WEBHOOK_SECRET environment variable');
      return NextResponse.json(
        { error: 'Webhook secret not configured' },
        { status: 500 }
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
      console.error('Webhook signature verification failed:', err);
      return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
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
          suggestedUsername =
            'user' + Math.random().toString(36).substring(2, 8);
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

        console.log(`Post-signup processing completed for user ${user.id}`);

        return NextResponse.json({
          success: true,
          message: 'User post-signup processing completed',
          fullName,
          suggestedUsername,
        });
      } catch (error) {
        console.error(
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
          { status: 200 } // Return 200 to prevent retries for non-critical errors
        );
      }
    }

    // For other event types, just acknowledge
    return NextResponse.json({ success: true, type: evt.type });
  } catch (error) {
    console.error('Webhook processing error:', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

export const runtime = 'nodejs'; // Required for Clerk webhooks

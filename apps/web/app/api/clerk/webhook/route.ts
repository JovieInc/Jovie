import { headers } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { Webhook } from 'svix';
import { getClerkHandler } from '@/lib/auth/clerk-webhook/registry';
import type { ClerkWebhookEvent } from '@/lib/auth/clerk-webhook/types';
import { env } from '@/lib/env-server';
import { NO_STORE_HEADERS } from '@/lib/http/headers';
import { logger } from '@/lib/utils/logger';

// Module-level singleton - initialized once per cold start
let webhookVerifier: Webhook | null = null;
let webhookVerifierSecret: string | null = null;

function getWebhookVerifier(secret: string): Webhook {
  // Re-initialize if secret changed (shouldn't happen, but be safe)
  if (webhookVerifier && webhookVerifierSecret === secret) {
    return webhookVerifier;
  }
  webhookVerifier = new Webhook(secret);
  webhookVerifierSecret = secret;
  return webhookVerifier;
}

/**
 * Verify the webhook signature and extract the event.
 */
async function verifyWebhook(
  request: NextRequest
): Promise<
  { ok: true; event: ClerkWebhookEvent } | { ok: false; response: NextResponse }
> {
  const headersList = await headers();
  const svix_id = headersList.get('svix-id');
  const svix_timestamp = headersList.get('svix-timestamp');
  const svix_signature = headersList.get('svix-signature');

  if (!svix_id || !svix_timestamp || !svix_signature) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Missing svix headers' },
        { status: 400, headers: NO_STORE_HEADERS }
      ),
    };
  }

  const body = await request.text();
  const webhook_secret = env.CLERK_WEBHOOK_SECRET;

  if (!webhook_secret) {
    logger.error('Missing CLERK_WEBHOOK_SECRET environment variable');
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Webhook secret not configured' },
        { status: 500, headers: NO_STORE_HEADERS }
      ),
    };
  }

  try {
    const wh = getWebhookVerifier(webhook_secret);
    const event = wh.verify(body, {
      'svix-id': svix_id,
      'svix-timestamp': svix_timestamp,
      'svix-signature': svix_signature,
    }) as ClerkWebhookEvent;

    return { ok: true, event };
  } catch (err) {
    logger.error('Webhook signature verification failed:', err);
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Invalid signature' },
        { status: 400, headers: NO_STORE_HEADERS }
      ),
    };
  }
}

export async function POST(request: NextRequest) {
  try {
    // Verify webhook signature
    const verification = await verifyWebhook(request);
    if (!verification.ok) {
      return verification.response;
    }

    const { event } = verification;

    // Look up handler for this event type
    const handler = getClerkHandler(event.type);

    if (!handler) {
      // Unhandled event type - acknowledge but don't process
      return NextResponse.json(
        { success: true, type: event.type },
        { headers: NO_STORE_HEADERS }
      );
    }

    // Execute the handler
    const result = await handler.handle({
      event,
      clerkUserId: event.data.id,
    });

    // Return 200 to prevent Clerk from retrying, even on failure
    // (non-critical sync failures shouldn't cause retries)
    return NextResponse.json(
      { ...result, type: event.type },
      { status: 200, headers: NO_STORE_HEADERS }
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

export const runtime = 'nodejs';

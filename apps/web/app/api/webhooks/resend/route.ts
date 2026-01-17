/**
 * Resend Webhooks Handler
 * Handles email delivery events for suppression management
 *
 * Supported Events:
 * - email.bounced: Hard/soft bounces - adds to suppression list
 * - email.complained: Spam complaints - adds to suppression list
 * - email.delivered: Delivery confirmation (logged for tracking)
 *
 * Security:
 * - Verifies webhook signature using RESEND_WEBHOOK_SECRET
 * - Uses SVix signature verification (Resend's webhook provider)
 * - Idempotent - duplicate events are safely ignored
 *
 * Architecture:
 * - Raw webhook events are stored for debugging/compliance
 * - Bounce/complaint events trigger automatic suppression
 * - All events are logged for delivery tracking
 */

import { createHmac, timingSafeEqual } from 'crypto';
import { eq } from 'drizzle-orm';
import { headers } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

import { db } from '@/lib/db';
import { webhookEvents } from '@/lib/db/schema';
import { env } from '@/lib/env-server';
import { captureCriticalError } from '@/lib/error-tracking';
import {
  addSuppression,
  logDelivery,
  type SuppressionReason,
} from '@/lib/notifications/suppression';
import { logger } from '@/lib/utils/logger';

// Force Node.js runtime for crypto operations
export const runtime = 'nodejs';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

/**
 * Resend webhook event types we handle
 */
type ResendEventType =
  | 'email.sent'
  | 'email.delivered'
  | 'email.delivery_delayed'
  | 'email.bounced'
  | 'email.complained';

/**
 * Resend webhook payload structure
 */
interface ResendWebhookPayload {
  type: ResendEventType;
  created_at: string;
  data: {
    email_id: string;
    from: string;
    to: string[];
    subject: string;
    created_at: string;
    // Bounce-specific fields
    bounce?: {
      message: string;
      // Diagnostic code from receiving server
      diagnostic_code?: string;
    };
    // Complaint-specific fields
    complaint?: {
      // Feedback type from ISP
      feedback_type?: string;
    };
  };
}

/**
 * Verify Resend webhook signature using SVix format.
 * Resend uses SVix for webhook delivery which has a specific signature format.
 *
 * @param payload - Raw request body
 * @param signature - svix-signature header value
 * @param timestamp - svix-timestamp header value
 * @param secret - Webhook signing secret
 * @returns true if signature is valid
 */
function verifySignature(
  payload: string,
  signature: string,
  timestamp: string,
  secret: string
): boolean {
  try {
    // SVix signature format: v1,<base64-signature>
    const signatures = signature.split(' ');
    const signedContent = `${timestamp}.${payload}`;

    // Extract the actual secret (remove whsec_ prefix if present)
    const secretBytes = Buffer.from(
      secret.startsWith('whsec_') ? secret.slice(6) : secret,
      'base64'
    );

    const expectedSignature = createHmac('sha256', secretBytes)
      .update(signedContent)
      .digest('base64');

    // Check each provided signature
    for (const sig of signatures) {
      const [version, providedSignature] = sig.split(',');
      if (version === 'v1' && providedSignature) {
        const providedBuffer = Buffer.from(providedSignature, 'base64');
        const expectedBuffer = Buffer.from(expectedSignature, 'base64');

        if (
          providedBuffer.length === expectedBuffer.length &&
          timingSafeEqual(providedBuffer, expectedBuffer)
        ) {
          return true;
        }
      }
    }

    return false;
  } catch {
    return false;
  }
}

/**
 * Map Resend bounce/complaint to suppression reason
 */
function getSuppressionReason(
  eventType: ResendEventType,
  bounceMessage?: string
): SuppressionReason | null {
  if (eventType === 'email.complained') {
    return 'spam_complaint';
  }

  if (eventType === 'email.bounced') {
    // Check for soft bounce indicators in the message
    const softBouncePatterns = [
      /mailbox full/i,
      /over quota/i,
      /temporarily/i,
      /try again/i,
      /rate limit/i,
      /421/,
      /450/,
      /451/,
      /452/,
    ];

    if (
      bounceMessage &&
      softBouncePatterns.some(pattern => pattern.test(bounceMessage))
    ) {
      return 'soft_bounce';
    }

    return 'hard_bounce';
  }

  return null;
}

/**
 * Process a bounce or complaint event
 */
async function processBounceOrComplaint(
  event: ResendWebhookPayload,
  eventId: string
): Promise<void> {
  const { type, data } = event;
  const emails = data.to;
  const bounceMessage = data.bounce?.message;
  const complaintType = data.complaint?.feedback_type;

  const reason = getSuppressionReason(type, bounceMessage);
  if (!reason) return;

  // Calculate expiry for soft bounces (30 days)
  const expiresAt =
    reason === 'soft_bounce'
      ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      : undefined;

  // Add each recipient to suppression list
  for (const email of emails) {
    const result = await addSuppression(email, reason, 'webhook', {
      sourceEventId: eventId,
      metadata: {
        bounceCode: data.bounce?.diagnostic_code,
        bounceMessage,
        complaintType,
      },
      expiresAt,
    });

    if (!result.success) {
      logger.error(`[Resend Webhook] Failed to add suppression for ${email}`, {
        error: result.error,
        eventId,
        reason,
      });
    } else if (!result.alreadyExists) {
      logger.info(`[Resend Webhook] Added suppression`, {
        reason,
        eventId,
        emailMasked: `${email.slice(0, 3)}***@***`,
      });
    }

    // Log the delivery outcome
    await logDelivery({
      channel: 'email',
      recipientEmail: email,
      status: type === 'email.bounced' ? 'bounced' : 'complained',
      providerMessageId: data.email_id,
      errorMessage: bounceMessage || complaintType,
      metadata: {
        eventType: type,
        bounceCode: data.bounce?.diagnostic_code,
        complaintType,
      },
    });
  }
}

/**
 * Process a delivery confirmation event
 */
async function processDelivered(event: ResendWebhookPayload): Promise<void> {
  const { data } = event;

  for (const email of data.to) {
    await logDelivery({
      channel: 'email',
      recipientEmail: email,
      status: 'delivered',
      providerMessageId: data.email_id,
    });
  }
}

export async function POST(request: NextRequest) {
  const webhookSecret = env.RESEND_WEBHOOK_SECRET;

  // Check if webhook secret is configured
  if (!webhookSecret) {
    logger.warn('[Resend Webhook] RESEND_WEBHOOK_SECRET not configured');
    return NextResponse.json(
      { error: 'Webhook not configured' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }

  try {
    const body = await request.text();
    const headersList = await headers();

    // Get SVix headers used by Resend
    const svixId = headersList.get('svix-id');
    const svixTimestamp = headersList.get('svix-timestamp');
    const svixSignature = headersList.get('svix-signature');

    if (!svixId || !svixTimestamp || !svixSignature) {
      await captureCriticalError(
        'Missing Resend webhook headers',
        new Error('Missing SVix headers'),
        { route: '/api/webhooks/resend' }
      );
      return NextResponse.json(
        { error: 'Missing webhook headers' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    // Verify signature
    if (!verifySignature(body, svixSignature, svixTimestamp, webhookSecret)) {
      await captureCriticalError(
        'Invalid Resend webhook signature',
        new Error('Signature verification failed'),
        { route: '/api/webhooks/resend' }
      );
      return NextResponse.json(
        { error: 'Invalid signature' },
        { status: 401, headers: NO_STORE_HEADERS }
      );
    }

    // Parse the event
    const event = JSON.parse(body) as ResendWebhookPayload;
    const eventId = svixId;

    // Check for duplicate event (idempotency)
    const [existingEvent] = await db
      .select({ id: webhookEvents.id, processed: webhookEvents.processed })
      .from(webhookEvents)
      .where(eq(webhookEvents.eventId, eventId))
      .limit(1);

    if (existingEvent?.processed) {
      // Already processed - return success (idempotent)
      return NextResponse.json(
        { received: true, status: 'already_processed' },
        { headers: NO_STORE_HEADERS }
      );
    }

    // Store the raw event
    if (!existingEvent) {
      await db.insert(webhookEvents).values({
        provider: 'resend',
        eventType: event.type,
        eventId,
        payload: event as unknown as Record<string, unknown>,
        processed: false,
      });
    }

    // Process based on event type
    switch (event.type) {
      case 'email.bounced':
      case 'email.complained':
        await processBounceOrComplaint(event, eventId);
        break;

      case 'email.delivered':
        await processDelivered(event);
        break;

      case 'email.sent':
      case 'email.delivery_delayed':
        // Log but don't take action
        logger.info(`[Resend Webhook] ${event.type}`, {
          eventId,
          emailId: event.data.email_id,
        });
        break;

      default:
        logger.warn(`[Resend Webhook] Unknown event type: ${event.type}`, {
          eventId,
        });
    }

    // Mark event as processed
    await db
      .update(webhookEvents)
      .set({ processed: true, processedAt: new Date() })
      .where(eq(webhookEvents.eventId, eventId));

    return NextResponse.json({ received: true }, { headers: NO_STORE_HEADERS });
  } catch (error) {
    await captureCriticalError('Resend webhook processing failed', error, {
      route: '/api/webhooks/resend',
    });
    return NextResponse.json(
      { error: 'Webhook processing failed' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}

// Only allow POST requests (webhooks)
export async function GET() {
  return NextResponse.json(
    { error: 'Method not allowed' },
    { status: 405, headers: NO_STORE_HEADERS }
  );
}

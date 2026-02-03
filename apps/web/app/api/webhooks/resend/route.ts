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

import { createHmac, timingSafeEqual } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { headers } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

import { db } from '@/lib/db';
import { webhookEvents } from '@/lib/db/schema/suppression';
import { stopEnrollmentsForEmail } from '@/lib/email/campaigns/enrollment';
import { env } from '@/lib/env-server';
import { captureCriticalError } from '@/lib/error-tracking';
import {
  getCreatorByMessageId,
  recordBounce,
  recordComplaint,
  recordDelivery as recordReputationDelivery,
} from '@/lib/notifications/reputation';
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
  | 'email.complained'
  | 'email.opened'
  | 'email.clicked';

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
    // Click-specific fields
    click?: {
      // IP address of the clicker
      ip_address?: string;
      // Link that was clicked
      link?: string;
      // Timestamp of the click
      timestamp?: string;
      // User agent
      user_agent?: string;
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
    // Validate timestamp freshness (5-minute window per Svix guidelines)
    const timestampMs = Number(timestamp) * 1000;
    if (
      Number.isNaN(timestampMs) ||
      Math.abs(Date.now() - timestampMs) > 5 * 60 * 1000
    ) {
      return false;
    }

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
 * Log suppression results for all emails
 */
function logSuppressionResults(
  suppressionResults: Array<{
    email: string;
    result: { success: boolean; error?: string; alreadyExists?: boolean };
  }>,
  eventId: string,
  reason: SuppressionReason
): void {
  for (const { email, result } of suppressionResults) {
    const emailMasked = `${email.slice(0, 3)}***@***`;
    if (!result.success) {
      logger.error(`[Resend Webhook] Failed to add suppression`, {
        error: result.error,
        eventId,
        reason,
        emailMasked,
      });
    } else if (!result.alreadyExists) {
      logger.info(`[Resend Webhook] Added suppression`, {
        reason,
        eventId,
        emailMasked,
      });
    }
  }
}

/**
 * Update creator reputation based on bounce or complaint
 */
async function updateCreatorReputation(
  type: ResendEventType,
  creatorProfileId: string,
  eventId: string
): Promise<void> {
  if (type === 'email.bounced') {
    const reputationResult = await recordBounce(creatorProfileId);
    if (reputationResult.statusChanged) {
      logger.warn(
        `[Resend Webhook] Creator reputation changed to ${reputationResult.newStatus}`,
        {
          creatorProfileId,
          bounceRate: reputationResult.metrics.bounceRate,
          eventId,
        }
      );
    }
    return;
  }

  if (type === 'email.complained') {
    const reputationResult = await recordComplaint(creatorProfileId);
    if (reputationResult.statusChanged) {
      logger.warn(
        `[Resend Webhook] Creator reputation changed to ${reputationResult.newStatus}`,
        {
          creatorProfileId,
          complaintRate: reputationResult.metrics.complaintRate,
          eventId,
        }
      );
    }
  }
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

  // Look up which creator sent this email (for reputation tracking)
  const creatorProfileId = await getCreatorByMessageId(data.email_id);

  // Add all recipients to suppression list in parallel
  const suppressionResults = await Promise.all(
    emails.map(email =>
      addSuppression(email, reason, 'webhook', {
        sourceEventId: eventId,
        metadata: {
          bounceCode: data.bounce?.diagnostic_code,
          bounceMessage,
          complaintType,
        },
        expiresAt,
      }).then(result => ({ email, result }))
    )
  );

  logSuppressionResults(suppressionResults, eventId, reason);

  // Attribute bounce/complaint to the sending creator's reputation
  if (creatorProfileId) {
    await updateCreatorReputation(type, creatorProfileId, eventId);
  }

  // Log all delivery outcomes and stop campaign enrollments in parallel
  await Promise.all([
    // Log delivery outcomes
    ...emails.map(email =>
      logDelivery({
        channel: 'email',
        recipientEmail: email,
        status: type === 'email.bounced' ? 'bounced' : 'complained',
        providerMessageId: data.email_id,
        errorMessage: bounceMessage || complaintType,
        metadata: {
          eventType: type,
          bounceCode: data.bounce?.diagnostic_code,
          complaintType,
          ...(creatorProfileId && { creatorProfileId }),
        },
      })
    ),
    // Stop campaign enrollments for bounced/complained emails
    ...emails.map(email =>
      stopEnrollmentsForEmail(
        email,
        type === 'email.bounced' ? 'bounced' : 'complained'
      )
    ),
  ]);
}

/**
 * Process an open or click event from Resend
 * Note: We also have our own tracking via email pixels and wrapped links,
 * but this provides a backup signal from Resend's tracking.
 */
async function processOpenOrClick(
  event: ResendWebhookPayload,
  eventId: string
): Promise<void> {
  const { type, data } = event;
  const eventName = type === 'email.opened' ? 'open' : 'click';

  logger.info(`[Resend Webhook] ${type}`, {
    eventId,
    emailId: data.email_id,
    clickLink: data.click?.link,
  });

  // Log the engagement event
  await Promise.all(
    data.to.map(email =>
      logDelivery({
        channel: 'email',
        recipientEmail: email,
        status: 'delivered', // Opens/clicks imply delivery
        providerMessageId: data.email_id,
        metadata: {
          eventType: type,
          engagementType: eventName,
          clickLink: data.click?.link,
          clickUserAgent: data.click?.user_agent,
        },
      })
    )
  );
}

/**
 * Process a delivery confirmation event
 */
async function processDelivered(event: ResendWebhookPayload): Promise<void> {
  const { data } = event;

  // Look up which creator sent this email (for reputation tracking)
  const creatorProfileId = await getCreatorByMessageId(data.email_id);

  // Track delivery in creator's reputation if attributed
  if (creatorProfileId) {
    await recordReputationDelivery(creatorProfileId);
  }

  // Log all deliveries in parallel
  await Promise.all(
    data.to.map(email =>
      logDelivery({
        channel: 'email',
        recipientEmail: email,
        status: 'delivered',
        providerMessageId: data.email_id,
        ...(creatorProfileId && {
          metadata: { creatorProfileId },
        }),
      })
    )
  );
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

    // Atomic insert with conflict handling (prevents TOCTOU race condition)
    await db
      .insert(webhookEvents)
      .values({
        provider: 'resend',
        eventType: event.type,
        eventId,
        payload: event as unknown as Record<string, unknown>,
        processed: false,
      })
      .onConflictDoNothing({
        target: [webhookEvents.provider, webhookEvents.eventId],
      });

    // Check if already processed (after atomic insert ensures row exists)
    const [existingEvent] = await db
      .select({ processed: webhookEvents.processed })
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

    // Process based on event type
    switch (event.type) {
      case 'email.bounced':
      case 'email.complained':
        await processBounceOrComplaint(event, eventId);
        break;

      case 'email.delivered':
        await processDelivered(event);
        break;

      case 'email.opened':
      case 'email.clicked':
        await processOpenOrClick(event, eventId);
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

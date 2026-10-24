/**
 * Stripe Webhooks Handler
 * Handles subscription events and updates user billing status
 * Webhooks are the source of truth for billing status
 *
 * Hardened with:
 * - Event ordering via stripeCreatedAt to skip stale events
 * - Optimistic locking to prevent concurrent overwrites
 * - Audit logging for all state changes
 * - Expanded payment failure handling
 *
 * Security Notes:
 * - Stripe customer IDs and subscription IDs are considered PII and are NOT logged
 * - Only internal user IDs, event IDs, event types, and price IDs are safe to log
 * - All errors are sent to error tracking with sanitized context
 *
 * Architecture:
 * - This route handles signature verification and idempotency
 * - Idempotency relies on the unique constraint on stripe_event_id (not transactions)
 * - Neon HTTP driver does not support transactions; operations are sequential
 * - Event processing is delegated to domain-specific handlers via getHandler()
 * - Handlers are registered in lib/stripe/webhooks/registry.ts
 */

import { createHash } from 'node:crypto';
import * as Sentry from '@sentry/nextjs';
import { and, eq, isNull, lt, or } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { stripeWebhookEvents } from '@/lib/db/schema/billing';
import { env } from '@/lib/env-server';
import { captureCriticalError } from '@/lib/error-tracking';
import { withSystemIngestionSession } from '@/lib/ingestion/session';
import { captureRevenueSpineFailure } from '@/lib/observability/revenue-spine';
import { stripe } from '@/lib/stripe/client';
import {
  getStripeObjectId,
  stripeTimestampToDate,
} from '@/lib/stripe/webhooks';
import { processStripeWebhookEvent } from '@/lib/stripe/webhooks/process-event';
import {
  isStripeReconciliationRequiredError,
  markStripeEventNeedsReconciliation,
  reconciledAtOnSuccess,
  reconciledStatusOnSuccess,
} from '@/lib/stripe/webhooks/reconciliation';
import { logger } from '@/lib/utils/logger';

// Force Node.js runtime for Stripe SDK compatibility
export const runtime = 'nodejs';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;
const WEBHOOK_PROCESSING_LEASE_MS = 5 * 60 * 1000;

/**
 * Build attribution context for a signature verification failure.
 *
 * Verification failed, so nothing in the payload can be trusted — the event
 * ID parsed from the raw body is diagnostic-only and must never drive
 * processing. Endpoint mode and a truncated secret fingerprint let us
 * attribute secret/deploy skew bursts (JOV-5851, JOV-1617) in Sentry without
 * logging the secret itself.
 */
function buildSignatureFailureContext(
  body: string,
  signatureHeader: string,
  webhookSecret: string
): Record<string, unknown> {
  let unverifiedEventId: string | undefined;
  try {
    const parsed: unknown = JSON.parse(body);
    if (
      parsed !== null &&
      typeof parsed === 'object' &&
      typeof (parsed as { id?: unknown }).id === 'string'
    ) {
      unverifiedEventId = (parsed as { id: string }).id;
    }
  } catch {
    // Body was not JSON — nothing to attribute.
  }

  const signatureTimestamp = /(?:^|,)t=(\d+)/.exec(signatureHeader)?.[1];
  const signatureSchemeCount = (signatureHeader.match(/(?:^|,)v\d+=/g) ?? [])
    .length;

  const secretKey = env.STRIPE_SECRET_KEY?.trim();
  const endpointMode = secretKey?.startsWith('sk_live_')
    ? 'live'
    : secretKey?.startsWith('sk_test_')
      ? 'test'
      : 'unknown';

  return {
    route: '/api/stripe/webhooks',
    error_class: 'stripe_signature_verification_failed',
    unverifiedEventId,
    endpointMode,
    signatureTimestamp,
    signatureSchemeCount,
    webhookSecretFingerprint: createHash('sha256')
      .update(webhookSecret)
      .digest('hex')
      .slice(0, 12),
  };
}

export async function POST(request: NextRequest) {
  const webhookSecret = env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!webhookSecret) {
    captureRevenueSpineFailure({
      stage: 'webhook',
      failureCode: 'configuration_missing',
      severity: 'blocked',
    });
    Sentry.addBreadcrumb({
      category: 'billing',
      message:
        'Webhook received but STRIPE_WEBHOOK_SECRET is missing — all webhooks will fail',
      level: 'fatal',
    });
    await captureCriticalError(
      'STRIPE_WEBHOOK_SECRET is not configured — production webhooks are broken',
      new Error('Missing STRIPE_WEBHOOK_SECRET environment variable'),
      { route: '/api/stripe/webhooks' }
    );
    return NextResponse.json(
      { error: 'Webhook not configured' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }

  try {
    const body = await request.text();
    const signature = request.headers.get('stripe-signature');

    if (!signature) {
      // Unsigned POSTs are expected probe/scanner noise on a public webhook.
      // Reject them, but do not page Sentry. Stripe always sends
      // `stripe-signature`. Invalid signatures below remain critical.
      logger.warn('[Stripe Webhook] Missing stripe-signature header');
      return NextResponse.json(
        { error: 'Missing signature' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    // Verify webhook signature
    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
    } catch (error) {
      captureRevenueSpineFailure({
        stage: 'webhook',
        failureCode: 'invalid_signature',
        severity: 'unknown',
      });
      await captureCriticalError(
        'Invalid Stripe webhook signature',
        error,
        buildSignatureFailureContext(body, signature, webhookSecret)
      );
      return NextResponse.json(
        { error: 'Invalid signature' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const stripeCreatedAt = stripeTimestampToDate(event.created);

    // Durable webhook processing lease with idempotency via unique constraint:
    // 1. Insert-or-skip webhook record (unique on stripe_event_id)
    // 2. Check if already processed
    // 3. Atomically claim an unprocessed or expired lease
    // 4. Process the event
    // 5. Mark as processed
    // If the claim fails, the unprocessed record remains and Stripe's retry
    // will re-attempt without requiring a transaction.
    let leaseClaimed = false;
    let leaseStartedAt: Date | null = null;
    let webhookRecordId: string | null = null;
    try {
      // Attempt insert; unique constraint on stripeEventId handles duplicates
      const [insertedRecord] = await withSystemIngestionSession(tx =>
        tx
          .insert(stripeWebhookEvents)
          .values({
            stripeEventId: event.id,
            type: event.type,
            stripeObjectId: getStripeObjectId(event),
            stripeCreatedAt,
            payload: event as unknown as Record<string, unknown>,
          })
          .onConflictDoNothing()
          .returning({ id: stripeWebhookEvents.id })
      );

      if (insertedRecord) {
        // New event — use the newly inserted record
        webhookRecordId = insertedRecord.id;
      } else {
        // Conflict: event already exists — check if already processed
        const [existingEvent] = await withSystemIngestionSession(tx =>
          tx
            .select({
              id: stripeWebhookEvents.id,
              processedAt: stripeWebhookEvents.processedAt,
            })
            .from(stripeWebhookEvents)
            .where(eq(stripeWebhookEvents.stripeEventId, event.id))
            .limit(1)
        );

        if (!existingEvent) {
          throw new Error(
            'Webhook record disappeared after conflict — possible data race'
          );
        }

        if (existingEvent.processedAt) {
          // Already processed — skip (idempotent)
          return NextResponse.json(
            { received: true },
            { headers: NO_STORE_HEADERS }
          );
        }

        // Exists but unprocessed (previous failure) — retry processing
        webhookRecordId = existingEvent.id;
      }

      // A unique insert prevents duplicate records, but it does not prevent
      // two requests from both reading the same unprocessed record. Claiming
      // with a compare-and-set lease closes that race without requiring a
      // transaction, which the Neon HTTP driver does not support.
      if (!webhookRecordId) {
        throw new Error('Webhook record ID was not resolved');
      }
      const claimedWebhookRecordId = webhookRecordId;
      const leaseCutoff = new Date(Date.now() - WEBHOOK_PROCESSING_LEASE_MS);
      leaseStartedAt = new Date();
      const claimedLeaseStartedAt = leaseStartedAt;
      const [claimedRecord] = await withSystemIngestionSession(tx =>
        tx
          .update(stripeWebhookEvents)
          .set({ processingStartedAt: claimedLeaseStartedAt })
          .where(
            and(
              eq(stripeWebhookEvents.id, claimedWebhookRecordId),
              isNull(stripeWebhookEvents.processedAt),
              or(
                isNull(stripeWebhookEvents.processingStartedAt),
                lt(stripeWebhookEvents.processingStartedAt, leaseCutoff)
              )
            )
          )
          .returning({ id: stripeWebhookEvents.id })
      );

      if (!claimedRecord) {
        // Another request owns the active lease, but it has not durably
        // completed yet. A 2xx here could make Stripe stop retrying before the
        // owner fails, so keep this delivery retryable until processed_at exists.
        return NextResponse.json(
          { error: 'Webhook processing in progress' },
          {
            status: 503,
            headers: { ...NO_STORE_HEADERS, 'Retry-After': '5' },
          }
        );
      }
      leaseClaimed = true;

      // Process the event (handlers throw on failure)
      await processStripeWebhookEvent(event, stripeCreatedAt);

      // Mark event as processed (and reconciled, if it was flagged earlier)
      const processedAt = new Date();
      const [processedRecord] = await withSystemIngestionSession(tx =>
        tx
          .update(stripeWebhookEvents)
          .set({
            processedAt,
            processingStartedAt: null,
            reconciliationStatus: reconciledStatusOnSuccess,
            reconciledAt: reconciledAtOnSuccess(processedAt),
          })
          .where(
            and(
              eq(stripeWebhookEvents.id, claimedWebhookRecordId),
              eq(
                stripeWebhookEvents.processingStartedAt,
                claimedLeaseStartedAt
              ),
              isNull(stripeWebhookEvents.processedAt)
            )
          )
          .returning({ id: stripeWebhookEvents.id })
      );

      if (!processedRecord) {
        throw new Error(
          'Webhook processing lease ownership was lost before completion'
        );
      }
    } catch (processingError) {
      // A verified event that cannot be applied yet (unmapped price) may be
      // acknowledged only once it is durably marked for reconciliation. If
      // that write fails, fall through to the 5xx path so Stripe retries.
      if (
        isStripeReconciliationRequiredError(processingError) &&
        leaseClaimed &&
        leaseStartedAt &&
        webhookRecordId
      ) {
        try {
          await markStripeEventNeedsReconciliation({
            webhookRecordId,
            stripeEventId: event.id,
            eventType: event.type,
            route: '/api/stripe/webhooks',
            error: processingError,
            leaseStartedAt,
          });
          return NextResponse.json(
            { received: true, reconciliation: 'needs_reconciliation' },
            { headers: NO_STORE_HEADERS }
          );
        } catch (captureError) {
          logger.warn('Stripe webhook reconciliation capture failed', {
            eventId: event.id,
            error: captureError,
          });
        }
      }
      captureRevenueSpineFailure({
        stage: 'webhook',
        severity: 'blocked',
        error: processingError,
      });
      // Release the lease on handled failures so Stripe retries immediately;
      // an abrupt process exit still self-heals when the lease expires.
      if (leaseClaimed && leaseStartedAt && webhookRecordId) {
        const failedLeaseStartedAt = leaseStartedAt;
        const failedWebhookRecordId = webhookRecordId;
        try {
          await withSystemIngestionSession(tx =>
            tx
              .update(stripeWebhookEvents)
              .set({ processingStartedAt: null })
              .where(
                and(
                  eq(stripeWebhookEvents.id, failedWebhookRecordId),
                  eq(
                    stripeWebhookEvents.processingStartedAt,
                    failedLeaseStartedAt
                  ),
                  isNull(stripeWebhookEvents.processedAt)
                )
              )
          );
        } catch (leaseReleaseError) {
          logger.warn('Stripe webhook lease release failed', {
            eventId: event.id,
            error: leaseReleaseError,
          });
        }
      }
      await captureCriticalError(
        'Stripe webhook processing failed',
        processingError,
        {
          route: '/api/stripe/webhooks',
          eventId: event.id,
          eventType: event.type,
        }
      );
      return NextResponse.json(
        { error: 'Webhook processing failed' },
        { status: 500, headers: NO_STORE_HEADERS }
      );
    }

    return NextResponse.json({ received: true }, { headers: NO_STORE_HEADERS });
  } catch (error) {
    captureRevenueSpineFailure({
      stage: 'webhook',
      severity: 'blocked',
      error,
    });
    await captureCriticalError('Stripe webhook processing failed', error, {
      route: '/api/stripe/webhooks',
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

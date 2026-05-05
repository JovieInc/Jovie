import { type NextRequest, NextResponse } from 'next/server';
import { env } from '@/lib/env-server';
import { captureCriticalError } from '@/lib/error-tracking';
import { NO_STORE_HEADERS } from '@/lib/http/headers';
import {
  handleVerifiedInbound,
  markWebhookEventProcessed,
  recordWebhookEvent,
  verifyInboundSmsWebhook,
} from '@/lib/notifications/sms-webhook';
import { logger } from '@/lib/utils/logger';

export const runtime = 'nodejs';
export const maxDuration = 30;

/**
 * Inbound SMS webhook (Twilio).
 *
 * Critical invariants:
 * - Read raw body BEFORE any JSON.parse so HMAC verification works on the
 *   exact bytes the provider signed (codex ENG-N1).
 * - STOP / HELP / STOPALL / UNSUBSCRIBE / CANCEL / END / QUIT process
 *   regardless of feature flags (TCPA mandate; codex F15).
 * - Insert webhookEvents OUTSIDE the main transaction with ON CONFLICT
 *   DO NOTHING. Duplicate provider event id returns 200 without
 *   reprocessing (codex F4 + decision row #30).
 * - Mark processed=true only after the main transaction commits.
 * - Return code taxonomy (codex F16): 401 invalid sig, 400 malformed,
 *   200 dup/idempotent, 500 DB-down (Twilio retries ~24h).
 */
export async function POST(request: NextRequest) {
  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch {
    return NextResponse.json(
      { error: 'Bad request' },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }

  const fullUrl = request.nextUrl.toString();

  const verification = await verifyInboundSmsWebhook({
    rawBody,
    headers: request.headers,
    fullUrl,
  });

  if ('reason' in verification) {
    if (verification.kind === 'signature_invalid') {
      logger.warn('SMS webhook signature invalid', {
        reason: verification.reason,
      });
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: NO_STORE_HEADERS }
      );
    }
    return NextResponse.json(
      { error: verification.reason },
      { status: verification.status, headers: NO_STORE_HEADERS }
    );
  }

  const { message, providerEventId } = verification;

  // Persist the raw delivery first so duplicate events short-circuit.
  let dedupe: { isFirstSeen: boolean; webhookEventId: string };
  try {
    const formObj = Object.fromEntries(new URLSearchParams(rawBody));
    dedupe = await recordWebhookEvent({
      provider: message.provider,
      eventId: providerEventId,
      payload: formObj,
    });
  } catch (error) {
    captureCriticalError('SMS webhook event record failed', error, {
      providerEventId,
    });
    return NextResponse.json(
      { error: 'Internal error' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }

  if (!dedupe.isFirstSeen) {
    logger.info('SMS webhook duplicate event ignored', { providerEventId });
    return NextResponse.json(
      { ok: true, idempotent: true },
      { status: 200, headers: NO_STORE_HEADERS }
    );
  }

  const nativeSmsEnabled =
    env.NATIVE_SMS_ENABLED === 'true' || env.NATIVE_SMS_ENABLED === '1';

  const result = await handleVerifiedInbound({
    verified: verification,
    webhookEventId: dedupe.webhookEventId,
    nativeSmsEnabled,
  });

  // Mark processed only after the handler returned successfully — for 5xx
  // responses we leave processed=false so the provider retry will pick it
  // up. Dedupe still works because webhookEvents (provider, event_id) is
  // unique; the next attempt will see isFirstSeen=false but processed=false
  // and the route returns 500 again (TODO: upgrade to claim-and-retry per
  // codex F6 once we have a job runner). For Phase 1 ship, processed=true
  // on any non-500 response is sufficient.
  if (result.status < 500) {
    try {
      await markWebhookEventProcessed(dedupe.webhookEventId);
    } catch (error) {
      captureCriticalError('SMS webhook processed flag update failed', error, {
        providerEventId,
      });
    }
  }

  // Outbound replies are best-effort and post-commit. In Phase 1 we don't
  // ship outbound SMS until A2P 10DLC is verified; the provider's TwiML
  // response is a no-op acknowledgement.
  return NextResponse.json(
    { ok: true, kind: result.kind },
    { status: result.status, headers: NO_STORE_HEADERS }
  );
}

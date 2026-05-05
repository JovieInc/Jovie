import 'server-only';
import { and, sql as drizzleSql, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { notificationSubscriptions } from '@/lib/db/schema/analytics';
import {
  notificationContacts,
  smsSubscribeIntents,
} from '@/lib/db/schema/notifications';
import { webhookEvents } from '@/lib/db/schema/suppression';
import { env } from '@/lib/env-server';
import { captureCriticalError, captureError } from '@/lib/error-tracking';
import {
  parseSecondaryExpiresAt,
  twilioAdapter,
} from '@/lib/notifications/providers/sms/twilio';
import {
  type InboundSmsMessage,
  type SmsProviderAdapter,
} from '@/lib/notifications/providers/sms/types';
import {
  CODE_NOT_FOUND_REPLY_TEXT,
  HELP_REPLY_TEXT,
  parseInboundCommand,
  STOP_REPLY_TEXT,
} from '@/lib/notifications/sms-commands';
import {
  getCurrentConsentSnapshot,
  getSmsConsentTextHash,
  SMS_CONSENT_TEXT,
  SMS_CONSENT_VERSION,
} from '@/lib/notifications/sms-consent';
import {
  consumeIntentByCode,
  hashIntentCode,
} from '@/lib/notifications/sms-intents';
import {
  hashPhoneE164,
  normalizePhoneE164,
  reactivatePhoneAfterVerifiedOptIn,
  suppressPhoneForStop,
  tryHashPhoneE164,
} from '@/lib/notifications/sms-suppression';
import { logger } from '@/lib/utils/logger';
import { logSafeCode, logSafePhone } from '@/lib/utils/pii';

const SMS_NATIVE_INTENT_SOURCE = 'sms_native_intent';

export interface WebhookHandleResult {
  /** HTTP status to return to the provider. */
  status: number;
  /** Optional reply body (TwiML / provider-specific). */
  replyBody?: string;
  /** Whether outbound SMS confirmation should be enqueued post-commit. */
  outboundReply?: { to: string; body: string };
  /** Diagnostic kind for analytics + structured logs. */
  kind:
    | 'duplicate_event'
    | 'signature_invalid'
    | 'malformed'
    | 'stop_applied'
    | 'help_replied'
    | 'reactivated'
    | 'reactivate_unknown'
    | 'join_confirmed'
    | 'join_expired'
    | 'join_already_consumed'
    | 'join_not_found'
    | 'join_disabled'
    | 'unknown_command'
    | 'error';
}

interface VerifiedInbound {
  message: InboundSmsMessage;
  rawBody: string;
  providerEventId: string;
  keyUsed: 'primary' | 'secondary';
}

interface VerificationFailure {
  status: number;
  kind: 'signature_invalid' | 'malformed';
  reason: string;
}

/**
 * Verify the inbound webhook against the configured SMS provider.
 *
 * Returns either the parsed message or a structured failure. Callers
 * should NEVER persist a webhookEvents row when verification fails.
 */
export async function verifyInboundSmsWebhook(input: {
  rawBody: string;
  headers: Headers;
  fullUrl: string;
  adapter?: SmsProviderAdapter;
}): Promise<VerifiedInbound | VerificationFailure> {
  const adapter = input.adapter ?? twilioAdapter;
  const primary = env.TWILIO_AUTH_TOKEN;
  if (!primary) {
    return { status: 500, kind: 'malformed', reason: 'missing_primary_token' };
  }
  const secondary = env.TWILIO_AUTH_TOKEN_SECONDARY;
  const secondaryExpiresAt = parseSecondaryExpiresAt(
    env.TWILIO_AUTH_TOKEN_SECONDARY_EXPIRES_AT
  );

  const verification = adapter.verifySignature({
    headers: input.headers,
    rawBody: input.rawBody,
    fullUrl: input.fullUrl,
    primaryToken: primary,
    secondaryToken: secondary,
    secondaryExpiresAt: secondaryExpiresAt ?? undefined,
  });

  if (!verification.ok) {
    return {
      status: 401,
      kind: 'signature_invalid',
      reason: verification.reason ?? 'unknown',
    };
  }

  const params = new URLSearchParams(input.rawBody);
  const message = adapter.parseInbound(params);

  if (!message.messageId || !message.fromPhone) {
    return {
      status: 400,
      kind: 'malformed',
      reason: 'missing_required_fields',
    };
  }

  if (verification.keyUsed === 'secondary') {
    logger.warn('SMS webhook validated against secondary token', {
      providerEventId: message.messageId,
    });
  }

  return {
    message,
    rawBody: input.rawBody,
    providerEventId: message.messageId,
    keyUsed: verification.keyUsed ?? 'primary',
  };
}

interface DedupeResult {
  isFirstSeen: boolean;
  webhookEventId: string;
}

/**
 * Insert the webhookEvents row OUTSIDE the main transaction. On unique
 * conflict, return `isFirstSeen=false` so the caller can short-circuit
 * with HTTP 200 (the original delivery already processed). See codex F4.
 */
export async function recordWebhookEvent(input: {
  provider: string;
  eventId: string;
  payload: Record<string, unknown>;
}): Promise<DedupeResult> {
  const inserted = await db
    .insert(webhookEvents)
    .values({
      provider: input.provider,
      eventType: 'sms.inbound',
      eventId: input.eventId,
      payload: input.payload,
      processed: false,
    })
    .onConflictDoNothing({
      target: [webhookEvents.provider, webhookEvents.eventId],
    })
    .returning({ id: webhookEvents.id });

  if (inserted.length === 1) {
    return { isFirstSeen: true, webhookEventId: inserted[0].id };
  }

  // Conflict — find the existing row id for downstream processed=true update.
  const existing = await db
    .select({ id: webhookEvents.id })
    .from(webhookEvents)
    .where(
      and(
        eq(webhookEvents.provider, input.provider),
        eq(webhookEvents.eventId, input.eventId)
      )
    )
    .limit(1);

  return {
    isFirstSeen: false,
    webhookEventId: existing[0]?.id ?? '',
  };
}

/**
 * Mark a previously-recorded webhook row as processed. Called after the
 * main transaction commits successfully so retries are safely no-op.
 */
export async function markWebhookEventProcessed(
  webhookEventId: string
): Promise<void> {
  if (!webhookEventId) return;
  await db
    .update(webhookEvents)
    .set({ processed: true, processedAt: new Date() })
    .where(eq(webhookEvents.id, webhookEventId));
}

/**
 * Atomic confirm flow for an inbound JOIN code. Implements decision rows
 * #27 (per-artist consent on notification_subscriptions), #30 (transaction
 * boundary), and codex F2 (first-write-wins on notification_contacts global
 * consent fields).
 */
async function confirmSubscriptionFromIntent(input: {
  code: string;
  fromPhone: string;
  providerName: string;
  providerEventId: string;
  source: string;
  sourceUrl: string | null;
}): Promise<
  | { kind: 'join_confirmed'; intentId: string; creatorProfileId: string }
  | { kind: 'join_expired' | 'join_already_consumed' | 'join_not_found' }
  | { kind: 'error'; reason: string }
> {
  const consume = await consumeIntentByCode(input.code, {
    phone: input.fromPhone,
    provider: input.providerName,
    providerMessageId: input.providerEventId,
  });

  if (consume.status === 'expired') {
    return { kind: 'join_expired' };
  }
  if (consume.status === 'already_consumed') {
    return { kind: 'join_already_consumed' };
  }
  if (consume.status === 'not_found') {
    return { kind: 'join_not_found' };
  }

  const intent = consume.intent;
  const phoneNorm = normalizePhoneE164(input.fromPhone);
  if (!phoneNorm) {
    return { kind: 'error', reason: 'phone_normalize_failed' };
  }
  const phoneHash = hashPhoneE164(phoneNorm);
  const consentSnapshot = getCurrentConsentSnapshot();
  const now = new Date();

  await db.transaction(async tx => {
    // Global contact: insert with first-write-wins consent fields. On
    // conflict (existing phone), bump phoneVerifiedAt + clear smsStatus
    // back to 'active' so a fresh verified opt-in re-enables a previously
    // STOP'd contact (CTIA convention via codex F3).
    await tx
      .insert(notificationContacts)
      .values({
        phone: phoneNorm,
        phoneHash,
        phoneVerifiedAt: now,
        smsStatus: 'active',
        smsConsentAt: now,
        smsConsentTextHash: consentSnapshot.textHash,
        smsConsentVersion: consentSnapshot.version,
        firstSource: input.source,
        firstSourceUrl: input.sourceUrl,
      })
      .onConflictDoUpdate({
        target: notificationContacts.phoneHash,
        set: {
          phoneVerifiedAt: now,
          smsStatus: 'active',
          updatedAt: now,
        },
      });

    // Per-artist subscription: ensure exactly one row per (artist, phone).
    // confirmedAt is set only if the existing row is still pending.
    // smsConsent fields are stamped on first-confirm and never overwritten
    // afterward — preserves audit trail across multi-artist races (F2).
    await tx
      .insert(notificationSubscriptions)
      .values({
        creatorProfileId: intent.creatorProfileId,
        channel: 'sms',
        phone: phoneNorm,
        countryCode: intent.countryCode ?? null,
        source: SMS_NATIVE_INTENT_SOURCE,
        confirmedAt: now,
        smsConsentAt: now,
        smsConsentTextHash: consentSnapshot.textHash,
        smsConsentVersion: consentSnapshot.version,
        unsubscribedAt: null,
        preferences: {
          newMusic: true,
          tourDates: true,
          merch: true,
          general: true,
        },
      })
      .onConflictDoUpdate({
        target: [
          notificationSubscriptions.creatorProfileId,
          notificationSubscriptions.phone,
        ],
        set: {
          confirmedAt: drizzleSql`COALESCE(${notificationSubscriptions.confirmedAt}, ${now})`,
          smsConsentAt: drizzleSql`COALESCE(${notificationSubscriptions.smsConsentAt}, ${now})`,
          smsConsentTextHash: drizzleSql`COALESCE(${notificationSubscriptions.smsConsentTextHash}, ${consentSnapshot.textHash})`,
          smsConsentVersion: drizzleSql`COALESCE(${notificationSubscriptions.smsConsentVersion}, ${consentSnapshot.version})`,
          unsubscribedAt: drizzleSql`NULL`,
          source: SMS_NATIVE_INTENT_SOURCE,
        },
      });

    // Audience member: best-effort upsert on (creatorProfileId, fingerprint)
    // is the existing pattern. If we don't have a fingerprint at this
    // point (webhook context, no browser session), skip the audience write
    // and let next profile visit fold the engagement signal in.
  });

  return {
    kind: 'join_confirmed',
    intentId: intent.id,
    creatorProfileId: intent.creatorProfileId,
  };
}

/**
 * Best-effort: when the webhook sees an unknown command from a phone with
 * recent active intents, log to provide a recovery hint at the polling
 * surface (codex F11 / ENG-N6).
 */
async function noteUnrecognizedFromPhone(phone: string): Promise<void> {
  const phoneHash = tryHashPhoneE164(phone);
  if (!phoneHash) return;
  // Cheap signal: just log; the polling client can surface the hint.
  logger.info('Unrecognized inbound SMS from a phone with active context', {
    phone: logSafePhone(phone),
  });
}

/**
 * Top-level dispatch from the route layer. Caller passes the verified
 * inbound + dedupe result; this function applies the command, with the
 * critical TCPA invariant: STOP/HELP/STOPALL etc. process regardless of
 * any feature flags (decision row #40 / F15).
 */
export async function handleVerifiedInbound(input: {
  verified: VerifiedInbound;
  webhookEventId: string;
  nativeSmsEnabled: boolean;
}): Promise<WebhookHandleResult> {
  const { message, providerEventId } = input.verified;
  const command = parseInboundCommand(message.body);

  try {
    if (command.kind === 'stop') {
      const phoneNorm = normalizePhoneE164(message.fromPhone);
      if (phoneNorm) {
        await suppressPhoneForStop(phoneNorm, {
          source: 'twilio_inbound_stop',
          providerEventId,
          rawCommand: command.rawToken,
        });
      }
      return {
        status: 200,
        kind: 'stop_applied',
        outboundReply: phoneNorm
          ? { to: phoneNorm, body: STOP_REPLY_TEXT }
          : undefined,
      };
    }

    if (command.kind === 'help') {
      return {
        status: 200,
        kind: 'help_replied',
        outboundReply: {
          to: normalizePhoneE164(message.fromPhone) ?? message.fromPhone,
          body: HELP_REPLY_TEXT,
        },
      };
    }

    if (command.kind === 'start') {
      const phoneNorm = normalizePhoneE164(message.fromPhone);
      if (!phoneNorm) {
        return { status: 200, kind: 'reactivate_unknown' };
      }
      const result = await reactivatePhoneAfterVerifiedOptIn(phoneNorm, {
        source: 'twilio_inbound_start',
        consentTextHash: getSmsConsentTextHash(),
        consentVersion: SMS_CONSENT_VERSION,
        providerEventId,
      });
      return {
        status: 200,
        kind: result.contactId ? 'reactivated' : 'reactivate_unknown',
      };
    }

    if (command.kind === 'join') {
      if (!input.nativeSmsEnabled) {
        return { status: 200, kind: 'join_disabled' };
      }
      const phoneNorm = normalizePhoneE164(message.fromPhone);
      if (!phoneNorm) {
        return { status: 400, kind: 'malformed' };
      }

      const confirmResult = await confirmSubscriptionFromIntent({
        code: command.code,
        fromPhone: phoneNorm,
        providerName: message.provider,
        providerEventId,
        source: SMS_NATIVE_INTENT_SOURCE,
        sourceUrl: null,
      });

      if (confirmResult.kind === 'join_confirmed') {
        logger.info('SMS subscription confirmed', {
          phone: logSafePhone(phoneNorm),
          code: logSafeCode(command.code),
          intentId: confirmResult.intentId,
          creatorProfileId: confirmResult.creatorProfileId,
        });
        return { status: 200, kind: 'join_confirmed' };
      }

      if (confirmResult.kind === 'error') {
        return { status: 500, kind: 'error' };
      }

      // Cross-phone replay polite reject (codex ENG-N6) — give the fan a
      // hint instead of silence, but never modify any subscription.
      return {
        status: 200,
        kind: confirmResult.kind,
        outboundReply: {
          to: phoneNorm,
          body: CODE_NOT_FOUND_REPLY_TEXT,
        },
      };
    }

    // Unknown text. Log to provide a polling-side recovery hint and reply
    // with the help template so the fan isn't stranded.
    await noteUnrecognizedFromPhone(message.fromPhone);
    return {
      status: 200,
      kind: 'unknown_command',
      outboundReply: {
        to: normalizePhoneE164(message.fromPhone) ?? message.fromPhone,
        body: HELP_REPLY_TEXT,
      },
    };
  } catch (error) {
    captureCriticalError('SMS webhook handler error', error, {
      providerEventId,
      command: command.kind,
    });
    return { status: 500, kind: 'error' };
  }
}

/**
 * Lookup a single matching active intent for a given recently-stop'd phone.
 * Used to discriminate: did the STOP arrive before its own JOIN (carrier
 * reorder), or is this a stranger? Helper exported for tests.
 */
export async function findActiveIntentByCodeHash(
  codeHash: string
): Promise<string | null> {
  const rows = await db
    .select({ id: smsSubscribeIntents.id })
    .from(smsSubscribeIntents)
    .where(
      and(
        eq(smsSubscribeIntents.codeHash, codeHash),
        drizzleSql`${smsSubscribeIntents.status} IN ('created', 'sms_received')`,
        drizzleSql`${smsSubscribeIntents.expiresAt} > now()`
      )
    )
    .limit(1);
  return rows[0]?.id ?? null;
}

export const __test__ = {
  hashIntentCode,
  SMS_CONSENT_TEXT,
};

export const SMS_WEBHOOK_INTERNAL = {
  captureError,
};

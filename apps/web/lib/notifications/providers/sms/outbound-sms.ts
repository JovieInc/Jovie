import 'server-only';
import { env } from '@/lib/env-server';
import { captureError } from '@/lib/error-tracking';
import { logDelivery } from '@/lib/notifications/suppression';
import { logger } from '@/lib/utils/logger';
import { type SendSmsResult, sendTwilioSms } from './twilio-sender';

function isTruthyFlag(value: string | undefined): boolean {
  return value === 'true' || value === '1';
}

/**
 * Whether outbound SMS sends are enabled for this environment.
 * Distinct from `NATIVE_SMS_ENABLED` (subscribe CTA) — this gates actual
 * provider POSTs once Twilio + A2P 10DLC are verified.
 */
export function isOutboundSmsEnabled(): boolean {
  return isTruthyFlag(env.OUTBOUND_SMS_ENABLED);
}

/**
 * Whether Twilio credentials and a sender identity are present.
 * Does not imply sends are enabled — pair with `isOutboundSmsEnabled()`.
 */
export function isOutboundSmsConfigured(): boolean {
  const hasAuth = Boolean(env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN);
  const hasSender = Boolean(
    env.TWILIO_MESSAGING_SERVICE_SID || env.TWILIO_FROM_NUMBER
  );
  return hasAuth && hasSender;
}

export interface SendOutboundSmsParams {
  /** E.164 destination phone. */
  to: string;
  /** Message body. */
  body: string;
  /** Optional delivery-log metadata (never include raw phone). */
  metadata?: Record<string, unknown>;
}

/**
 * Send an outbound SMS through the Twilio provider connector.
 * Returns a discriminated result; does not throw on provider failures.
 */
export async function sendOutboundSms(
  params: SendOutboundSmsParams
): Promise<SendSmsResult> {
  if (!isOutboundSmsEnabled()) {
    return {
      success: false,
      error: 'Outbound SMS disabled (OUTBOUND_SMS_ENABLED is not true)',
      retryable: false,
    };
  }

  return sendTwilioSms({ to: params.to, body: params.body });
}

export interface SendOutboundSmsBestEffortParams extends SendOutboundSmsParams {
  /** Short source label for logs + delivery metadata (e.g. `sms_webhook_stop`). */
  source: string;
  /** Provider inbound event id when replying from a webhook. */
  providerEventId?: string;
}

/**
 * Best-effort outbound send for post-commit webhook auto-replies.
 * Never throws; logs delivery success/failure for observability.
 */
export async function sendOutboundSmsBestEffort(
  params: SendOutboundSmsBestEffortParams
): Promise<void> {
  if (!isOutboundSmsEnabled()) {
    logger.info('[outbound-sms] Skipping outbound reply — feature disabled', {
      source: params.source,
      providerEventId: params.providerEventId,
    });
    return;
  }

  const result = await sendOutboundSms({
    to: params.to,
    body: params.body,
    metadata: params.metadata,
  });

  if (result.success) {
    await logDelivery({
      channel: 'sms',
      recipientPhone: params.to,
      status: 'sent',
      providerMessageId: result.providerMessageId,
      metadata: {
        provider: 'twilio',
        source: params.source,
        twilioStatus: result.status,
        ...(params.providerEventId && {
          providerEventId: params.providerEventId,
        }),
        ...params.metadata,
      },
    });
    return;
  }

  await logDelivery({
    channel: 'sms',
    recipientPhone: params.to,
    status: 'failed',
    errorMessage: result.error,
    metadata: {
      provider: 'twilio',
      source: params.source,
      twilioErrorCode: result.errorCode,
      twilioHttpStatus: result.httpStatus,
      retryable: result.retryable,
      ...(params.providerEventId && {
        providerEventId: params.providerEventId,
      }),
      ...params.metadata,
    },
  });

  logger.warn('[outbound-sms] Outbound SMS send failed', {
    source: params.source,
    error: result.error,
    errorCode: result.errorCode,
    httpStatus: result.httpStatus,
    providerEventId: params.providerEventId,
  });

  if (result.error) {
    captureError('Outbound SMS send failed', new Error(result.error), {
      source: params.source,
      errorCode: result.errorCode,
      httpStatus: result.httpStatus,
      provider: 'twilio',
      providerEventId: params.providerEventId,
    });
  }
}

import 'server-only';

import { createHash } from 'node:crypto';
import { listConsentedSmsRecipientPhones } from '@/lib/db/queries/analytics';
import {
  isOutboundSmsConfigured,
  isOutboundSmsEnabled,
  sendOutboundSms,
} from '@/lib/notifications/providers/sms/outbound-sms';
import { isPhoneSmsSuppressed } from '@/lib/notifications/sms-suppression';
import { logDelivery } from '@/lib/notifications/suppression';
import { logger } from '@/lib/utils/logger';
import type {
  DistributionDeliveryEvidence,
  ReleaseDistributionDraft,
  ReleaseToRevenueRunStepOutputs,
} from './types';

const MAX_SMS_RECIPIENTS_PER_DISPATCH = 500;
const MAX_PERSISTED_PROVIDER_MESSAGE_IDS = 25;

export function computeDraftPayloadDigest(body: string): string {
  return createHash('sha256').update(body, 'utf8').digest('hex');
}

export interface DraftDeliveryResult {
  readonly status: 'dispatched' | 'failed' | 'undeliverable';
  readonly delivery: DistributionDeliveryEvidence;
}

function undeliverable(
  state: DistributionDeliveryEvidence['state'],
  error: string,
  attemptedAt: string
): DraftDeliveryResult {
  return {
    status: 'undeliverable',
    delivery: {
      provider: null,
      state,
      attemptedAt,
      attemptedRecipients: 0,
      acceptedRecipients: 0,
      suppressedRecipients: 0,
      error,
    },
  };
}

async function deliverSmsDraft(input: {
  readonly draft: ReleaseDistributionDraft;
  readonly creatorProfileId: string;
  readonly runId: string;
  readonly attemptedAt: string;
}): Promise<DraftDeliveryResult> {
  const { draft, creatorProfileId, runId, attemptedAt } = input;

  if (!isOutboundSmsEnabled() || !isOutboundSmsConfigured()) {
    return undeliverable(
      'provider-not-configured',
      'Outbound SMS provider is disabled or not configured',
      attemptedAt
    );
  }

  const consented = await listConsentedSmsRecipientPhones(
    creatorProfileId,
    MAX_SMS_RECIPIENTS_PER_DISPATCH
  );
  const sendable: string[] = [];
  let suppressedRecipients = 0;
  for (const phone of consented) {
    const suppression = await isPhoneSmsSuppressed(phone);
    if (suppression.suppressed) {
      suppressedRecipients++;
      await logDelivery({
        channel: 'sms',
        recipientPhone: phone,
        status: 'suppressed',
        metadata: {
          source: 'release_distribution',
          runId,
          draftId: draft.id,
          idempotencyKey: draft.idempotencyKey,
          suppressionReason: suppression.reason,
        },
      });
    } else {
      sendable.push(phone);
    }
  }

  if (sendable.length === 0) {
    return {
      status: 'undeliverable',
      delivery: {
        provider: 'twilio',
        state: 'no-consented-recipients',
        attemptedAt,
        attemptedRecipients: 0,
        acceptedRecipients: 0,
        suppressedRecipients,
        error:
          suppressedRecipients > 0
            ? 'All consented recipients are suppressed'
            : 'No consented SMS recipients for this creator',
      },
    };
  }

  const providerMessageIds: string[] = [];
  let firstError: string | undefined;
  let retryable = false;

  for (const phone of sendable) {
    const result = await sendOutboundSms({
      to: phone,
      body: draft.body,
      metadata: {
        source: 'release_distribution',
        runId,
        draftId: draft.id,
        idempotencyKey: draft.idempotencyKey,
      },
    });

    if (result.success) {
      if (providerMessageIds.length < MAX_PERSISTED_PROVIDER_MESSAGE_IDS) {
        providerMessageIds.push(result.providerMessageId);
      }
      await logDelivery({
        channel: 'sms',
        recipientPhone: phone,
        status: 'sent',
        providerMessageId: result.providerMessageId,
        metadata: {
          source: 'release_distribution',
          provider: 'twilio',
          runId,
          draftId: draft.id,
          idempotencyKey: draft.idempotencyKey,
        },
      });
      continue;
    }

    firstError ??= result.error;
    retryable = retryable || Boolean(result.retryable);
    await logDelivery({
      channel: 'sms',
      recipientPhone: phone,
      status: 'failed',
      errorMessage: result.error,
      metadata: {
        source: 'release_distribution',
        provider: 'twilio',
        runId,
        draftId: draft.id,
        idempotencyKey: draft.idempotencyKey,
        twilioErrorCode: result.errorCode,
        twilioHttpStatus: result.httpStatus,
        retryable: result.retryable,
      },
    });
  }

  const acceptedRecipients = providerMessageIds.length;
  const allAccepted = acceptedRecipients === sendable.length;

  return {
    status: allAccepted ? 'dispatched' : 'failed',
    delivery: {
      provider: 'twilio',
      state: allAccepted ? 'accepted' : 'failed',
      attemptedAt,
      ...(allAccepted ? { acceptedAt: new Date().toISOString() } : {}),
      attemptedRecipients: sendable.length,
      acceptedRecipients,
      suppressedRecipients,
      providerMessageIds,
      ...(firstError ? { error: firstError } : {}),
      retryable,
    },
  };
}

/**
 * Provider-backed dispatch for an approved draft. Returns an honest terminal
 * state: `dispatched` only when the provider accepted the send, `failed` when
 * it attempted and was rejected, `undeliverable` when no supported path exists
 * (unsupported channel, unconfigured provider, no consented recipients, or a
 * payload mutated after approval).
 */
export async function deliverApprovedDistributionDraft(input: {
  readonly draft: ReleaseDistributionDraft;
  readonly stepOutputs: ReleaseToRevenueRunStepOutputs;
  readonly runId: string;
}): Promise<DraftDeliveryResult> {
  const { draft, stepOutputs, runId } = input;
  const attemptedAt = new Date().toISOString();

  if (
    draft.payloadDigest &&
    draft.payloadDigest !== computeDraftPayloadDigest(draft.body)
  ) {
    return undeliverable(
      'payload-mismatch',
      'Draft body changed after approval; refusing dispatch',
      attemptedAt
    );
  }

  if (draft.channel === 'sms') {
    const result = await deliverSmsDraft({
      draft,
      creatorProfileId: stepOutputs.designPartner.creatorProfileId,
      runId,
      attemptedAt,
    });
    logger.info('[release-to-revenue] sms draft delivery settled', {
      draftId: draft.id,
      runId,
      status: result.status,
      deliveryState: result.delivery.state,
      acceptedRecipients: result.delivery.acceptedRecipients,
    });
    return result;
  }

  return undeliverable(
    'unsupported-channel',
    `No provider adapter for ${draft.channel} on ${draft.platform}`,
    attemptedAt
  );
}

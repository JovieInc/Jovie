import 'server-only';

import { and, desc, eq } from 'drizzle-orm';
import {
  type AcquisitionRejection,
  buildProductGapIssue,
  dedupeProductGapIssue,
  existingRejectionDedupKey,
  isRebuildEligibleForAttempt,
  REJECTION_FUNNEL_EVENT_TYPE,
  rejectionEventDedupKey,
  resolveRejectionEventDedup,
} from '@/lib/acquisition';
import { db } from '@/lib/db';
import {
  type LeadFunnelEventMetadata,
  leadFunnelEvents,
} from '@/lib/db/schema/leads';
import { captureError } from '@/lib/error-tracking';
import { recordLeadFunnelEvent } from '@/lib/leads/funnel-events';

export interface RecordLeadRejectionEventInput {
  leadId: string;
  rejection: AcquisitionRejection;
  channel?: string | null;
  provider?: string | null;
  campaignKey?: string | null;
  variantKey?: string | null;
  occurredAt?: Date;
  verifiedProductGapIssueKeys?: readonly string[];
}

export interface RecordLeadRejectionEventResult {
  readonly action: 'insert' | 'skip' | 'record-new-attempt';
  readonly dedupKey: string;
}

function buildRejectionMetadata(
  rejection: AcquisitionRejection,
  verifiedProductGapIssueKeys: readonly string[]
): LeadFunnelEventMetadata {
  const productGapIssue = buildProductGapIssue(rejection);
  return {
    dedupKey: rejectionEventDedupKey(rejection),
    rejection,
    productGapIssue,
    productGapIssueAction: productGapIssue
      ? dedupeProductGapIssue(verifiedProductGapIssueKeys, productGapIssue)
          .action
      : null,
    rebuildEligibleForAttempt: isRebuildEligibleForAttempt({
      rejection,
      verifiedProductGapIssueKeys,
    }),
  };
}

/**
 * Record a rejection without collapsing distinct decisions onto
 * `leadId + eventType`. Replay of the same decision is a no-op. A new
 * attempt after rebuild with a different reason updates the stored event
 * so the unique funnel index cannot drop the new reason.
 */
export async function recordLeadRejectionEvent(
  input: RecordLeadRejectionEventInput
): Promise<RecordLeadRejectionEventResult> {
  const dedupKey = rejectionEventDedupKey(input.rejection);
  const verifiedKeys = input.verifiedProductGapIssueKeys ?? [];

  try {
    if (typeof db.select !== 'function' || typeof db.insert !== 'function') {
      return { action: 'insert', dedupKey };
    }

    const [existing] = await db
      .select({
        id: leadFunnelEvents.id,
        metadata: leadFunnelEvents.metadata,
      })
      .from(leadFunnelEvents)
      .where(
        and(
          eq(leadFunnelEvents.leadId, input.leadId),
          eq(leadFunnelEvents.eventType, REJECTION_FUNNEL_EVENT_TYPE)
        )
      )
      .orderBy(desc(leadFunnelEvents.occurredAt))
      .limit(1);

    const action = resolveRejectionEventDedup({
      incomingKey: dedupKey,
      existingKey: existingRejectionDedupKey(existing?.metadata),
    });

    if (action === 'skip') {
      return { action, dedupKey };
    }

    const metadata = buildRejectionMetadata(input.rejection, verifiedKeys);
    const occurredAt = input.occurredAt ?? new Date();

    if (action === 'record-new-attempt' && existing) {
      if (typeof db.update !== 'function') {
        return { action, dedupKey };
      }
      await db
        .update(leadFunnelEvents)
        .set({
          metadata,
          occurredAt,
          channel: input.channel ?? null,
          provider: input.provider ?? null,
          campaignKey: input.campaignKey ?? null,
          variantKey: input.variantKey ?? null,
        })
        .where(eq(leadFunnelEvents.id, existing.id));
      return { action, dedupKey };
    }

    await recordLeadFunnelEvent(
      {
        leadId: input.leadId,
        eventType: REJECTION_FUNNEL_EVENT_TYPE,
        channel: input.channel,
        provider: input.provider,
        campaignKey: input.campaignKey,
        variantKey: input.variantKey,
        metadata,
        occurredAt,
      },
      { idempotent: true }
    );
    return { action, dedupKey };
  } catch (error) {
    await captureError('Failed to record lead rejection event', error, {
      route: 'lib/leads/rejection-event',
      contextData: {
        leadId: input.leadId,
        dedupKey,
      },
    });
    return { action: 'insert', dedupKey };
  }
}

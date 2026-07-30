import 'server-only';

import { createHash } from 'node:crypto';
import { and, desc, eq, inArray } from 'drizzle-orm';
import {
  BRAND_DEAL_OPPORTUNITY_KIND,
  buildVerifiedPersonalEmailOpportunity,
  collectBrandDealEvidenceObjectIds,
} from '@/lib/connectors/brand-deal-opportunity';
import { extractGmailBrandDealCandidate } from '@/lib/connectors/gmail/extract-brand-deal-candidate';
import { CONNECTOR_PROVIDERS } from '@/lib/connectors/registry';
import { db } from '@/lib/db';
import {
  connectorAccounts,
  externalObjects,
  suggestedActions,
} from '@/lib/db/schema/connectors';

export type EmitBrandDealOpportunityResult =
  | { readonly created: true; readonly actionId: string }
  | {
      readonly created: false;
      readonly actionId: string | null;
      readonly reason:
        | 'invalid-opportunity'
        | 'evidence-object-not-found'
        | 'evidence-object-unsupported'
        | 'connector-account-not-connected'
        | 'connector-provider-unsupported'
        | 'evidence-already-decided'
        | 'decision-slot-occupied'
        | 'duplicate';
    };

function deterministicActionId(input: string): string {
  const hex = createHash('sha256').update(input).digest('hex');
  const variant = ((Number.parseInt(hex[16] ?? '0', 16) & 0x3) | 0x8).toString(
    16
  );
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    `4${hex.slice(13, 16)}`,
    `${variant}${hex.slice(17, 20)}`,
    hex.slice(20, 32),
  ].join('-');
}

function normalizedStringField(
  payload: unknown,
  field: 'subject' | 'from' | 'date' | 'snippet'
): string | undefined {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return undefined;
  }
  const value = (payload as Record<string, unknown>)[field];
  return typeof value === 'string' ? value : undefined;
}

export async function emitBrandDealOpportunity(input: {
  readonly userId: string;
  readonly evidenceObjectId: string;
}): Promise<EmitBrandDealOpportunityResult> {
  const [evidenceObject] = await db
    .select({
      id: externalObjects.id,
      connectorAccountId: externalObjects.connectorAccountId,
      provider: externalObjects.provider,
      kind: externalObjects.kind,
      providerId: externalObjects.providerId,
      payload: externalObjects.payload,
      fetchedAt: externalObjects.fetchedAt,
    })
    .from(externalObjects)
    .where(eq(externalObjects.id, input.evidenceObjectId))
    .limit(1);

  if (!evidenceObject) {
    return {
      created: false,
      actionId: null,
      reason: 'evidence-object-not-found',
    };
  }

  const persistedCandidate = extractGmailBrandDealCandidate({
    externalObjectId: evidenceObject.id,
    payload: {
      subject: normalizedStringField(evidenceObject.payload, 'subject'),
      from: normalizedStringField(evidenceObject.payload, 'from'),
      date: normalizedStringField(evidenceObject.payload, 'date'),
      snippet: normalizedStringField(evidenceObject.payload, 'snippet'),
    },
  });
  if (!persistedCandidate) {
    return {
      created: false,
      actionId: null,
      reason: 'invalid-opportunity',
    };
  }

  if (
    evidenceObject.provider !== CONNECTOR_PROVIDERS.gmail ||
    evidenceObject.kind !== 'gmail_message'
  ) {
    return {
      created: false,
      actionId: null,
      reason: 'evidence-object-unsupported',
    };
  }

  const [connectorAccount] = await db
    .select({
      id: connectorAccounts.id,
      provider: connectorAccounts.provider,
      providerAccountId: connectorAccounts.providerAccountId,
    })
    .from(connectorAccounts)
    .where(
      and(
        eq(connectorAccounts.id, evidenceObject.connectorAccountId),
        eq(connectorAccounts.userId, input.userId),
        eq(connectorAccounts.status, 'connected')
      )
    )
    .limit(1);

  if (!connectorAccount) {
    return {
      created: false,
      actionId: null,
      reason: 'connector-account-not-connected',
    };
  }

  if (connectorAccount.provider !== CONNECTOR_PROVIDERS.gmail) {
    return {
      created: false,
      actionId: null,
      reason: 'connector-provider-unsupported',
    };
  }

  const parsed = buildVerifiedPersonalEmailOpportunity({
    candidate: persistedCandidate.candidate,
    sourceAccount: connectorAccount.providerAccountId,
    sourceReference: `gmail:message:${evidenceObject.providerId}`,
    observedAt: evidenceObject.fetchedAt.toISOString(),
  });
  if (!parsed) {
    return {
      created: false,
      actionId: null,
      reason: 'invalid-opportunity',
    };
  }

  const priorEvidence = await db
    .select({ sourceRefs: suggestedActions.sourceRefs })
    .from(suggestedActions)
    .where(
      and(
        eq(suggestedActions.userId, input.userId),
        eq(suggestedActions.kind, BRAND_DEAL_OPPORTUNITY_KIND)
      )
    );
  if (collectBrandDealEvidenceObjectIds(priorEvidence).has(evidenceObject.id)) {
    return {
      created: false,
      actionId: null,
      reason: 'evidence-already-decided',
    };
  }

  const [activeDecision] = await db
    .select({
      id: suggestedActions.id,
      status: suggestedActions.status,
    })
    .from(suggestedActions)
    .where(
      and(
        eq(suggestedActions.userId, input.userId),
        eq(suggestedActions.kind, BRAND_DEAL_OPPORTUNITY_KIND),
        inArray(suggestedActions.status, ['pending', 'approved'])
      )
    )
    .orderBy(desc(suggestedActions.createdAt))
    .limit(1);

  if (activeDecision) {
    return {
      created: false,
      actionId: activeDecision.id,
      reason: 'decision-slot-occupied',
    };
  }

  const [latestDecision] = await db
    .select({ id: suggestedActions.id })
    .from(suggestedActions)
    .where(
      and(
        eq(suggestedActions.userId, input.userId),
        eq(suggestedActions.kind, BRAND_DEAL_OPPORTUNITY_KIND),
        inArray(suggestedActions.status, [
          'executed',
          'rejected',
          'failed',
          'expired',
        ])
      )
    )
    .orderBy(desc(suggestedActions.createdAt))
    .limit(1);

  const actionId = deterministicActionId(
    `${input.userId}:brand-deal-slot:${latestDecision?.id ?? 'initial'}`
  );
  const idempotencyKey = `brand-deal:${actionId}`;
  const inserted = await db
    .insert(suggestedActions)
    .values({
      id: actionId,
      userId: input.userId,
      kind: BRAND_DEAL_OPPORTUNITY_KIND,
      targetConnectorAccountId: connectorAccount.id,
      payload: parsed,
      signalType: 'brand_deal',
      status: 'pending',
      sourceRefs: [
        {
          connectorAccountId: connectorAccount.id,
          externalObjectId: evidenceObject.id,
          sourceType: parsed.sourceType,
          sourceReference: parsed.sourceReference,
          observedAt: parsed.observedAt,
          confidence: parsed.confidence,
        },
      ],
      rationale:
        'Complete current commercial terms found in authenticated Gmail.',
      idempotencyKey,
      sideEffects: [],
    })
    .onConflictDoNothing()
    .returning({ id: suggestedActions.id });

  return inserted.length > 0
    ? { created: true, actionId }
    : { created: false, actionId, reason: 'duplicate' };
}

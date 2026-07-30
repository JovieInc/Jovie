import 'server-only';

import { createHash } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import {
  BRAND_DEAL_OPPORTUNITY_KIND,
  parseBrandDealOpportunity,
} from '@/lib/connectors/brand-deal-opportunity';
import { CONNECTOR_PROVIDERS } from '@/lib/connectors/registry';
import { db } from '@/lib/db';
import {
  connectorAccounts,
  suggestedActions,
} from '@/lib/db/schema/connectors';

export type EmitBrandDealOpportunityResult =
  | { readonly created: true; readonly actionId: string }
  | {
      readonly created: false;
      readonly actionId: string | null;
      readonly reason:
        | 'invalid-opportunity'
        | 'connector-account-not-connected'
        | 'connector-account-mismatch'
        | 'connector-provider-unsupported'
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

export async function emitBrandDealOpportunity(input: {
  readonly userId: string;
  readonly connectorAccountId: string;
  readonly payload: unknown;
  readonly rationale: string;
}): Promise<EmitBrandDealOpportunityResult> {
  const parsed = parseBrandDealOpportunity(
    BRAND_DEAL_OPPORTUNITY_KIND,
    input.payload
  );
  if (!parsed) {
    return {
      created: false,
      actionId: null,
      reason: 'invalid-opportunity',
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
        eq(connectorAccounts.id, input.connectorAccountId),
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

  const authenticatedAccount = connectorAccount.providerAccountId
    .trim()
    .toLowerCase();
  if (
    authenticatedAccount !== parsed.sourceAccount.trim().toLowerCase() ||
    authenticatedAccount !== parsed.requiredSourceAccount.trim().toLowerCase()
  ) {
    return {
      created: false,
      actionId: null,
      reason: 'connector-account-mismatch',
    };
  }

  const [pendingDecision] = await db
    .select({ id: suggestedActions.id })
    .from(suggestedActions)
    .where(
      and(
        eq(suggestedActions.userId, input.userId),
        eq(suggestedActions.kind, BRAND_DEAL_OPPORTUNITY_KIND),
        eq(suggestedActions.status, 'pending')
      )
    )
    .limit(1);

  if (pendingDecision) {
    return {
      created: false,
      actionId: pendingDecision.id,
      reason: 'decision-slot-occupied',
    };
  }

  const actionId = deterministicActionId(
    `${input.userId}:${connectorAccount.id}:${parsed.sourceReference}`
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
          sourceType: parsed.sourceType,
          sourceReference: parsed.sourceReference,
          observedAt: parsed.observedAt,
          confidence: parsed.confidence,
        },
      ],
      rationale: input.rationale.trim() || 'Verified brand-deal opportunity.',
      idempotencyKey,
      sideEffects: [],
    })
    .onConflictDoNothing()
    .returning({ id: suggestedActions.id });

  return inserted.length > 0
    ? { created: true, actionId }
    : { created: false, actionId, reason: 'duplicate' };
}

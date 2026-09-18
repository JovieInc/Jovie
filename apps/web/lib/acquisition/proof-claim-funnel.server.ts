import 'server-only';

import { and, sql as drizzleSql, eq, gte, inArray, lte } from 'drizzle-orm';
import { db } from '@/lib/db';
import { dailyProfileViews } from '@/lib/db/schema/analytics';
import { leadFunnelEvents } from '@/lib/db/schema/leads';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { captureError } from '@/lib/error-tracking';
import {
  getLeadAttributionCookie,
  recordLeadFunnelEvent,
} from '@/lib/leads/funnel-events';
import { getRedis } from '@/lib/redis';
import {
  hasProofClaimCampaign,
  PROOF_CLAIM_ACTIVATION_ALIASES,
  PROOF_CLAIM_CAMPAIGN_KEY,
  PROOF_CLAIM_CHECKOUT_ALIASES,
  PROOF_CLAIM_FUNNEL_EVENTS,
  PROOF_PROFILE,
  type ProofClaimFunnelEvent,
  type ProofClaimFunnelReport,
  proofClaimAttribution,
  rateProofClaimFunnel,
} from './proof-claim-funnel';

const REDIS_COUNTER_PREFIX = 'proof-claim:funnel:v1';

function redisCounterKey(eventType: ProofClaimFunnelEvent): string {
  return `${REDIS_COUNTER_PREFIX}:${eventType}`;
}

export async function incrementProofClaimCounter(
  eventType: ProofClaimFunnelEvent
): Promise<number | null> {
  const redis = getRedis();
  if (!redis) return null;
  try {
    return await redis.incr(redisCounterKey(eventType));
  } catch (error) {
    await captureError(
      'Failed to increment proof-claim funnel counter',
      error,
      {
        route: 'lib/acquisition/proof-claim-funnel.server',
        contextData: { eventType },
      }
    );
    return null;
  }
}

export async function readProofClaimCounters(): Promise<
  Partial<Record<ProofClaimFunnelEvent, number>>
> {
  const redis = getRedis();
  if (!redis) return {};
  try {
    const events = Object.values(PROOF_CLAIM_FUNNEL_EVENTS);
    const values = await redis.mget<(number | null)[]>(
      ...events.map(event => redisCounterKey(event))
    );
    const counts: Partial<Record<ProofClaimFunnelEvent, number>> = {};
    events.forEach((event, index) => {
      const value = values[index];
      if (typeof value === 'number' && Number.isFinite(value)) {
        counts[event] = value;
      }
    });
    return counts;
  } catch (error) {
    await captureError('Failed to read proof-claim funnel counters', error, {
      route: 'lib/acquisition/proof-claim-funnel.server',
    });
    return {};
  }
}

export async function recordProofClaimFunnelEvent(
  eventType: ProofClaimFunnelEvent,
  metadata?: Record<string, unknown>
): Promise<void> {
  await incrementProofClaimCounter(eventType);

  if (eventType === PROOF_CLAIM_FUNNEL_EVENTS.PROOF_VIEWED) {
    return;
  }

  const attribution = await getLeadAttributionCookie();
  if (!attribution?.leadId) return;

  const campaignKey = hasProofClaimCampaign(attribution.campaignKey)
    ? attribution.campaignKey
    : proofClaimAttribution().campaignKey;

  await recordLeadFunnelEvent({
    leadId: attribution.leadId,
    eventType,
    campaignKey,
    variantKey: attribution.variantKey ?? proofClaimAttribution().variantKey,
    channel: attribution.channel,
    provider: attribution.provider,
    metadata: {
      ...metadata,
      experimentId: proofClaimAttribution().experimentId,
      source: proofClaimAttribution().source,
    },
  });
}

export async function recordProofClaimActivationForLead(
  leadId: string,
  metadata?: Record<string, unknown>
): Promise<void> {
  await incrementProofClaimCounter(PROOF_CLAIM_FUNNEL_EVENTS.ACTIVATION);
  await recordLeadFunnelEvent(
    {
      leadId,
      eventType: PROOF_CLAIM_FUNNEL_EVENTS.ACTIVATION,
      campaignKey: proofClaimAttribution().campaignKey,
      variantKey: proofClaimAttribution().variantKey,
      metadata: {
        ...metadata,
        experimentId: proofClaimAttribution().experimentId,
      },
    },
    { idempotent: true }
  );
}

async function countProofProfileViews(
  start?: Date,
  end?: Date
): Promise<number> {
  const conditions = [eq(creatorProfiles.username, PROOF_PROFILE.handle)];
  if (start) {
    conditions.push(
      gte(dailyProfileViews.viewDate, start.toISOString().slice(0, 10))
    );
  }
  if (end) {
    conditions.push(
      lte(dailyProfileViews.viewDate, end.toISOString().slice(0, 10))
    );
  }

  const [row] = await db
    .select({
      views: drizzleSql<number>`coalesce(sum(${dailyProfileViews.viewCount}), 0)`,
    })
    .from(dailyProfileViews)
    .innerJoin(
      creatorProfiles,
      eq(dailyProfileViews.creatorProfileId, creatorProfiles.id)
    )
    .where(and(...conditions));

  return Number(row?.views ?? 0);
}

async function countDistinctLeadsForEvents(
  eventTypes: readonly string[],
  start?: Date,
  end?: Date
): Promise<number> {
  const conditions = [
    eq(leadFunnelEvents.campaignKey, PROOF_CLAIM_CAMPAIGN_KEY),
    inArray(leadFunnelEvents.eventType, [...eventTypes]),
  ];
  if (start) conditions.push(gte(leadFunnelEvents.occurredAt, start));
  if (end) conditions.push(lte(leadFunnelEvents.occurredAt, end));

  const [row] = await db
    .select({
      count: drizzleSql<number>`count(distinct ${leadFunnelEvents.leadId})`,
    })
    .from(leadFunnelEvents)
    .where(and(...conditions));

  return Number(row?.count ?? 0);
}

export async function getProofClaimFunnelReport(input?: {
  readonly start?: Date;
  readonly end?: Date;
}): Promise<ProofClaimFunnelReport> {
  const [proofViewed, claimStarted, checkout, activation, redisCounts] =
    await Promise.all([
      countProofProfileViews(input?.start, input?.end),
      countDistinctLeadsForEvents(
        [PROOF_CLAIM_FUNNEL_EVENTS.CLAIM_STARTED],
        input?.start,
        input?.end
      ),
      countDistinctLeadsForEvents(
        PROOF_CLAIM_CHECKOUT_ALIASES,
        input?.start,
        input?.end
      ),
      countDistinctLeadsForEvents(
        PROOF_CLAIM_ACTIVATION_ALIASES,
        input?.start,
        input?.end
      ),
      readProofClaimCounters(),
    ]);

  const stages = {
    proofViewed: Math.max(
      proofViewed,
      redisCounts[PROOF_CLAIM_FUNNEL_EVENTS.PROOF_VIEWED] ?? 0
    ),
    claimStarted: Math.max(
      claimStarted,
      redisCounts[PROOF_CLAIM_FUNNEL_EVENTS.CLAIM_STARTED] ?? 0
    ),
    checkout: Math.max(
      checkout,
      redisCounts[PROOF_CLAIM_FUNNEL_EVENTS.CHECKOUT] ?? 0
    ),
    activation: Math.max(
      activation,
      redisCounts[PROOF_CLAIM_FUNNEL_EVENTS.ACTIVATION] ?? 0
    ),
  };

  return {
    campaignKey: PROOF_CLAIM_CAMPAIGN_KEY,
    variantKey: proofClaimAttribution().variantKey,
    stages,
    rates: rateProofClaimFunnel(stages),
  };
}

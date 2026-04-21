import 'server-only';

import {
  and,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  lt,
} from 'drizzle-orm';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema/auth';
import { stripeWebhookEvents } from '@/lib/db/schema/billing';
import {
  type NewProductFunnelEvent,
  productFunnelEvents,
  productSyntheticRuns,
} from '@/lib/db/schema/product-funnel';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { captureError } from '@/lib/error-tracking';
import { logger } from '@/lib/utils/logger';
import {
  isProductFunnelClientEventType,
  isProductFunnelEventType,
  type ProductFunnelClientEventType,
  type ProductFunnelEventType,
} from './shared';

export interface RecordProductFunnelEventInput {
  readonly eventType: ProductFunnelEventType;
  readonly actorKey?: string;
  readonly userId?: string | null;
  readonly creatorProfileId?: string | null;
  readonly sessionId?: string | null;
  readonly sourceSurface?: string | null;
  readonly sourceRoute?: string | null;
  readonly isSynthetic?: boolean;
  readonly metadata?: Record<string, unknown>;
  readonly occurredAt?: Date;
  readonly idempotencyKey: string;
}

export interface RecordProductFunnelClientEventInput {
  readonly eventType: ProductFunnelClientEventType;
  readonly sessionId: string;
  readonly sourceSurface?: string | null;
  readonly sourceRoute?: string | null;
  readonly metadata?: Record<string, unknown>;
  readonly userClerkId?: string | null;
}

interface ResolvedActorContext {
  readonly actorKey: string;
  readonly userId: string | null;
  readonly creatorProfileId: string | null;
}

function buildActorKey(input: {
  readonly actorKey?: string;
  readonly userId?: string | null;
  readonly creatorProfileId?: string | null;
  readonly sessionId?: string | null;
}): string {
  if (input.actorKey) return input.actorKey;
  if (input.userId) return `user:${input.userId}`;
  if (input.creatorProfileId) return `profile:${input.creatorProfileId}`;
  if (input.sessionId) return `session:${input.sessionId}`;
  throw new TypeError(
    'Product funnel event requires at least one actor identity'
  );
}

async function resolveActorContext(
  input: RecordProductFunnelEventInput
): Promise<ResolvedActorContext> {
  if (input.userId || input.creatorProfileId) {
    return {
      actorKey: buildActorKey(input),
      userId: input.userId ?? null,
      creatorProfileId: input.creatorProfileId ?? null,
    };
  }

  return {
    actorKey: buildActorKey(input),
    userId: null,
    creatorProfileId: null,
  };
}

export async function resolveDbUserByClerkId(
  clerkUserId: string
): Promise<{ id: string; activeProfileId: string | null } | null> {
  const [user] = await db
    .select({
      id: users.id,
      activeProfileId: users.activeProfileId,
    })
    .from(users)
    .where(eq(users.clerkId, clerkUserId))
    .limit(1);

  return user ?? null;
}

export async function recordProductFunnelEvent(
  input: RecordProductFunnelEventInput
): Promise<boolean> {
  if (!isProductFunnelEventType(input.eventType)) {
    throw new TypeError(`Unsupported product funnel event: ${input.eventType}`);
  }

  const actor = await resolveActorContext(input);
  const values: NewProductFunnelEvent = {
    eventType: input.eventType,
    occurredAt: input.occurredAt ?? new Date(),
    actorKey: actor.actorKey,
    userId: actor.userId,
    creatorProfileId: actor.creatorProfileId,
    sessionId: input.sessionId ?? null,
    sourceSurface: input.sourceSurface ?? null,
    sourceRoute: input.sourceRoute ?? null,
    isSynthetic: input.isSynthetic ?? false,
    metadata: input.metadata ?? {},
    idempotencyKey: input.idempotencyKey,
  };

  try {
    const inserted = await db
      .insert(productFunnelEvents)
      .values(values)
      .onConflictDoNothing({
        target: [productFunnelEvents.idempotencyKey],
      })
      .returning({ id: productFunnelEvents.id });

    return inserted.length > 0;
  } catch (error) {
    await captureError('Failed to record product funnel event', error, {
      route: 'lib/product-funnel/events',
      contextData: {
        eventType: input.eventType,
        idempotencyKey: input.idempotencyKey,
      },
    });
    throw error;
  }
}

export async function recordProductFunnelClientEvent(
  input: RecordProductFunnelClientEventInput
): Promise<boolean> {
  if (!isProductFunnelClientEventType(input.eventType)) {
    throw new TypeError(
      `Unsupported product funnel client event: ${input.eventType}`
    );
  }

  const dbUser = input.userClerkId
    ? await resolveDbUserByClerkId(input.userClerkId)
    : null;
  const today = new Date().toISOString().slice(0, 10);
  const actorIdentity =
    dbUser?.id != null
      ? `user:${dbUser.id}`
      : input.userClerkId
        ? `clerk:${input.userClerkId}`
        : `session:${input.sessionId}`;

  let idempotencyKey: string;
  switch (input.eventType) {
    case 'visit':
      idempotencyKey = `${input.eventType}:${input.sessionId}:${input.sourceSurface ?? 'unknown'}:${today}`;
      break;
    case 'signup_started':
      idempotencyKey = `${input.eventType}:${input.sessionId}`;
      break;
    case 'onboarding_started':
      idempotencyKey = `${input.eventType}:${actorIdentity}`;
      break;
    case 'app_session':
      idempotencyKey = `${input.eventType}:${actorIdentity}:${today}`;
      break;
  }

  return recordProductFunnelEvent({
    eventType: input.eventType,
    actorKey: dbUser ? undefined : actorIdentity,
    userId: dbUser?.id ?? null,
    creatorProfileId: dbUser?.activeProfileId ?? null,
    sessionId: input.sessionId,
    sourceSurface: input.sourceSurface ?? null,
    sourceRoute: input.sourceRoute ?? null,
    metadata: input.metadata,
    idempotencyKey,
  });
}

export async function recordProductFunnelEventForClerkUser(input: {
  readonly clerkUserId: string;
  readonly eventType: ProductFunnelEventType;
  readonly idempotencyKey: string;
  readonly creatorProfileId?: string | null;
  readonly occurredAt?: Date;
  readonly sourceSurface?: string | null;
  readonly sourceRoute?: string | null;
  readonly isSynthetic?: boolean;
  readonly metadata?: Record<string, unknown>;
}): Promise<boolean> {
  const dbUser = await resolveDbUserByClerkId(input.clerkUserId);

  return recordProductFunnelEvent({
    eventType: input.eventType,
    actorKey: dbUser ? undefined : `clerk:${input.clerkUserId}`,
    userId: dbUser?.id ?? null,
    creatorProfileId: input.creatorProfileId ?? dbUser?.activeProfileId ?? null,
    occurredAt: input.occurredAt,
    sourceSurface: input.sourceSurface,
    sourceRoute: input.sourceRoute,
    isSynthetic: input.isSynthetic,
    metadata: input.metadata,
    idempotencyKey: input.idempotencyKey,
  });
}

export async function getLatestProductSyntheticRun(
  monitorKey = 'synthetic_signup'
) {
  const [run] = await db
    .select()
    .from(productSyntheticRuns)
    .where(eq(productSyntheticRuns.monitorKey, monitorKey))
    .orderBy(desc(productSyntheticRuns.startedAt))
    .limit(1);

  return run ?? null;
}

export async function getConsecutiveSyntheticFailures(
  monitorKey = 'synthetic_signup',
  now = new Date()
): Promise<number> {
  const staleRunningThreshold = new Date(now.getTime() - 30 * 60 * 1000);
  const runs = await db
    .select({
      status: productSyntheticRuns.status,
      startedAt: productSyntheticRuns.startedAt,
    })
    .from(productSyntheticRuns)
    .where(eq(productSyntheticRuns.monitorKey, monitorKey))
    .orderBy(desc(productSyntheticRuns.startedAt))
    .limit(10);

  let failures = 0;
  for (const run of runs) {
    const effectiveStatus =
      run.status === 'running' && run.startedAt <= staleRunningThreshold
        ? 'failure'
        : run.status;

    if (effectiveStatus === 'failure') {
      failures += 1;
      continue;
    }
    break;
  }
  return failures;
}

export async function backfillProductFunnelHistory(
  now = new Date()
): Promise<{ inserted: number }> {
  const inserted = { count: 0 };
  const start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const recentUsers = await db
    .select({
      id: users.id,
      clerkId: users.clerkId,
      createdAt: users.createdAt,
      activeProfileId: users.activeProfileId,
    })
    .from(users)
    .where(and(gte(users.createdAt, start), isNull(users.deletedAt)));

  for (const user of recentUsers) {
    if (!user.clerkId) continue;
    const wasInserted = await recordProductFunnelEvent({
      eventType: 'signup_completed',
      userId: user.id,
      creatorProfileId: user.activeProfileId,
      occurredAt: user.createdAt ?? undefined,
      idempotencyKey: `signup_completed:${user.clerkId}`,
      metadata: {
        backfilled: true,
      },
    });
    if (wasInserted) inserted.count += 1;
  }

  const recentProfiles = await db
    .select({
      id: creatorProfiles.id,
      userId: creatorProfiles.userId,
      onboardingCompletedAt: creatorProfiles.onboardingCompletedAt,
      claimedAt: creatorProfiles.claimedAt,
    })
    .from(creatorProfiles)
    .where(
      and(
        gte(creatorProfiles.onboardingCompletedAt, start),
        isNotNull(creatorProfiles.userId)
      )
    );

  for (const profile of recentProfiles) {
    if (!profile.userId || !profile.onboardingCompletedAt) continue;

    const onboardingInserted = await recordProductFunnelEvent({
      eventType: 'onboarding_completed',
      userId: profile.userId,
      creatorProfileId: profile.id,
      occurredAt: profile.onboardingCompletedAt,
      idempotencyKey: `onboarding_completed:${profile.id}`,
      metadata: { backfilled: true },
    });
    if (onboardingInserted) inserted.count += 1;

    const activatedInserted = await recordProductFunnelEvent({
      eventType: 'activated',
      userId: profile.userId,
      creatorProfileId: profile.id,
      occurredAt: profile.claimedAt ?? profile.onboardingCompletedAt,
      idempotencyKey: `activated:${profile.id}`,
      metadata: { backfilled: true },
    });
    if (activatedInserted) inserted.count += 1;
  }

  const recentPayments = await db
    .select({
      stripeEventId: stripeWebhookEvents.stripeEventId,
      userClerkId: stripeWebhookEvents.userClerkId,
      stripeCreatedAt: stripeWebhookEvents.stripeCreatedAt,
      createdAt: stripeWebhookEvents.createdAt,
    })
    .from(stripeWebhookEvents)
    .where(
      and(
        inArray(stripeWebhookEvents.type, ['checkout.session.completed']),
        gte(stripeWebhookEvents.createdAt, start)
      )
    );

  const paymentClerkIds = [
    ...new Set(
      recentPayments
        .map(payment => payment.userClerkId)
        .filter((clerkId): clerkId is string => typeof clerkId === 'string')
    ),
  ];
  const dbUsersByClerkId =
    paymentClerkIds.length > 0
      ? new Map(
          (
            await db
              .select({
                clerkId: users.clerkId,
                id: users.id,
                activeProfileId: users.activeProfileId,
              })
              .from(users)
              .where(inArray(users.clerkId, paymentClerkIds))
          )
            .filter(user => user.clerkId)
            .map(user => [user.clerkId as string, user])
        )
      : new Map<
          string,
          {
            clerkId: string | null;
            id: string;
            activeProfileId: string | null;
          }
        >();

  for (const payment of recentPayments) {
    if (!payment.userClerkId) continue;
    const dbUser = dbUsersByClerkId.get(payment.userClerkId);
    if (!dbUser) continue;

    const paymentInserted = await recordProductFunnelEvent({
      eventType: 'payment_succeeded',
      userId: dbUser.id,
      creatorProfileId: dbUser.activeProfileId,
      occurredAt: payment.stripeCreatedAt ?? payment.createdAt ?? undefined,
      idempotencyKey: `payment_succeeded:${payment.stripeEventId}`,
      metadata: { backfilled: true },
    });
    if (paymentInserted) inserted.count += 1;
  }

  logger.info('[product-funnel] Backfill completed', inserted);
  return { inserted: inserted.count };
}

export async function materializeRetentionEvents(
  now = new Date()
): Promise<{ inserted: number }> {
  const activations = await db
    .select({
      id: productFunnelEvents.id,
      occurredAt: productFunnelEvents.occurredAt,
      userId: productFunnelEvents.userId,
      creatorProfileId: productFunnelEvents.creatorProfileId,
    })
    .from(productFunnelEvents)
    .where(
      and(
        eq(productFunnelEvents.eventType, 'activated'),
        eq(productFunnelEvents.isSynthetic, false),
        isNotNull(productFunnelEvents.userId)
      )
    );

  const candidateWindows: Array<{
    activationId: string;
    userId: string;
    creatorProfileId: string | null;
    eventType: 'retained_day_1' | 'retained_day_7';
    maturityDate: Date;
    dayEnd: Date;
    idempotencyKey: string;
  }> = [];
  for (const activation of activations) {
    if (!activation.userId || !activation.occurredAt) continue;

    for (const retentionWindow of [
      { days: 1, eventType: 'retained_day_1' as const },
      { days: 7, eventType: 'retained_day_7' as const },
    ]) {
      const maturityDate = new Date(activation.occurredAt);
      maturityDate.setDate(maturityDate.getDate() + retentionWindow.days);
      if (maturityDate > now) continue;

      const dayEnd = new Date(maturityDate);
      dayEnd.setDate(dayEnd.getDate() + 1);
      candidateWindows.push({
        activationId: activation.id,
        userId: activation.userId,
        creatorProfileId: activation.creatorProfileId,
        eventType: retentionWindow.eventType,
        maturityDate,
        dayEnd,
        idempotencyKey: `${retentionWindow.eventType}:${activation.id}`,
      });
    }
  }

  if (candidateWindows.length === 0) {
    return { inserted: 0 };
  }

  const existingRetentionKeys = new Set(
    (
      await db
        .select({
          idempotencyKey: productFunnelEvents.idempotencyKey,
        })
        .from(productFunnelEvents)
        .where(
          inArray(
            productFunnelEvents.idempotencyKey,
            candidateWindows.map(window => window.idempotencyKey)
          )
        )
    ).map(event => event.idempotencyKey)
  );

  const pendingWindows = candidateWindows.filter(
    window => !existingRetentionKeys.has(window.idempotencyKey)
  );

  if (pendingWindows.length === 0) {
    return { inserted: 0 };
  }

  const sessionRangeStart = pendingWindows.reduce(
    (earliest, window) =>
      window.maturityDate < earliest ? window.maturityDate : earliest,
    pendingWindows[0].maturityDate
  );
  const sessionRangeEnd = pendingWindows.reduce(
    (latest, window) => (window.dayEnd > latest ? window.dayEnd : latest),
    pendingWindows[0].dayEnd
  );
  const sessionUserIds = [
    ...new Set(
      pendingWindows
        .map(window => window.userId)
        .filter((userId): userId is string => typeof userId === 'string')
    ),
  ];
  const sessionEvents = await db
    .select({
      userId: productFunnelEvents.userId,
      occurredAt: productFunnelEvents.occurredAt,
    })
    .from(productFunnelEvents)
    .where(
      and(
        eq(productFunnelEvents.eventType, 'app_session'),
        eq(productFunnelEvents.isSynthetic, false),
        inArray(productFunnelEvents.userId, sessionUserIds),
        gte(productFunnelEvents.occurredAt, sessionRangeStart),
        lt(productFunnelEvents.occurredAt, sessionRangeEnd)
      )
    );

  const sessionEventsByUserId = new Map<string, Date[]>();
  for (const sessionEvent of sessionEvents) {
    if (!sessionEvent.userId || !sessionEvent.occurredAt) continue;
    const eventsForUser = sessionEventsByUserId.get(sessionEvent.userId) ?? [];
    eventsForUser.push(sessionEvent.occurredAt);
    sessionEventsByUserId.set(sessionEvent.userId, eventsForUser);
  }

  let inserted = 0;
  for (const window of pendingWindows) {
    const sessionEvent = sessionEventsByUserId
      .get(window.userId)
      ?.some(
        occurredAt =>
          occurredAt >= window.maturityDate && occurredAt < window.dayEnd
      );

    if (!sessionEvent) continue;

    const wasInserted = await recordProductFunnelEvent({
      eventType: window.eventType,
      userId: window.userId,
      creatorProfileId: window.creatorProfileId,
      occurredAt: window.maturityDate,
      idempotencyKey: window.idempotencyKey,
    });
    if (wasInserted) inserted += 1;
  }

  return { inserted };
}

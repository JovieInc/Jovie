import { NextResponse } from 'next/server';
import { getCachedAuth } from '@/lib/auth/cached';
import {
  getEntitlements,
  type PlanId,
  resolveChatUsagePlan,
} from '@/lib/entitlements/registry';
import { getCurrentUserEntitlements } from '@/lib/entitlements/server';
import { aiChatWeeklyPlanAwareLimiter } from '@/lib/rate-limit/limiters';
import { getRedis } from '@/lib/redis';
import { withTimeout } from '@/lib/resilience/primitives';
import { logger } from '@/lib/utils/logger';
import type { UserPlan } from '@/types';

export const runtime = 'nodejs';

type ChatUsageSnapshot = {
  plan: PlanId;
  weeklyLimit: number;
  used: number;
  remaining: number;
  resetAt: string | null;
  isExhausted: boolean;
  warningThreshold: number;
  isNearLimit: boolean;
  observedAt: number;
};

// Never reuse v2 snapshots synthesized from unrelated process-local counters.
const CHAT_USAGE_CACHE_KEY_PREFIX = 'chat:usage:v3:';
const CHAT_USAGE_CACHE_TTL_SECONDS = 60 * 60;
const CACHE_HEADERS = { 'Cache-Control': 'private, no-store' } as const;
const CACHE_TIMEOUT = {
  timeoutMs: 750,
  context: 'chat-usage-cache',
  timeoutMessage: 'Chat usage cache timeout',
} as const;

function isVerifiedSnapshot(value: unknown): value is ChatUsageSnapshot {
  if (!value || typeof value !== 'object') return false;
  const data = value as Partial<ChatUsageSnapshot>;
  if (!['free', 'trial', 'pro', 'max'].includes(data.plan ?? '')) return false;
  const { weeklyLimit, used, remaining, observedAt } = data;
  if (
    typeof weeklyLimit !== 'number' ||
    !Number.isSafeInteger(weeklyLimit) ||
    weeklyLimit < 0 ||
    typeof used !== 'number' ||
    !Number.isSafeInteger(used) ||
    used < 0 ||
    typeof remaining !== 'number' ||
    !Number.isSafeInteger(remaining) ||
    remaining < 0 ||
    used + remaining !== weeklyLimit ||
    typeof observedAt !== 'number' ||
    !Number.isFinite(observedAt) ||
    observedAt > Date.now() ||
    Date.now() - observedAt > CHAT_USAGE_CACHE_TTL_SECONDS * 1000
  )
    return false;
  const warningThreshold = Math.max(1, Math.ceil(weeklyLimit * 0.2));
  return (
    (data.resetAt === null ||
      (typeof data.resetAt === 'string' &&
        Number.isFinite(Date.parse(data.resetAt)))) &&
    data.warningThreshold === warningThreshold &&
    data.isExhausted === (remaining === 0) &&
    data.isNearLimit === (remaining > 0 && remaining <= warningThreshold)
  );
}

async function readCachedChatUsage(
  userId: string
): Promise<ChatUsageSnapshot | null> {
  try {
    const redis = getRedis();
    if (!redis) return null;
    const raw = await withTimeout(
      redis.get<unknown>(`${CHAT_USAGE_CACHE_KEY_PREFIX}${userId}`),
      CACHE_TIMEOUT
    );
    const cached: unknown = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return isVerifiedSnapshot(cached) ? cached : null;
  } catch {
    return null;
  }
}

function writeChatUsageCache(
  userId: string,
  snapshot: ChatUsageSnapshot
): void {
  try {
    const redis = getRedis();
    if (!redis) return;
    // Advisory cache failure never invalidates the fresh quota observation.
    void withTimeout(
      redis.set(
        `${CHAT_USAGE_CACHE_KEY_PREFIX}${userId}`,
        JSON.stringify(snapshot),
        { ex: CHAT_USAGE_CACHE_TTL_SECONDS }
      ),
      CACHE_TIMEOUT
    ).catch(() => {});
  } catch {
    // A synchronous cache client failure is advisory too.
  }
}

export async function buildChatUsageSnapshot(params: {
  readonly userId: string;
  readonly entitlementPlan: UserPlan;
}): Promise<ChatUsageSnapshot | null> {
  const plan = resolveChatUsagePlan(params.entitlementPlan);
  const expectedLimit = getEntitlements(params.entitlementPlan).limits
    .aiWeeklyMessageLimit;
  const status = await aiChatWeeklyPlanAwareLimiter.readStatus(
    params.userId,
    params.entitlementPlan
  );
  if (!status.available || status.limit !== expectedLimit) return null;
  const weeklyLimit = status.limit;
  const remaining = status.remaining;
  const warningThreshold = Math.max(1, Math.ceil(weeklyLimit * 0.2));
  const response: ChatUsageSnapshot = {
    plan,
    weeklyLimit,
    used: weeklyLimit - remaining,
    remaining,
    resetAt:
      status.resetTime === null
        ? null
        : new Date(status.resetTime).toISOString(),
    isExhausted: remaining === 0,
    warningThreshold,
    isNearLimit: remaining > 0 && remaining <= warningThreshold,
    observedAt: status.observedAt,
  };
  return isVerifiedSnapshot(response) ? response : null;
}

export async function GET() {
  let userId: string | null;
  try {
    ({ userId } = await getCachedAuth());
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (message.includes('clerkMiddleware'))
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    throw error;
  }
  if (!userId)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const entitlements = await getCurrentUserEntitlements();
  if (!entitlements.isAuthenticated || !entitlements.userId)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const billingUnavailable = entitlements.billingVerification === 'unavailable';
  if (!billingUnavailable) {
    try {
      const snapshot = await buildChatUsageSnapshot({
        userId,
        entitlementPlan: entitlements.plan,
      });
      if (snapshot) {
        writeChatUsageCache(userId, snapshot);
        return NextResponse.json(snapshot, { headers: CACHE_HEADERS });
      }
    } catch {
      logger.warn('Chat usage observation unavailable');
    }
  }
  const cached = await readCachedChatUsage(userId);
  const cacheMatchesPlan =
    cached &&
    cached.plan === resolveChatUsagePlan(entitlements.plan) &&
    cached.weeklyLimit ===
      getEntitlements(entitlements.plan).limits.aiWeeklyMessageLimit;
  if (cached && (billingUnavailable || cacheMatchesPlan)) {
    return NextResponse.json(
      { ...cached, _stale: true },
      { headers: CACHE_HEADERS }
    );
  }
  return NextResponse.json(
    { error: 'Usage unavailable' },
    { status: 503, headers: CACHE_HEADERS }
  );
}

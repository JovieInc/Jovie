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
};

type StaleChatUsageSnapshot = ChatUsageSnapshot & {
  _stale: true;
};

const CHAT_USAGE_CACHE_KEY_PREFIX = 'chat:usage:v2:';
const CHAT_USAGE_CACHE_TTL_SECONDS = 60 * 60; // 1 hour

async function readCachedChatUsage(
  userId: string
): Promise<ChatUsageSnapshot | null> {
  const redis = getRedis();
  if (!redis) return null;

  try {
    const cached = await redis.get<ChatUsageSnapshot>(
      `${CHAT_USAGE_CACHE_KEY_PREFIX}${userId}`
    );
    if (!cached) return null;
    return typeof cached === 'string' ? JSON.parse(cached) : cached;
  } catch {
    return null;
  }
}

function writeChatUsageCache(
  userId: string,
  snapshot: ChatUsageSnapshot
): void {
  const redis = getRedis();
  if (!redis) return;

  redis
    .set(`${CHAT_USAGE_CACHE_KEY_PREFIX}${userId}`, JSON.stringify(snapshot), {
      ex: CHAT_USAGE_CACHE_TTL_SECONDS,
    })
    .catch(() => {});
}

const CACHE_HEADERS = {
  'Cache-Control': 'private, max-age=30, stale-while-revalidate=120',
} as const;

function formatResetAt(resetTime: number): string | null {
  if (!Number.isFinite(resetTime)) return null;
  return new Date(resetTime).toISOString();
}

export function buildChatUsageSnapshot(params: {
  readonly userId: string;
  readonly entitlementPlan: UserPlan;
}): ChatUsageSnapshot {
  const plan = resolveChatUsagePlan(params.entitlementPlan);
  const entitlements = getEntitlements(params.entitlementPlan);
  const weeklyLimit = entitlements.limits.aiWeeklyMessageLimit;
  const status = aiChatWeeklyPlanAwareLimiter.getStatus(
    params.userId,
    params.entitlementPlan
  );
  const remaining = Math.max(0, Math.min(weeklyLimit, status.remaining));
  const used = Math.max(0, weeklyLimit - remaining);
  const warningThreshold = Math.max(1, Math.ceil(weeklyLimit * 0.2));

  return {
    plan,
    weeklyLimit,
    used,
    remaining,
    resetAt: formatResetAt(status.resetTime),
    isExhausted: remaining <= 0,
    warningThreshold,
    isNearLimit: remaining > 0 && remaining <= warningThreshold,
  };
}

export async function GET() {
  let userId: string | null;
  try {
    ({ userId } = await getCachedAuth());
  } catch (error) {
    // Clerk throws when middleware didn't run (e.g., matcher misconfiguration).
    // Return 401 for that case, but let unexpected errors propagate to Sentry.
    const message = error instanceof Error ? error.message : '';
    if (message.includes('clerkMiddleware')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    throw error;
  }
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const entitlements = await getCurrentUserEntitlements();
  if (!entitlements.isAuthenticated || !entitlements.userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const billingUnavailable = entitlements.billingVerification === 'unavailable';

  if (billingUnavailable) {
    const cached = await readCachedChatUsage(userId);
    if (cached) {
      const stale: StaleChatUsageSnapshot = { ...cached, _stale: true };
      return NextResponse.json(stale, { headers: CACHE_HEADERS });
    }

    logger.warn('Chat usage billing unavailable; serving degraded snapshot', {
      userId,
    });
    const degraded = buildChatUsageSnapshot({
      userId,
      entitlementPlan: entitlements.plan,
    });
    const stale: StaleChatUsageSnapshot = { ...degraded, _stale: true };
    return NextResponse.json(stale, { headers: CACHE_HEADERS });
  }

  const response = buildChatUsageSnapshot({
    userId,
    entitlementPlan: entitlements.plan,
  });

  writeChatUsageCache(userId, response);

  return NextResponse.json(response, { headers: CACHE_HEADERS });
}

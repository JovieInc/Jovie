import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { getEntitlements } from '@/lib/entitlements/registry';
import { RETRY_AFTER_SERVICE } from '@/lib/http/headers';
import { aiChatDailyPlanAwareLimiter } from '@/lib/rate-limit/limiters';
import { getRedis } from '@/lib/redis';
import { getUserBillingInfo } from '@/lib/stripe/customer-sync';
import { logger } from '@/lib/utils/logger';

export const runtime = 'nodejs';

type ChatUsageSnapshot = {
  plan: 'free' | 'pro' | 'growth';
  dailyLimit: number;
  used: number;
  remaining: number;
  isExhausted: boolean;
  warningThreshold: number;
  isNearLimit: boolean;
};

type StaleChatUsageSnapshot = ChatUsageSnapshot & {
  _stale: true;
};

const CHAT_USAGE_CACHE_KEY_PREFIX = 'chat:usage:v1:';
const CHAT_USAGE_CACHE_TTL_SECONDS = 60 * 60; // 1 hour

function resolvePlan(
  plan: string | null | undefined
): 'free' | 'pro' | 'growth' {
  if (plan === 'pro' || plan === 'growth') {
    return plan;
  }
  return 'free';
}

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

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const billing = await getUserBillingInfo();
  if (!billing.success) {
    // Billing unavailable — serve stale cached data if we have it
    const cached = await readCachedChatUsage(userId);
    if (cached) {
      const stale: StaleChatUsageSnapshot = { ...cached, _stale: true };
      return NextResponse.json(stale, { headers: CACHE_HEADERS });
    }

    logger.warn('Chat usage billing lookup failed with no cache fallback', {
      userId,
    });
    return NextResponse.json(
      { error: 'Billing service temporarily unavailable' },
      {
        status: 503,
        headers: {
          'Cache-Control': 'no-store',
          'Retry-After': RETRY_AFTER_SERVICE,
        },
      }
    );
  }

  const plan = resolvePlan(billing.data?.plan);
  const entitlements = getEntitlements(plan);
  const dailyLimit = entitlements.limits.aiDailyMessageLimit;
  const status = aiChatDailyPlanAwareLimiter.getStatus(userId, plan);
  const remaining = Math.max(0, Math.min(dailyLimit, status.remaining));
  const used = Math.max(0, dailyLimit - remaining);
  const warningThreshold = plan === 'free' ? 2 : 5;

  const response: ChatUsageSnapshot = {
    plan,
    dailyLimit,
    used,
    remaining,
    isExhausted: remaining <= 0,
    warningThreshold,
    isNearLimit: remaining > 0 && remaining <= warningThreshold,
  };

  writeChatUsageCache(userId, response);

  return NextResponse.json(response, { headers: CACHE_HEADERS });
}

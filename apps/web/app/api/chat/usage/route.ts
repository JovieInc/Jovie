import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { getEntitlements } from '@/lib/entitlements/registry';
import {
  aiChatDailyFreeLimiter,
  aiChatDailyGrowthLimiter,
  aiChatDailyProLimiter,
} from '@/lib/rate-limit';
import { getUserBillingInfo } from '@/lib/stripe/customer-sync';

export const runtime = 'nodejs';

interface ChatUsageSnapshot {
  plan: 'free' | 'pro' | 'growth';
  dailyLimit: number;
  used: number;
  remaining: number;
  isExhausted: boolean;
  warningThreshold: number;
  isNearLimit: boolean;
}

function resolvePlan(
  plan: string | null | undefined
): 'free' | 'pro' | 'growth' {
  if (plan === 'pro' || plan === 'growth') {
    return plan;
  }
  return 'free';
}

function getDailyLimiter(plan: 'free' | 'pro' | 'growth') {
  if (plan === 'growth') return aiChatDailyGrowthLimiter;
  if (plan === 'pro') return aiChatDailyProLimiter;
  return aiChatDailyFreeLimiter;
}

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const billing = await getUserBillingInfo();
  if (!billing.success) {
    return NextResponse.json(
      { error: 'Billing service temporarily unavailable' },
      { status: 503, headers: { 'Retry-After': '60' } }
    );
  }

  const plan = resolvePlan(billing.data?.plan);
  const entitlements = getEntitlements(plan);
  const dailyLimit = entitlements.limits.aiDailyMessageLimit;
  const limiter = getDailyLimiter(plan);
  const status = limiter.getStatus(userId);
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

  return NextResponse.json(response, {
    headers: {
      'Cache-Control': 'private, max-age=30, stale-while-revalidate=120',
    },
  });
}

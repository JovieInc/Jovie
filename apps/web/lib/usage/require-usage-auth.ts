import { NextResponse } from 'next/server';
import { getCachedAuth } from '@/lib/auth/cached';
import { type PlanId, resolveCanonicalPlanId } from '@/lib/entitlements/registry';
import { getCurrentUserEntitlements } from '@/lib/entitlements/server';

interface UsageAuthSuccess {
  readonly response: null;
  readonly userId: string;
  readonly plan: PlanId;
}

interface UsageAuthFailure {
  readonly response: NextResponse;
  readonly userId?: undefined;
  readonly plan?: undefined;
}

export type UsageAuthResult = UsageAuthSuccess | UsageAuthFailure;

const unauthorized = (): UsageAuthFailure => ({
  response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
});

/**
 * Shared auth preamble for usage endpoints: resolves the Clerk user and the
 * canonical plan id, degrading Clerk middleware misconfiguration to a 401
 * (unexpected errors propagate to Sentry). Extracted from
 * `app/api/chat/usage/route.ts`'s inline preamble so new usage routes do not
 * copy-paste it (SonarCloud new-code duplication gate).
 */
export async function requireUsageAuth(): Promise<UsageAuthResult> {
  let userId: string | null;
  try {
    ({ userId } = await getCachedAuth());
  } catch (error) {
    // Clerk throws when middleware didn't run (e.g., matcher misconfiguration).
    const message = error instanceof Error ? error.message : '';
    if (message.includes('clerkMiddleware')) {
      return unauthorized();
    }
    throw error;
  }
  if (!userId) {
    return unauthorized();
  }

  const entitlements = await getCurrentUserEntitlements();
  if (!entitlements.isAuthenticated || !entitlements.userId) {
    return unauthorized();
  }

  return {
    response: null,
    userId,
    plan: resolveCanonicalPlanId(entitlements.plan) ?? 'free',
  };
}

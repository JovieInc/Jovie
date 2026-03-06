/**
 * Plan-Aware Rate Limiter Factory
 *
 * Creates rate limiters that automatically select the correct limits based on
 * the user's plan tier. Eliminates manual plan-dispatch boilerplate in API routes.
 */

import type { PlanId } from '@/lib/entitlements/registry';
import { createRateLimiter, RateLimiter } from './rate-limiter';
import type {
  PlanAwareLimiterOptions,
  PlanAwareRateLimiter,
  PlanRateLimitConfig,
  RateLimitConfig,
  RateLimitResult,
  RateLimitStatus,
} from './types';

/**
 * Valid plan IDs for rate limiting.
 * Used to validate plan strings and determine config lookup.
 */
const VALID_PLAN_IDS: readonly PlanId[] = [
  'free',
  'founding',
  'pro',
  'growth',
] as const;

/**
 * Normalize a plan string to a valid PlanId.
 * Returns 'free' for null, undefined, or unknown plans.
 */
function normalizePlan(plan: PlanId | string | null | undefined): PlanId {
  if (!plan || typeof plan !== 'string') {
    return 'free';
  }
  const normalized = plan.toLowerCase() as PlanId;
  return VALID_PLAN_IDS.includes(normalized) ? normalized : 'free';
}

/**
 * Resolve the config for a given plan from a PlanRateLimitConfig.
 * Uses the following fallback chain:
 * 1. Exact plan match
 * 2. For 'founding', fall back to 'pro' if not explicitly defined
 * 3. Fall back to 'free' config (always required)
 */
function resolveConfigForPlan(
  configs: PlanRateLimitConfig,
  plan: PlanId
): RateLimitConfig {
  // Exact match
  if (configs[plan]) {
    return configs[plan]!;
  }

  // founding -> pro fallback (founding is equivalent to pro for rate limits)
  if (plan === 'founding' && configs.pro) {
    return configs.pro;
  }

  // Default to free (always defined per type constraint)
  return configs.free;
}

/**
 * Default error message generator.
 * Provides plan-appropriate messages with upgrade prompts for free users.
 */
function defaultErrorMessage(plan: PlanId | null): string {
  const normalizedPlan = normalizePlan(plan);
  if (normalizedPlan === 'free') {
    return 'Rate limit exceeded. Upgrade your plan for higher limits.';
  }
  return 'Rate limit exceeded. Please try again later.';
}

/**
 * Create a plan-aware rate limiter that automatically selects the correct
 * rate limiter based on the user's plan tier.
 *
 * @param options - Configuration options including plan-to-config mapping
 * @returns A PlanAwareRateLimiter instance
 *
 * @example
 * ```typescript
 * const limiter = createPlanAwareRateLimiter({
 *   configs: {
 *     free: { name: 'feature-free', limit: 10, window: '1 d', prefix: 'feature:free' },
 *     pro: { name: 'feature-pro', limit: 100, window: '1 d', prefix: 'feature:pro' },
 *     growth: { name: 'feature-growth', limit: 500, window: '1 d', prefix: 'feature:growth' },
 *   },
 *   errorMessage: (plan) => plan === 'free'
 *     ? 'Limit reached. Upgrade for more!'
 *     : 'Limit reached. Try again later.',
 * });
 *
 * // Use in API route
 * const result = await limiter.limit(userId, user.plan);
 * ```
 */
export function createPlanAwareRateLimiter(
  options: PlanAwareLimiterOptions
): PlanAwareRateLimiter {
  const {
    configs,
    errorMessage = defaultErrorMessage,
    preferRedis = true,
  } = options;

  // Create limiters for each defined plan config (lazy initialization)
  const limiterCache = new Map<PlanId, RateLimiter>();

  /**
   * Get or create a limiter for a specific plan.
   * Limiters are cached to avoid creating duplicate instances.
   */
  function getLimiterForPlan(plan: PlanId): RateLimiter {
    // Check cache first
    const cached = limiterCache.get(plan);
    if (cached) {
      return cached;
    }

    // Resolve config and create limiter
    const config = resolveConfigForPlan(configs, plan);

    // Check if we already have a limiter for this config (e.g., founding -> pro)
    // This avoids creating duplicate limiters for plans that share configs
    for (const [cachedPlan, cachedLimiter] of limiterCache.entries()) {
      const cachedConfig = resolveConfigForPlan(configs, cachedPlan);
      if (cachedConfig === config) {
        limiterCache.set(plan, cachedLimiter);
        return cachedLimiter;
      }
    }

    // Create new limiter
    const limiter = createRateLimiter(config, { preferRedis });
    limiterCache.set(plan, limiter);
    return limiter;
  }

  return {
    async limit(
      identifier: string,
      plan: PlanId | string | null | undefined
    ): Promise<RateLimitResult> {
      const normalizedPlan = normalizePlan(plan);
      const limiter = getLimiterForPlan(normalizedPlan);
      const result = await limiter.limit(identifier);

      if (!result.success) {
        return {
          ...result,
          reason: errorMessage(normalizedPlan),
        };
      }

      return result;
    },

    getStatus(
      identifier: string,
      plan: PlanId | string | null | undefined
    ): RateLimitStatus {
      const normalizedPlan = normalizePlan(plan);
      const limiter = getLimiterForPlan(normalizedPlan);
      return limiter.getStatus(identifier);
    },

    async wouldBeRateLimited(
      identifier: string,
      plan: PlanId | string | null | undefined
    ): Promise<boolean> {
      const normalizedPlan = normalizePlan(plan);
      const limiter = getLimiterForPlan(normalizedPlan);
      return limiter.wouldBeRateLimited(identifier);
    },

    getConfigForPlan(
      plan: PlanId | string | null | undefined
    ): RateLimitConfig {
      const normalizedPlan = normalizePlan(plan);
      return resolveConfigForPlan(configs, normalizedPlan);
    },
  };
}

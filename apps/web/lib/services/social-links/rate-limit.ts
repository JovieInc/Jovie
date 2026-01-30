import {
  createRateLimitHeaders,
  dashboardLinksLimiter,
} from '@/lib/rate-limit';

/**
 * Check and apply rate limiting for dashboard link operations.
 *
 * Rate limiting is applied per-user (via clerkUserId) rather than per-profile.
 * This means a user with multiple profiles shares the same rate limit bucket
 * across all their profiles (30 requests per minute total).
 *
 * Rationale: Per-user limiting is simpler and prevents abuse where a malicious
 * user creates many profiles to bypass per-profile limits.
 */
export async function checkRateLimit(
  userId: string
): Promise<{ allowed: boolean; headers: HeadersInit }> {
  const result = await dashboardLinksLimiter.limit(userId);
  const headers = createRateLimitHeaders(result);

  return { allowed: result.success, headers };
}

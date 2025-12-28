/**
 * Unified Rate Limiting Module
 *
 * This is the main entry point for rate limiting in the application.
 * All rate limiting functionality is centralized in the rate-limit/ directory.
 *
 * Usage:
 * ```typescript
 * import {
 *   avatarUploadLimiter,
 *   getClientIP,
 *   createRateLimitHeaders
 * } from '@/lib/rate-limit';
 *
 * export async function POST(request: Request) {
 *   const ip = getClientIP(request);
 *   const result = await avatarUploadLimiter.limit(userId);
 *
 *   if (!result.success) {
 *     return NextResponse.json(
 *       { error: 'Rate limit exceeded' },
 *       { status: 429, headers: createRateLimitHeaders(result) }
 *     );
 *   }
 * }
 * ```
 */

// Re-export everything from the unified rate-limit module
export * from './rate-limit/index';

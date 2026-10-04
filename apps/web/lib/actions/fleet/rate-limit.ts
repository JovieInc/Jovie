import 'server-only';
import { NO_STORE_HEADERS, RETRY_AFTER_SERVICE } from '@/lib/http/headers';
import {
  createRateLimitHeaders,
  generalLimiter,
  getClientIP,
  rateLimitDenialStatus,
} from '@/lib/rate-limit';

/** Shared durable ingress budget; untrusted identities cannot select a new bucket. */
export async function limitFleetRequest(
  request: Request
): Promise<Response | null> {
  try {
    const result = await generalLimiter.limit(`fleet:${getClientIP(request)}`);
    if (result.success) return null;
    return Response.json(
      {
        error: {
          code: result.unavailable ? 'TEMPORARILY_UNAVAILABLE' : 'RATE_LIMITED',
          retryable: true,
        },
      },
      {
        status: rateLimitDenialStatus(result),
        headers: { ...NO_STORE_HEADERS, ...createRateLimitHeaders(result) },
      }
    );
  } catch {
    return Response.json(
      { error: { code: 'TEMPORARILY_UNAVAILABLE', retryable: true } },
      {
        status: 503,
        headers: { ...NO_STORE_HEADERS, 'Retry-After': RETRY_AFTER_SERVICE },
      }
    );
  }
}

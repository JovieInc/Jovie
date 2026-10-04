import { BASE_URL } from '@/constants/app';
import { captureError } from '@/lib/error-tracking';
import { isCodeFlagEnabled } from '@/lib/flags/code-flags';
import { NO_STORE_HEADERS } from '@/lib/http/headers';
import { parseJsonBody } from '@/lib/http/parse-json';
import {
  createRateLimitHeaders,
  getClientIP,
  publicArtistApiLimiter,
} from '@/lib/rate-limit';
import { makeLinkInputSchema } from '@/lib/smart-link-mvp/contract';
import { createSmartLink } from '@/lib/smart-link-mvp/create-link';
import { resolveLinkActor } from '@/lib/smart-link-mvp/principal';
import { createSmartLinkResolver } from '@/lib/smart-link-mvp/resolve';
import { createSmartLinkStore } from '@/lib/smart-link-mvp/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const BODY_MAX_BYTES = 4_096;

function json(
  body: unknown,
  status: number,
  headers: Record<string, string> = {}
): Response {
  return Response.json(body, {
    status,
    headers: { ...NO_STORE_HEADERS, ...headers },
  });
}

function statusFor(code: string | undefined, domain: string): number {
  if (
    domain === 'created' ||
    domain === 'existing' ||
    domain === 'needs_choice'
  ) {
    return 200;
  }
  if (domain === 'not_found' || code === 'NOT_FOUND') return 404;
  if (code === 'FEATURE_DISABLED') return 404;
  if (code === 'RATE_LIMITED' || code === 'LIMIT_REACHED') return 429;
  if (code === 'BUDGET_EXHAUSTED') return 503;
  if (code === 'UNSUPPORTED_INPUT') return 400;
  return 502;
}

/**
 * Public Jovie link creation. Off unless FEATURE_SMART_LINK_MVP=true.
 * Anonymous callers are rate limited and capped at three new links a month.
 * Repeats of the same recording return the existing link.
 */
export async function POST(request: Request) {
  if (!isCodeFlagEnabled('SMART_LINK_MVP')) {
    return json({ status: 'error', code: 'FEATURE_DISABLED' }, 404);
  }

  try {
    const limit = await publicArtistApiLimiter.limit(getClientIP(request));
    if (!limit.success) {
      return json(
        {
          status: 'error',
          code: limit.unavailable ? 'UPSTREAM_FAILURE' : 'RATE_LIMITED',
        },
        limit.unavailable ? 503 : 429,
        {
          ...createRateLimitHeaders(limit),
          'Retry-After': '60',
        }
      );
    }

    const body = await parseJsonBody(request, {
      route: 'smart-link-mvp',
      maxBodySize: BODY_MAX_BYTES,
      redactParseErrors: true,
      headers: NO_STORE_HEADERS,
    });
    if (!body.ok) return body.response;

    const parsed = makeLinkInputSchema.safeParse(body.data);
    if (!parsed.success) {
      return json({ status: 'error', code: 'UNSUPPORTED_INPUT' }, 400);
    }

    const result = await createSmartLink({
      query: parsed.data.query,
      ...(parsed.data.kind ? { kind: parsed.data.kind } : {}),
      origin: new URL(BASE_URL).origin,
      actor: await resolveLinkActor(request),
      store: createSmartLinkStore(),
      resolver: createSmartLinkResolver(),
    });
    return json(result, statusFor(result.code, result.status));
  } catch (error) {
    await captureError('Public Jovie link creation failed', error, {
      route: '/api/links',
      method: 'POST',
    });
    return json({ status: 'error', code: 'UPSTREAM_FAILURE' }, 502);
  }
}

export function GET() {
  if (!isCodeFlagEnabled('SMART_LINK_MVP')) {
    return new Response(null, { status: 404, headers: NO_STORE_HEADERS });
  }
  return new Response(null, {
    status: 405,
    headers: { ...NO_STORE_HEADERS, Allow: 'POST' },
  });
}

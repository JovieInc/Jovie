import { randomUUID } from 'node:crypto';
import { BASE_URL } from '@/constants/app';
import {
  PUBLIC_ARTIST_API_COMMON_HEADERS,
  PUBLIC_ARTIST_API_RATE_LIMIT_POLICY,
  PUBLIC_ARTIST_API_RATE_LIMIT_POLICY_VALUE,
  PUBLIC_ARTIST_API_RATE_LIMIT_WINDOW_SECONDS,
} from '@/lib/api/v1/contract';
import { NO_STORE_HEADERS } from '@/lib/http/headers';
import { parseJsonBody } from '@/lib/http/parse-json';
import { executePublicMusicRead } from '@/lib/music-resolver/public-execution';
import { resolvePublicMusic } from '@/lib/music-resolver/public-read';
import {
  type MusicResolveFailure,
  musicResolveResultSchema,
  musicResolveSchema,
} from '@/lib/music-resolver/public-schemas';
import {
  createRateLimitHeaders,
  getClientIP,
  publicArtistApiLimiter,
} from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const statusByCode: Record<MusicResolveFailure['error']['code'], number> = {
  BODY_TIMEOUT: 408,
  CANCELLED: 499,
  FORBIDDEN: 403,
  INVALID_BODY: 400,
  INVALID_INPUT: 400,
  PAYLOAD_TOO_LARGE: 413,
  RATE_LIMITED: 429,
  RATE_LIMIT_UNAVAILABLE: 503,
  UNSUPPORTED_MEDIA_TYPE: 415,
  UPSTREAM_FAILURE: 502,
  UPSTREAM_TIMEOUT: 504,
};

/** Anonymous public facts only, with the same authority and resolver as MCP. */
export async function POST(request: Request) {
  const headers: Record<string, string> = {
    ...PUBLIC_ARTIST_API_COMMON_HEADERS,
    ...NO_STORE_HEADERS,
    'RateLimit-Policy': PUBLIC_ARTIST_API_RATE_LIMIT_POLICY_VALUE,
    'X-Request-Id': randomUUID(),
  };
  const failure = (
    code: MusicResolveFailure['error']['code'],
    retryable = false
  ) =>
    Response.json(
      { error: { code, retryable } } satisfies MusicResolveFailure,
      {
        status: statusByCode[code],
        headers: {
          ...headers,
          ...(retryable ? { 'Retry-After': '60' } : {}),
        },
      }
    );

  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(BASE_URL).origin)
    return failure('FORBIDDEN');
  try {
    const limit = await publicArtistApiLimiter.limit(getClientIP(request));
    if (limit.unavailable) return failure('RATE_LIMIT_UNAVAILABLE', true);
    Object.assign(
      headers,
      createRateLimitHeaders(limit, {
        policyName: PUBLIC_ARTIST_API_RATE_LIMIT_POLICY,
        windowSeconds: PUBLIC_ARTIST_API_RATE_LIMIT_WINDOW_SECONDS,
      })
    );
    if (!limit.success) return failure('RATE_LIMITED', true);
  } catch {
    return failure('RATE_LIMIT_UNAVAILABLE', true);
  }

  const mediaType = request.headers.get('content-type')?.split(';')[0].trim();
  if (mediaType?.toLowerCase() !== 'application/json')
    return failure('UNSUPPORTED_MEDIA_TYPE');

  const deadline = new AbortController();
  const timer = setTimeout(() => deadline.abort(), 5_000);
  const signal = AbortSignal.any([request.signal, deadline.signal]);
  let data: unknown;
  try {
    // The shared parser owns the byte cap. Strip URL query data from diagnostics.
    const boundedRequest = new Request(
      new URL('/api/v1/music/resolve', request.url),
      {
        method: 'POST',
        headers: request.headers,
        body: request.body?.pipeThrough(new TransformStream(), { signal }),
        signal,
        duplex: 'half',
      } as RequestInit
    );
    const body = await parseJsonBody(boundedRequest, {
      route: 'public-music-resolve-v1',
      maxBodySize: 16384,
      redactParseErrors: true,
    });
    if (!body.ok)
      return failure(
        body.response.status === 413 ? 'PAYLOAD_TOO_LARGE' : 'INVALID_BODY'
      );
    data = body.data;
  } catch {
    return failure(
      deadline.signal.aborted
        ? 'BODY_TIMEOUT'
        : request.signal.aborted
          ? 'CANCELLED'
          : 'INVALID_BODY',
      deadline.signal.aborted
    );
  } finally {
    clearTimeout(timer);
  }

  const input = musicResolveSchema.safeParse(data);
  if (!input.success) return failure('INVALID_INPUT');
  const parsed = musicResolveResultSchema.safeParse(
    await executePublicMusicRead(
      providerSignal => resolvePublicMusic(input.data, providerSignal),
      request.signal
    )
  );
  if (!parsed.success) return failure('UPSTREAM_FAILURE', true);
  const result = parsed.data;
  if ('error' in result)
    return failure(result.error.code, result.error.retryable);
  return Response.json(result, { headers });
}

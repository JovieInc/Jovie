import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { BASE_URL } from '@/constants/app';
import { createMusicMcpServer } from '@/lib/agent-acquisition/music-mcp';
import { NO_STORE_HEADERS } from '@/lib/http/headers';
import { parseJsonBody } from '@/lib/http/parse-json';
import {
  createRateLimitHeaders,
  getClientIP,
  publicArtistApiLimiter,
} from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
const MUSIC_BODY_TIMEOUT_MS = 5_000;

function originAllowed(request: Request) {
  const origin = request.headers.get('origin');
  return !origin || origin === new URL(BASE_URL).origin;
}

/** Anonymous public reads. No write flag, write limiter or owner session. */
export async function POST(request: Request) {
  if (!originAllowed(request)) return new Response(null, { status: 403 });
  const limit = await publicArtistApiLimiter.limit(getClientIP(request));
  if (!limit.success)
    return Response.json(
      {
        error: {
          code: limit.unavailable ? 'RATE_LIMIT_UNAVAILABLE' : 'RATE_LIMITED',
          retryable: true,
        },
      },
      {
        status: limit.unavailable ? 503 : 429,
        headers: {
          ...NO_STORE_HEADERS,
          ...createRateLimitHeaders(limit),
          'Retry-After': '60',
        },
      }
    );
  const deadline = new AbortController();
  const timer = setTimeout(() => deadline.abort(), MUSIC_BODY_TIMEOUT_MS);
  const signal = AbortSignal.any([request.signal, deadline.signal]);
  let body;
  try {
    // Aborting the pipe cancels a stalled reader and its upstream request body.
    const boundedRequest = new Request(request, {
      body: request.body?.pipeThrough(new TransformStream(), { signal }),
      signal,
      duplex: 'half',
    } as RequestInit);
    body = await parseJsonBody(boundedRequest, {
      route: 'public-music-mcp',
      maxBodySize: 16384,
      redactParseErrors: true,
      headers: NO_STORE_HEADERS,
    });
  } catch {
    return Response.json(
      {
        error: {
          code: deadline.signal.aborted
            ? 'BODY_TIMEOUT'
            : request.signal.aborted
              ? 'CANCELLED'
              : 'INVALID_BODY',
          retryable: deadline.signal.aborted,
        },
      },
      {
        status: deadline.signal.aborted
          ? 408
          : request.signal.aborted
            ? 499
            : 400,
        headers: NO_STORE_HEADERS,
      }
    );
  } finally {
    clearTimeout(timer);
  }
  if (!body.ok) return body.response;
  const server = createMusicMcpServer(request.signal);
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  await server.connect(transport);
  try {
    const response = await transport.handleRequest(request, {
      parsedBody: body.data,
    });
    response.headers.set('Cache-Control', 'no-store');
    return response;
  } finally {
    await server.close();
  }
}

// Stateless JSON transport does not offer an SSE stream or session deletion.
export function GET(request: Request) {
  return new Response(null, {
    status: originAllowed(request) ? 405 : 403,
    headers: { ...NO_STORE_HEADERS, Allow: 'POST' },
  });
}
export const DELETE = GET;

import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { BASE_URL } from '@/constants/app';
import { chatgptDirectoryOriginAllowed } from '@/lib/chatgpt/directory/contract';
import {
  findPublicArtists,
  getPublicArtist,
  getPublicArtistUpdates,
} from '@/lib/chatgpt/directory/queries';
import { createArtistDirectoryMcpServer } from '@/lib/chatgpt/directory/server';
import { isCodeFlagEnabled } from '@/lib/flags/code-flags';
import { NO_STORE_HEADERS } from '@/lib/http/headers';
import { parseJsonBody } from '@/lib/http/parse-json';
import {
  createRateLimitHeaders,
  getClientIP,
  publicArtistApiLimiter,
} from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 15;

const BODY_MAX_BYTES = 16_384;

function appOrigin(): string {
  return new URL(BASE_URL).origin;
}

function originAllowed(request: Request): boolean {
  return chatgptDirectoryOriginAllowed(
    request.headers.get('origin'),
    appOrigin()
  );
}

function unavailable(): Response {
  return new Response(null, { status: 404, headers: NO_STORE_HEADERS });
}

function closed(request: Request): Response {
  if (!isCodeFlagEnabled('CHATGPT_APP_DIRECTORY_MCP')) return unavailable();
  if (!originAllowed(request)) {
    return new Response(null, { status: 403, headers: NO_STORE_HEADERS });
  }
  return new Response(null, {
    status: 405,
    headers: { ...NO_STORE_HEADERS, Allow: 'POST' },
  });
}

/** Anonymous public-artist reads. Off unless FEATURE_CHATGPT_APP_DIRECTORY_MCP=true. */
export async function POST(request: Request) {
  if (!isCodeFlagEnabled('CHATGPT_APP_DIRECTORY_MCP')) return unavailable();
  if (!originAllowed(request)) {
    return new Response(null, { status: 403, headers: NO_STORE_HEADERS });
  }
  const limit = await publicArtistApiLimiter.limit(getClientIP(request));
  if (!limit.success) {
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
  }
  const body = await parseJsonBody(request, {
    route: 'chatgpt-artist-directory-mcp',
    maxBodySize: BODY_MAX_BYTES,
    redactParseErrors: true,
    headers: NO_STORE_HEADERS,
  });
  if (!body.ok) return body.response;
  const server = createArtistDirectoryMcpServer({
    findArtists: findPublicArtists,
    getArtist: getPublicArtist,
    getUpdates: getPublicArtistUpdates,
  });
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

export function GET(request: Request) {
  return closed(request);
}

export const DELETE = GET;

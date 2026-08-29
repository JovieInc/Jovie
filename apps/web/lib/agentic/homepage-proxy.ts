import { type NextRequest, NextResponse } from 'next/server';
import { negotiateAgenticRepresentation } from './markdown-negotiation';

export const AGENTIC_HOMEPAGE_INTERNAL_PATH = '/jovie-agentic/home';
export const AGENTIC_HOMEPAGE_INTERNAL_MARKER = 'x-jovie-agentic-home';
export const AGENTIC_HOMEPAGE_INTERNAL_MARKER_VALUE = 'root';

/** Add a cache-variance token without discarding framework-owned tokens. */
export function appendVaryToken(headers: Headers, token: string): void {
  const currentTokens = (headers.get('Vary') ?? '')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean);

  if (
    !currentTokens.some(value => value.toLowerCase() === token.toLowerCase())
  ) {
    currentTokens.push(token);
  }

  headers.set('Vary', currentTokens.join(', '));
}

/**
 * Resolve the representation at the supported proxy boundary. Returning null
 * leaves the existing homepage/auth flow untouched. The implementation route
 * remains addressable because Next runs the proxy again after an internal
 * rewrite; the negotiated root URL is the canonical public surface.
 */
export function resolveAgenticHomepageProxyResponse(
  request: NextRequest
): NextResponse | null {
  if (
    (request.method !== 'GET' && request.method !== 'HEAD') ||
    request.nextUrl.pathname !== '/' ||
    negotiateAgenticRepresentation(request.headers.get('accept')) !== 'markdown'
  ) {
    return null;
  }

  const targetUrl = request.nextUrl.clone();
  targetUrl.pathname = AGENTIC_HOMEPAGE_INTERNAL_PATH;
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(
    AGENTIC_HOMEPAGE_INTERNAL_MARKER,
    AGENTIC_HOMEPAGE_INTERNAL_MARKER_VALUE
  );
  const response = NextResponse.rewrite(targetUrl, {
    request: { headers: requestHeaders },
  });
  appendVaryToken(response.headers, 'Accept');
  return response;
}

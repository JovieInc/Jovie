import { type NextRequest, NextResponse } from 'next/server';
import { negotiateAgenticRepresentation } from './markdown-negotiation';

export const AGENTIC_HOMEPAGE_INTERNAL_PATH = '/jovie-agentic/home';

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
  const response = NextResponse.rewrite(targetUrl);
  response.headers.set('Vary', 'Accept');
  return response;
}

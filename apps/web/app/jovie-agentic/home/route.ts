import { AGENTIC_HOMEPAGE_MARKDOWN } from '@/lib/agentic/homepage-markdown';
import {
  AGENTIC_HOMEPAGE_INTERNAL_MARKER,
  AGENTIC_HOMEPAGE_INTERNAL_MARKER_VALUE,
} from '@/lib/agentic/homepage-proxy';

export const dynamic = 'force-dynamic';

/** Internal target for the proxy-owned homepage negotiation boundary. */
export function GET(request: Request): Response {
  const marker = request.headers.get(AGENTIC_HOMEPAGE_INTERNAL_MARKER);
  if (marker !== AGENTIC_HOMEPAGE_INTERNAL_MARKER_VALUE) {
    return new Response(null, {
      status: 404,
      headers: {
        'Cache-Control': 'private, no-store',
        'X-Robots-Tag': 'noindex, nofollow',
      },
    });
  }

  return new Response(AGENTIC_HOMEPAGE_MARKDOWN, {
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      Vary: 'Accept',
    },
  });
}

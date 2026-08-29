import { NextResponse } from 'next/server';
import { AGENTIC_HOMEPAGE_MARKDOWN } from '@/lib/agentic/homepage-markdown';
import { negotiateAgenticRepresentation } from '@/lib/agentic/markdown-negotiation';

export const dynamic = 'force-dynamic';

function markdownResponse(): Response {
  return new Response(AGENTIC_HOMEPAGE_MARKDOWN, {
    headers: {
      'Cache-Control': 'public, max-age=86400, s-maxage=86400',
      'Content-Type': 'text/markdown; charset=utf-8',
      Vary: 'Accept',
    },
  });
}

/**
 * Internal target for the header-conditioned root rewrite. HTML requests are
 * rewritten back to the canonical page with a marker query so the config rule
 * cannot loop; Markdown requests terminate here with the negotiated body.
 */
export function GET(request: Request): Response {
  const requestUrl = new URL(request.url);
  if (
    negotiateAgenticRepresentation(request.headers.get('accept')) === 'markdown'
  ) {
    return markdownResponse();
  }

  requestUrl.pathname = '/';
  return NextResponse.rewrite(requestUrl);
}

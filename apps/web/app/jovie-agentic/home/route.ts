import { AGENTIC_HOMEPAGE_MARKDOWN } from '@/lib/agentic/homepage-markdown';

export const dynamic = 'force-static';
export const revalidate = 86_400;

/** Static target for the proxy-owned homepage negotiation boundary. */
export function GET(): Response {
  return new Response(AGENTIC_HOMEPAGE_MARKDOWN, {
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      Vary: 'Accept',
    },
  });
}

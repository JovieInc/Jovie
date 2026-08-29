import { NextRequest, NextResponse } from 'next/server';
import {
  buildHomepageMarkdown,
  buildNotFoundMarkdown,
} from '@/lib/agent/homepage-markdown';
import { isNextRscRequest, negotiateAccept } from '@/lib/http/accept-header';
import {
  getPublicProfileCandidate,
  isDedicatedRootSegment,
} from '@/lib/routing/proxy-routing';

const MARKDOWN_CONTENT_TYPE = 'text/markdown; charset=utf-8';
const FILE_EXTENSION_PATTERN = /\.[a-z0-9]{1,8}$/i;

const PASS_THROUGH_EXACT = new Set(['/api', '/app', '/trpc', '/monitoring']);

function startsWithPassThroughPrefix(pathname: string): boolean {
  return (
    pathname.startsWith('/api/') ||
    pathname.startsWith('/app/') ||
    pathname.startsWith('/_next/') ||
    pathname.startsWith('/__clerk/') ||
    pathname.startsWith('/trpc/') ||
    pathname.startsWith('/monitoring/') ||
    pathname.startsWith('/.well-known/')
  );
}

function hasFileExtension(segment: string): boolean {
  return FILE_EXTENSION_PATTERN.test(segment);
}

function isHomepagePath(pathname: string): boolean {
  return pathname === '/' || pathname === '';
}

/**
 * Known HTML/app/file surfaces keep their existing representation.
 * Unknown paths become the markdown 404 recovery document.
 */
export function shouldPassThroughMarkdownNegotiation(
  pathname: string
): boolean {
  if (isHomepagePath(pathname)) return false;
  if (
    PASS_THROUGH_EXACT.has(pathname) ||
    startsWithPassThroughPrefix(pathname)
  ) {
    return true;
  }

  const segments = pathname.split('/').filter(Boolean);
  const root = segments[0];
  if (!root) return false;
  if (isDedicatedRootSegment(root)) return true;
  // Artist profiles and smart links are a known HTML surface, not unknown
  // routes. Do not intercept them as Markdown 404s.
  if (getPublicProfileCandidate(`/${root}`)) return true;
  return segments.some(hasFileExtension);
}

function markdownResponse(
  body: string,
  status: number,
  cacheControl: string,
  method: string
): NextResponse {
  return new NextResponse(method === 'HEAD' ? null : body, {
    status,
    headers: {
      'Content-Type': MARKDOWN_CONTENT_TYPE,
      Vary: 'Accept',
      'Cache-Control': cacheControl,
    },
  });
}

function notAcceptableResponse(method: string): NextResponse {
  const body =
    'Not Acceptable. Supported representations: text/html, text/markdown.\n';
  return new NextResponse(method === 'HEAD' ? null : body, {
    status: 406,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      Vary: 'Accept',
      'Cache-Control': 'no-store',
    },
  });
}

/**
 * Homepage markdown negotiation plus agent-friendly markdown 404s.
 * Skip Next.js RSC navigations so the App Router keeps HTML.
 */
export function negotiateAgentMarkdown(req: NextRequest): NextResponse | null {
  const method = req.method;
  if (method !== 'GET' && method !== 'HEAD') return null;
  if (isNextRscRequest(req.headers)) return null;

  const pathname = req.nextUrl.pathname;
  if (shouldPassThroughMarkdownNegotiation(pathname)) return null;

  const decision = negotiateAccept(req.headers.get('accept'));

  if (decision === 'not-acceptable') {
    return notAcceptableResponse(method);
  }

  if (decision !== 'markdown') return null;

  if (isHomepagePath(pathname)) {
    return markdownResponse(
      buildHomepageMarkdown(),
      200,
      'public, max-age=3600',
      method
    );
  }

  return markdownResponse(buildNotFoundMarkdown(), 404, 'no-store', method);
}

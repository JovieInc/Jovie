/**
 * Public Markdown variants for the homepage and unknown-route recovery.
 *
 * Visual HTML homepage is unchanged. These bodies are returned only when
 * Accept negotiation prefers text/markdown.
 */

import { APP_NAME, BASE_URL } from '@/constants/app';
import { HOMEPAGE_LAUNCH_COPY } from '@/data/homepageLaunchCopy';
import {
  ensureVaryAccept,
  MARKDOWN_CONTENT_TYPE,
  prefersMarkdown,
} from '@/lib/http/accept-markdown';
import { isDedicatedRootSegment } from '@/lib/routing/proxy-routing';

export const MARKDOWN_HOMEPAGE_CACHE_CONTROL =
  'public, max-age=3600, s-maxage=3600';

const MACHINE_READABLE_SURFACES = [
  '/llms.txt',
  '/openapi.json',
  '/sitemap.xml',
  '/llms-full.txt',
] as const;

function normalizePathname(pathname: string): string {
  if (!pathname || pathname === '/') return '/';
  const prefixed = pathname.startsWith('/') ? pathname : `/${pathname}`;
  if (prefixed.length > 1 && prefixed.endsWith('/')) {
    return prefixed.slice(0, -1);
  }
  return prefixed;
}

function firstSegment(pathname: string): string | null {
  const segment = pathname.split('/').filter(Boolean)[0];
  return segment ?? null;
}

/**
 * Paths that already have a non-HTML machine-readable or dedicated HTML
 * document. Unknown paths get the Markdown 404 recovery body instead.
 */
export function isMarkdownPassThroughPath(pathname: string): boolean {
  const normalized = normalizePathname(pathname);
  if (normalized === '/') return false;
  if (normalized === '/api' || normalized.startsWith('/api/')) return true;
  if (normalized.endsWith('/llms.txt')) return true;

  const segment = firstSegment(normalized);
  return segment !== null && isDedicatedRootSegment(segment);
}

export function buildHomepageMarkdown(): string {
  const { seo, hero, faq } = HOMEPAGE_LAUNCH_COPY;
  const faqLines = faq
    .map(item => `### ${item.question}\n\n${item.answer}`)
    .join('\n\n');

  return `# ${APP_NAME}

> ${hero.headline}

${hero.subhead}

${seo.description}

## Get started

- [${hero.primaryCta.label}](${BASE_URL}${hero.primaryCta.href})
- [${hero.secondaryCta.label}](${BASE_URL}${hero.secondaryCta.href})

## FAQ

${faqLines}

## Machine-readable surfaces

- [/llms.txt](${BASE_URL}/llms.txt) — site identity for AI agents
- [/openapi.json](${BASE_URL}/openapi.json) — public Artist API
- [/sitemap.xml](${BASE_URL}/sitemap.xml) — public URL index
- [/llms-full.txt](${BASE_URL}/llms-full.txt) — full documentation
`;
}

export function buildMarkdownNotFoundBody(): string {
  const links = MACHINE_READABLE_SURFACES.map(
    path => `- [${path}](${BASE_URL}${path})`
  ).join('\n');

  return `# Not found

This URL is not a Jovie page.

Recover from these machine-readable surfaces:

${links}
- [/](${BASE_URL}/) — homepage
`;
}

function markdownHeaders(
  extra: Record<string, string>
): Record<string, string> {
  const headers = new Headers({
    'Content-Type': MARKDOWN_CONTENT_TYPE,
    ...extra,
  });
  ensureVaryAccept(headers);
  return Object.fromEntries(headers.entries());
}

export function createHomepageMarkdownResponse(method: string): Response {
  const body = buildHomepageMarkdown();
  return new Response(method === 'HEAD' ? null : body, {
    status: 200,
    headers: markdownHeaders({
      'Cache-Control': MARKDOWN_HOMEPAGE_CACHE_CONTROL,
    }),
  });
}

export function createMarkdownNotFoundResponse(method: string): Response {
  const body = buildMarkdownNotFoundBody();
  return new Response(method === 'HEAD' ? null : body, {
    status: 404,
    headers: markdownHeaders({
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'none',
    }),
  });
}

/**
 * Short-circuit public GET/HEAD when the client prefers Markdown.
 * Returns null so browsers and dedicated documents keep existing HTML/handlers.
 */
export function maybePublicMarkdownResponse(req: Request): Response | null {
  if (req.method !== 'GET' && req.method !== 'HEAD') return null;
  if (!prefersMarkdown(req.headers.get('accept'))) return null;

  const pathname = normalizePathname(new URL(req.url).pathname);
  if (pathname === '/') {
    return createHomepageMarkdownResponse(req.method);
  }
  if (isMarkdownPassThroughPath(pathname)) return null;
  return createMarkdownNotFoundResponse(req.method);
}

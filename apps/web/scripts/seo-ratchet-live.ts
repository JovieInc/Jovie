#!/usr/bin/env tsx
/**
 * Live SEO/AEO ratchet — fetches production robots.txt + sitemap.xml and fails loud.
 *
 * Used by post-deploy smoke against https://jov.ie. PR-level source checks live in
 * scripts/seo-ratchet-guard.mjs + tests/app/seo-ratchet.test.ts.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  formatSurfaceViolations,
  type SeoSurfaceViolation,
  validateRobotsTxtSurface,
  validateSitemapXmlSurface,
} from '../lib/seo/surface-ratchet';
import {
  assertExactProbeResponse,
  buildOriginBoundCookieRequest,
  buildOriginBoundProbeRequest,
  createAbsoluteDeadline,
  isExactVercelDeploymentUrl,
  parseProbeUrl,
  readExactHostCookieJar,
} from './vercel-protected-origin.cjs';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(scriptDir, '..');
const baselinePath = join(projectRoot, 'seo-ratchet.baseline.json');

const baseline = JSON.parse(readFileSync(baselinePath, 'utf8')) as {
  robots: { requiredAiCrawlers: string[] };
  sitemap: { requireLastModified: boolean; minEntryCount: number };
};

const USER_AGENT =
  'Mozilla/5.0 (compatible; JovieSeoRatchet/1.0; +https://jov.ie)';
const TIMEOUT_MS = 15_000;
const buildCookieOnlyRequest = buildOriginBoundCookieRequest as unknown as (
  url: URL,
  options: {
    readonly cookieHeader: string;
    readonly headers: Record<string, string>;
  }
) => { readonly url: URL; readonly options: RequestInit };
const buildPublicRequest = buildOriginBoundProbeRequest as unknown as (
  url: URL,
  options: { readonly headers: Record<string, string> }
) => { readonly url: URL; readonly options: RequestInit };

export function normalizeSeoBaseUrl(rawBaseUrl: string): string {
  const parsed = parseProbeUrl(rawBaseUrl, 'SEO ratchet base URL');
  if (
    parsed.pathname !== '/' ||
    parsed.search ||
    (parsed.origin !== 'https://jov.ie' && !isExactVercelDeploymentUrl(parsed))
  ) {
    throw new Error(
      'SEO ratchet base URL must be canonical production or one trusted Jovie deployment origin.'
    );
  }
  return parsed.origin;
}

export async function fetchSeoSurface(
  rawBaseUrl: string,
  path: '/robots.txt' | '/sitemap.xml',
  {
    fetchImpl = globalThis.fetch,
    cookieJarPath = process.env.VERCEL_PROBE_COOKIE_JAR,
    timeoutMs = TIMEOUT_MS,
  }: {
    readonly fetchImpl?: typeof globalThis.fetch;
    readonly cookieJarPath?: string;
    readonly timeoutMs?: number;
  } = {}
): Promise<{ status: number; body: string }> {
  const baseUrl = normalizeSeoBaseUrl(rawBaseUrl);
  const deadline = createAbsoluteDeadline(timeoutMs, 'SEO surface fetch');
  try {
    const targetUrl = parseProbeUrl(`${baseUrl}${path}`);
    const headers = {
      Accept: '*/*',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      Pragma: 'no-cache',
      'User-Agent': USER_AGENT,
    };
    const request = isExactVercelDeploymentUrl(targetUrl)
      ? buildCookieOnlyRequest(targetUrl, {
          cookieHeader: readExactHostCookieJar(cookieJarPath, targetUrl),
          headers,
        })
      : buildPublicRequest(targetUrl, { headers });
    const response = await deadline.run(signal =>
      fetchImpl(request.url, {
        ...request.options,
        signal,
      })
    );
    assertExactProbeResponse(response, request.url);

    const body = await deadline.run(() => response.text());
    const contentType = (
      response.headers.get('content-type') ?? ''
    ).toLowerCase();
    if (contentType.includes('text/html') || /<html(?:\s|>)/i.test(body)) {
      throw new Error(
        `${path} returned HTML instead of exact SEO surface content.`
      );
    }
    return { status: response.status, body };
  } finally {
    deadline.dispose();
  }
}

async function main(): Promise<void> {
  const baseUrl = normalizeSeoBaseUrl(
    process.env.BASE_URL ?? process.argv[2] ?? 'https://jov.ie'
  );
  const violations: SeoSurfaceViolation[] = [];

  console.log(`[seo-ratchet:live] Checking ${baseUrl}`);

  const robots = await fetchSeoSurface(baseUrl, '/robots.txt');
  if (robots.status !== 200) {
    violations.push({
      check: 'robots-http',
      message: `robots.txt returned HTTP ${robots.status}.`,
      remediation: 'Verify production deploy and app/robots.ts route health.',
    });
  } else {
    violations.push(
      ...validateRobotsTxtSurface(robots.body, {
        requiredAiCrawlers: baseline.robots.requiredAiCrawlers,
      })
    );
    console.log('[seo-ratchet:live] ✓ robots.txt fetched');
  }

  const sitemap = await fetchSeoSurface(baseUrl, '/sitemap.xml');
  if (sitemap.status !== 200) {
    violations.push({
      check: 'sitemap-http',
      message: `sitemap.xml returned HTTP ${sitemap.status}.`,
      remediation: 'Verify production deploy and app/sitemap.ts route health.',
    });
  } else {
    violations.push(
      ...validateSitemapXmlSurface(sitemap.body, {
        requireLastModified: baseline.sitemap.requireLastModified,
        minEntryCount: baseline.sitemap.minEntryCount,
      })
    );
    console.log('[seo-ratchet:live] ✓ sitemap.xml fetched');
  }

  if (violations.length > 0) {
    console.error('');
    console.error('[seo-ratchet:live] FAILED — live SEO surface violations:');
    console.error(formatSurfaceViolations(violations));
    console.error('');
    console.error(
      '  Incident context: JovieInc/Jovie#11043 — silent Disallow: / on production.'
    );
    process.exit(1);
  }

  console.log(
    '[seo-ratchet:live] ✓ Production robots.txt and sitemap.xml are healthy'
  );
}

const invokedPath = process.argv[1];
if (invokedPath && import.meta.url === pathToFileURL(invokedPath).href) {
  void main().catch(error => {
    console.error(
      '[seo-ratchet:live] Unexpected failure:',
      error instanceof Error ? error.message : 'Unknown error.'
    );
    process.exitCode = 1;
  });
}

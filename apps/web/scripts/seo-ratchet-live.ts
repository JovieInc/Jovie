#!/usr/bin/env tsx
/**
 * Live SEO/AEO ratchet — fetches production robots.txt + sitemap.xml and fails loud.
 *
 * Used by post-deploy smoke against https://jov.ie. PR-level source checks live in
 * scripts/seo-ratchet-guard.mjs + tests/app/seo-ratchet.test.ts.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  formatSurfaceViolations,
  validateRobotsTxtSurface,
  validateSitemapXmlSurface,
} from '../lib/seo/surface-ratchet';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(scriptDir, '..');
const baselinePath = join(projectRoot, 'seo-ratchet.baseline.json');

const baseUrl = (
  process.env.BASE_URL ??
  process.argv[2] ??
  'https://jov.ie'
).replace(/\/$/, '');

const baseline = JSON.parse(readFileSync(baselinePath, 'utf8')) as {
  robots: { requiredAiCrawlers: string[] };
  sitemap: { requireLastModified: boolean; minEntryCount: number };
};

const USER_AGENT =
  'Mozilla/5.0 (compatible; JovieSeoRatchet/1.0; +https://jov.ie)';
const TIMEOUT_MS = 15_000;

async function fetchText(
  path: string
): Promise<{ status: number; body: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(`${baseUrl}${path}`, {
      headers: {
        Accept: '*/*',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        Pragma: 'no-cache',
        'User-Agent': USER_AGENT,
      },
      signal: controller.signal,
    });

    const body = await response.text();
    return { status: response.status, body };
  } finally {
    clearTimeout(timeout);
  }
}

async function main(): Promise<void> {
  const violations = [];

  console.log(`[seo-ratchet:live] Checking ${baseUrl}`);

  const robots = await fetchText('/robots.txt');
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

  const sitemap = await fetchText('/sitemap.xml');
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

main().catch(error => {
  console.error('[seo-ratchet:live] Unexpected failure:', error);
  process.exit(1);
});

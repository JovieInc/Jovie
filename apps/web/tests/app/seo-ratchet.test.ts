/**
 * SEO/AEO ratchet guardrail (#11044)
 *
 * 1. Per-route metadata contract: title, description, canonical, OG, Twitter.
 * 2. Baseline no-regression lock: seo-baseline.json records clean routes;
 *    CI hard-fails if a previously-present tag disappears.
 * 3. Profile/asset JSON-LD source ratchet (AEO #11032 / #11034).
 *
 * Update tests/seo/seo-baseline.json only in intentional PRs that add routes
 * or confirm new SEO coverage — never to silence regressions.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  collectSeoRatchetRegressions,
  collectSeoTagViolations,
  extractSeoTagPresence,
  type SeoTagPresence,
} from '@/lib/seo/metadata-contract';
import {
  validateRobotsTxtBody,
  validateSitemapXmlBody,
} from '@/lib/seo/robots-http-guard';
import {
  SEO_JSON_LD_SOURCE_ROUTES,
  SEO_STATIC_ROUTE_MANIFEST,
} from '@/lib/seo/static-route-manifest';

interface SeoBaselineFile {
  readonly version: number;
  readonly routes: Readonly<Record<string, SeoTagPresence>>;
}

const BASELINE_PATH = resolve(__dirname, '../seo/seo-baseline.json');

function loadBaseline(): SeoBaselineFile {
  const raw = readFileSync(BASELINE_PATH, 'utf8');
  return JSON.parse(raw) as SeoBaselineFile;
}

describe('SEO/AEO ratchet (#11044)', () => {
  describe('robots.txt HTTP body guard', () => {
    it('rejects production-shaped global Disallow: /', () => {
      const body = ['User-agent: *', 'Disallow: /', ''].join('\n');
      const result = validateRobotsTxtBody(body);
      expect(result.ok).toBe(false);
      expect(result.violations.join('\n')).toMatch(/global Disallow/i);
    });

    it('accepts production-shaped allow rules with sitemap + AI crawlers', () => {
      const body = [
        'User-agent: *',
        'Allow: /',
        'Disallow: /app/',
        '',
        'User-agent: GPTBot',
        'Allow: /',
        '',
        'User-agent: Claude-Web',
        'Allow: /',
        '',
        'User-agent: PerplexityBot',
        'Allow: /',
        '',
        'User-agent: Google-Extended',
        'Allow: /',
        '',
        'Sitemap: https://jov.ie/sitemap.xml',
      ].join('\n');
      const result = validateRobotsTxtBody(body);
      expect(result.ok).toBe(true);
      expect(result.violations).toHaveLength(0);
    });
  });

  describe('sitemap.xml HTTP body guard', () => {
    it('rejects empty sitemap', () => {
      const result = validateSitemapXmlBody(
        '<?xml version="1.0"?><urlset></urlset>'
      );
      expect(result.ok).toBe(false);
      expect(result.violations.join('\n')).toMatch(/empty/i);
    });

    it('requires lastmod on every url entry', () => {
      const body = `<?xml version="1.0"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://jov.ie/</loc></url>
</urlset>`;
      const result = validateSitemapXmlBody(body);
      expect(result.ok).toBe(false);
      expect(result.violations.join('\n')).toMatch(/lastmod/i);
    });

    it('accepts non-empty sitemap with lastmod', () => {
      const body = `<?xml version="1.0"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://jov.ie/</loc>
    <lastmod>2026-06-17</lastmod>
  </url>
</urlset>`;
      const result = validateSitemapXmlBody(body);
      expect(result.ok).toBe(true);
      expect(result.urlCount).toBe(1);
    });
  });

  describe('per-route metadata contract + baseline ratchet', () => {
    it('every manifest route satisfies required SEO tags and matches seo-baseline.json', async () => {
      const baseline = loadBaseline();
      const violations: string[] = [];
      const regressions: string[] = [];

      for (const route of SEO_STATIC_ROUTE_MANIFEST) {
        const metadata = await route.loadMetadata();
        const current = extractSeoTagPresence(metadata);
        violations.push(...collectSeoTagViolations(current, route.id));

        const expected = baseline.routes[route.id];
        if (!expected) {
          regressions.push(
            `${route.id}: missing from seo-baseline.json — add this route in an intentional baseline PR`
          );
          continue;
        }

        regressions.push(
          ...collectSeoRatchetRegressions(route.id, expected, current)
        );
      }

      const failures = [...violations, ...regressions];
      expect(failures, failures.join('\n')).toEqual([]);
    }, 30_000);
  });

  describe('profile/asset JSON-LD source ratchet', () => {
    const appsWebRoot = resolve(__dirname, '../..');

    for (const relativePath of SEO_JSON_LD_SOURCE_ROUTES) {
      it(`${relativePath} emits JSON-LD structured data`, () => {
        const source = readFileSync(resolve(appsWebRoot, relativePath), 'utf8');
        expect(
          source.includes('application/ld+json') ||
            source.includes('safeJsonLdStringify'),
          `${relativePath} must include JSON-LD (application/ld+json or safeJsonLdStringify)`
        ).toBe(true);
      });
    }
  });
});

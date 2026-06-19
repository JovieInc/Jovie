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
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Metadata, MetadataRoute } from 'next';
import { describe, expect, it, vi } from 'vitest';
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
import { generateMetadata as generateHomeMetadata } from '../../app/(home)/page';
import { buildPublicProfileMetadata } from '../../lib/profile/metadata';
import {
  assertMetadataRatchet,
  type SeoRequiredTag,
  validateMetadataTags,
} from '../../lib/seo/metadata-ratchet';
import {
  validateRobotsTxtSurface,
  validateSitemapXmlSurface,
} from '../../lib/seo/surface-ratchet';

interface SeoBaselineFile {
  readonly version: number;
  readonly routes: Readonly<Record<string, SeoTagPresence>>;
}

const BASELINE_PATH = resolve(__dirname, '../seo/seo-baseline.json');

function loadBaseline(): SeoBaselineFile {
  const raw = readFileSync(BASELINE_PATH, 'utf8');
  return JSON.parse(raw) as SeoBaselineFile;
}

const testDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(testDir, '../..');
const ratchetBaseline = JSON.parse(
  readFileSync(join(projectRoot, 'seo-ratchet.baseline.json'), 'utf8')
) as {
  routes: Array<{
    id: string;
    requiredTags: SeoRequiredTag[];
  }>;
  robots: {
    requiredAiCrawlers: string[];
  };
};

function formatRobotsTxt(robots: MetadataRoute.Robots): string {
  const rules = Array.isArray(robots.rules) ? robots.rules : [robots.rules];
  const lines: string[] = [];

  for (const rule of rules) {
    lines.push(`User-agent: ${rule.userAgent}`);

    const allow = rule.allow;
    if (allow) {
      const allowList = Array.isArray(allow) ? allow : [allow];
      for (const value of allowList) {
        if (value) lines.push(`Allow: ${value}`);
      }
    }

    const disallow = rule.disallow;
    if (disallow) {
      const disallowList = Array.isArray(disallow) ? disallow : [disallow];
      for (const value of disallowList) {
        if (value) lines.push(`Disallow: ${value}`);
      }
    }
  }

  if (robots.sitemap) {
    lines.push(`Sitemap: ${robots.sitemap}`);
  }

  return `${lines.join('\n')}\n`;
}

function serializeSitemapXml(entries: MetadataRoute.Sitemap): string {
  const urls = entries
    .map(entry => {
      const lastmod = entry.lastModified
        ? `<lastmod>${new Date(entry.lastModified).toISOString()}</lastmod>`
        : '';
      return `<url><loc>${entry.url}</loc>${lastmod}</url>`;
    })
    .join('');
  return `<?xml version="1.0" encoding="UTF-8"?><urlset>${urls}</urlset>`;
}

// ---------------------------------------------------------------------------
// PR #11044: HTTP body guard + static-route manifest
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Main-branch: seo-ratchet baseline routes (metadata-ratchet lib)
// ---------------------------------------------------------------------------

describe('seo-ratchet baseline routes', () => {
  it('homepage metadata keeps required SEO/AEO tags', async () => {
    const metadata = await generateHomeMetadata();
    const route = ratchetBaseline.routes.find(entry => entry.id === 'homepage');
    expect(route).toBeDefined();
    assertMetadataRatchet('homepage', metadata, route!.requiredTags);
  });

  it('profile metadata builder keeps required SEO/AEO tags', () => {
    const route = ratchetBaseline.routes.find(entry => entry.id === 'profile');
    expect(route).toBeDefined();

    const metadata = buildPublicProfileMetadata({
      profile: {
        username: 'tim',
        username_normalized: 'tim',
        display_name: 'Tim White',
        bio: 'Producer and artist.',
        location: 'Los Angeles',
        avatar_url: null,
        is_verified: true,
      },
      genres: ['Electronic'],
    });

    assertMetadataRatchet('profile', metadata, route!.requiredTags);
  });

  it('hard-fails when a baseline-clean route loses a required tag', () => {
    const brokenMetadata: Metadata = {
      title: 'Still has title',
      description: 'Still has description',
      openGraph: {
        title: 'OG',
        description: 'OG description',
        url: 'https://jov.ie',
        type: 'website',
        siteName: 'Jovie',
      },
      twitter: {
        card: 'summary_large_image',
        title: 'Twitter title',
      },
    };

    const results = validateMetadataTags(brokenMetadata, [
      'title',
      'description',
      'canonical',
      'openGraph',
      'twitter',
    ]);

    expect(results.find(result => result.tag === 'canonical')?.passed).toBe(
      false
    );
    expect(() =>
      assertMetadataRatchet('broken-route', brokenMetadata, [
        'title',
        'description',
        'canonical',
        'openGraph',
        'twitter',
      ])
    ).toThrow(/lost required SEO tags/i);
  });
});

describe('seo-ratchet robots.txt serialization', () => {
  it('production-shaped robots.txt must not globally disallow /', async () => {
    vi.resetModules();
    vi.doMock('@/constants/app', () => ({
      BASE_URL: 'https://jov.ie',
    }));
    vi.doMock('@/lib/env-server', () => ({
      env: { VERCEL_ENV: 'production' },
    }));

    const { default: robots } = await import('../../app/robots');
    const body = formatRobotsTxt(robots());

    expect(body).not.toMatch(/User-agent: \*\nDisallow: \/\n/);
    expect(body).toContain('Sitemap: https://jov.ie/sitemap.xml');
    expect(body).toContain('Allow: /');
  });
});

describe('seo-ratchet live surface validators', () => {
  const productionRobots = [
    'User-agent: *',
    'Allow: /',
    'Disallow: /app/',
    'Disallow: /api/',
    'Sitemap: https://jov.ie/sitemap.xml',
    'Host: https://jov.ie',
    '',
    ...baseline.robots.requiredAiCrawlers.flatMap(crawler => [
      `User-agent: ${crawler}`,
      'Allow: /',
      'Allow: /llms.txt',
      'Disallow: /app/',
      '',
    ]),
  ].join('\n');

  it('flags global Disallow: / on wildcard user-agent', () => {
    const violations = validateRobotsTxtSurface(
      `User-agent: *\nDisallow: /\n`,
      { requiredAiCrawlers: ['GPTBot'] }
    );

    expect(
      violations.some(violation => violation.check === 'robots-global-disallow')
    ).toBe(true);
  });

  it('accepts production-shaped robots.txt bodies', () => {
    const violations = validateRobotsTxtSurface(productionRobots, {
      requiredAiCrawlers: baseline.robots.requiredAiCrawlers,
    });

    expect(violations).toEqual([]);
  });

  it('requires lastmod on every sitemap URL block', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://jov.ie</loc></url>
</urlset>`;

    const violations = validateSitemapXmlSurface(xml, {
      requireLastModified: true,
      minEntryCount: 1,
    });

    expect(
      violations.some(violation => violation.check === 'sitemap-lastmod')
    ).toBe(true);
  });

  it('accepts non-empty sitemap XML with lastmod entries', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://jov.ie</loc><lastmod>2026-06-18</lastmod></url>
</urlset>`;

    const violations = validateSitemapXmlSurface(xml, {
      requireLastModified: true,
      minEntryCount: 1,
    });

    expect(violations).toEqual([]);
  });
});

describe('seo-ratchet sitemap.xml shape', () => {
  it('serializes non-empty sitemap XML with lastmod on every URL', async () => {
    vi.resetModules();
    vi.doMock('next/cache', () => ({
      unstable_cache: (callback: () => Promise<unknown>) => callback,
    }));
    vi.doMock('@/constants/app', () => ({
      BASE_URL: 'https://jov.ie',
    }));
    vi.doMock('@/lib/env-server', () => ({
      env: { DATABASE_URL: undefined },
    }));
    vi.doMock('@/lib/blog/getBlogPosts', () => ({
      getBlogPosts: vi.fn().mockResolvedValue([]),
      slugifyCategory: (value: string) => value.toLowerCase(),
    }));

    const { default: sitemap } = await import('../../app/sitemap');
    const entries = await sitemap();

    expect(entries.length).toBeGreaterThan(0);
    for (const entry of entries) {
      expect(
        entry.lastModified,
        `${entry.url} missing lastModified`
      ).toBeDefined();
    }

    const xml = serializeSitemapXml(entries);
    expect(xml).toContain('<?xml');
    expect(xml).toContain('<urlset>');
    expect(xml).toContain('<lastmod>');
    expect((xml.match(/<lastmod>/g) ?? []).length).toBe(entries.length);
  });
});

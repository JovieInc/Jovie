import { describe, expect, it } from 'vitest';
import {
  validateRobotsTxt,
  validateSitemapXml,
} from '@/lib/seo/guardrail-check';

const PRODUCTION_ROBOTS = `User-agent: *
Allow: /
Disallow: /app/
Disallow: /api/

User-agent: GPTBot
Allow: /
Allow: /llms.txt
Disallow: /app/

User-agent: ChatGPT-User
Allow: /
Allow: /llms.txt
Disallow: /app/

User-agent: Claude-Web
Allow: /
Allow: /llms.txt
Disallow: /app/

User-agent: PerplexityBot
Allow: /
Allow: /llms.txt
Disallow: /app/

User-agent: Google-Extended
Allow: /
Allow: /llms.txt
Disallow: /app/

Sitemap: https://jov.ie/sitemap.xml
Host: https://jov.ie
`;

const PREVIEW_ROBOTS = `User-agent: *
Disallow: /
`;

const SAMPLE_SITEMAP = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://jov.ie/</loc>
    <lastmod>2026-06-18T00:00:00.000Z</lastmod>
  </url>
  <url>
    <loc>https://jov.ie/tim</loc>
    <lastmod>2026-06-17T00:00:00.000Z</lastmod>
  </url>
</urlset>`;

describe('validateRobotsTxt', () => {
  it('passes production-shaped robots with sitemap and AI crawlers', () => {
    const result = validateRobotsTxt(PRODUCTION_ROBOTS);
    expect(result.ok).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('fails when User-agent: * globally blocks all paths', () => {
    const result = validateRobotsTxt(PREVIEW_ROBOTS);
    expect(result.ok).toBe(false);
    expect(result.errors.map(error => error.code)).toContain(
      'robots.global-disallow'
    );
    expect(result.errors[0]?.remediation).toContain('apps/web/app/robots.ts');
  });

  it('fails when sitemap reference is missing', () => {
    const withoutSitemap = PRODUCTION_ROBOTS.replace(
      'Sitemap: https://jov.ie/sitemap.xml\n',
      ''
    );
    const result = validateRobotsTxt(withoutSitemap);
    expect(result.ok).toBe(false);
    expect(result.errors.map(error => error.code)).toContain(
      'robots.missing-sitemap'
    );
  });

  it('accepts a sitemap directive with trailing whitespace', () => {
    const withTrailingSpace = PRODUCTION_ROBOTS.replace(
      'Sitemap: https://jov.ie/sitemap.xml',
      'Sitemap:   https://jov.ie/sitemap.xml   '
    );
    const result = validateRobotsTxt(withTrailingSpace);
    expect(result.errors.map(error => error.code)).not.toContain(
      'robots.missing-sitemap'
    );
  });

  it('does not treat a non-/sitemap.xml directive as a sitemap reference', () => {
    const wrongSuffix = PRODUCTION_ROBOTS.replace(
      'Sitemap: https://jov.ie/sitemap.xml',
      'Sitemap: https://jov.ie/sitemap_index.xml'
    );
    const result = validateRobotsTxt(wrongSuffix);
    expect(result.errors.map(error => error.code)).toContain(
      'robots.missing-sitemap'
    );
  });

  it('handles adversarial sitemap input without super-linear backtracking', () => {
    // Long run of whitespace after a `Sitemap:` directive that never resolves
    // to /sitemap.xml — would trigger catastrophic backtracking on a naive
    // `^sitemap:\s*.+/sitemap\.xml\s*$` regex (SonarCloud S5852).
    const adversarial = `${PRODUCTION_ROBOTS.replace(
      'Sitemap: https://jov.ie/sitemap.xml\n',
      ''
    )}Sitemap: ${' '.repeat(100_000)}`;
    const start = performance.now();
    const result = validateRobotsTxt(adversarial);
    const elapsedMs = performance.now() - start;
    expect(elapsedMs).toBeLessThan(1000);
    expect(result.errors.map(error => error.code)).toContain(
      'robots.missing-sitemap'
    );
  });

  it('fails when a required AI crawler rule is missing', () => {
    const withoutGptBot = `User-agent: *
Allow: /
Disallow: /app/

User-agent: ChatGPT-User
Allow: /
Disallow: /app/

User-agent: Claude-Web
Allow: /
Disallow: /app/

User-agent: PerplexityBot
Allow: /
Disallow: /app/

User-agent: Google-Extended
Allow: /
Disallow: /app/

Sitemap: https://jov.ie/sitemap.xml
`;
    const result = validateRobotsTxt(withoutGptBot);
    expect(result.ok).toBe(false);
    expect(result.errors.map(error => error.code)).toContain(
      'robots.missing-ai-crawler'
    );
  });
});

describe('validateSitemapXml', () => {
  it('passes non-empty sitemap entries with lastmod', () => {
    const result = validateSitemapXml(SAMPLE_SITEMAP);
    expect(result.ok).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('fails on empty body', () => {
    const result = validateSitemapXml('');
    expect(result.ok).toBe(false);
    expect(result.errors[0]?.code).toBe('sitemap.empty');
  });

  it('fails when url entries are missing lastmod', () => {
    const missingLastmod = SAMPLE_SITEMAP.replace(
      '<lastmod>2026-06-17T00:00:00.000Z</lastmod>',
      ''
    );
    const result = validateSitemapXml(missingLastmod);
    expect(result.ok).toBe(false);
    expect(result.errors.map(error => error.code)).toContain(
      'sitemap.missing-lastmod'
    );
  });

  it('fails when sitemap has no url entries', () => {
    const result = validateSitemapXml(
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>'
    );
    expect(result.ok).toBe(false);
    expect(result.errors[0]?.code).toBe('sitemap.no-urls');
  });
});

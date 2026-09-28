import { describe, expect, it } from 'vitest';
import {
  parseRobotsTxt,
  validateLiveRobotsTxt,
  validateLiveSitemapXml,
  validateProductionRobots,
  validateSourceMetadataPatterns,
} from '@/lib/seo/ratchet';

describe('SEO ratchet library — live robots/sitemap parsers (JOV-11044)', () => {
  it('accepts production-shaped robots.txt', () => {
    const robots = [
      'User-agent: *',
      'Allow: /',
      'Disallow: /app/',
      'Disallow: /api/',
      '',
      'User-agent: GPTBot',
      'Allow: /',
      'User-agent: ChatGPT-User',
      'Allow: /',
      'User-agent: Claude-Web',
      'Allow: /',
      'User-agent: PerplexityBot',
      'Allow: /',
      'User-agent: Google-Extended',
      'Allow: /',
      '',
      'Sitemap: https://jov.ie/sitemap.xml',
    ].join('\n');

    expect(validateLiveRobotsTxt(robots)).toEqual([]);
    expect(parseRobotsTxt(robots).wildcardDisallow).not.toContain('/');
  });

  it('parses sitemap URLs without truncating at the scheme colon (S5852-safe parser)', () => {
    const robots = [
      'user-agent: *',
      'ALLOW: /',
      'Sitemap: https://jov.ie/sitemap.xml',
    ].join('\n');

    const parsed = parseRobotsTxt(robots);
    expect(parsed.sitemapUrls).toEqual(['https://jov.ie/sitemap.xml']);
    expect(parsed.aiCrawlerAllows['*']).toBe(true);
  });

  it('rejects global Disallow: / on wildcard user-agent', () => {
    const robots = ['User-agent: *', 'Disallow: /'].join('\n');
    const issues = validateLiveRobotsTxt(robots);
    expect(
      issues.some(issue => issue.code === 'live-robots-global-disallow')
    ).toBe(true);
  });

  it('accepts live sitemap.xml with or without lastmod', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://jov.ie/</loc><lastmod>2026-06-18</lastmod></url>
  <url><loc>https://jov.ie/about</loc></url>
</urlset>`;

    expect(validateLiveSitemapXml(xml)).toEqual([]);
  });

  it('validateProductionRobots catches missing AI crawler rules', () => {
    const issues = validateProductionRobots({
      rules: [{ userAgent: '*', allow: '/', disallow: ['/app/'] }],
      sitemap: 'https://jov.ie/sitemap.xml',
    });

    expect(
      issues.some(issue => issue.code === 'robots-missing-ai-crawler')
    ).toBe(true);
  });
});

describe('validateSourceMetadataPatterns character class', () => {
  const required = ['canonical', 'title', 'description'] as const;

  it('accepts colon-separated metadata wiring', () => {
    const source = `
      export const metadata = {
        title: 'Jovie',
        description: 'Public page',
        alternates: {
          canonical: 'https://jov.ie',
        },
      };
    `;

    expect(
      validateSourceMetadataPatterns(source, required, 'colon-form')
    ).toEqual([]);
  });

  it('accepts comma-separated metadata wiring', () => {
    const source = `
      export const metadata = {
        title,
        description,
        alternates: {
          canonical,
        },
      };
    `;

    expect(
      validateSourceMetadataPatterns(source, required, 'comma-form')
    ).toEqual([]);
  });

  it('rejects metadata wiring that has neither colon nor comma', () => {
    const source = `
      export const metadata = {
        title
        description
        alternates: {
          canonical
        },
      };
    `;
    const issues = validateSourceMetadataPatterns(
      source,
      required,
      'bare-form'
    );

    expect(issues.map(issue => issue.code)).toEqual([
      'missing-source-canonical',
      'missing-source-title',
      'missing-source-description',
    ]);
  });
});

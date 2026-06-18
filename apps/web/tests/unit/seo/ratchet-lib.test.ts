import { describe, expect, it } from 'vitest';
import {
  parseRobotsTxt,
  validateLiveRobotsTxt,
  validateLiveSitemapXml,
  validateProductionRobots,
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

  it('accepts live sitemap.xml with lastmod on every URL', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://jov.ie/</loc><lastmod>2026-06-18</lastmod></url>
  <url><loc>https://jov.ie/about</loc><lastmod>2026-06-18</lastmod></url>
</urlset>`;

    expect(validateLiveSitemapXml(xml)).toEqual([]);
  });

  it('rejects live sitemap.xml entries missing lastmod', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://jov.ie/</loc></url>
</urlset>`;

    const issues = validateLiveSitemapXml(xml);
    expect(
      issues.some(issue => issue.code === 'live-sitemap-missing-lastmod')
    ).toBe(true);
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

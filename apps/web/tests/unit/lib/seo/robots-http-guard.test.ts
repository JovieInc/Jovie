import { describe, expect, it } from 'vitest';
import {
  validateRobotsTxtBody,
  validateSitemapXmlBody,
} from '@/lib/seo/robots-http-guard';

describe('robots-http-guard (#11043 regression)', () => {
  it('catches the incident pattern: User-agent * + Disallow / with no Allow /', () => {
    const incidentBody = ['User-agent: *', 'Disallow: /', ''].join('\n');
    const result = validateRobotsTxtBody(incidentBody);
    expect(result.ok).toBe(false);
    expect(result.violations).toContain(
      'robots.txt contains a global Disallow: / for User-agent: * — site is de-indexed'
    );
  });

  it('catches missing AI crawler welcome rules', () => {
    const body = [
      'User-agent: *',
      'Allow: /',
      'Sitemap: https://jov.ie/sitemap.xml',
    ].join('\n');
    const result = validateRobotsTxtBody(body);
    expect(result.ok).toBe(false);
    expect(result.violations.join('\n')).toMatch(/GPTBot/);
  });

  it('flags a missing Sitemap: directive', () => {
    const body = ['User-agent: *', 'Allow: /'].join('\n');
    const result = validateRobotsTxtBody(body);
    expect(result.violations.join('\n')).toMatch(/missing a Sitemap/);
  });

  it('accepts a present Sitemap: directive (no false missing-sitemap violation)', () => {
    const body = [
      '# comment',
      'User-agent: *',
      'Allow: /',
      'Sitemap:   https://jov.ie/sitemap.xml',
    ].join('\n');
    const result = validateRobotsTxtBody(body);
    expect(result.violations.join('\n')).not.toMatch(/missing a Sitemap/);
  });
});

describe('sitemap-http-guard', () => {
  it('accepts sitemap entries that omit lastmod when unknown', () => {
    const body = `<urlset>
  <url><loc>https://jov.ie/pricing</loc></url>
</urlset>`;
    const result = validateSitemapXmlBody(body);
    expect(result.ok).toBe(true);
    expect(result.urlCount).toBe(1);
  });

  it('rejects a captured lastmod that is not a date and keeps a real one', () => {
    const invalid = `<urlset>
  <url><loc>https://jov.ie/pricing</loc><lastmod>not-a-date</lastmod></url>
</urlset>`;
    const invalidResult = validateSitemapXmlBody(invalid);
    expect(invalidResult.ok).toBe(false);
    expect(invalidResult.violations).toContain(
      'sitemap.xml url[0] has an invalid <lastmod>'
    );

    const valid = `<urlset>
  <url><loc>https://jov.ie/pricing</loc><lastmod>2026-06-17</lastmod></url>
</urlset>`;
    const validResult = validateSitemapXmlBody(valid);
    expect(validResult.ok).toBe(true);
    expect(validResult.urlCount).toBe(1);
    expect(validResult.violations).toEqual([]);
  });
});

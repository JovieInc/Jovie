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
});

describe('sitemap-http-guard', () => {
  it('rejects sitemap entries without lastmod', () => {
    const body = `<urlset>
  <url><loc>https://jov.ie/pricing</loc></url>
</urlset>`;
    const result = validateSitemapXmlBody(body);
    expect(result.ok).toBe(false);
    expect(result.violations.join('\n')).toMatch(/lastmod/);
  });
});

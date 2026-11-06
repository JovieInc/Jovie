import type { MetadataRoute } from 'next';
import { resolveRobots } from 'next/dist/build/webpack/loaders/metadata/resolve-route-data';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CONTENT_SIGNAL } from '@/lib/agent-ready/discovery';
import { validateRobotsTxtBody } from '@/lib/seo/robots-http-guard';

afterEach(() => {
  vi.doUnmock('@/lib/env-server');
  vi.resetModules();
});

describe('canonical robots.txt Content-Signal output', () => {
  it.each(['production', undefined, 'preview', 'development'])(
    'native metadata serialization preserves the complete crawl policy in %s',
    async vercelEnv => {
      vi.resetModules();
      vi.doMock('@/lib/env-server', () => ({ env: { VERCEL_ENV: vercelEnv } }));
      const { default: robots } = await import('../../app/robots');
      const config = robots();
      const body = resolveRobots(config);
      const rules = Array.isArray(config.rules) ? config.rules : [config.rules];
      const groups = body
        .split('\n\n')
        .filter(group => group.includes('User-Agent'));
      expect(groups).toHaveLength(rules.length);
      for (const [index, rule] of rules.entries()) {
        const lines = groups[index].split('\n');
        expect(lines).toEqual([
          ...[rule.userAgent ?? '*']
            .flat()
            .map(agent => `User-Agent: ${agent}`),
          ...[rule.allow ?? []].flat().map(path => `Allow: ${path}`),
          ...[rule.disallow ?? []].flat().map(path => `Disallow: ${path}`),
          `Content-Signal: ${CONTENT_SIGNAL}`,
        ]);
      }
      for (const sitemap of [config.sitemap ?? []].flat()) {
        expect(body).toContain(`Sitemap: ${sitemap}\n`);
      }
      expect(body).not.toContain('/.well-known/robots.txt');
      if (vercelEnv === 'preview' || vercelEnv === 'development') {
        expect(body).toContain('Disallow: /\n');
        expect(body).not.toContain('Allow: /\n');
        expect(body).not.toContain('Sitemap:');
      } else {
        expect(validateRobotsTxtBody(body)).toEqual({
          ok: true,
          violations: [],
        });
      }
    }
  );

  it('native metadata preserves crawl delays, multiple agents and sitemaps alongside the signal', () => {
    const config: MetadataRoute.Robots = {
      rules: {
        userAgent: ['ExampleBot', 'OtherBot'],
        allow: '/public/',
        crawlDelay: 2,
        other: { 'Content-Signal': CONTENT_SIGNAL },
      },
      sitemap: ['https://jov.ie/sitemap.xml', 'https://jov.ie/news.xml'],
    };
    expect(resolveRobots(config)).toBe(
      [
        'User-Agent: ExampleBot',
        'User-Agent: OtherBot',
        'Allow: /public/',
        'Crawl-delay: 2',
        `Content-Signal: ${CONTENT_SIGNAL}`,
        '',
        'Sitemap: https://jov.ie/sitemap.xml',
        'Sitemap: https://jov.ie/news.xml',
        '',
      ].join('\n')
    );
  });

  it('serves the metadata route without a duplicate body rewrite', async () => {
    const { default: config } = await import('../../next.config.js');
    const rewrites = await config.rewrites();
    expect(
      rewrites.beforeFiles.some(
        (rule: { readonly source: string }) => rule.source === '/robots.txt'
      )
    ).toBe(false);
    expect(
      rewrites.beforeFiles.some((rule: { readonly source: string }) =>
        rule.source.startsWith('/hud')
      )
    ).toBe(true);
  });
});

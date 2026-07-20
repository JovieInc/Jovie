import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  validateRobotsTxtSurface,
  validateSitemapXmlSurface,
} from '../lib/seo/surface-ratchet';
import { fetchSeoSurface } from './seo-ratchet-live';

const BASE_URL = 'https://jovie-dojdmaf42-jovie.vercel.app';
const COOKIE_VALUE = 'opaque-origin-cookie';

function cookieJarFixture(): { directory: string; path: string } {
  const directory = mkdtempSync(join(tmpdir(), 'jovie-seo-cookie-'));
  const path = join(directory, 'cookie-jar');
  writeFileSync(
    path,
    `#HttpOnly_jovie-dojdmaf42-jovie.vercel.app\tFALSE\t/\tTRUE\t0\t__vercel_live_token\t${COOKIE_VALUE}\n`,
    { mode: 0o600 }
  );
  chmodSync(path, 0o600);
  return { directory, path };
}

function responseFixture({
  path,
  status,
  body,
  contentType,
  location,
}: {
  readonly path: '/robots.txt' | '/sitemap.xml';
  readonly status: number;
  readonly body: string;
  readonly contentType: string;
  readonly location?: string;
}): Response {
  const headers = new Headers({ 'content-type': contentType });
  if (location) headers.set('location', location);
  return {
    status,
    url: `${BASE_URL}${path}`,
    headers,
    text: vi.fn().mockResolvedValue(body),
  } as unknown as Response;
}

describe('live SEO exact-origin boundary', () => {
  it('rejects protected-login HTML before it becomes mass robots and sitemap violations', async () => {
    const { directory, path: cookieJarPath } = cookieJarFixture();
    const loginHtml =
      '<!doctype html><html><body><h1>Log in to Vercel</h1></body></html>';
    try {
      expect(
        validateRobotsTxtSurface(loginHtml, {
          requiredAiCrawlers: [
            'GPTBot',
            'ChatGPT-User',
            'OAI-SearchBot',
            'ClaudeBot',
            'Applebot-Extended',
            'PerplexityBot',
            'Google-Extended',
          ],
        }).length
      ).toBeGreaterThan(7);
      expect(
        validateSitemapXmlSurface(loginHtml, {
          requireLastModified: true,
          minEntryCount: 1,
        }).map(violation => violation.check)
      ).toContain('sitemap-xml-shape');

      for (const surface of ['/robots.txt', '/sitemap.xml'] as const) {
        const fetchImpl = vi.fn().mockResolvedValue(
          responseFixture({
            path: surface,
            status: 200,
            body: loginHtml,
            contentType: 'text/html; charset=utf-8',
          })
        );

        await expect(
          fetchSeoSurface(BASE_URL, surface, {
            fetchImpl,
            cookieJarPath,
          })
        ).rejects.toThrow(
          `${surface} returned HTML instead of exact SEO surface content`
        );
        const options = fetchImpl.mock.calls[0]?.[1] as RequestInit;
        expect(options.redirect).toBe('manual');
        expect(options.headers).toMatchObject({
          Cookie: `__vercel_live_token=${COOKIE_VALUE}`,
        });
        expect(options.headers).not.toHaveProperty(
          'x-vercel-protection-bypass'
        );
      }
    } finally {
      rmSync(directory, { force: true, recursive: true });
    }
  });

  it('rejects a Vercel login redirect without reading its body', async () => {
    const { directory, path: cookieJarPath } = cookieJarFixture();
    const response = responseFixture({
      path: '/robots.txt',
      status: 307,
      body: '<html><body>login</body></html>',
      contentType: 'text/html',
      location: 'https://vercel.com/login?next=%2Frobots.txt',
    });
    try {
      await expect(
        fetchSeoSurface(BASE_URL, '/robots.txt', {
          fetchImpl: vi.fn().mockResolvedValue(response),
          cookieJarPath,
        })
      ).rejects.toThrow('Refusing cross-origin protected-probe redirect');
      expect(response.text).not.toHaveBeenCalled();
    } finally {
      rmSync(directory, { force: true, recursive: true });
    }
  });
});

import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { safeFetchPublicHtml } from '@/lib/ai/tools/safe-fetch-public-html';
import { fetchDocument } from '@/lib/ingestion/strategies/base/fetch';
import {
  coreSocialHtmlFetchBlockMessage,
  isCoreSocialHtmlHost,
} from './social-html-policy';

const WEB_ROOT = path.resolve(__dirname, '../..');
const SKIP_DIRS = new Set([
  'node_modules',
  '.next',
  'dist',
  'coverage',
  'tests',
  '__tests__',
]);

const SOCIAL_HOST = String.raw`(?:^|[^a-z0-9.-])(?:(?:www|m|vm|mobile|l)\.)?(?:instagram\.com|linktr\.ee|linktree\.com|x\.com|twitter\.com|tiktok\.com)(?![a-z0-9.-])`;

const LITERAL_SOCIAL_FETCH = new RegExp(
  String.raw`(?:fetchDocument|\bfetch)\s*(?:<[^>\n]*>)?\s*\(\s*['"\`]https?:\/\/(?:www\.|m\.|vm\.|mobile\.|l\.)?(?:instagram\.com|linktr\.ee|linktree\.com|x\.com|twitter\.com|tiktok\.com)(?![a-z0-9.-])`,
  'i'
);

const SOCIAL_HOST_LITERAL = new RegExp(SOCIAL_HOST, 'i');

function listCoreSources(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      listCoreSources(fullPath, out);
      continue;
    }
    if (!/\.(?:ts|tsx|js|mjs|cjs)$/.test(entry.name)) continue;
    if (/\.(?:test|spec)\./.test(entry.name)) continue;
    out.push(fullPath);
  }
  return out;
}

function socialHtmlFetchViolations(source: string): string[] {
  const violations: string[] = [];
  if (LITERAL_SOCIAL_FETCH.test(source)) {
    violations.push('literal social HTML fetch');
  }
  if (source.includes('fetchDocument(') && SOCIAL_HOST_LITERAL.test(source)) {
    violations.push('fetchDocument shares a file with a social HTML host');
  }
  return violations;
}

describe('core social HTML policy', () => {
  afterEach(() => {
    delete process.env.FEATURE_SOCIAL_HTML_ISOLATED_PROVIDER;
    vi.unstubAllGlobals();
  });

  it('matches page hosts and leaves official API hosts alone', () => {
    expect(isCoreSocialHtmlHost('instagram.com')).toBe(true);
    expect(isCoreSocialHtmlHost('www.instagram.com')).toBe(true);
    expect(isCoreSocialHtmlHost('l.instagram.com')).toBe(true);
    expect(isCoreSocialHtmlHost('linktr.ee')).toBe(true);
    expect(isCoreSocialHtmlHost('www.linktree.com')).toBe(true);
    expect(isCoreSocialHtmlHost('x.com')).toBe(true);
    expect(isCoreSocialHtmlHost('mobile.twitter.com')).toBe(true);
    expect(isCoreSocialHtmlHost('vm.tiktok.com')).toBe(true);
    expect(isCoreSocialHtmlHost('business-api.tiktok.com')).toBe(false);
    expect(isCoreSocialHtmlHost('cdninstagram.com')).toBe(false);
    expect(isCoreSocialHtmlHost('scontent.cdninstagram.com')).toBe(false);
  });

  it('fails closed before fetchDocument contacts a social host', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      fetchDocument('https://www.instagram.com/artist/')
    ).rejects.toMatchObject({
      code: 'SOCIAL_HTML_DISABLED',
      message: 'Social HTML fetch is disabled',
    });
    expect(fetchMock).not.toHaveBeenCalled();

    process.env.FEATURE_SOCIAL_HTML_ISOLATED_PROVIDER = 'true';
    await expect(fetchDocument('https://linktr.ee/artist')).rejects.toThrow(
      coreSocialHtmlFetchBlockMessage()
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('blocks safeFetchPublicHtml from scraping social HTML', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      safeFetchPublicHtml('https://tiktok.com/@artist')
    ).resolves.toEqual({
      ok: false,
      error: 'blocked_host',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('blocks redirected social HTML without contacting the target or retrying', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(null, {
        status: 302,
        headers: { location: 'https://mobile.twitter.com/artist' },
      })
    );
    vi.stubGlobal('fetch', fetchMock);
    await expect(
      fetchDocument('https://example.com/profile', { maxRetries: 2 })
    ).rejects.toMatchObject({
      code: 'SOCIAL_HTML_DISABLED',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('https://example.com/profile');
    expect(fetchMock.mock.calls[0][1].redirect).toBe('manual');
  });

  it('preserves approved redirects and reports their final URL', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(null, { status: 302, headers: { location: '/artist' } })
      )
      .mockResolvedValueOnce(
        new Response('<html>Artist</html>', {
          headers: { 'content-type': 'text/html' },
        })
      );
    vi.stubGlobal('fetch', fetchMock);
    const result = await fetchDocument('https://example.com/profile');
    expect(result.finalUrl).toBe('https://example.com/artist');
    expect(result.html).toBe('<html>Artist</html>');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('fails when core source fetches social HTML', () => {
    expect(
      socialHtmlFetchViolations("await fetch('https://instagram.com/artist')")
    ).toContain('literal social HTML fetch');
    expect(
      socialHtmlFetchViolations(
        "const host = 'instagram.com';\nawait fetchDocument(url);"
      )
    ).toContain('fetchDocument shares a file with a social HTML host');
    expect(
      socialHtmlFetchViolations(
        "await fetch('https://business-api.tiktok.com/open_api/v1.3/event/track/')"
      )
    ).toEqual([]);

    const violations = listCoreSources(WEB_ROOT).flatMap(filePath => {
      const found = socialHtmlFetchViolations(
        fs.readFileSync(filePath, 'utf8')
      );
      return found.map(
        violation => `${path.relative(WEB_ROOT, filePath)}: ${violation}`
      );
    });

    expect(violations).toEqual([]);
  });
});

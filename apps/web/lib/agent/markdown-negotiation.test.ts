import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';
import { HOMEPAGE_LAUNCH_COPY } from '@/data/homepageLaunchCopy';
import {
  negotiateAgentMarkdown,
  shouldPassThroughMarkdownNegotiation,
} from '@/lib/agent/markdown-negotiation';
import { HOMEPAGE_HTML_ALTERNATE_LINK } from '@/lib/http/accept-header';

function request(
  pathname: string,
  init?: { accept?: string; method?: string; rsc?: boolean }
): NextRequest {
  const headers = new Headers();
  if (init?.accept) headers.set('accept', init.accept);
  if (init?.rsc) headers.set('rsc', '1');
  return new NextRequest(`https://jov.ie${pathname}`, {
    method: init?.method ?? 'GET',
    headers,
  });
}

describe('shouldPassThroughMarkdownNegotiation', () => {
  it('negotiates the homepage and unknown paths', () => {
    expect(shouldPassThroughMarkdownNegotiation('/')).toBe(false);
    expect(
      shouldPassThroughMarkdownNegotiation(
        '/some-path-that-definitely-does-not-exist'
      )
    ).toBe(false);
  });

  it('leaves known app, API, and file surfaces alone', () => {
    expect(shouldPassThroughMarkdownNegotiation('/pricing')).toBe(true);
    expect(shouldPassThroughMarkdownNegotiation('/about')).toBe(true);
    expect(shouldPassThroughMarkdownNegotiation('/api/v1/timwhite')).toBe(true);
    expect(shouldPassThroughMarkdownNegotiation('/llms.txt')).toBe(true);
    expect(shouldPassThroughMarkdownNegotiation('/openapi.json')).toBe(true);
    expect(shouldPassThroughMarkdownNegotiation('/sitemap.xml')).toBe(true);
    expect(shouldPassThroughMarkdownNegotiation('/app/dashboard')).toBe(true);
    expect(shouldPassThroughMarkdownNegotiation('/tim')).toBe(true);
    expect(shouldPassThroughMarkdownNegotiation('/tim/listen')).toBe(true);
  });
});

describe('negotiateAgentMarkdown', () => {
  it('serves homepage markdown with Vary: Accept', async () => {
    const res = negotiateAgentMarkdown(
      request('/', { accept: 'text/markdown' })
    );

    expect(res).not.toBeNull();
    expect(res?.status).toBe(200);
    expect(res?.headers.get('content-type')).toBe(
      'text/markdown; charset=utf-8'
    );
    expect(res?.headers.get('vary')).toBe('Accept');
    expect(res?.headers.get('link')).toBe(HOMEPAGE_HTML_ALTERNATE_LINK);

    const body = await res?.text();
    expect(body).toContain(`# ${HOMEPAGE_LAUNCH_COPY.hero.headline}`);
    expect(body).toContain('## When to use Jovie');
    expect(body).toContain('/openapi.json');
  });

  it('returns a markdown 404 recovery body for missing paths', async () => {
    const res = negotiateAgentMarkdown(
      request('/some-path-that-definitely-does-not-exist', {
        accept: 'text/markdown',
      })
    );

    expect(res?.status).toBe(404);
    expect(res?.headers.get('content-type')).toBe(
      'text/markdown; charset=utf-8'
    );
    expect(res?.headers.get('vary')).toContain('Accept');
    expect(res?.headers.get('cache-control')).toBe('no-store');

    const body = await res?.text();
    expect(body).toContain('# Page not found');
    expect(body).toContain('/llms.txt');
    expect(body).toContain('/openapi.json');
    expect(body).toContain('/sitemap.xml');
    expect(body).toContain('/llms-full.txt');
  });

  it('does not 404 a public profile path that still renders HTML', () => {
    expect(
      negotiateAgentMarkdown(request('/tim', { accept: 'text/markdown' }))
    ).toBeNull();
  });

  it('omits the body on HEAD while keeping Markdown headers', async () => {
    const res = negotiateAgentMarkdown(
      request('/', { accept: 'text/markdown', method: 'HEAD' })
    );
    expect(res?.status).toBe(200);
    expect(res?.headers.get('content-type')).toBe(
      'text/markdown; charset=utf-8'
    );
    expect(res?.headers.get('vary')).toBe('Accept');
    expect(await res?.text()).toBe('');
  });

  it('omits the markdown 404 body on HEAD', async () => {
    const res = negotiateAgentMarkdown(
      request('/some-path-that-definitely-does-not-exist', {
        accept: 'text/markdown',
        method: 'HEAD',
      })
    );
    expect(res?.status).toBe(404);
    expect(res?.headers.get('content-type')).toBe(
      'text/markdown; charset=utf-8'
    );
    expect(res?.headers.get('vary')).toBe('Accept');
    expect(await res?.text()).toBe('');
  });

  it('does not intercept HTML or RSC homepage requests', () => {
    expect(negotiateAgentMarkdown(request('/'))).toBeNull();
    expect(
      negotiateAgentMarkdown(request('/', { accept: 'text/html' }))
    ).toBeNull();
    expect(
      negotiateAgentMarkdown(
        request('/', { accept: 'text/html, text/markdown;q=0.9' })
      )
    ).toBeNull();
    expect(negotiateAgentMarkdown(request('/', { accept: '*/*' }))).toBeNull();
    expect(
      negotiateAgentMarkdown(request('/', { accept: 'text/*' }))
    ).toBeNull();
    expect(
      negotiateAgentMarkdown(
        request('/', { accept: 'text/markdown;q=0.5, text/html;q=0.5' })
      )
    ).toBeNull();
    expect(
      negotiateAgentMarkdown(
        request('/', { accept: 'text/markdown', rsc: true })
      )
    ).toBeNull();
  });

  it('serves markdown when markdown outranks HTML by q-value', async () => {
    const res = negotiateAgentMarkdown(
      request('/', { accept: 'text/html;q=0.1, text/markdown;q=0.9' })
    );
    expect(res?.status).toBe(200);
    expect(res?.headers.get('content-type')).toBe(
      'text/markdown; charset=utf-8'
    );
  });

  it('serves markdown when explicit markdown outranks a wildcard', async () => {
    const res = negotiateAgentMarkdown(
      request('/', { accept: 'text/markdown, */*;q=0.8' })
    );
    expect(res?.status).toBe(200);
    expect(res?.headers.get('content-type')).toBe(
      'text/markdown; charset=utf-8'
    );
    expect(res?.headers.get('vary')).toBe('Accept');
  });

  it('returns 406 when the client rejects HTML and markdown', () => {
    const res = negotiateAgentMarkdown(
      request('/', { accept: 'application/json' })
    );
    expect(res?.status).toBe(406);
    expect(res?.headers.get('vary')).toBe('Accept');
  });

  it('does not 404 a dedicated marketing page that still renders HTML', () => {
    expect(
      negotiateAgentMarkdown(request('/pricing', { accept: 'text/markdown' }))
    ).toBeNull();
  });
});

describe('homepage CDN Vary contract', () => {
  it('includes Accept on the `/` header rule so HTML and Markdown cannot mix', () => {
    const candidates = [
      resolve(process.cwd(), 'next.config.js'),
      resolve(process.cwd(), 'apps/web/next.config.js'),
    ];
    const source = readFileSync(
      candidates.find(path => existsSync(path)) ?? candidates[0],
      'utf8'
    );
    const lastHomepageIndex = source.lastIndexOf("source: '/',");
    const catchAllIndex = source.indexOf("source: '/(.*)',");
    expect(lastHomepageIndex).toBeGreaterThan(catchAllIndex);
    const nextSourceIndex = source.indexOf('source:', lastHomepageIndex + 1);
    const homepageBlock = source.slice(
      lastHomepageIndex,
      nextSourceIndex === -1 ? undefined : nextSourceIndex
    );
    expect(homepageBlock).toContain("key: 'Vary'");
    expect(homepageBlock).toContain('Accept');
    expect(homepageBlock).toContain('rsc');
    expect(homepageBlock).toContain("key: 'Link'");
    expect(homepageBlock).toContain('text/markdown');
    expect(homepageBlock).toContain('cacheHeaders.revalidate');
    expect(homepageBlock).not.toContain('immutable');
  });

  it('does not mark the negotiated homepage immutable in any `/` header rule', () => {
    const candidates = [
      resolve(process.cwd(), 'next.config.js'),
      resolve(process.cwd(), 'apps/web/next.config.js'),
    ];
    const source = readFileSync(
      candidates.find(path => existsSync(path)) ?? candidates[0],
      'utf8'
    );
    let searchFrom = 0;
    let homepageRules = 0;
    while (true) {
      const start = source.indexOf("source: '/',", searchFrom);
      if (start === -1) break;
      const nextSource = source.indexOf('source:', start + 'source:'.length);
      const block = source.slice(
        start,
        nextSource === -1 ? undefined : nextSource
      );
      searchFrom = start + 1;
      if (!block.includes("key: 'Vary'")) continue;
      homepageRules += 1;
      expect(block).not.toContain('immutable');
      expect(block).toContain('Accept');
      expect(block).toContain('cacheHeaders.revalidate');
    }
    expect(homepageRules).toBeGreaterThanOrEqual(2);
  });
});

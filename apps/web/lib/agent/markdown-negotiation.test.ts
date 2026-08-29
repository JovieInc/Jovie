import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';
import { HOMEPAGE_LAUNCH_COPY } from '@/data/homepageLaunchCopy';
import {
  negotiateAgentMarkdown,
  shouldPassThroughMarkdownNegotiation,
} from '@/lib/agent/markdown-negotiation';

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
      shouldPassThroughMarkdownNegotiation('/some-path-that-does-not-exist')
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

    const body = await res?.text();
    expect(body).toContain(`# ${HOMEPAGE_LAUNCH_COPY.hero.headline}`);
    expect(body).toContain('## When to use Jovie');
    expect(body).toContain('/openapi.json');
  });

  it('returns a markdown 404 recovery body for missing paths', async () => {
    const res = negotiateAgentMarkdown(
      request('/some-path-that-does-not-exist', {
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
    expect(
      negotiateAgentMarkdown(
        request('/', { accept: 'text/markdown', rsc: true })
      )
    ).toBeNull();
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
    const homepageIndex = source.indexOf("source: '/',");
    const nextSourceIndex = source.indexOf('source:', homepageIndex + 1);
    const homepageBlock = source.slice(homepageIndex, nextSourceIndex);
    expect(homepageBlock).toContain("key: 'Vary'");
    expect(homepageBlock).toContain("value: 'Accept'");
  });
});

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { HOMEPAGE_LAUNCH_COPY } from '@/data/homepageLaunchCopy';
import { MARKDOWN_CONTENT_TYPE } from '@/lib/http/accept-markdown';
import {
  buildHomepageMarkdown,
  buildMarkdownNotFoundBody,
  isMarkdownPassThroughPath,
  maybePublicMarkdownResponse,
} from '@/lib/http/markdown-documents';

const BROWSER_ACCEPT =
  'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8';

function request(
  path: string,
  accept?: string,
  method: string = 'GET'
): Request {
  const headers = accept ? { Accept: accept } : undefined;
  return new Request(`https://jov.ie${path}`, { method, headers });
}

describe('homepage Markdown document', () => {
  it('includes approved homepage copy and discovery surfaces', () => {
    const body = buildHomepageMarkdown();
    expect(body).toContain(HOMEPAGE_LAUNCH_COPY.hero.headline);
    expect(body).toContain(HOMEPAGE_LAUNCH_COPY.hero.subhead);
    expect(body).toContain('/llms.txt');
    expect(body).toContain('/openapi.json');
    expect(body).toContain('/sitemap.xml');
    expect(body).toContain('/llms-full.txt');
  });
});

describe('Markdown 404 recovery', () => {
  it('links llms.txt, OpenAPI, sitemap, and docs', () => {
    const body = buildMarkdownNotFoundBody();
    expect(body).toContain('/llms.txt');
    expect(body).toContain('/openapi.json');
    expect(body).toContain('/sitemap.xml');
    expect(body).toContain('/llms-full.txt');
  });
});

describe('Markdown pass-through paths', () => {
  it('passes dedicated and machine-readable documents', () => {
    expect(isMarkdownPassThroughPath('/llms.txt')).toBe(true);
    expect(isMarkdownPassThroughPath('/llms-full.txt')).toBe(true);
    expect(isMarkdownPassThroughPath('/openapi.json')).toBe(true);
    expect(isMarkdownPassThroughPath('/sitemap.xml')).toBe(true);
    expect(isMarkdownPassThroughPath('/robots.txt')).toBe(true);
    expect(isMarkdownPassThroughPath('/about')).toBe(true);
    expect(isMarkdownPassThroughPath('/api/v1/openapi.json')).toBe(true);
    expect(isMarkdownPassThroughPath('/tim/llms.txt')).toBe(true);
  });

  it('treats unknown and profile-shaped paths as recovery candidates', () => {
    expect(isMarkdownPassThroughPath('/')).toBe(false);
    expect(isMarkdownPassThroughPath('/this-page-does-not-exist')).toBe(false);
    expect(isMarkdownPassThroughPath('/not-a-real/route')).toBe(false);
  });
});

describe('maybePublicMarkdownResponse', () => {
  it('serves homepage Markdown with Content-Type and Vary: Accept', async () => {
    const res = maybePublicMarkdownResponse(request('/', 'text/markdown'));
    expect(res).not.toBeNull();
    expect(res?.status).toBe(200);
    expect(res?.headers.get('content-type')).toBe(MARKDOWN_CONTENT_TYPE);
    expect(res?.headers.get('vary')).toBe('Accept');
    const body = await res?.text();
    expect(body).toContain(HOMEPAGE_LAUNCH_COPY.hero.headline);
  });

  it('preserves HTML for browsers and HTML-preferring q-values', () => {
    expect(maybePublicMarkdownResponse(request('/'))).toBeNull();
    expect(
      maybePublicMarkdownResponse(request('/', BROWSER_ACCEPT))
    ).toBeNull();
    expect(
      maybePublicMarkdownResponse(
        request('/', 'text/html, text/markdown;q=0.9')
      )
    ).toBeNull();
    expect(maybePublicMarkdownResponse(request('/', '*/*'))).toBeNull();
  });

  it('returns a real Markdown 404 for an unknown route', async () => {
    const res = maybePublicMarkdownResponse(
      request('/this-page-does-not-exist', 'text/markdown')
    );
    expect(res?.status).toBe(404);
    expect(res?.headers.get('content-type')).toBe(MARKDOWN_CONTENT_TYPE);
    expect(res?.headers.get('vary')).toBe('Accept');
    const body = await res?.text();
    expect(body).toContain('/llms.txt');
    expect(body).toContain('/openapi.json');
    expect(body).toContain('/sitemap.xml');
  });

  it('does not intercept dedicated HTML or machine-readable documents', () => {
    expect(
      maybePublicMarkdownResponse(request('/about', 'text/markdown'))
    ).toBeNull();
    expect(
      maybePublicMarkdownResponse(request('/llms.txt', 'text/markdown'))
    ).toBeNull();
    expect(
      maybePublicMarkdownResponse(
        request('/api/v1/openapi.json', 'text/markdown')
      )
    ).toBeNull();
  });

  it('omits the body on HEAD while keeping Markdown headers', async () => {
    const res = maybePublicMarkdownResponse(
      request('/', 'text/markdown', 'HEAD')
    );
    expect(res?.status).toBe(200);
    expect(res?.headers.get('content-type')).toBe(MARKDOWN_CONTENT_TYPE);
    expect(await res?.text()).toBe('');
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

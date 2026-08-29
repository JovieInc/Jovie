import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';
import {
  AGENTIC_HOMEPAGE_INTERNAL_PATH,
  resolveAgenticHomepageProxyResponse,
} from './homepage-proxy';

function request(accept?: string, pathname = '/'): NextRequest {
  return new NextRequest(`https://jov.ie${pathname}`, {
    headers: accept ? { Accept: accept } : undefined,
  });
}

describe('agentic homepage proxy negotiation', () => {
  it.each([
    ['text/markdown', true],
    ['text/markdown;q=0.8, text/html;q=0.1', true],
    ['application/json, text/markdown', true],
    ['text/markdown;q=0.4, text/html;q=0.9', false],
    ['text/markdown;q=0, text/html', false],
    ['text/markdown;q=bogus, text/html;q=0.5', false],
    ['garbage, text/markdown', true],
    ['text/markdown;level=1;q=0.8, text/html;q=0.1', true],
    ['text/*;q=0.8', false],
    ['*/*', false],
    ['*/*;q=1, text/markdown;q=0.9', false],
    ['*/*;q=0, text/markdown;q=1', true],
  ])('resolves %s to Markdown=%s', (accept, expectsMarkdown) => {
    const response = resolveAgenticHomepageProxyResponse(request(accept));

    if (!expectsMarkdown) {
      expect(response).toBeNull();
      return;
    }

    expect(response?.headers.get('x-middleware-rewrite')).toBe(
      `https://jov.ie${AGENTIC_HOMEPAGE_INTERNAL_PATH}`
    );
    expect(response?.headers.get('vary')).toBe('Accept');
  });

  it('leaves the internal rewrite target to Next route handling', () => {
    const response = resolveAgenticHomepageProxyResponse(
      request('text/markdown', AGENTIC_HOMEPAGE_INTERNAL_PATH)
    );

    expect(response).toBeNull();
  });
});

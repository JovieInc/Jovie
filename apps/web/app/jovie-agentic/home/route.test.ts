import { describe, expect, it } from 'vitest';

import { GET } from './route';

function request(accept?: string): Request {
  const url = 'https://jov.ie/jovie-agentic/home?__jovie_agentic_html=1';
  return new Request(url, {
    headers: accept ? { Accept: accept } : undefined,
  });
}

describe('GET / with an agentic representation request', () => {
  it.each([
    ['text/markdown', 'markdown'],
    ['text/markdown;q=0.8, text/html;q=0.1', 'markdown'],
    ['application/json, text/markdown', 'markdown'],
    ['text/markdown;q=0.4, text/html;q=0.9', 'html'],
    ['text/markdown;q=0, text/html', 'html'],
    ['text/markdown;q=bogus, text/html;q=0.5', 'html'],
    ['garbage, text/markdown', 'markdown'],
    ['text/markdown;level=1;q=0.8, text/html;q=0.1', 'markdown'],
    ['text/*;q=0.8', 'html'],
    ['*/*', 'html'],
    ['*/*;q=1, text/markdown;q=0.9', 'html'],
    ['*/*;q=0, text/markdown;q=1', 'markdown'],
  ])('negotiates %s as %s', async (accept, representation) => {
    const response = await GET(request(accept));

    if (representation === 'markdown') {
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toBe(
        'text/markdown; charset=utf-8'
      );
      expect(response.headers.get('vary')).toBe('Accept');
      expect(response.headers.get('cache-control')).toBe(
        'public, max-age=86400, s-maxage=86400'
      );
      await expect(response.text()).resolves.toMatch(/^# Jovie\n/);
      return;
    }

    // HTML is internally rewritten to the canonical page. The marker keeps
    // the beforeFiles rule from routing the second pass back here.
    expect(response.headers.get('x-middleware-rewrite')).toBe(
      'https://jov.ie/?__jovie_agentic_html=1'
    );
  });

  it('keeps ordinary requests on the HTML page', async () => {
    const response = await GET(request());

    expect(response.headers.get('x-middleware-rewrite')).toBe(
      'https://jov.ie/?__jovie_agentic_html=1'
    );
  });
});

import { describe, expect, it } from 'vitest';

import {
  AGENTIC_HOMEPAGE_INTERNAL_MARKER,
  AGENTIC_HOMEPAGE_INTERNAL_MARKER_VALUE,
} from '@/lib/agentic/homepage-proxy';
import { GET } from './route';

describe('GET internal agentic homepage', () => {
  it('returns Markdown only for a proxy-marked request', async () => {
    const response = GET(
      new Request('https://jov.ie/jovie-agentic/home', {
        headers: {
          [AGENTIC_HOMEPAGE_INTERNAL_MARKER]:
            AGENTIC_HOMEPAGE_INTERNAL_MARKER_VALUE,
        },
      })
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe(
      'text/markdown; charset=utf-8'
    );
    expect(response.headers.get('vary')).toBe('Accept');
    await expect(response.text()).resolves.toMatch(/^# Jovie\n/);
  });

  it.each([
    undefined,
    'forged',
  ])('returns a non-indexable 404 without the proxy marker (%s)', marker => {
    const headers = marker
      ? { [AGENTIC_HOMEPAGE_INTERNAL_MARKER]: marker }
      : undefined;
    const response = GET(
      new Request('https://jov.ie/jovie-agentic/home', { headers })
    );

    expect(response.status).toBe(404);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.headers.get('x-robots-tag')).toContain('noindex');
  });
});

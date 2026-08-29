import { describe, expect, it } from 'vitest';

import { GET } from './route';

describe('GET internal agentic homepage', () => {
  it('returns the static Markdown representation', async () => {
    const response = GET();

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe(
      'text/markdown; charset=utf-8'
    );
    expect(response.headers.get('vary')).toBe('Accept');
    await expect(response.text()).resolves.toMatch(/^# Jovie\n/);
  });
});

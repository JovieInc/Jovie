import { afterEach, describe, expect, it } from 'vitest';
import { GET } from './route';

describe('openai apps challenge', () => {
  afterEach(() => {
    delete process.env.OPENAI_APPS_CHALLENGE;
  });

  it('404s when the token is unset and serves plain text when it is set', () => {
    const missing = GET();
    expect(missing.status).toBe(404);
    expect(missing.headers.get('cache-control')).toBe('no-store');

    process.env.OPENAI_APPS_CHALLENGE = 'portal-token-not-committed';
    const present = GET();
    expect(present.status).toBe(200);
    expect(present.headers.get('content-type')).toContain('text/plain');
    return expect(present.text()).resolves.toBe('portal-token-not-committed');
  });
});

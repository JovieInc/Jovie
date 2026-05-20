import { describe, expect, it } from 'vitest';
import { splitSetCookieHeader } from './clerk-fapi-proxy';

describe('splitSetCookieHeader', () => {
  it('keeps an Expires comma inside a single cookie', () => {
    expect(
      splitSetCookieHeader(
        'session=abc; Expires=Wed, 21 Oct 2026 07:28:00 GMT; Path=/'
      )
    ).toEqual(['session=abc; Expires=Wed, 21 Oct 2026 07:28:00 GMT; Path=/']);
  });

  it('splits multiple cookies without a backtracking regex', () => {
    expect(
      splitSetCookieHeader(
        'session=abc; Path=/; HttpOnly, theme=dark; Path=/; SameSite=Lax'
      )
    ).toEqual([
      'session=abc; Path=/; HttpOnly',
      'theme=dark; Path=/; SameSite=Lax',
    ]);
  });
});

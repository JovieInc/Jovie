import { describe, expect, it } from 'vitest';
import { splitCombinedSetCookieHeader } from '@/lib/auth/clerk-fapi-proxy';

describe('splitCombinedSetCookieHeader', () => {
  it('returns null when the header is missing', () => {
    expect(splitCombinedSetCookieHeader(null)).toBeNull();
  });

  it('splits combined Set-Cookie values without splitting Expires dates', () => {
    const header =
      'session=abc; Path=/; Expires=Wed, 21 Oct 2026 07:28:00 GMT, __client_uat=123; Path=/; HttpOnly';

    expect(splitCombinedSetCookieHeader(header)).toEqual([
      'session=abc; Path=/; Expires=Wed, 21 Oct 2026 07:28:00 GMT',
      '__client_uat=123; Path=/; HttpOnly',
    ]);
  });

  it('ignores empty split segments', () => {
    expect(splitCombinedSetCookieHeader('a=1, b=2')).toEqual(['a=1', 'b=2']);
  });
});

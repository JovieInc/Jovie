import { describe, expect, it } from 'vitest';
import { splitSetCookieHeader } from '@/lib/auth/clerk-fapi-proxy';

describe('splitSetCookieHeader', () => {
  it('splits combined Set-Cookie headers without splitting Expires dates', () => {
    expect(
      splitSetCookieHeader(
        'a=1; Expires=Wed, 21 Oct 2030 07:28:00 GMT; Path=/, b=2; Path=/'
      )
    ).toEqual([
      'a=1; Expires=Wed, 21 Oct 2030 07:28:00 GMT; Path=/',
      'b=2; Path=/',
    ]);
  });

  it('keeps commas inside cookie values', () => {
    expect(splitSetCookieHeader('a=hello,world; Path=/, b=2; Path=/')).toEqual([
      'a=hello,world; Path=/',
      'b=2; Path=/',
    ]);
  });
});

import { describe, expect, it } from 'vitest';
import {
  parseBrowseAuthArgs,
  parseSetCookieHeaders,
} from '../../../../../scripts/browse-auth';

describe('scripts/browse-auth.ts', () => {
  it('parses explicit base URL, persona, and output flags', () => {
    expect(
      parseBrowseAuthArgs([
        '--base-url',
        'http://localhost:3001',
        '--persona',
        'admin',
        '--output',
        '/tmp/test-cookies.json',
      ])
    ).toEqual({
      baseUrl: 'http://localhost:3001',
      persona: 'admin',
      output: '/tmp/test-cookies.json',
    });
  });

  it('builds browser-importable cookies from Set-Cookie headers', () => {
    expect(
      parseSetCookieHeaders(
        [
          '__e2e_test_mode=bypass-auth; Path=/; HttpOnly; SameSite=Lax',
          '__e2e_test_user_id=user_creator; Path=/; HttpOnly; SameSite=Lax; Max-Age=3600',
        ],
        new URL('http://localhost:3000')
      )
    ).toEqual([
      expect.objectContaining({
        name: '__e2e_test_mode',
        value: 'bypass-auth',
        domain: 'localhost',
        path: '/',
        httpOnly: true,
        sameSite: 'Lax',
      }),
      expect.objectContaining({
        name: '__e2e_test_user_id',
        value: 'user_creator',
        domain: 'localhost',
        path: '/',
        httpOnly: true,
        sameSite: 'Lax',
      }),
    ]);
  });
});

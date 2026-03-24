import { describe, expect, it } from 'vitest';
import { buildAuthRouteUrl } from '@/lib/auth/build-auth-route-url';

describe('buildAuthRouteUrl', () => {
  it('forwards only a valid redirect_url', () => {
    const searchParams = new URLSearchParams(
      'redirect_url=%2Fonboarding&plan=founding'
    );

    expect(buildAuthRouteUrl('/signin', searchParams)).toBe(
      '/signin?redirect_url=%2Fonboarding'
    );
  });

  it('drops invalid redirect_url values', () => {
    const searchParams = new URLSearchParams(
      'redirect_url=https%3A%2F%2Fevil.com'
    );

    expect(buildAuthRouteUrl('/signup', searchParams)).toBe('/signup');
  });

  it('does not leak the parsing base for protocol-relative paths', () => {
    const searchParams = new URLSearchParams(
      'redirect_url=%2Fonboarding&plan=founding'
    );

    expect(buildAuthRouteUrl('//evil.com/path', searchParams)).toBe(
      '/path?redirect_url=%2Fonboarding'
    );
  });
});

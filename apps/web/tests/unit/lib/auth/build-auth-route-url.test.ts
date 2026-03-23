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

  it('does not forward protocol-relative redirect_url values', () => {
    const searchParams = new URLSearchParams(
      'redirect_url=%2F%2Fevil.com%2Fphish&plan=founding'
    );

    expect(buildAuthRouteUrl('/signin', searchParams)).toBe('/signin');
  });
});

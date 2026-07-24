import { describe, expect, it } from 'vitest';
import {
  getProfileModeRedirectHref,
  getRouteRedirectSearchParams,
  profileModeRedirectResponse,
} from '../../../app/[username]/_lib/mode-route-redirect';

describe('profile mode route redirects', () => {
  it('redirects to the canonical tour mode URL with a hard 307', async () => {
    const response = profileModeRedirectResponse(
      'http://localhost:3000/testartist/tour',
      'testartist',
      undefined,
      'tour'
    );

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      'http://localhost:3000/testartist?mode=tour'
    );
  });

  it('redirects to the canonical pay mode URL without server search params', () => {
    const response = profileModeRedirectResponse(
      'http://localhost:3000/testartist/tip',
      'testartist',
      undefined,
      'pay'
    );

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      'http://localhost:3000/testartist?mode=pay'
    );
  });

  it('redirects to the canonical releases mode URL', () => {
    const response = profileModeRedirectResponse(
      'http://localhost:3000/testartist/releases',
      'testartist',
      undefined,
      'releases'
    );

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      'http://localhost:3000/testartist?mode=releases'
    );
  });

  it('preserves the source query param in the redirect target', () => {
    const searchParams = getRouteRedirectSearchParams(
      new URLSearchParams('source=qr')
    );
    const href = getProfileModeRedirectHref('testartist', searchParams, 'pay');

    expect(href).toBe('/testartist?mode=pay&source=qr');
  });

  it('keeps all source values; the href builder picks the first non-empty one', () => {
    const multi = getRouteRedirectSearchParams(
      new URLSearchParams('source=qr&source=ig')
    );
    expect(multi).toEqual({ source: ['qr', 'ig'] });
    expect(getProfileModeRedirectHref('testartist', multi, 'pay')).toBe(
      '/testartist?mode=pay&source=qr'
    );
    expect(
      getRouteRedirectSearchParams(new URLSearchParams('utm_source=x'))
    ).toBeUndefined();
  });
});

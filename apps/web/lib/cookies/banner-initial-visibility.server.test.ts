import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveInitialCookieBannerVisible } from './banner-initial-visibility.server';

const stores = vi.hoisted(() => ({
  cookies: new Map<string, { value: string }>(),
  headers: new Map<string, string>(),
}));

vi.mock('next/headers', () => ({
  cookies: async () => stores.cookies,
  headers: async () => stores.headers,
}));

describe('initial cookie banner visibility', () => {
  beforeEach(() => {
    stores.cookies.clear();
    stores.headers.clear();
  });

  it.each([undefined, '', '1', '2', '0=1'])(
    'shows the banner without geo when the flag is %j',
    async value => {
      if (value !== undefined) stores.cookies.set('jv_cc_required', { value });
      expect(await resolveInitialCookieBannerVisible()).toBe(true);
    }
  );

  it('preserves an explicit non-required flag without geo', async () => {
    stores.cookies.set('jv_cc_required', { value: '0' });
    expect(await resolveInitialCookieBannerVisible()).toBe(false);
  });

  it.each([
    ['DE', undefined, true],
    ['XX', undefined, true],
    ['JP', undefined, false],
    ['US', 'TX', false],
    ['US', 'CA', false],
    ['CA', 'QC', true],
  ] as const)(
    'uses current geo %s/%s over a stale cookie',
    async (country, region, expected) => {
      stores.headers.set('x-vercel-ip-country', country);
      if (region) stores.headers.set('x-vercel-ip-country-region', region);
      stores.cookies.set('jv_cc_required', { value: expected ? '0' : '1' });
      expect(await resolveInitialCookieBannerVisible()).toBe(expected);
    }
  );

  it('uses the Cloudflare country fallback', async () => {
    stores.headers.set('cf-ipcountry', 'DE');
    expect(await resolveInitialCookieBannerVisible()).toBe(true);
  });

  it('keeps the banner hidden for a saved consent choice', async () => {
    stores.cookies.set('jv_cc', {
      value: JSON.stringify({
        essential: true,
        analytics: false,
        marketing: false,
      }),
    });
    expect(await resolveInitialCookieBannerVisible()).toBe(false);
  });
});

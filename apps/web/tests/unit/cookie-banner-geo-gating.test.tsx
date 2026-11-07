import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ usePathname: () => '/pricing' }));
vi.mock('@/lib/cookies/consent', () => ({
  saveConsent: vi.fn().mockResolvedValue(undefined),
}));

function setCookie(value: string) {
  Object.defineProperty(document, 'cookie', {
    configurable: true,
    writable: true,
    value,
  });
}

describe('CookieBannerSection geo gating (fail closed)', () => {
  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
  });
  afterEach(() => setCookie(''));

  async function mount() {
    const mod = await import('@/components/organisms/CookieBannerSection');
    render(<mod.CookieBannerSection />);
  }

  it.each([
    ['jv_cc_required=1; jv_country=DE', true],
    ['', true], // no geo flag at all
    ['jv_country=DE', true], // flag missing
    ['jv_cc_required=junk', true],
    ['jv_cc_required=0; jv_country=US', false],
  ])('cookie %j -> banner visible=%s', async (cookie, visible) => {
    setCookie(cookie);
    await mount();
    expect(screen.queryByTestId('cookie-banner') !== null).toBe(visible);
  });

  it('stays hidden for a returning visitor with a stored choice', async () => {
    setCookie('jv_cc_required=1');
    localStorage.setItem(
      'jv_cc',
      JSON.stringify({ essential: true, analytics: false, marketing: false })
    );
    await mount();
    expect(screen.queryByTestId('cookie-banner')).toBeNull();
  });

  it('uses a full-width bottom sheet on phones for non-profile routes', async () => {
    setCookie('jv_cc_required=1');
    await mount();
    const cls = screen.getByTestId('cookie-banner').className;
    expect(cls).toContain('max-sm:inset-x-0');
    expect(cls).toContain('max-sm:bottom-0');
  });
});

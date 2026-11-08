import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CookieBannerMount } from './CookieBannerMount';

vi.mock('@/components/organisms/CookieBannerSection', () => ({
  CookieBannerSection: () => (
    <div data-testid='cookie-banner'>Consent actions</div>
  ),
}));

describe('CookieBannerMount consent gate', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it.each([
    '',
    'jv_cc_required=1',
    'jv_cc_required=0=1',
    'jv_cc_required=0; jv_cc_required=1',
  ])(
    'mounts the consent banner when region consent is required or uncertain: %j',
    async cookie => {
      vi.spyOn(document, 'cookie', 'get').mockReturnValue(cookie);
      render(<CookieBannerMount />);
      expect(await screen.findByTestId('cookie-banner')).toBeVisible();
    }
  );

  it('keeps the banner absent in an explicit non-required region', async () => {
    vi.spyOn(document, 'cookie', 'get').mockReturnValue('jv_cc_required=0');
    render(<CookieBannerMount />);
    await waitFor(() => expect(globalThis.JVConsent).toBeDefined());
    expect(screen.queryByTestId('cookie-banner')).not.toBeInTheDocument();
  });

  it('does not duplicate a server-rendered banner', async () => {
    vi.spyOn(document, 'cookie', 'get').mockReturnValue('jv_cc_required=1');
    render(
      <>
        <div data-testid='cookie-banner'>Server consent actions</div>
        <CookieBannerMount />
      </>
    );
    await waitFor(() => expect(globalThis.JVConsent).toBeDefined());
    expect(screen.getAllByTestId('cookie-banner')).toHaveLength(1);
  });

  it('does not mount the consent question when GPC already opts out', async () => {
    vi.spyOn(document, 'cookie', 'get').mockReturnValue('jv_cc_required=1');
    Object.defineProperty(navigator, 'globalPrivacyControl', {
      configurable: true,
      value: true,
    });
    try {
      render(<CookieBannerMount />);
      await waitFor(() => expect(globalThis.JVConsent).toBeDefined());
      expect(screen.queryByTestId('cookie-banner')).not.toBeInTheDocument();
    } finally {
      Object.defineProperty(navigator, 'globalPrivacyControl', {
        configurable: true,
        value: false,
      });
    }
  });
});

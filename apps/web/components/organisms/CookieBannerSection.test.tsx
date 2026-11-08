import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockMobile = vi.hoisted(() => ({ value: false }));

const mockSaveConsent = vi.fn().mockResolvedValue(undefined);

vi.mock('@/lib/cookies/consent', () => ({
  saveConsent: mockSaveConsent,
}));

vi.mock('@/lib/tracking/consent', async importOriginal => {
  const actual =
    await importOriginal<typeof import('@/lib/tracking/consent')>();
  return { ...actual, setConsentState: vi.fn() };
});

vi.mock('@/hooks/useMediaQuery', () => ({
  useMediaQuery: () => mockMobile.value,
}));

function setCookie(value: string) {
  Object.defineProperty(document, 'cookie', {
    configurable: true,
    writable: true,
    value,
  });
}

describe('CookieBannerSection uncertain region flags', () => {
  beforeEach(() => {
    vi.resetModules();
    mockSaveConsent.mockResolvedValue(undefined);
    localStorage.clear();
  });

  afterEach(() => {
    setCookie('');
    globalThis.JVConsent = undefined;
    vi.unstubAllEnvs();
  });

  it.each(['', 'jv_cc_required=0=1', 'jv_cc_required=0; jv_cc_required=1'])(
    'keeps consent actions available for uncertain region flags: %j',
    async cookie => {
      const mod = await import('@/components/organisms/CookieBannerSection');
      setCookie(cookie);
      render(<mod.CookieBannerSection />);
      expect(screen.getByRole('button', { name: 'Reject all' })).toBeVisible();
      expect(screen.getByRole('button', { name: 'Accept all' })).toBeVisible();
    }
  );
});

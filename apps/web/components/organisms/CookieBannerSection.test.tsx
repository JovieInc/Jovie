import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';

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

  it.each([false, true])(
    'renders no consent actions when GPC already opts out (initialVisible=%s)',
    async initialVisible => {
      Object.defineProperty(navigator, 'globalPrivacyControl', {
        configurable: true,
        value: true,
      });
      try {
        const mod = await import('@/components/organisms/CookieBannerSection');
        setCookie('jv_cc_required=1');
        render(<mod.CookieBannerSection initialVisible={initialVisible} />);
        expect(screen.queryByTestId('cookie-banner')).not.toBeInTheDocument();
        expect(
          screen.queryByRole('button', { name: 'Accept all' })
        ).not.toBeInTheDocument();
      } finally {
        Object.defineProperty(navigator, 'globalPrivacyControl', {
          configurable: true,
          value: false,
        });
      }
    }
  );
});

describe('CookieBannerSection consent choices', () => {
  beforeEach(() => {
    vi.resetModules();
    mockSaveConsent.mockReset();
    mockSaveConsent.mockResolvedValue(undefined);
    localStorage.clear();
    setCookie('jv_cc_required=1');
  });

  afterEach(() => {
    setCookie('');
    globalThis.JVConsent = undefined;
    vi.restoreAllMocks();
  });

  async function renderBanner() {
    const mod = await import('@/components/organisms/CookieBannerSection');
    return render(<mod.CookieBannerSection />);
  }

  it('saves accept-all, remembers it and dismisses the card', async () => {
    const user = userEvent.setup();
    const { container } = await renderBanner();
    await expectNoA11yViolations(container);

    await user.click(screen.getByRole('button', { name: 'Accept all' }));

    await waitFor(() =>
      expect(screen.queryByTestId('cookie-banner')).not.toBeInTheDocument()
    );
    expect(mockSaveConsent).toHaveBeenCalledWith({
      essential: true,
      analytics: true,
      marketing: true,
    });
    expect(JSON.parse(localStorage.getItem('jv_cc') ?? 'null')).toEqual({
      essential: true,
      analytics: true,
      marketing: true,
    });
  });

  it('disables every choice while the save is in flight', async () => {
    const user = userEvent.setup();
    mockSaveConsent.mockReturnValue(new Promise<void>(() => {}));
    const { container } = await renderBanner();

    await user.click(screen.getByRole('button', { name: 'Reject all' }));

    for (const name of ['Reject all', 'Accept all', 'Customize'])
      expect(screen.getByRole('button', { name })).toBeDisabled();
    expect(screen.getByTestId('cookie-banner')).toBeVisible();
    await expectNoA11yViolations(container);
  });

  it.each([
    ['a server error', new Error('Consent cookie write failed')],
    ['an offline request', new TypeError('Failed to fetch')],
  ])(
    'keeps the card and announces the failure after %s',
    async (_label, failure) => {
      const user = userEvent.setup();
      mockSaveConsent.mockRejectedValue(failure);
      const { container } = await renderBanner();

      await user.click(screen.getByRole('button', { name: 'Reject all' }));

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'We could not save preferences. Check your connection and try again.'
      );
      expect(screen.getByRole('button', { name: 'Reject all' })).toBeEnabled();
      expect(localStorage.getItem('jv_cc')).toBeNull();
      await expectNoA11yViolations(container);
    }
  );

  it('fails closed and asks again when the browser blocks storage', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('The operation is insecure.', 'SecurityError');
    });
    const { container } = await renderBanner();

    expect(screen.getByTestId('cookie-banner')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Accept all' })).toBeEnabled();
    await expectNoA11yViolations(container);
  });

  it('swaps the card for the preferences dialog on Customize', async () => {
    const user = userEvent.setup();
    const { baseElement } = await renderBanner();

    await user.click(screen.getByRole('button', { name: 'Customize' }));

    expect(
      await screen.findByRole('dialog', { name: 'Cookie Preferences' })
    ).toBeVisible();
    expect(screen.queryByTestId('cookie-banner')).not.toBeInTheDocument();
    await expectNoA11yViolations(baseElement);
  });

  it('stays accessible in a right-to-left document', async () => {
    const mod = await import('@/components/organisms/CookieBannerSection');
    const { container } = render(
      <div dir='rtl'>
        <mod.CookieBannerSection />
      </div>
    );

    expect(
      screen.getByRole('complementary', { name: 'Cookie Consent' })
    ).toBeVisible();
    await expectNoA11yViolations(container);
  });
});

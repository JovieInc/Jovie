import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Consent } from '@/lib/cookies/consent';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { CookieBannerMount } from './CookieBannerMount';

vi.mock('@/components/organisms/CookieBannerSection', () => ({
  CookieBannerSection: () => (
    <aside aria-label='Cookie Consent' data-testid='cookie-banner'>
      Consent actions
    </aside>
  ),
}));

vi.mock('@/lib/tracking/consent', async importOriginal => {
  const actual =
    await importOriginal<typeof import('@/lib/tracking/consent')>();
  return { ...actual, setConsentState: vi.fn() };
});

const savedConsent: Consent = {
  essential: true,
  analytics: true,
  marketing: false,
};

vi.mock('@/components/organisms/CookieModal', () => ({
  CookieModal: ({
    open,
    onClose,
    onSave,
  }: {
    open: boolean;
    onClose: () => void;
    onSave?: (consent: Consent) => void;
  }) =>
    open ? (
      <div role='dialog' aria-label='Cookie Preferences'>
        <button type='button' onClick={() => onSave?.(savedConsent)}>
          Save Preferences
        </button>
        <button type='button' onClick={onClose}>
          Cancel
        </button>
      </div>
    ) : null,
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

describe('CookieBannerMount preferences and failure paths', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.spyOn(document, 'cookie', 'get').mockReturnValue('jv_cc_required=0');
  });
  afterEach(() => vi.restoreAllMocks());

  it('opens preferences from the global menu event and applies the saved choice', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { container } = render(<CookieBannerMount />);
    await waitFor(() => expect(globalThis.JVConsent).toBeDefined());
    globalThis.JVConsent?.onChange(onChange);

    fireEvent(globalThis.window, new Event('jv:cookie:open'));
    expect(
      await screen.findByRole('dialog', { name: 'Cookie Preferences' })
    ).toBeVisible();
    await expectNoA11yViolations(container);

    await user.click(screen.getByRole('button', { name: 'Save Preferences' }));
    expect(JSON.parse(localStorage.getItem('jv_cc') ?? 'null')).toEqual(
      savedConsent
    );
    expect(onChange).toHaveBeenCalledWith(savedConsent);

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(
      screen.queryByRole('dialog', { name: 'Cookie Preferences' })
    ).not.toBeInTheDocument();
  });

  it('opens preferences through JVConsent.openModal', async () => {
    render(<CookieBannerMount />);
    await waitFor(() => expect(globalThis.JVConsent).toBeDefined());

    act(() => globalThis.JVConsent?.openModal());

    expect(
      await screen.findByRole('dialog', { name: 'Cookie Preferences' })
    ).toBeVisible();
  });

  it('fails closed and mounts the banner when storage reads throw', async () => {
    vi.spyOn(document, 'cookie', 'get').mockReturnValue('jv_cc_required=1');
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('The operation is insecure.', 'SecurityError');
    });
    const { container } = render(<CookieBannerMount />);

    expect(await screen.findByTestId('cookie-banner')).toBeVisible();
    await expectNoA11yViolations(container);
  });

  it('removes the global consent API on unmount', async () => {
    const { unmount } = render(<CookieBannerMount />);
    await waitFor(() => expect(globalThis.JVConsent).toBeDefined());

    unmount();

    expect(globalThis.JVConsent).toBeUndefined();
  });
});

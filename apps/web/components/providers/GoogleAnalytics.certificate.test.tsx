import { fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';

type AnalyticsWindow = Window & {
  dataLayer?: unknown[][];
  gtag?: ReturnType<typeof vi.fn>;
};

type ConsentListener = (value: unknown) => void;

const state = vi.hoisted(() => ({
  applyGoogleConsentMode: vi.fn(),
  bannerRequired: false,
}));

vi.mock('next/script', () => ({
  default: ({ id, src }: { readonly id?: string; readonly src?: string }) => (
    <span data-testid={id} data-src={src} hidden />
  ),
}));
vi.mock('@/lib/env-client', () => ({ env: { IS_E2E: false, IS_TEST: false } }));
vi.mock('@/lib/env-public', () => ({
  publicEnv: { NEXT_PUBLIC_GA_MEASUREMENT_ID: 'G-TMY7Z8HK47' },
}));
vi.mock('@/lib/demo-recording', () => ({
  isDemoRecordingClient: () => false,
}));
vi.mock('@/lib/tracking/google-consent-mode', async importOriginal => {
  const original =
    await importOriginal<typeof import('@/lib/tracking/google-consent-mode')>();
  return {
    ...original,
    applyGoogleConsentMode: state.applyGoogleConsentMode,
    isCookieBannerRequiredFromClient: () => state.bannerRequired,
  };
});

import { consentToGoogleConsentMode } from '@/lib/tracking/google-consent-mode';
import { GoogleAnalytics } from './GoogleAnalytics';

function installConsentApi() {
  const listeners: ConsentListener[] = [];
  const unsubscribe = vi.fn();
  globalThis.JVConsent = {
    onChange: (cb: ConsentListener) => {
      listeners.push(cb);
      return unsubscribe;
    },
    _emit: (value: unknown) => {
      for (const listener of listeners) listener(value);
    },
    openModal: () => undefined,
  };
  return { listeners, unsubscribe };
}

const GRANTED = { essential: true, analytics: true, marketing: false };

describe('GoogleAnalytics certificate', () => {
  beforeEach(() => {
    state.applyGoogleConsentMode.mockReset();
    state.bannerRequired = false;
    globalThis.JVConsent = undefined;
    (window as AnalyticsWindow).dataLayer = undefined;
    (window as AnalyticsWindow).gtag = vi.fn();
  });

  afterEach(() => {
    globalThis.JVConsent = undefined;
  });

  it('syncs consent changes from an already-mounted consent API', async () => {
    const consent = installConsentApi();
    const { container, getByTestId, unmount } = render(<GoogleAnalytics />);

    expect(getByTestId('ga-gtag-loader')).toHaveAttribute(
      'data-src',
      'https://www.googletagmanager.com/gtag/js?id=G-TMY7Z8HK47'
    );
    expect(consent.listeners).toHaveLength(1);

    consent.listeners[0]?.({ analytics: true });
    expect(state.applyGoogleConsentMode).not.toHaveBeenCalled();

    consent.listeners[0]?.(GRANTED);
    expect(state.applyGoogleConsentMode).toHaveBeenCalledWith(
      consentToGoogleConsentMode(GRANTED, false)
    );
    await expectNoA11yViolations(container);

    unmount();
    expect(consent.unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('attaches to the consent API once it announces itself ready', async () => {
    const { container } = render(<GoogleAnalytics />);
    const consent = installConsentApi();
    state.bannerRequired = true;

    fireEvent(window, new Event('jvconsent:ready'));
    expect(consent.listeners).toHaveLength(1);

    consent.listeners[0]?.(GRANTED);
    expect(state.applyGoogleConsentMode).toHaveBeenCalledWith(
      consentToGoogleConsentMode(GRANTED, true)
    );

    fireEvent(window, new Event('jvconsent:ready'));
    expect(consent.listeners).toHaveLength(1);
    await expectNoA11yViolations(container);
  });
});

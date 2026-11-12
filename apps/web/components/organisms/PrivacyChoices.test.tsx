import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import Link from 'next/link';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AcquisitionCapture } from '@/components/features/tracking/AcquisitionCapture';
import { MetaPixel } from '@/components/features/tracking/MetaPixel';
import { ProfileNavButton } from '@/components/molecules/ProfileNavButton';
import {
  getOrCreateAcquisitionId,
  isAnalyticsAllowed,
  isMarketingAllowed,
} from '@/lib/tracking/consent';
import {
  resetNavigationTelemetryForTests,
  trackNavigationImpressions,
} from '@/lib/tracking/navigation-telemetry';
import { trackPacClientEvent } from '@/lib/tracking/pac-events';
import { useMarketingConsent } from '@/lib/tracking/use-marketing-consent';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { CookieBannerMount } from './CookieBannerMount';

vi.mock('@/hooks/useClerkSafe', () => ({
  useAuthSafe: () => ({ isSignedIn: false }),
}));
vi.mock('@/hooks/useBreakpoint', () => ({ useBreakpoint: () => false }));

const pathname = vi.hoisted(() => ({ value: '/' }));
vi.mock('next/navigation', async importOriginal => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  usePathname: () => pathname.value,
}));

const saveConsent = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock('@/lib/cookies/consent', () => ({ saveConsent }));
vi.mock('@/lib/env-client', () => ({ env: { IS_TEST: false, IS_E2E: false } }));
vi.mock('@/lib/demo-recording', () => ({ isDemoRecordingClient: () => false }));
vi.mock('@/lib/analytics', () => ({ track: vi.fn() }));
vi.mock('@/lib/tracking/json-beacon', () => ({ postJsonBeacon: vi.fn() }));
vi.mock('next/script', () => ({
  default: ({ src }: { src: string }) => (
    <script defer src={src} data-testid='ad-pixel' />
  ),
}));

/** Renders the surface and waits for the lazily loaded privacy host. */
async function surface() {
  const view = render(
    <>
      <Link href='/legal/privacy#privacy-choices'>Your Privacy Choices</Link>
      <CookieBannerMount />
      <MetaPixel pixelIds={['123']} />
      <AcquisitionCapture />
    </>
  );
  await act(async () => {
    await import('./PrivacyChoices');
  });
  return view;
}

beforeEach(() => {
  pathname.value = '/';
  localStorage.clear();
  for (const cookie of document.cookie.split(';'))
    document.cookie = `${cookie.split('=')[0].trim()}=; Max-Age=0; path=/`;
  document.cookie = 'jv_cc_required=0; path=/';
  Object.defineProperty(navigator, 'globalPrivacyControl', {
    configurable: true,
    value: false,
  });
  Object.defineProperty(navigator, 'doNotTrack', {
    configurable: true,
    value: '0',
  });
  Object.assign(window, {
    fbq: undefined,
    _fbq: undefined,
    __jovieMetaPixelInited: undefined,
  });
  saveConsent.mockReset().mockResolvedValue(undefined);
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(JSON.stringify({}), { status: 200 })
  );
  resetNavigationTelemetryForTests();
});
afterEach(() => {
  cleanup();
  globalThis.JVConsent = undefined;
  vi.restoreAllMocks();
});

describe('Your Privacy Choices', () => {
  it('negative control: loads the pixel by default without GPC or an opt-out', async () => {
    await surface();
    expect(await screen.findByTestId('ad-pixel')).toHaveAttribute(
      'src',
      'https://connect.facebook.net/en_US/fbevents.js'
    );
    expect(
      screen.queryByText("Your browser's privacy signal is honored")
    ).toBeNull();
  });

  it('never loads the pixel for an existing first-party opt-out', async () => {
    document.cookie = 'jv_tracking_consent=rejected; path=/';
    await surface();
    expect(screen.queryByTestId('ad-pixel')).toBeNull();
    expect((window as Window & { fbq?: unknown }).fbq).toBeUndefined();
  });

  it('honors GPC before loading pixels, confirms it and skips the consent bar', async () => {
    Object.defineProperty(navigator, 'globalPrivacyControl', {
      configurable: true,
      value: true,
    });
    document.cookie = 'jv_cc_required=1; path=/';
    localStorage.setItem(
      'jv_cc',
      JSON.stringify({ essential: true, analytics: true, marketing: true })
    );
    await surface();
    expect(
      await screen.findByText("Your browser's privacy signal is honored")
    ).toBeVisible();
    expect(screen.queryByTestId('ad-pixel')).toBeNull();
    expect(screen.queryByTestId('cookie-banner')).toBeNull();
    expect((window as Window & { fbq?: unknown }).fbq).toBeUndefined();
    fireEvent.click(screen.getByRole('link', { name: 'Your Privacy Choices' }));
    expect(
      await screen.findByRole('switch', {}, { timeout: 5000 })
    ).toBeChecked();
    expect(screen.getByRole('switch')).toBeDisabled();
    await expectNoA11yViolations(await screen.findByRole('dialog'));
  });

  it('persists an opt-out and suppresses pixels immediately and after remount', async () => {
    const first = await surface();
    await screen.findByTestId('ad-pixel');
    fireEvent.click(screen.getByRole('link', { name: 'Your Privacy Choices' }));
    const toggle = await screen.findByRole('switch', {}, { timeout: 5000 });
    expect(toggle).not.toBeChecked();
    await expectNoA11yViolations(await screen.findByRole('dialog'));
    fireEvent.click(toggle);
    await waitFor(() =>
      expect(saveConsent).toHaveBeenCalledWith({
        essential: true,
        analytics: true,
        marketing: false,
      })
    );
    expect(screen.queryByTestId('ad-pixel')).toBeNull();
    expect(localStorage.getItem('jovie_tracking_consent')).toBe('rejected');
    expect(document.cookie).toContain('jv_tracking_consent=rejected');
    first.unmount();
    Object.assign(window, { fbq: undefined, _fbq: undefined });
    await surface();
    expect(screen.queryByTestId('ad-pixel')).toBeNull();
    expect((window as Window & { fbq?: unknown }).fbq).toBeUndefined();
  });

  describe.each([false, true])('analytics choice: %s', analytics => {
    describe.each([false, true])('consent required: %s', required => {
      it.each([false, true])(
        'preserves effective analytics through advertising opt-out, remount and opt-in (save fails: %s)',
        async saveFails => {
          document.cookie = `jv_cc_required=${Number(required)}; path=/`;
          localStorage.setItem(
            'jv_cc',
            JSON.stringify({ essential: true, analytics, marketing: true })
          );
          if (saveFails) saveConsent.mockRejectedValue(new Error('offline'));
          const acquisitionId = getOrCreateAcquisitionId();
          const first = await surface();
          fireEvent.click(
            screen.getByRole('link', { name: 'Your Privacy Choices' })
          );
          fireEvent.click(
            await screen.findByRole('switch', {}, { timeout: 5000 })
          );
          await waitFor(() => expect(screen.getByRole('switch')).toBeEnabled());
          expect(saveConsent).toHaveBeenLastCalledWith({
            essential: true,
            analytics,
            marketing: false,
          });
          expect(isMarketingAllowed()).toBe(false);
          expect(isAnalyticsAllowed()).toBe(analytics);
          expect(localStorage.getItem('jovie_acquisition_id') ?? '').toBe(
            acquisitionId
          );
          expect(getOrCreateAcquisitionId()).toBe(acquisitionId);
          expect(
            trackPacClientEvent('pac_exposure', {
              profileId: '3f9c2f6a-8f1e-4b6a-9a44-1c2d3e4f5a6b',
              variantId:
                'copy:default|trigger:30s|s2:merch|tab:visible|dismiss:text',
              pacState: 'idle',
            })?.consent
          ).toBe(analytics ? 'accepted' : 'rejected');
          expect(
            trackNavigationImpressions(['inbox'], '/app', {
              isElectron: false,
              isMobile: false,
              navVariant: 'canonical_customer_ia_v1',
            })
          ).toHaveLength(analytics ? 1 : 0);

          first.unmount();
          await surface();
          expect(isMarketingAllowed()).toBe(false);
          expect(isAnalyticsAllowed()).toBe(analytics);
          expect(getOrCreateAcquisitionId()).toBe(acquisitionId);

          fireEvent.click(
            screen.getByRole('link', { name: 'Your Privacy Choices' })
          );
          fireEvent.click(
            await screen.findByRole('switch', {}, { timeout: 5000 })
          );
          await waitFor(() => expect(screen.getByRole('switch')).toBeEnabled());
          expect(isMarketingAllowed()).toBe(true);
          expect(isAnalyticsAllowed()).toBe(analytics);
          expect(getOrCreateAcquisitionId()).toBe(acquisitionId);
        }
      );
    });
  });

  it('shows Do Not Track as a locked, honored signal instead of an enabled toggle', async () => {
    Object.defineProperty(navigator, 'doNotTrack', {
      configurable: true,
      value: '1',
    });
    await surface();
    fireEvent.click(screen.getByRole('link', { name: 'Your Privacy Choices' }));
    const toggle = await screen.findByRole('switch', {}, { timeout: 5000 });
    expect(toggle).toBeChecked();
    expect(toggle).toBeDisabled();
    expect(screen.getByText(/Do Not Track is enabled/)).toBeVisible();
    expect(saveConsent).not.toHaveBeenCalled();
  });

  it('does not show the privacy-signal card on routes where banner chrome is suppressed', async () => {
    Object.defineProperty(navigator, 'globalPrivacyControl', {
      configurable: true,
      value: true,
    });
    pathname.value = '/app';
    await surface();
    await waitFor(() => expect(globalThis.JVConsent).toBeDefined());
    expect(
      screen.queryByText("Your browser's privacy signal is honored")
    ).toBeNull();
  });

  it('keeps the local opt-out when the server save fails', async () => {
    saveConsent.mockRejectedValue(new Error('offline'));
    await surface();
    fireEvent.click(screen.getByRole('link', { name: 'Your Privacy Choices' }));
    fireEvent.click(await screen.findByRole('switch', {}, { timeout: 5000 }));
    expect(await screen.findByRole('alert')).toBeVisible();
    await expectNoA11yViolations(await screen.findByRole('dialog'));
    expect(screen.queryByTestId('ad-pixel')).toBeNull();
    expect(document.cookie).toContain('jv_tracking_consent=rejected');
  });
  it('falls back to the consent cookie when localStorage is unavailable', async () => {
    await surface();
    fireEvent.click(screen.getByRole('link', { name: 'Your Privacy Choices' }));
    const toggle = await screen.findByRole('switch', {}, { timeout: 5000 });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    fireEvent.click(toggle);
    await waitFor(() => expect(saveConsent).toHaveBeenCalled());
    expect(document.cookie).toContain('jv_tracking_consent=rejected');
    expect(screen.queryByTestId('ad-pixel')).toBeNull();
  });

  it('re-enables advertising only after the visitor turns opt-out off', async () => {
    document.cookie = 'jv_tracking_consent=rejected; path=/';
    await surface();
    fireEvent.click(screen.getByRole('link', { name: 'Your Privacy Choices' }));
    fireEvent.click(await screen.findByRole('switch', {}, { timeout: 5000 }));
    await waitFor(() =>
      expect(saveConsent).toHaveBeenCalledWith({
        essential: true,
        analytics: false,
        marketing: true,
      })
    );
    expect(await screen.findByTestId('ad-pixel')).toBeInTheDocument();
  });

  it('revokes an already loaded pixel when another tab opts out', async () => {
    await surface();
    await screen.findByTestId('ad-pixel');
    const fbq = vi.fn();
    Object.assign(window, { fbq });
    localStorage.setItem('jovie_tracking_consent', 'rejected');
    act(() =>
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: 'jovie_tracking_consent',
          newValue: 'rejected',
        })
      )
    );
    expect(screen.queryByTestId('ad-pixel')).toBeNull();
    expect(fbq).toHaveBeenCalledWith('consent', 'revoke');
  });

  it('keeps the EU/UK consent bar and blocks pixels until a choice is made', async () => {
    document.cookie = 'jv_cc_required=1; path=/';
    await surface();
    expect(
      await screen.findByTestId('cookie-banner', {}, { timeout: 5000 })
    ).toBeVisible();
    expect(screen.queryByTestId('ad-pixel')).toBeNull();
  });
  it('opens privacy choices from the profile menu', async () => {
    render(
      <>
        <ProfileNavButton showBackButton={false} artistHandle='privacy-test' />
        <CookieBannerMount />
      </>
    );
    fireEvent.pointerDown(
      screen.getByRole('button', { name: 'Open profile menu' }),
      { button: 0, ctrlKey: false, pointerType: 'mouse' }
    );
    const link = await screen.findByRole('menuitem', {
      name: 'Your Privacy Choices',
    });
    expect(link).toHaveAttribute('href', '/legal/privacy#privacy-choices');
    fireEvent.click(link);
    expect(
      await screen.findByRole('switch', {}, { timeout: 5000 })
    ).toBeVisible();
  });
  it('revokes the loaded SDK before a conditional pixel is unmounted', async () => {
    function ConditionalPixel() {
      const allowed = useMarketingConsent(false);
      return allowed ? <MetaPixel pixelIds={['123']} /> : null;
    }
    render(
      <>
        <CookieBannerMount />
        <ConditionalPixel />
      </>
    );
    await screen.findByTestId('ad-pixel');
    const fbq = vi.fn();
    Object.assign(window, { fbq });
    localStorage.setItem('jovie_tracking_consent', 'rejected');
    act(() => globalThis.JVConsent?._emit({ marketing: false }));
    expect(screen.queryByTestId('ad-pixel')).toBeNull();
    expect(fbq).toHaveBeenCalledWith('consent', 'revoke');
  });
});

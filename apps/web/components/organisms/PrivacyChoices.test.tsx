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
import { MetaPixel } from '@/components/features/tracking/MetaPixel';
import { ProfileNavButton } from '@/components/molecules/ProfileNavButton';
import { CookieBannerMount } from './CookieBannerMount';

vi.mock('@/hooks/useClerkSafe', () => ({
  useAuthSafe: () => ({ isSignedIn: false }),
}));
vi.mock('@/hooks/useBreakpoint', () => ({ useBreakpoint: () => false }));

const saveConsent = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock('@/lib/cookies/consent', () => ({ saveConsent }));
vi.mock('@/lib/env-client', () => ({ env: { IS_TEST: false, IS_E2E: false } }));
vi.mock('@/lib/demo-recording', () => ({ isDemoRecordingClient: () => false }));
vi.mock('next/script', () => ({
  default: ({ src }: { src: string }) => (
    <script defer src={src} data-testid='ad-pixel' />
  ),
}));

function surface() {
  return render(
    <>
      <Link href='/legal/privacy#privacy-choices'>Your Privacy Choices</Link>
      <CookieBannerMount />
      <MetaPixel pixelIds={['123']} />
    </>
  );
}

beforeEach(() => {
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
});
afterEach(() => {
  cleanup();
  globalThis.JVConsent = undefined;
  vi.restoreAllMocks();
});

describe('Your Privacy Choices', () => {
  it('negative control: loads the pixel by default without GPC or an opt-out', async () => {
    surface();
    expect(await screen.findByTestId('ad-pixel')).toHaveAttribute(
      'src',
      'https://connect.facebook.net/en_US/fbevents.js'
    );
    expect(
      screen.queryByText("Your browser's privacy signal is honored")
    ).toBeNull();
  });

  it('never loads the pixel for an existing first-party opt-out', () => {
    document.cookie = 'jv_tracking_consent=rejected; path=/';
    surface();
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
    surface();
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
  });

  it('persists an opt-out and suppresses pixels immediately and after remount', async () => {
    const first = surface();
    await screen.findByTestId('ad-pixel');
    fireEvent.click(screen.getByRole('link', { name: 'Your Privacy Choices' }));
    const toggle = await screen.findByRole('switch', {}, { timeout: 5000 });
    expect(toggle).not.toBeChecked();
    fireEvent.click(toggle);
    await waitFor(() =>
      expect(saveConsent).toHaveBeenCalledWith({
        essential: true,
        analytics: false,
        marketing: false,
      })
    );
    expect(screen.queryByTestId('ad-pixel')).toBeNull();
    expect(localStorage.getItem('jovie_tracking_consent')).toBe('rejected');
    expect(document.cookie).toContain('jv_tracking_consent=rejected');
    first.unmount();
    Object.assign(window, { fbq: undefined, _fbq: undefined });
    surface();
    expect(screen.queryByTestId('ad-pixel')).toBeNull();
    expect((window as Window & { fbq?: unknown }).fbq).toBeUndefined();
  });

  it('keeps the local opt-out when the server save fails', async () => {
    saveConsent.mockRejectedValue(new Error('offline'));
    surface();
    fireEvent.click(screen.getByRole('link', { name: 'Your Privacy Choices' }));
    fireEvent.click(await screen.findByRole('switch', {}, { timeout: 5000 }));
    expect(await screen.findByRole('alert')).toBeVisible();
    expect(screen.queryByTestId('ad-pixel')).toBeNull();
    expect(document.cookie).toContain('jv_tracking_consent=rejected');
  });
  it('falls back to the consent cookie when localStorage is unavailable', async () => {
    surface();
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
    surface();
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
    surface();
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
    surface();
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
});

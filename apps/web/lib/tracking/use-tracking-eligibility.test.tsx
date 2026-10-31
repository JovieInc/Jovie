import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MetaPixel } from '@/components/features/tracking/MetaPixel';
import { GoogleAnalytics } from '@/components/providers/GoogleAnalytics';
import { trackingEligibility } from './eligibility';

const state = vi.hoisted(() => ({
  pathname: '/synthetic-artist',
  youngAudience: false,
}));
vi.mock('next/navigation', () => ({ usePathname: () => state.pathname }));
vi.mock('next/script', () => ({
  default: ({ id }: { id: string }) => <script data-testid={id} />,
}));
vi.mock('@/lib/env-client', () => ({ env: { IS_TEST: false, IS_E2E: false } }));
vi.mock('@/lib/env-public', () => ({
  publicEnv: { NEXT_PUBLIC_GA_MEASUREMENT_ID: 'G-SYNTHETIC' },
}));
vi.mock('@/lib/demo-recording', () => ({ isDemoRecordingClient: () => false }));
vi.mock('./vendor-navigation', () => ({
  isolateTrackingDocument: vi.fn(),
  resetTrackingDocument: vi.fn(),
}));

function surface() {
  return (
    <>
      <MetaPixel pixelIds={['synthetic']} youngAudience={false} />
      <GoogleAnalytics />
    </>
  );
}
const fetchMock = vi.fn();
beforeEach(() => {
  state.pathname = '/synthetic-artist';
  state.youngAudience = false;
  localStorage.clear();
  document.cookie = 'jv_cc_required=0; path=/';
  document.cookie = 'jv_tracking_consent=; path=/';
  Object.defineProperty(navigator, 'globalPrivacyControl', {
    configurable: true,
    value: false,
  });
  globalThis.JVConsent = undefined;
  delete (window as Window & { fbq?: unknown }).fbq;
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset().mockImplementation(async () => ({
    ok: true,
    json: async () => ({
      pathname: state.pathname,
      eligibility: trackingEligibility({
        profile: { youngAudience: state.youngAudience },
        visitor: {},
      }),
    }),
  }));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('live browser policy with stale profile payloads', () => {
  it('loads Meta and GA when eligible, then blocks BOTH on a warm cached profile visit after flag change', async () => {
    const first = render(surface());
    await screen.findByTestId('meta-fbevents-loader');
    await screen.findByTestId('ga-gtag-loader');
    first.unmount();
    state.youngAudience = true;
    render(surface()); // deliberately replay the old youngAudience=false payload
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4));
    expect(screen.queryByTestId('meta-fbevents-loader')).toBeNull();
    expect(screen.queryByTestId('ga-gtag-loader')).toBeNull();
    expect(
      fetchMock.mock.calls.every(([, options]) => options.cache === 'no-store')
    ).toBe(true);
  });
  it.each([
    '/synthetic-artist',
    '/synthetic-artist/alerts',
    '/synthetic-artist/about',
    '/synthetic-artist/release',
  ])('loads no vendor on flagged public surface %s', async path => {
    state.pathname = path;
    state.youngAudience = true;
    render(surface());
    await act(async () => {});
    expect(screen.queryByTestId('meta-fbevents-loader')).toBeNull();
    expect(screen.queryByTestId('ga-gtag-loader')).toBeNull();
    expect((window as Window & { fbq?: unknown }).fbq).toBeUndefined();
  });
  it.each(['gpc', 'opt-out', 'EU', 'offline', 'malformed'] as const)(
    'fails closed for %s',
    async scenario => {
      if (scenario === 'gpc')
        Object.defineProperty(navigator, 'globalPrivacyControl', {
          configurable: true,
          value: true,
        });
      if (scenario === 'opt-out')
        localStorage.setItem('jovie_tracking_consent', 'rejected');
      if (scenario === 'EU') document.cookie = 'jv_cc_required=1; path=/';
      if (scenario === 'offline')
        fetchMock.mockRejectedValue(new Error('offline'));
      if (scenario === 'malformed')
        fetchMock.mockResolvedValue({
          ok: true,
          json: async () => ({ eligibility: { ga: true, vercel: true } }),
        });
      render(surface());
      await act(async () => {});
      expect(screen.queryByTestId('meta-fbevents-loader')).toBeNull();
      expect(screen.queryByTestId('ga-gtag-loader')).toBeNull();
    }
  );
  it('denies synchronously during a client route transition and ignores an old response', async () => {
    let resolve!: (value: unknown) => void;
    fetchMock.mockImplementation(
      () =>
        new Promise(r => {
          resolve = r;
        })
    );
    const view = render(surface());
    state.pathname = '/other-artist/alerts';
    state.youngAudience = true;
    view.rerender(surface());
    await act(async () =>
      resolve({
        ok: true,
        json: async () => ({
          pathname: '/synthetic-artist',
          eligibility: {
            facebook: true,
            ga: true,
            google: true,
            tiktok: true,
            vercel: true,
          },
        }),
      })
    );
    expect(screen.queryByTestId('meta-fbevents-loader')).toBeNull();
    expect(screen.queryByTestId('ga-gtag-loader')).toBeNull();
  });
});

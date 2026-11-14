import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { COUNTRY_CODE_COOKIE, LISTEN_COOKIE } from '@/constants/app';
import { postJsonBeacon } from '@/lib/tracking/json-beacon';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { PreferredDspRedirect } from './PreferredDspRedirect';

vi.mock('@/lib/tracking/json-beacon', () => ({
  postJsonBeacon: vi.fn(() => true),
}));

const PROVIDER_LINKS = [
  { providerId: 'spotify', url: 'https://open.spotify.com/album/abc' },
  { providerId: 'apple_music', url: 'https://music.apple.com/album/abc' },
];

const TRACKING = {
  contentType: 'release' as const,
  contentId: 'release-1',
  smartLinkSlug: 'midnight',
};

function setLocation({
  pathname = '/artist/midnight',
  search = '',
}: {
  pathname?: string;
  search?: string;
} = {}) {
  const replaceMock = vi.fn();
  Object.defineProperty(globalThis, 'location', {
    value: {
      origin: 'https://jov.ie',
      pathname,
      search,
      hash: '',
      replace: replaceMock,
    },
    writable: true,
    configurable: true,
  });
  return replaceMock;
}

function setNavigationType(type: 'navigate' | 'reload' | 'back_forward') {
  vi.spyOn(performance, 'getEntriesByType').mockImplementation(
    (entryType: string) =>
      entryType === 'navigation' ? ([{ type }] as never) : []
  );
}

function setPreferredDsp(provider: string | null) {
  document.cookie = `${LISTEN_COOKIE}=; path=/; max-age=0`;
  if (provider) {
    document.cookie = `${LISTEN_COOKIE}=${provider}; path=/`;
  }
}

function renderRedirect() {
  return render(
    <PreferredDspRedirect
      providerLinks={PROVIDER_LINKS}
      artistHandle='artist'
      tracking={TRACKING}
    />
  );
}

describe('<PreferredDspRedirect>', () => {
  const originalLocation = globalThis.location;

  beforeEach(() => {
    sessionStorage.clear();
    document.cookie = `${COUNTRY_CODE_COOKIE}=; path=/; max-age=0`;
    setPreferredDsp(null);
    setNavigationType('navigate');
  });

  afterEach(() => {
    document.cookie = `${COUNTRY_CODE_COOKIE}=; path=/; max-age=0`;
    Object.defineProperty(globalThis, 'location', {
      value: originalLocation,
      writable: true,
      configurable: true,
    });
    setPreferredDsp(null);
    sessionStorage.clear();
    vi.restoreAllMocks();
  });

  it('auto-redirects a fresh eligible visit to the remembered provider', () => {
    const replaceMock = setLocation();
    setPreferredDsp('spotify');

    renderRedirect();

    expect(replaceMock).toHaveBeenCalledWith(
      'https://open.spotify.com/album/abc?utm_source=jovie'
    );
    expect(
      sessionStorage.getItem('jovie:smartlink:auto-redirected:/artist/midnight')
    ).toBe('1');
  });

  it.each([
    ['JP', 'jp'],
    ['XX', 'us'],
  ])(
    'uses visitor country %s without losing the track id or attribution',
    (country, storefront) => {
      const replaceMock = setLocation();
      setPreferredDsp('apple_music');
      document.cookie = `${COUNTRY_CODE_COOKIE}=${country}; path=/`;
      render(
        <PreferredDspRedirect
          providerLinks={[
            {
              providerId: 'apple_music',
              url: 'https://music.apple.com/us/album/midnight/123?i=456',
            },
          ]}
          artistHandle='artist'
          tracking={TRACKING}
        />
      );
      expect(replaceMock).toHaveBeenCalledWith(
        `https://music.apple.com/${storefront}/album/midnight/123?i=456&utm_source=jovie`
      );
    }
  );

  it('suppresses the auto-redirect after browser Back (history traversal)', () => {
    const replaceMock = setLocation();
    setPreferredDsp('spotify');
    setNavigationType('back_forward');

    renderRedirect();

    expect(replaceMock).not.toHaveBeenCalled();
  });

  it('suppresses the auto-redirect on a same-session deliberate revisit', () => {
    const replaceMock = setLocation();
    setPreferredDsp('spotify');
    sessionStorage.setItem(
      'jovie:smartlink:auto-redirected:/artist/midnight',
      '1'
    );

    renderRedirect();

    expect(replaceMock).not.toHaveBeenCalled();
  });

  it('scopes the one-shot flag per SmartLink so sibling pages stay eligible', () => {
    const replaceMock = setLocation({
      pathname: '/artist/midnight/first-track',
    });
    setPreferredDsp('spotify');
    sessionStorage.setItem(
      'jovie:smartlink:auto-redirected:/artist/midnight',
      '1'
    );

    renderRedirect();

    expect(replaceMock).toHaveBeenCalledWith(
      'https://open.spotify.com/album/abc?utm_source=jovie'
    );
  });

  it('still redirects on an explicit ?dsp= tap even after auto-redirect fired', () => {
    const replaceMock = setLocation({ search: '?dsp=spotify' });
    sessionStorage.setItem(
      'jovie:smartlink:auto-redirected:/artist/midnight',
      '1'
    );

    renderRedirect();

    expect(replaceMock).toHaveBeenCalledWith(
      'https://open.spotify.com/album/abc?utm_source=jovie'
    );
  });

  it('forwards the visit UTM params instead of the Jovie default', () => {
    const replaceMock = setLocation({
      search: '?dsp=spotify&utm_source=instagram&utm_campaign=midnight',
    });

    renderRedirect();

    expect(replaceMock).toHaveBeenCalledWith(
      'https://open.spotify.com/album/abc?utm_source=instagram&utm_campaign=midnight'
    );
  });

  it('does not redirect when noredirect=1 is present', () => {
    const replaceMock = setLocation({ search: '?noredirect=1' });
    setPreferredDsp('spotify');

    renderRedirect();

    expect(replaceMock).not.toHaveBeenCalled();
  });

  it('does not redirect without a remembered provider', () => {
    const replaceMock = setLocation();

    renderRedirect();

    expect(replaceMock).not.toHaveBeenCalled();
  });

  it('tracks automatic redirects as preferred_dsp and explicit taps as redirect', () => {
    setLocation();
    setPreferredDsp('spotify');
    renderRedirect();

    expect(postJsonBeacon).toHaveBeenCalledWith(
      '/api/track',
      expect.objectContaining({ source: 'preferred_dsp' }),
      expect.any(Function)
    );

    vi.mocked(postJsonBeacon).mockClear();
    setLocation({ search: '?dsp=spotify' });
    renderRedirect();

    expect(postJsonBeacon).toHaveBeenCalledWith(
      '/api/track',
      expect.objectContaining({ source: 'redirect' }),
      expect.any(Function)
    );
  });

  it('stays on an axe-clean page when no provider link matches', async () => {
    vi.mocked(postJsonBeacon).mockClear();
    const replaceMock = setLocation();
    setPreferredDsp('spotify');

    const { container } = render(
      <main>
        <h1>Never Say A Word</h1>
        <PreferredDspRedirect
          providerLinks={[]}
          artistHandle='artist'
          tracking={TRACKING}
        />
      </main>
    );

    expect(replaceMock).not.toHaveBeenCalled();
    expect(postJsonBeacon).not.toHaveBeenCalled();
    await expectNoA11yViolations(container);
  });

  it('still redirects once when session storage throws', async () => {
    const replaceMock = setLocation();
    setPreferredDsp('spotify');
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });

    const { container } = renderRedirect();

    expect(replaceMock).toHaveBeenCalledTimes(1);
    expect(replaceMock).toHaveBeenCalledWith(
      'https://open.spotify.com/album/abc?utm_source=jovie'
    );
    expect(container).toBeEmptyDOMElement();
    await expectNoA11yViolations(container);
  });

  it('follows an updated provider preference', () => {
    const replaceMock = setLocation();
    setPreferredDsp('apple_music');

    renderRedirect();

    expect(replaceMock).toHaveBeenCalledWith(
      'https://music.apple.com/album/abc?utm_source=jovie'
    );
  });
});

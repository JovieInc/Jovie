import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LISTEN_COOKIE } from '@/constants/app';
import { postJsonBeacon } from '@/lib/tracking/json-beacon';
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
    setPreferredDsp(null);
    setNavigationType('navigate');
  });

  afterEach(() => {
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
      'https://open.spotify.com/album/abc'
    );
    expect(
      sessionStorage.getItem('jovie:smartlink:auto-redirected:/artist/midnight')
    ).toBe('1');
  });

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
      'https://open.spotify.com/album/abc'
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
      'https://open.spotify.com/album/abc'
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

  it('follows an updated provider preference', () => {
    const replaceMock = setLocation();
    setPreferredDsp('apple_music');

    renderRedirect();

    expect(replaceMock).toHaveBeenCalledWith(
      'https://music.apple.com/album/abc'
    );
  });
});

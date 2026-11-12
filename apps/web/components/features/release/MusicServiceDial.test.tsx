import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LISTEN_COOKIE } from '@/constants/app';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { MusicServiceDial } from './MusicServiceDial';

const PROVIDERS = [
  {
    key: 'spotify' as const,
    label: 'Spotify',
    url: 'https://open.spotify.com/song',
  },
  {
    key: 'apple_music' as const,
    label: 'Apple Music',
    url: 'https://music.apple.com/song',
  },
  { key: 'deezer' as const, label: 'Deezer', url: 'https://deezer.com/song' },
];

afterEach(() => {
  document.cookie = `${LISTEN_COOKIE}=; path=/; max-age=0`;
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('MusicServiceDial', () => {
  it('restores an available choice and tracks the provider actually streamed', () => {
    document.cookie = `${LISTEN_COOKIE}=apple_music; path=/`;
    const onStream = vi.fn();
    render(
      <MusicServiceDial
        providers={PROVIDERS}
        utmParams={{}}
        onStream={onStream}
      />
    );
    const action = screen.getByRole('link', {
      name: 'Stream Now with Apple Music',
    });
    expect(action).toHaveAttribute('href', 'https://music.apple.com/song');
    fireEvent.click(action);
    expect(onStream).toHaveBeenCalledWith('apple_music');
  });

  it('retains an unavailable saved service without showing a broken action', () => {
    document.cookie = `${LISTEN_COOKIE}=deezer; path=/`;
    render(
      <MusicServiceDial
        providers={PROVIDERS.slice(0, 2)}
        utmParams={{}}
        onStream={vi.fn()}
      />
    );
    expect(
      screen.getByRole('link', { name: 'Stream Now with Spotify' })
    ).toBeInTheDocument();
    expect(document.cookie).toContain(`${LISTEN_COOKIE}=deezer`);
  });

  it('drops the swipe hint when only one service exists', () => {
    render(
      <MusicServiceDial
        providers={PROVIDERS.slice(0, 1)}
        utmParams={{}}
        onStream={vi.fn()}
      />
    );
    expect(
      screen.getByRole('link', { name: 'Stream Now with Spotify' })
    ).toBeInTheDocument();
    expect(screen.queryByText(/Swipe to switch/)).not.toBeInTheDocument();
  });

  it('persists a newly settled choice before the next visit', () => {
    vi.useFakeTimers();
    render(
      <MusicServiceDial
        providers={PROVIDERS}
        utmParams={{}}
        onStream={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole('option', { name: 'Apple Music' }));
    act(() => vi.advanceTimersByTime(1000));
    expect(document.cookie).toContain(`${LISTEN_COOKIE}=apple_music`);
    expect(
      screen.getByRole('link', { name: 'Stream Now with Apple Music' })
    ).toBeInTheDocument();
  });
});

describe('MusicServiceDial states', () => {
  it('renders nothing when the release has no streaming service', async () => {
    const { container } = render(
      <MusicServiceDial providers={[]} utmParams={{}} onStream={vi.fn()} />
    );
    expect(container).toBeEmptyDOMElement();
    await expectNoA11yViolations(container);
  });

  it('offers every service in caller order with an axe-clean dial', async () => {
    const many = [
      ...PROVIDERS,
      { key: 'tidal' as const, label: 'TIDAL', url: 'https://tidal.com/t' },
      {
        key: 'soundcloud' as const,
        label: 'SoundCloud',
        url: 'https://soundcloud.com/t',
      },
    ];
    const { container } = render(
      <MusicServiceDial providers={many} utmParams={{}} onStream={vi.fn()} />
    );
    expect(
      screen.getAllByRole('option').map(option => option.textContent)
    ).toEqual(['Spotify', 'Apple Music', 'Deezer', 'TIDAL', 'SoundCloud']);
    await expectNoA11yViolations(container);
  });

  it('still streams and remembers by cookie when local storage throws', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    const onStream = vi.fn();
    const { container } = render(
      <MusicServiceDial
        providers={PROVIDERS}
        utmParams={{}}
        onStream={onStream}
      />
    );
    fireEvent.click(
      screen.getByRole('link', { name: 'Stream Now with Spotify' })
    );
    expect(onStream).toHaveBeenCalledWith('spotify');
    expect(document.cookie).toContain(`${LISTEN_COOKIE}=spotify`);
    await expectNoA11yViolations(container);
  });

  it('keeps the dial axe-clean inside a right-to-left page', async () => {
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <MusicServiceDial
          providers={PROVIDERS}
          utmParams={{}}
          onStream={vi.fn()}
        />
      </div>
    );
    expect(
      screen.getByRole('listbox', { name: 'Choose a streaming service' })
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});

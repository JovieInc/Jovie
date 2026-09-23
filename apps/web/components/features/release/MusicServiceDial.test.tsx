import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LISTEN_COOKIE } from '@/constants/app';
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

  it('persists a newly settled choice before the next visit', () => {
    vi.useFakeTimers();
    render(
      <MusicServiceDial
        providers={PROVIDERS}
        utmParams={{}}
        onStream={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Select Apple Music' }));
    act(() => vi.advanceTimersByTime(180));
    expect(document.cookie).toContain(`${LISTEN_COOKIE}=apple_music`);
    expect(
      screen.getByRole('link', { name: 'Stream Now with Apple Music' })
    ).toBeInTheDocument();
  });
});

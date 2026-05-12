import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReleaseViewModel } from '@/lib/discography/types';

const toggleTrack = vi.fn().mockResolvedValue(undefined);
let playbackState = { activeTrackId: null as string | null, isPlaying: false };

beforeEach(() => {
  toggleTrack.mockClear();
  playbackState = { activeTrackId: null, isPlaying: false };
});

vi.mock('@/components/organisms/release-sidebar/useTrackAudioPlayer', () => ({
  useTrackAudioPlayer: () => ({
    playbackState,
    toggleTrack,
    seek: vi.fn(),
    stop: vi.fn(),
    onError: vi.fn(),
  }),
}));

const { ShellReleaseRow } = await import(
  '@/components/features/dashboard/organisms/release-provider-matrix/shell-releases/ShellReleaseRow'
);

function fakeRelease(
  partial: Partial<ReleaseViewModel> = {}
): ReleaseViewModel {
  return {
    profileId: 'profile-1',
    id: 'release-1',
    title: 'Skyline Dreams',
    slug: 'skyline-dreams',
    smartLinkPath: '/smart/release-1',
    artistNames: ['Jovie Artist'],
    status: 'released',
    releaseType: 'single',
    isExplicit: false,
    totalTracks: 1,
    providers: [],
    previewUrl: 'https://cdn.example.com/preview.mp3',
    primaryIsrc: 'USX9P2400001',
    artworkUrl: 'https://cdn.example.com/art.jpg',
    lyrics: '',
    ...partial,
  } as ReleaseViewModel;
}

describe('ShellReleaseRow audio parity', () => {
  it('omits the play overlay when the release has no production preview', () => {
    render(
      <ShellReleaseRow
        release={fakeRelease({ previewUrl: null })}
        isSelected={false}
        onSelect={vi.fn()}
      />
    );

    expect(
      screen.queryByRole('button', { name: /Play|Pause/ })
    ).not.toBeInTheDocument();
  });

  it('passes the full production track payload to toggleTrack on first click', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();

    render(
      <ShellReleaseRow
        release={fakeRelease({ lyrics: 'first line\nsecond line' })}
        isSelected={false}
        onSelect={onSelect}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Play' }));

    expect(toggleTrack).toHaveBeenCalledWith({
      id: 'release-1',
      title: 'Skyline Dreams',
      audioUrl: 'https://cdn.example.com/preview.mp3',
      isrc: 'USX9P2400001',
      releaseTitle: 'Skyline Dreams',
      artistName: 'Jovie Artist',
      artworkUrl: 'https://cdn.example.com/art.jpg',
      hasLyrics: true,
    });
    // Click on the overlay must not also fire the row's onSelect.
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('omits audioUrl when toggling the same track that is already active (resume path)', async () => {
    const user = userEvent.setup();
    playbackState = { activeTrackId: 'release-1', isPlaying: false };

    render(
      <ShellReleaseRow
        release={fakeRelease()}
        isSelected={false}
        onSelect={vi.fn()}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Play' }));

    expect(toggleTrack).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'release-1',
        audioUrl: undefined,
      })
    );
  });

  it('marks the row as the active audio source while playing', () => {
    playbackState = { activeTrackId: 'release-1', isPlaying: true };

    const { container } = render(
      <ShellReleaseRow
        release={fakeRelease()}
        isSelected={false}
        onSelect={vi.fn()}
      />
    );

    const row = container.querySelector('[data-shell-release-row]');
    expect(row).toHaveAttribute('data-release-active', 'true');
    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument();
  });

  it('reports hasLyrics=false when release.lyrics is empty whitespace', async () => {
    const user = userEvent.setup();

    render(
      <ShellReleaseRow
        release={fakeRelease({ lyrics: '   \n  ' })}
        isSelected={false}
        onSelect={vi.fn()}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Play' }));

    expect(toggleTrack).toHaveBeenCalledWith(
      expect.objectContaining({ hasLyrics: false })
    );
  });
});

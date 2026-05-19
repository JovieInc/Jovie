import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReleaseViewModel } from '@/lib/discography/types';

const toggleTrack = vi.fn().mockResolvedValue(undefined);
let playbackState: {
  activeTrackId: string | null;
  isPlaying: boolean;
  playbackStatus: 'idle' | 'loading' | 'playing' | 'paused' | 'error';
} = {
  activeTrackId: null,
  isPlaying: false,
  playbackStatus: 'idle',
};

beforeEach(() => {
  toggleTrack.mockClear();
  playbackState = {
    activeTrackId: null,
    isPlaying: false,
    playbackStatus: 'idle',
  };
});

vi.mock('@/components/organisms/release-sidebar/useTrackAudioPlayer', () => ({
  useTrackAudioPlayer: () => ({
    playbackState,
    toggleTrack,
    seek: vi.fn(),
    stop: vi.fn(),
    onError: vi.fn(() => () => undefined),
  }),
}));

const { ShellReleaseRow } = await import(
  '@/components/features/dashboard/organisms/release-provider-matrix/shell-releases/ShellReleaseRow'
);

function fakeRelease(
  partial: Partial<ReleaseViewModel> & { id: string; title: string }
): ReleaseViewModel {
  return {
    profileId: 'p',
    artistNames: ['Bahamas'],
    status: 'released',
    artworkUrl: 'https://x.invalid/a.jpg',
    slug: partial.title.toLowerCase().replace(/\s+/g, '-'),
    smartLinkPath: `/${partial.title.toLowerCase().replace(/\s+/g, '-')}`,
    providers: [],
    releaseType: 'single',
    isExplicit: false,
    totalTracks: 1,
    ...partial,
  } as ReleaseViewModel;
}

describe('ShellReleaseRow audio affordance', () => {
  it('uses shared row state tokens for selected releases', () => {
    const { container } = render(
      <ShellReleaseRow
        release={fakeRelease({
          id: 'r1',
          title: 'Lost in the Light',
          previewUrl: null,
        })}
        isSelected
        onSelect={() => undefined}
      />
    );

    const row = container.querySelector('[data-shell-release-row]');
    expect(row).toHaveAttribute('aria-selected', 'true');
    expect(row).toHaveAttribute('data-selected', 'true');
    expect(row?.className).toContain('bg-(--linear-row-selected)');
    expect(row?.className).toContain('--linear-border-focus');
  });

  it('uses the shell typography tokens for the release title and subtitle', () => {
    render(
      <ShellReleaseRow
        release={fakeRelease({
          id: 'r1',
          title: 'Lost in the Light',
          previewUrl: null,
        })}
        isSelected={false}
        onSelect={() => undefined}
      />
    );

    expect(screen.getByText('Lost in the Light').className).toContain(
      'text-[13px]'
    );
    expect(screen.getByText('Lost in the Light').className).toContain(
      'font-caption'
    );
    expect(screen.getByText('Bahamas').className).toContain('text-[11px]');
  });

  it('omits the play overlay when the release has no preview URL', () => {
    render(
      <ShellReleaseRow
        release={fakeRelease({
          id: 'r1',
          title: 'No Preview',
          previewUrl: null,
        })}
        isSelected={false}
        onSelect={() => undefined}
      />
    );

    expect(
      screen.queryByRole('button', { name: 'Play No Preview' })
    ).not.toBeInTheDocument();
  });

  it('renders a production-backed play overlay when previewUrl exists', () => {
    render(
      <ShellReleaseRow
        release={fakeRelease({
          id: 'r1',
          title: 'Lost in the Light',
          previewUrl: 'https://cdn.example.com/preview.mp3',
        })}
        isSelected={false}
        onSelect={() => undefined}
      />
    );

    const playButton = screen.getByRole('button', {
      name: 'Play Lost in the Light',
    });
    expect(playButton).toBeInTheDocument();
    expect(playButton).toHaveAttribute('aria-pressed', 'false');
  });

  it('toggles playback via the shared audio player without selecting the row', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();

    render(
      <ShellReleaseRow
        release={fakeRelease({
          id: 'r1',
          title: 'Lost in the Light',
          previewUrl: 'https://cdn.example.com/preview.mp3',
          primaryIsrc: 'USX9P2400001',
          lyrics: 'la la la',
        })}
        isSelected={false}
        onSelect={onSelect}
      />
    );

    await user.click(
      screen.getByRole('button', { name: 'Play Lost in the Light' })
    );

    expect(toggleTrack).toHaveBeenCalledWith({
      id: 'r1',
      title: 'Lost in the Light',
      audioUrl: 'https://cdn.example.com/preview.mp3',
      isrc: 'USX9P2400001',
      releaseTitle: 'Lost in the Light',
      artistName: 'Bahamas',
      artworkUrl: 'https://x.invalid/a.jpg',
      hasLyrics: true,
    });
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('forwards a resume request without re-loading the audio source', async () => {
    const user = userEvent.setup();
    playbackState = {
      activeTrackId: 'r1',
      isPlaying: false,
      playbackStatus: 'paused',
    };

    render(
      <ShellReleaseRow
        release={fakeRelease({
          id: 'r1',
          title: 'Lost in the Light',
          previewUrl: 'https://cdn.example.com/preview.mp3',
        })}
        isSelected={false}
        onSelect={() => undefined}
      />
    );

    await user.click(
      screen.getByRole('button', { name: 'Play Lost in the Light' })
    );

    expect(toggleTrack).toHaveBeenCalledWith({
      id: 'r1',
      title: 'Lost in the Light',
    });
    const call = toggleTrack.mock.calls[0]?.[0] ?? {};
    expect(call).not.toHaveProperty('audioUrl');
  });

  it('reflects the active track in aria-pressed and data attributes', () => {
    playbackState = {
      activeTrackId: 'r1',
      isPlaying: true,
      playbackStatus: 'playing',
    };

    const { container } = render(
      <ShellReleaseRow
        release={fakeRelease({
          id: 'r1',
          title: 'Lost in the Light',
          previewUrl: 'https://cdn.example.com/preview.mp3',
        })}
        isSelected={false}
        onSelect={() => undefined}
      />
    );

    const pauseButton = screen.getByRole('button', {
      name: 'Pause Lost in the Light',
    });
    expect(pauseButton).toHaveAttribute('aria-pressed', 'true');
    expect(pauseButton.className).toContain('opacity-100');

    const row = container.querySelector('[data-shell-release-row]');
    expect(row).toHaveAttribute('data-release-active', 'true');
  });

  it('flags lyrics availability when the release has lyrics text', async () => {
    const user = userEvent.setup();

    render(
      <ShellReleaseRow
        release={fakeRelease({
          id: 'r1',
          title: 'No Lyrics',
          previewUrl: 'https://cdn.example.com/preview.mp3',
          lyrics: '',
        })}
        isSelected={false}
        onSelect={() => undefined}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Play No Lyrics' }));

    expect(toggleTrack).toHaveBeenCalledWith(
      expect.objectContaining({ hasLyrics: false })
    );
  });
});

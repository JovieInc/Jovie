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
    expect(row?.className).toContain('system-b-table-row-selected');
    expect(row?.className).toContain('system-b-table-row-focus-visible');
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
      'font-caption'
    );
    expect(screen.getByText('Lost in the Light').className).toContain(
      'leading-[1.2]'
    );
    expect(screen.getByText('Bahamas').className).toContain('text-2xs');
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

  it('does not reserve a row action slot when the release has no actions', () => {
    render(
      <ShellReleaseRow
        release={fakeRelease({
          id: 'r1',
          title: 'No Actions',
          previewUrl: null,
        })}
        isSelected={false}
        onSelect={() => undefined}
      />
    );

    expect(
      screen.queryByTestId('shell-release-row-actions')
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

describe('ShellReleaseRow enrichment', () => {
  it('renders a release-type badge derived from real release data', () => {
    render(
      <ShellReleaseRow
        release={fakeRelease({
          id: 'r1',
          title: 'Materia',
          releaseType: 'album',
          previewUrl: null,
        })}
        isSelected={false}
        onSelect={() => undefined}
      />
    );

    expect(screen.getByText('Album')).toBeInTheDocument();
  });

  it('falls back to a Single badge for unmapped release types', () => {
    render(
      <ShellReleaseRow
        release={fakeRelease({
          id: 'r1',
          title: 'Mystery',
          // Force an out-of-map value to exercise the fallback.
          releaseType: 'unknown' as never,
          previewUrl: null,
        })}
        isSelected={false}
        onSelect={() => undefined}
      />
    );

    expect(screen.getByText('Single')).toBeInTheDocument();
  });

  it('omits the inline sync status and agent pulse when idle', () => {
    const { container } = render(
      <ShellReleaseRow
        release={fakeRelease({ id: 'r1', title: 'Idle', previewUrl: null })}
        isSelected={false}
        onSelect={() => undefined}
        syncStatus={null}
      />
    );

    expect(screen.queryByText('Syncing…')).not.toBeInTheDocument();
    expect(screen.queryByText('Rescanning ISRC…')).not.toBeInTheDocument();
    expect(
      container.querySelector('[title="Agent working"]')
    ).not.toBeInTheDocument();
  });

  it('renders the inline sync status and agent pulse while refreshing', () => {
    const { container } = render(
      <ShellReleaseRow
        release={fakeRelease({ id: 'r1', title: 'Syncing', previewUrl: null })}
        isSelected={false}
        onSelect={() => undefined}
        syncStatus='refreshing'
      />
    );

    expect(screen.getByText('Syncing…')).toBeInTheDocument();
    expect(
      container.querySelector('[title="Agent working"]')
    ).toBeInTheDocument();
  });

  it('labels an in-flight ISRC rescan distinctly', () => {
    render(
      <ShellReleaseRow
        release={fakeRelease({ id: 'r1', title: 'Rescan', previewUrl: null })}
        isSelected={false}
        onSelect={() => undefined}
        syncStatus='rescanning-isrc'
      />
    );

    expect(screen.getByText('Rescanning ISRC…')).toBeInTheDocument();
  });

  it('keeps a stable row height across idle and syncing states (no layout shift)', () => {
    const release = fakeRelease({
      id: 'r1',
      title: 'Stable Row',
      previewUrl: null,
    });

    const idle = render(
      <ShellReleaseRow
        release={release}
        isSelected={false}
        onSelect={() => undefined}
        syncStatus={null}
      />
    );
    const idleRow = idle.container.querySelector('[data-shell-release-row]');
    expect(idleRow?.className).toContain('h-14');
    idle.unmount();

    const syncing = render(
      <ShellReleaseRow
        release={release}
        isSelected={false}
        onSelect={() => undefined}
        syncStatus='refreshing'
      />
    );
    const syncingRow = syncing.container.querySelector(
      '[data-shell-release-row]'
    );
    // Same fixed row height token in both states — the sync chrome lives
    // inside the existing single-line subtitle and an absolutely-positioned
    // pulse, so adding it cannot reflow the row.
    expect(syncingRow?.className).toContain('h-14');
  });
});

describe('ShellReleaseRow weekly streams metric', () => {
  it('renders the formatted weekly metric when data exists', () => {
    render(
      <ShellReleaseRow
        release={fakeRelease({
          id: 'r-weekly',
          title: 'Weekly Hit',
          weeklyStreams: 12_400,
        })}
        isSelected={false}
        onSelect={() => undefined}
      />
    );

    const cell = screen.getByTestId('shell-release-weekly-streams');
    expect(cell.textContent).toContain('12.4K');
    expect(cell.textContent).toContain('/ wk');
  });

  it('renders a placeholder when no weekly data exists', () => {
    render(
      <ShellReleaseRow
        release={fakeRelease({
          id: 'r-no-data',
          title: 'Quiet Release',
          weeklyStreams: null,
        })}
        isSelected={false}
        onSelect={() => undefined}
      />
    );

    const cell = screen.getByTestId('shell-release-weekly-streams');
    expect(cell.textContent).toContain('—');
    expect(cell.textContent).not.toContain('/ wk');
  });

  it('treats a zero count as no data (quiet placeholder, not a noisy zero)', () => {
    render(
      <ShellReleaseRow
        release={fakeRelease({
          id: 'r-zero',
          title: 'Zero Week',
          weeklyStreams: 0,
        })}
        isSelected={false}
        onSelect={() => undefined}
      />
    );

    expect(
      screen.getByTestId('shell-release-weekly-streams').textContent
    ).toContain('—');
  });

  it('always renders the fixed-width cell so states cannot shift layout', () => {
    const { container } = render(
      <ShellReleaseRow
        release={fakeRelease({
          id: 'r-layout',
          title: 'Layout Check',
        })}
        isSelected={false}
        onSelect={() => undefined}
      />
    );

    const cell = container.querySelector(
      '[data-testid="shell-release-weekly-streams"]'
    );
    expect(cell?.className).toContain('w-20');
  });
});

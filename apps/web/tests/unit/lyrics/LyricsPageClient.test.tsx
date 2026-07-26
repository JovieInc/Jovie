import { fireEvent, render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { APP_ROUTES } from '@/constants/routes';

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  seek: vi.fn(),
  searchParams: new URLSearchParams(),
  playbackState: {
    activeTrackId: null as string | null,
    trackTitle: null as string | null,
    artistName: null as string | null,
    duration: 0,
    currentTime: 0,
  },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push }),
  useSearchParams: () => mocks.searchParams,
}));

vi.mock('@/components/organisms/release-sidebar/useTrackAudioPlayer', () => ({
  useTrackAudioPlayer: () => ({
    playbackState: mocks.playbackState,
    seek: mocks.seek,
  }),
}));

vi.mock('@/components/shell/LyricsView', () => ({
  LyricsView: ({
    track,
    currentTimeSec,
    durationSec,
    autoFocusView,
    timed,
    timingStatus,
    seekEnabled,
    syncEnabled,
  }: {
    track: { title: string; artist?: string };
    currentTimeSec: number;
    durationSec: number;
    autoFocusView?: boolean;
    timed?: boolean;
    timingStatus?: string;
    seekEnabled?: boolean;
    syncEnabled?: boolean;
  }) => (
    <section aria-label='Lyrics view'>
      <h1>{track.title}</h1>
      <p>{track.artist}</p>
      <span data-testid='current-time'>{currentTimeSec}</span>
      <span data-testid='duration'>{durationSec}</span>
      <span data-testid='auto-focus'>{String(Boolean(autoFocusView))}</span>
      <span data-testid='timed'>{String(Boolean(timed))}</span>
      <span data-testid='timing-status'>{timingStatus}</span>
      <span data-testid='seek-enabled'>{String(Boolean(seekEnabled))}</span>
      <span data-testid='sync-enabled'>{String(Boolean(syncEnabled))}</span>
    </section>
  ),
}));

const { LyricsPageClient } = await import(
  '@/app/app/(shell)/lyrics/[trackId]/LyricsPageClient'
);

type LyricsPageClientProps = ComponentProps<typeof LyricsPageClient>;

const baseProps = {
  initialLyrics: {
    lines: [],
    provenance: { format: 'plain', offsetMs: 0, timing: 'none' },
    timed: false,
  },
  initialTrack: {
    title: 'Server Track',
    artist: 'Server Artist',
  },
  initialDurationSec: 180,
  trackId: 'track-1',
} satisfies LyricsPageClientProps;

describe('LyricsPageClient', () => {
  beforeEach(() => {
    mocks.push.mockClear();
    mocks.seek.mockClear();
    mocks.searchParams = new URLSearchParams();
    mocks.playbackState.activeTrackId = null;
    mocks.playbackState.trackTitle = null;
    mocks.playbackState.artistName = null;
    mocks.playbackState.duration = 0;
    mocks.playbackState.currentTime = 0;
  });

  it('renders the server-resolved track when audio is not active', () => {
    render(<LyricsPageClient {...baseProps} />);

    expect(
      screen.getByRole('heading', { name: 'Server Track' })
    ).toBeInTheDocument();
    expect(screen.getByText('Server Artist')).toBeInTheDocument();
    expect(screen.getByTestId('current-time')).toHaveTextContent('0');
    expect(screen.getByTestId('auto-focus')).toHaveTextContent('true');
    expect(screen.getByTestId('timed')).toHaveTextContent('false');
    expect(screen.getByTestId('timing-status')).toHaveTextContent('empty');
    expect(screen.getByTestId('seek-enabled')).toHaveTextContent('false');
    expect(screen.getByTestId('sync-enabled')).toHaveTextContent('false');
  });

  it('closes direct lyrics entry to the return route on Escape', () => {
    mocks.searchParams = new URLSearchParams(
      'from=%2Fapp%2Fchat%2Fthread-1%3Fpanel%3Dprofile'
    );

    render(<LyricsPageClient {...baseProps} />);

    fireEvent.keyDown(globalThis, { key: 'Escape' });

    expect(mocks.push).toHaveBeenCalledWith('/app/chat/thread-1?panel=profile');
  });

  it('falls back to the library when the return route is missing or loops back into lyrics', () => {
    mocks.searchParams = new URLSearchParams(
      'from=%2Fapp%2Flyrics%2Ftrack-2%3Ffrom%3D%252Fapp%252Fchat'
    );

    render(<LyricsPageClient {...baseProps} />);

    fireEvent.keyDown(globalThis, { key: 'Escape' });

    expect(mocks.push).toHaveBeenCalledWith(APP_ROUTES.LIBRARY);
  });

  it('uses active playback state and leaves Escape to the persistent player', () => {
    mocks.playbackState.activeTrackId = 'track-1';
    mocks.playbackState.trackTitle = 'Live Track';
    mocks.playbackState.artistName = 'Live Artist';
    mocks.playbackState.duration = 32;
    mocks.playbackState.currentTime = 11;

    render(<LyricsPageClient {...baseProps} />);

    expect(
      screen.getByRole('heading', { name: 'Live Track' })
    ).toBeInTheDocument();
    expect(screen.getByText('Live Artist')).toBeInTheDocument();
    expect(screen.getByTestId('current-time')).toHaveTextContent('11');

    fireEvent.keyDown(globalThis, { key: 'Escape' });

    expect(mocks.push).not.toHaveBeenCalled();
  });

  it('enables timed interaction only for server-validated timed lyrics', () => {
    const initialLyrics = {
      lines: [{ startSec: 1, text: 'Opening' }],
      provenance: {
        format: 'lrc' as const,
        offsetMs: 0,
        timing: 'line' as const,
      },
      timed: true,
    };
    const view = render(
      <LyricsPageClient {...baseProps} initialLyrics={initialLyrics} />
    );

    expect(screen.getByTestId('timed')).toHaveTextContent('true');
    expect(screen.getByTestId('seek-enabled')).toHaveTextContent('false');

    mocks.playbackState.activeTrackId = 'track-1';
    view.rerender(
      <LyricsPageClient {...baseProps} initialLyrics={initialLyrics} />
    );

    expect(screen.getByTestId('timed')).toHaveTextContent('true');
    expect(screen.getByTestId('seek-enabled')).toHaveTextContent('true');
    expect(screen.getByTestId('sync-enabled')).toHaveTextContent('true');
  });

  it('reclassifies timing against live duration and disables stale seeking', () => {
    mocks.playbackState.activeTrackId = 'track-1';
    mocks.playbackState.duration = 30;
    mocks.playbackState.currentTime = 12;

    render(
      <LyricsPageClient
        {...baseProps}
        initialDurationSec={0}
        initialLyrics={{
          lines: [
            { startSec: 1, text: 'Opening' },
            { startSec: 32, text: 'Past the live duration' },
          ],
          provenance: { format: 'lrc', offsetMs: 0, timing: 'line' },
          timed: true,
        }}
      />
    );

    expect(screen.getByTestId('duration')).toHaveTextContent('30');
    expect(screen.getByTestId('timing-status')).toHaveTextContent('stale');
    expect(screen.getByTestId('timed')).toHaveTextContent('false');
    expect(screen.getByTestId('seek-enabled')).toHaveTextContent('false');
    expect(screen.getByTestId('sync-enabled')).toHaveTextContent('false');
  });

  it('clears synchronization when queue advance changes the active track', () => {
    mocks.playbackState.activeTrackId = 'track-1';
    mocks.playbackState.duration = 180;
    mocks.playbackState.currentTime = 42;
    const view = render(
      <LyricsPageClient
        {...baseProps}
        initialLyrics={{
          lines: [{ startSec: 1, text: 'Opening' }],
          provenance: { format: 'lrc', offsetMs: 0, timing: 'line' },
          timed: true,
        }}
      />
    );

    expect(screen.getByTestId('current-time')).toHaveTextContent('42');
    expect(screen.getByTestId('sync-enabled')).toHaveTextContent('true');

    mocks.playbackState.activeTrackId = 'track-2';
    mocks.playbackState.currentTime = 9;
    view.rerender(
      <LyricsPageClient
        {...baseProps}
        initialLyrics={{
          lines: [{ startSec: 1, text: 'Opening' }],
          provenance: { format: 'lrc', offsetMs: 0, timing: 'line' },
          timed: true,
        }}
      />
    );

    expect(screen.getByTestId('current-time')).toHaveTextContent('0');
    expect(screen.getByTestId('seek-enabled')).toHaveTextContent('false');
    expect(screen.getByTestId('sync-enabled')).toHaveTextContent('false');
  });
});

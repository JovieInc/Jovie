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
    autoFocusView,
  }: {
    track: { title: string; artist?: string };
    currentTimeSec: number;
    autoFocusView?: boolean;
  }) => (
    <section aria-label='Lyrics view'>
      <h1>{track.title}</h1>
      <p>{track.artist}</p>
      <span data-testid='current-time'>{currentTimeSec}</span>
      <span data-testid='auto-focus'>{String(Boolean(autoFocusView))}</span>
    </section>
  ),
}));

const { LyricsPageClient } = await import(
  '@/app/app/(shell)/lyrics/[trackId]/LyricsPageClient'
);

type LyricsPageClientProps = ComponentProps<typeof LyricsPageClient>;

const baseProps = {
  initialLines: [],
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
});

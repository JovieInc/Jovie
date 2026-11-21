import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { TrackSidebar, type TrackSidebarData } from './TrackSidebar';

const { toggleTrack } = vi.hoisted(() => ({
  toggleTrack: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('./useTrackAudioPlayer', () => ({
  useTrackAudioPlayer: () => ({
    playbackState: {
      activeTrackId: null,
      isPlaying: false,
      playbackStatus: 'idle',
      currentTime: 0,
      duration: 0,
    },
    toggleTrack,
    seek: vi.fn(),
    onError: vi.fn().mockReturnValue(() => {}),
  }),
}));

const track: TrackSidebarData = {
  id: 'track-1',
  title: 'Midnight Echo',
  slug: 'midnight-echo',
  smartLinkPath: '/r/echo/1',
  trackNumber: 1,
  discNumber: 1,
  durationMs: 181000,
  isrc: 'USRC17607839',
  isExplicit: false,
  previewUrl: 'https://cdn.example.com/preview.mp3',
  audioUrl: null,
  audioFormat: null,
  previewSource: null,
  previewVerification: 'unknown',
  providers: [],
  releaseTitle: 'Midnight Echo (EP)',
  releaseArtworkUrl: null,
  releaseId: 'release-1',
};

describe('TrackSidebar', () => {
  it('renders the empty state without a track, axe-clean', async () => {
    const { container } = render(
      <TrackSidebar track={null} isOpen onClose={vi.fn()} />
    );
    await expectNoA11yViolations(container);
  });

  it('toggles preview playback from the assets tab, axe-clean', async () => {
    const user = userEvent.setup();
    toggleTrack.mockClear();
    const { container } = render(
      <TrackSidebar track={track} isOpen onClose={vi.fn()} />
    );
    await expectNoA11yViolations(container);
    await user.click(screen.getByRole('tab', { name: /assets/i }));
    await user.click(screen.getByRole('button', { name: 'Play preview' }));
    expect(toggleTrack).toHaveBeenCalledTimes(1);
    await expectNoA11yViolations(container);
  });
});

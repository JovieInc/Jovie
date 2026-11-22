import { TooltipProvider } from '@jovie/ui';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resetAudioChromeSnapshot } from '@/components/organisms/audio-chrome-state';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { PersistentAudioBar } from './PersistentAudioBar';

const player = vi.hoisted(() => ({
  state: {
    activeTrackId: null as string | null,
    isPlaying: false,
    playbackStatus: 'idle',
    lastErrorReason: null,
    currentTime: 0,
    duration: 0,
    trackTitle: null as string | null,
    releaseTitle: null as string | null,
    artistName: null as string | null,
    artworkUrl: null as string | null,
    hasLyrics: false,
    bpm: null,
    musicalKey: null,
    queueLength: 0,
    queueIndex: -1,
    hasNext: false,
    hasPrevious: false,
  },
  toggleTrack: vi.fn().mockResolvedValue(undefined),
  stop: vi.fn(),
}));

vi.mock('@/components/organisms/release-sidebar/useTrackAudioPlayer', () => ({
  useTrackAudioPlayer: () => ({
    playbackState: player.state,
    toggleTrack: player.toggleTrack,
    playNext: vi.fn().mockResolvedValue(undefined),
    playPrevious: vi.fn().mockResolvedValue(undefined),
    seek: vi.fn(),
    stop: player.stop,
    onError: () => () => {},
  }),
}));
vi.mock('next/navigation', () => ({
  usePathname: () => '/app',
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), prefetch: vi.fn() }),
}));
vi.mock('@/lib/hooks/useReducedMotion', () => ({
  useReducedMotion: () => true,
}));
vi.mock('@/components/atoms/TruncatedText', () => ({
  TruncatedText: ({ children }: { children: ReactNode }) => (
    <span>{children}</span>
  ),
}));
vi.mock('@/components/atoms/SeekBar', () => ({
  SeekBar: () => <input type='range' aria-label='Seek' />,
}));

function renderBar() {
  return render(
    <TooltipProvider>
      <PersistentAudioBar />
    </TooltipProvider>
  );
}

describe('PersistentAudioBar', () => {
  beforeEach(() => {
    resetAudioChromeSnapshot();
    player.toggleTrack.mockClear();
    player.stop.mockClear();
    player.state.activeTrackId = null;
    player.state.trackTitle = null;
    player.state.artistName = null;
  });

  it('renders no player controls when nothing is loaded and has no axe violations', async () => {
    const { container } = renderBar();

    expect(screen.queryByTestId('player-visibility-toggle')).toBeNull();
    await expectNoA11yViolations(container);
  });

  it('toggles the player visibility, dismisses to stop playback and has no axe violations', async () => {
    // The dock reveal is height-animated and starts with pointer-events off.
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    player.state.activeTrackId = 'track-1';
    player.state.trackTitle = 'Midnight Echo';
    player.state.artistName = 'Fixture Artist';
    const { container } = renderBar();

    const toggle = screen.getByTestId('player-visibility-toggle');
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await user.click(screen.getByTestId('audio-player-dismiss'));
    expect(player.stop).toHaveBeenCalledTimes(1);
    // jsdom applies no breakpoint CSS, so the desktop dock and the mobile bar
    // are both mounted; audit each surface on its own, as a viewport shows one.
    for (const selector of [
      '[data-shell-audio-surface="persistent-expanded"]',
      '[data-mobile-audio-surface]',
    ]) {
      const surface = container.querySelector(selector);
      expect(surface).not.toBeNull();
      await expectNoA11yViolations(surface as Element);
    }
  });
});

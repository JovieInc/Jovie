import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import {
  resetAudioChromeSnapshot,
  setAudioChromeSnapshot,
} from './audio-chrome-state';

let playbackState: Record<string, unknown> = {};

const { stop, toggleTrack } = vi.hoisted(() => ({
  stop: vi.fn(),
  toggleTrack: vi.fn(() => Promise.resolve()),
}));

vi.mock('@/components/organisms/release-sidebar/useTrackAudioPlayer', () => ({
  useTrackAudioPlayer: () => ({ playbackState, toggleTrack, stop }),
}));

import { SidebarBottomNowPlayingBridge } from './SidebarBottomNowPlayingBridge';

function activeTrack(overrides: Record<string, unknown> = {}) {
  playbackState = {
    activeTrackId: 'track-1',
    isPlaying: false,
    trackTitle: 'Lost in the Light',
    artistName: 'Bahamas',
    artworkUrl: null,
    ...overrides,
  };
}

describe('SidebarBottomNowPlayingBridge certificate', () => {
  beforeEach(() => {
    playbackState = { activeTrackId: null, trackTitle: null };
  });

  afterEach(() => {
    act(() => resetAudioChromeSnapshot());
    vi.clearAllMocks();
  });

  it('renders nothing without an active track', async () => {
    const { container } = render(<SidebarBottomNowPlayingBridge />);

    expect(container).toBeEmptyDOMElement();
    await expectNoA11yViolations(container);
  });

  it('plays, dismisses and expands the paused track, axe-clean', async () => {
    activeTrack();
    const user = userEvent.setup();
    const { container } = render(<SidebarBottomNowPlayingBridge />);

    expect(screen.getByText('Lost in the Light')).toBeInTheDocument();
    await expectNoA11yViolations(container);

    await user.click(screen.getByRole('button', { name: 'Play' }));
    expect(toggleTrack).toHaveBeenCalledWith({
      id: 'track-1',
      title: 'Lost in the Light',
    });

    await user.click(screen.getByRole('button', { name: 'Dismiss Player' }));
    expect(stop).toHaveBeenCalledTimes(1);
  });

  it('swallows a rejected toggle and keeps the row', async () => {
    activeTrack();
    toggleTrack.mockImplementationOnce(() => Promise.reject(new Error('nope')));
    const user = userEvent.setup();
    render(<SidebarBottomNowPlayingBridge />);

    await user.click(screen.getByRole('button', { name: 'Play' }));

    expect(toggleTrack).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Lost in the Light')).toBeInTheDocument();
  });

  it('hides itself from assistive tech while the full player owns the track', async () => {
    activeTrack({ isPlaying: true });
    const { container } = render(<SidebarBottomNowPlayingBridge />);

    act(() =>
      setAudioChromeSnapshot({
        activeTrackId: 'track-1',
        compactPlayerVisible: false,
        fullPlayerVisible: true,
      })
    );

    const surface = container.querySelector(
      '[data-shell-audio-surface="sidebar-compact"]'
    );
    expect(surface).toHaveAttribute('data-state', 'reserved');
    expect(surface).toHaveAttribute('aria-hidden', 'true');
    await expectNoA11yViolations(container);
  });

  it('keeps the collapsed, long and right-to-left rows axe-clean', async () => {
    activeTrack({
      isPlaying: true,
      trackTitle: 'ضائع في الضوء (نسخة ممتدة طويلة جدًا للاختبار)',
      artistName: 'ليلى حداد',
    });
    const { container } = render(
      <div dir='rtl'>
        <SidebarBottomNowPlayingBridge />
        <SidebarBottomNowPlayingBridge collapsed />
      </div>
    );

    expect(
      screen.getAllByText('ضائع في الضوء (نسخة ممتدة طويلة جدًا للاختبار)')
        .length
    ).toBeGreaterThan(0);
    await expectNoA11yViolations(container);
  });
});

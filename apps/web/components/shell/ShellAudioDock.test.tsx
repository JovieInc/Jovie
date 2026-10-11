import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  resetAudioChromeSnapshot,
  setAudioChromeSnapshot,
} from '@/components/organisms/audio-chrome-state';
import { ShellAudioDock } from './ShellAudioDock';

let mockPrefersReducedMotion = false;
vi.mock('@/lib/hooks/useReducedMotion', () => ({
  useReducedMotion: () => mockPrefersReducedMotion,
}));

function getDock() {
  return screen.getByTestId('shell-audio-dock');
}

function getDockContent() {
  return screen.getByTestId('shell-audio-dock-content');
}

function publishSnapshot(
  overrides: Partial<Parameters<typeof setAudioChromeSnapshot>[0]> = {}
) {
  act(() => {
    setAudioChromeSnapshot({
      activeTrackId: 'track-1',
      compactPlayerVisible: false,
      fullPlayerVisible: true,
      ...overrides,
    });
  });
}

describe('ShellAudioDock', () => {
  beforeEach(() => {
    mockPrefersReducedMotion = false;
    resetAudioChromeSnapshot();
  });

  it('stays collapsed while idle — zero height, hidden, inert', () => {
    render(
      <ShellAudioDock>
        <div data-testid='player'>Player</div>
      </ShellAudioDock>
    );

    const dock = getDock();
    expect(dock).toHaveAttribute('data-state', 'closed');
    expect(dock).toHaveAttribute('aria-hidden', 'true');
    // JOV-4522: the dock publishes its shared rail-motion slot so
    // certification can sample it alongside the left/right rails.
    expect(dock).toHaveAttribute('data-shell-rail-motion', 'dock');
    expect(dock.style.maxHeight).toBe('0px');
    expect(dock.style.marginTop).toBe('0px');
  });

  it('reveals with the cinematic tier when a track starts playing', () => {
    render(
      <ShellAudioDock>
        <div data-testid='player'>Player</div>
      </ShellAudioDock>
    );

    // idle → playing
    publishSnapshot();

    const dock = getDock();
    expect(dock).toHaveAttribute('data-state', 'open');
    expect(dock).toHaveAttribute('aria-hidden', 'false');
    expect(dock.style.maxHeight).toBe('var(--app-shell-audio-bar-max-height)');
    expect(dock.style.transition).toContain(
      'var(--ds-motion-cinematic-duration)'
    );
    expect(getDockContent().style.opacity).toBe('1');
    expect(getDockContent().style.pointerEvents).toBe('auto');
  });

  it('keeps the dock open when playback pauses', () => {
    render(
      <ShellAudioDock>
        <div data-testid='player'>Player</div>
      </ShellAudioDock>
    );

    publishSnapshot();
    // playing → paused: fullPlayerVisible is still true (pause keeps the
    // dock visible — only dismiss/stop collapses it).
    publishSnapshot({ fullPlayerVisible: true });

    expect(getDock()).toHaveAttribute('data-state', 'open');
    expect(getDock().style.maxHeight).toBe(
      'var(--app-shell-audio-bar-max-height)'
    );
  });

  it('collapses with the standard tier when the player is dismissed', () => {
    render(
      <ShellAudioDock>
        <div data-testid='player'>Player</div>
      </ShellAudioDock>
    );

    publishSnapshot();
    expect(getDock()).toHaveAttribute('data-state', 'open');

    // dismissed: chrome snapshot resets to the empty state.
    act(() => {
      resetAudioChromeSnapshot();
    });

    const dock = getDock();
    expect(dock).toHaveAttribute('data-state', 'closed');
    expect(dock).toHaveAttribute('aria-hidden', 'true');
    expect(dock.style.maxHeight).toBe('0px');
    // Hide is the normal tier, not the cinematic reveal tier.
    expect(dock.style.transition).toContain('var(--duration-normal)');
    expect(dock.style.transition).not.toContain(
      'var(--ds-motion-cinematic-duration)'
    );
  });

  it('collapses when the full player is hidden to the sidebar mini', () => {
    render(
      <ShellAudioDock>
        <div data-testid='player'>Player</div>
      </ShellAudioDock>
    );

    publishSnapshot();
    publishSnapshot({
      compactPlayerVisible: true,
      fullPlayerVisible: false,
    });

    expect(getDock()).toHaveAttribute('data-state', 'closed');
  });

  it('resolves instantly under prefers-reduced-motion', () => {
    mockPrefersReducedMotion = true;
    render(
      <ShellAudioDock>
        <div data-testid='player'>Player</div>
      </ShellAudioDock>
    );

    publishSnapshot();

    expect(getDock().style.transition).toBe('none');
    expect(getDockContent().style.transition).toBe('none');
    expect(getDockContent().style.transform).toBe('translateY(0)');
  });
});

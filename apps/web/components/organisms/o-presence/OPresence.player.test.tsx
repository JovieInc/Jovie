import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildLyricsRoute } from '@/constants/routes';
import { renderWithQueryClient as render } from '@/tests/utils/test-utils';
import {
  getAudioChromeSnapshot,
  publishMediaCanvasTransport,
  registerMediaCanvasTransport,
  requestFullAudioPlayer,
  resetAudioChromeSnapshot,
} from '../audio-chrome-state';
import {
  playerActions,
  playTrack,
  resetPlayback,
  setPlayback,
  visiblePlayControls,
} from './o-presence.test-harness';

vi.mock('@/components/organisms/release-sidebar/useTrackAudioPlayer', () =>
  import('./o-presence.test-harness').then(mod => mod.playerModule())
);
let pathname = '/app/library';
vi.mock('next/navigation', () => ({
  usePathname: () => pathname,
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), prefetch: vi.fn() }),
}));
vi.mock('@/lib/desktop/electron-bridge', () => ({
  isElectronRuntime: () => false,
}));
vi.mock('@/lib/service-worker/control', () => ({
  isSwEnabled: () => false,
  unregisterServiceWorker: async () => {},
  registerServiceWorker: vi.fn(),
}));
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));

const { PersistentAudioBar } = await import('../PersistentAudioBar');
const { SidebarDockBridge } = await import('../SidebarDockBridge');

const noFeed = vi.fn(async () => Response.json(null));
const canvasController = {
  toggle: vi.fn(),
  seek: vi.fn(),
  next: vi.fn(),
  previous: vi.fn(),
};

function Shell() {
  return (
    <>
      <SidebarDockBridge userId='one' collapsed={false} fetchImpl={noFeed} />
      <PersistentAudioBar />
    </>
  );
}

const sidebarO = () => document.querySelector('[data-sidebar-o-presence]');
const hidePlayer = () => screen.queryByRole('button', { name: 'Hide Player' });
const showPlayer = () => screen.queryByRole('button', { name: /Show Player/ });

function openFull() {
  act(() => requestFullAudioPlayer());
}

function publishCanvas() {
  act(() => {
    publishMediaCanvasTransport({
      title: 'Clip One',
      index: 0,
      count: 3,
      isVideo: true,
      isPlaying: true,
      currentTime: 12,
      duration: 40,
      hasNext: true,
      hasPrevious: true,
    });
  });
}

beforeEach(() => {
  resetPlayback();
  resetAudioChromeSnapshot();
  localStorage.clear();
  pathname = '/app/library';
});

describe('play lands in the O', () => {
  it('rests as the Open Chat link until audio loads', () => {
    render(<Shell />);
    expect(screen.getByRole('link', { name: 'Open Chat' })).toBeVisible();
    expect(sidebarO()).not.toHaveAttribute('data-shell-audio-surface');
    expect(visiblePlayControls()).toHaveLength(0);
  });

  it('a user-started play goes to the O and the full player does not open', () => {
    render(<Shell />);
    playTrack();
    const o = screen.getByRole('button', { name: 'Pause Midnight Drive' });
    expect(o.closest('[data-shell-audio-surface="sidebar-compact"]')).toBe(
      sidebarO()
    );
    expect(getAudioChromeSnapshot()).toMatchObject({
      activeTrackId: 'track-1',
      compactPlayerVisible: true,
      fullPlayerVisible: false,
    });
    expect(hidePlayer()).toBeNull();
    expect(screen.queryByRole('link', { name: 'Open Chat' })).toBeNull();
  });

  it('shows the title beside the O and plays or pauses from it', async () => {
    const user = userEvent.setup();
    render(<Shell />);
    playTrack();
    const expand = screen.getByRole('button', { name: /Show Player/ });
    expect(expand).toHaveAttribute('data-audio-expand-player', 'true');
    expect(expand).toHaveTextContent('Midnight Drive · Maya Vale');
    await user.click(
      screen.getByRole('button', { name: 'Pause Midnight Drive' })
    );
    expect(playerActions.toggleTrack).toHaveBeenCalledWith({
      id: 'track-1',
      title: 'Midnight Drive',
    });
    setPlayback({ isPlaying: false, playbackStatus: 'paused' });
    expect(
      screen.getByRole('button', { name: 'Play Midnight Drive' })
    ).toBeVisible();
    // The stroke engine loads lazily; the O keeps its rest glyph until then.
    await waitFor(() =>
      expect(document.querySelector('[data-os-pose]')).not.toBeNull()
    );
  });

  it('removes the dock card: audio shows in the O and nowhere in the dock', () => {
    render(<Shell />);
    playTrack();
    expect(document.querySelector('[data-dock-card="now-playing"]')).toBeNull();
  });

  it('auto-advance keeps the mini open state, and the title cross-fades', () => {
    render(<Shell />);
    playTrack();
    playTrack('track-2', 'Second Wind');
    expect(
      screen.getByRole('button', { name: 'Pause Second Wind' })
    ).toBeVisible();
    expect(getAudioChromeSnapshot().fullPlayerVisible).toBe(false);
    expect(hidePlayer()).toBeNull();
  });

  it('auto-advance keeps the full player open when it was open', () => {
    render(<Shell />);
    playTrack();
    openFull();
    expect(hidePlayer()).not.toBeNull();
    playTrack('track-2', 'Second Wind');
    expect(getAudioChromeSnapshot()).toMatchObject({
      activeTrackId: 'track-2',
      fullPlayerVisible: true,
    });
    expect(hidePlayer()).not.toBeNull();
  });

  it('keeps the open state across stop and a fresh play', () => {
    render(<Shell />);
    playTrack();
    openFull();
    setPlayback({ activeTrackId: null, trackTitle: null, isPlaying: false });
    expect(sidebarO()).not.toHaveAttribute('data-shell-audio-surface');
    playTrack('track-3', 'Third');
    expect(hidePlayer()).not.toBeNull();
  });
});

describe('one transport at a time', () => {
  const scenes: ReadonlyArray<
    readonly [string, () => void, 'sidebar' | 'dock']
  > = [
    ['mini, playing', () => playTrack(), 'sidebar'],
    [
      'mini, paused',
      () => {
        playTrack();
        setPlayback({ isPlaying: false, playbackStatus: 'paused' });
      },
      'sidebar',
    ],
    [
      'full, playing',
      () => {
        playTrack();
        openFull();
      },
      'dock',
    ],
    [
      'full, paused',
      () => {
        playTrack();
        setPlayback({ isPlaying: false, playbackStatus: 'paused' });
        openFull();
      },
      'dock',
    ],
  ];

  for (const route of ['library', 'lyrics']) {
    it.each(scenes)(`${route} route: %s`, (_name, arrange, owner) => {
      pathname =
        route === 'lyrics' ? buildLyricsRoute('track-1') : '/app/library';
      render(<Shell />);
      arrange();
      const controls = visiblePlayControls();
      expect(controls).toHaveLength(1);
      const inSidebar = controls[0].closest('[data-sidebar-o-presence]');
      expect(Boolean(inSidebar)).toBe(owner === 'sidebar');
      // The other surface is present, inert and hidden from assistive tech.
      if (owner === 'dock') {
        expect(sidebarO()).toHaveAttribute('inert');
        expect(sidebarO()).toHaveAttribute('aria-hidden', 'true');
      } else {
        expect(sidebarO()).not.toHaveAttribute('inert');
        expect(showPlayer()).not.toBeNull();
      }
    });
  }

  describe('media canvas transport', () => {
    let unregister: (() => void) | null = null;
    beforeEach(() => {
      unregister?.();
      unregister = registerMediaCanvasTransport(canvasController);
    });

    it('canvas with no audio: the dock row is the only transport', () => {
      render(<Shell />);
      publishCanvas();
      expect(visiblePlayControls()).toHaveLength(1);
      expect(visiblePlayControls()[0]).toHaveAccessibleName('Pause video');
    });

    it('canvas over the mini: the O goes inert and the canvas row is the one transport', () => {
      render(<Shell />);
      playTrack();
      expect(visiblePlayControls()).toHaveLength(1);
      publishCanvas();
      expect(visiblePlayControls()).toHaveLength(1);
      expect(visiblePlayControls()[0]).toHaveAccessibleName('Pause video');
      expect(sidebarO()).toHaveAttribute('inert');
    });
  });
});

describe('PersistentAudioBar size', () => {
  it('lost the open-on-track-change effect and got shorter than its 708-line baseline', () => {
    const source = readFileSync(
      join(__dirname, '..', 'PersistentAudioBar.tsx'),
      'utf8'
    );
    expect(source.split('\n').length - 1).toBeLessThan(708);
    expect(source).toContain('useState(false)');
    expect(source).not.toMatch(
      /useEffect\(\(\) => \{\s*setPlayerOpen\(true\);\s*\}, \[playbackState\.activeTrackId\]\)/
    );
  });
});

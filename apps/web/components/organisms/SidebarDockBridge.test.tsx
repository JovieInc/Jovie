import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DesktopUpdateViewState } from '@/lib/desktop/desktop-updates';
import { WHATS_NEW_PATH } from '@/lib/whats-new';
import { SidebarDockBridge } from './SidebarDockBridge';

const mocks = vi.hoisted(() => ({
  update: { state: 'unsupported' } as DesktopUpdateViewState,
  openModal: vi.fn(),
  stop: vi.fn(),
  toggleTrack: vi.fn(async () => {}),
  track: {
    activeTrackId: null as string | null,
    trackTitle: null as string | null,
    artistName: 'Tim White',
    artworkUrl: null,
    isPlaying: true,
  },
}));
vi.mock('./desktop-update/DesktopUpdateProvider', () => ({
  useDesktopUpdateContext: () => ({
    state: mocks.update,
    openModal: mocks.openModal,
  }),
}));
vi.mock('./release-sidebar/useTrackAudioPlayer', () => ({
  useTrackAudioPlayer: () => ({
    playbackState: mocks.track,
    stop: mocks.stop,
    toggleTrack: mocks.toggleTrack,
  }),
}));
vi.mock('./audio-chrome-state', () => ({
  useAudioChromeSnapshot: () => ({ fullPlayerVisible: false }),
  requestFullAudioPlayer: vi.fn(),
}));
vi.mock('@/lib/desktop/electron-bridge', () => ({
  isElectronRuntime: () => false,
}));
vi.mock('@/lib/service-worker/control', () => ({
  isSwEnabled: () => false,
  unregisterServiceWorker: async () => {},
  registerServiceWorker: vi.fn(),
}));

const entry = {
  id: '2026-10-15',
  title: 'Your latest releases',
  date: '2026-10-15',
  summary: '',
  url: '/changelog',
  highlights: [],
  dogfood: [],
};
const fetchFeed = vi.fn(async () =>
  Response.json({ version: 1, changelogUrl: '/changelog', entries: [entry] })
);
const props = {
  userId: 'one',
  collapsed: false,
  fetchImpl: fetchFeed,
  children: () => null,
};

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  mocks.update = { state: 'unsupported' };
  mocks.track.activeTrackId = null;
  mocks.track.trackTitle = null;
});

it('loads the newest canonical release on web and connects updater and audio actions', async () => {
  mocks.update = { state: 'ready', version: '2' };
  mocks.track.activeTrackId = 'track';
  mocks.track.trackTitle = 'Never Say A Word';
  render(<SidebarDockBridge {...props} />);
  expect(await screen.findByRole('link')).toHaveAttribute('href', '/changelog');
  expect(fetchFeed).toHaveBeenCalledWith(
    WHATS_NEW_PATH,
    expect.objectContaining({ signal: expect.any(AbortSignal) })
  );
  fireEvent.click(screen.getByRole('button', { name: 'Restart to update' }));
  expect(mocks.openModal).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
  expect(mocks.toggleTrack).toHaveBeenCalledWith({
    id: 'track',
    title: 'Never Say A Word',
  });
  fireEvent.click(screen.getByRole('button', { name: 'Dismiss Player' }));
  expect(mocks.stop).toHaveBeenCalledOnce();
});

it.each([null, { version: 2 }])(
  'silently omits malformed or empty feeds: %j',
  async value => {
    const fetchImpl = vi.fn(async () => Response.json(value));
    render(<SidebarDockBridge {...props} fetchImpl={fetchImpl} />);
    await waitFor(() => expect(fetchImpl).toHaveBeenCalledOnce());
    expect(screen.queryByRole('link')).toBeNull();
  }
);

it('aborts an outstanding feed load on unmount and handles offline', async () => {
  const fetchImpl = vi.fn<typeof fetch>(async () => {
    throw new Error('offline');
  });
  const { unmount } = render(
    <SidebarDockBridge {...props} fetchImpl={fetchImpl} />
  );
  await waitFor(() => expect(fetchImpl).toHaveBeenCalledOnce());
  const signal = (fetchImpl.mock.calls[0]?.[1] as RequestInit).signal;
  unmount();
  expect(signal?.aborted).toBe(true);
});

function installEvent() {
  const event = new Event('beforeinstallprompt');
  Object.assign(event, {
    prompt: vi.fn(async () => {}),
    userChoice: Promise.resolve({ outcome: 'accepted' }),
  });
  return event;
}

describe('PWA install within the shared dock', () => {
  it('persists dismissal through the existing PWA store across remounts', async () => {
    const first = render(<SidebarDockBridge {...props} />);
    act(() => {
      window.dispatchEvent(installEvent());
    });
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss Prompt' }));
    expect(localStorage.getItem('jv_pwa_dismissed')).toBeTruthy();
    first.unmount();
    render(<SidebarDockBridge {...props} />);
    act(() => {
      window.dispatchEvent(installEvent());
    });
    expect(screen.queryByRole('button', { name: 'Install' })).toBeNull();
  });

  it('invokes the browser install prompt and removes the installed card', async () => {
    render(<SidebarDockBridge {...props} />);
    const event = installEvent();
    act(() => {
      window.dispatchEvent(event);
    });
    fireEvent.click(screen.getByRole('button', { name: 'Install' }));
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Install' })).toBeNull()
    );
    expect(
      (event as Event & { prompt: () => void }).prompt
    ).toHaveBeenCalledOnce();
  });
});

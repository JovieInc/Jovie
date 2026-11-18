import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  installDesktopUpdateBridge,
  uninstallDesktopUpdateBridge,
} from '@/lib/desktop/desktop-updates.test-utils';
import { WHATS_NEW_PATH } from '@/lib/whats-new';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { SidebarDockBridge } from './SidebarDockBridge';

const mocks = vi.hoisted(() => ({
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
  uninstallDesktopUpdateBridge();
  mocks.track.activeTrackId = null;
  mocks.track.trackTitle = null;
});

it('queues the newest release behind the updater while preserving audio actions', async () => {
  const { bridge, emit } = installDesktopUpdateBridge({
    state: 'available',
    version: '2',
    releaseDate: null,
    notesUrl: '/changelog',
  });
  mocks.track.activeTrackId = 'track';
  mocks.track.trackTitle = 'Never Say A Word';
  render(<SidebarDockBridge {...props} />);
  await waitFor(() => expect(fetchFeed).toHaveBeenCalledOnce());
  expect(screen.queryByRole('link')).toBeNull();
  expect(fetchFeed).toHaveBeenCalledWith(
    WHATS_NEW_PATH,
    expect.objectContaining({ signal: expect.any(AbortSignal) })
  );
  expect(
    await screen.findByRole('button', { name: 'Download update' })
  ).toBeVisible();
  expect(bridge.download).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
  expect(mocks.toggleTrack).toHaveBeenCalledWith({
    id: 'track',
    title: 'Never Say A Word',
  });
  fireEvent.click(screen.getByRole('button', { name: 'Dismiss Player' }));
  expect(mocks.stop).toHaveBeenCalledOnce();
  act(() => emit({ state: 'not-available' }));
  expect(await screen.findByRole('link')).toHaveAttribute('href', '/changelog');
  expect(screen.queryByRole('button', { name: 'Download update' })).toBeNull();
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
    await screen.findByRole('link');
    act(() => {
      window.dispatchEvent(installEvent());
    });
    expect(screen.queryByRole('button', { name: 'Install' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: "Dismiss what's new" }));
    await screen.findByRole('button', { name: 'Install' });
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
    await screen.findByRole('link');
    const event = installEvent();
    act(() => {
      window.dispatchEvent(event);
    });
    expect(screen.queryByRole('button', { name: 'Install' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: "Dismiss what's new" }));
    fireEvent.click(await screen.findByRole('button', { name: 'Install' }));
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Install' })).toBeNull()
    );
    expect(
      (event as Event & { prompt: () => void }).prompt
    ).toHaveBeenCalledOnce();
  });
});

it('suppresses a what-is-new entry whose action the user already completed', async () => {
  const claimEntry = {
    ...entry,
    id: '2026-10-16',
    title: 'Choose your Jovie link',
  };
  const fetchImpl = vi.fn(async () =>
    Response.json({
      version: 1,
      changelogUrl: '/changelog',
      entries: [claimEntry],
    })
  );
  const { unmount } = render(
    <SidebarDockBridge
      {...props}
      fetchImpl={fetchImpl}
      userState={{ hasClaimedHandle: false }}
    />
  );
  expect(await screen.findByRole('link')).toBeInTheDocument();
  unmount();

  render(
    <SidebarDockBridge
      {...props}
      fetchImpl={fetchImpl}
      userState={{ hasClaimedHandle: true }}
    />
  );
  await waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(2));
  await new Promise(resolve => setTimeout(resolve, 50));
  expect(screen.queryByRole('link')).toBeNull();
});

describe('SidebarDockBridge accessibility', () => {
  const feedWith = (title: string) =>
    vi.fn(async () =>
      Response.json({
        version: 1,
        changelogUrl: '/changelog',
        entries: [{ ...entry, title }],
      })
    );

  it.each([
    ['latest release', 'Your latest releases'],
    [
      'long release title',
      'Release planning for extraordinarily long album titles, deluxe anniversary remastered editions and every territory',
    ],
  ])('has no axe violations with the %s card', async (_label, title) => {
    const { container } = render(
      <SidebarDockBridge {...props} fetchImpl={feedWith(title)} />
    );
    expect(await screen.findByRole('link')).toHaveAttribute(
      'href',
      '/changelog'
    );
    await expectNoA11yViolations(container);
  });

  it('has no axe violations in a right-to-left rail', async () => {
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <SidebarDockBridge {...props} fetchImpl={feedWith('أحدث إصداراتك')} />
      </div>
    );
    expect(await screen.findByRole('link')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it.each([
    ['empty feed', async () => Response.json({ version: 1, entries: [] })],
    ['failed feed', async () => new Response(null, { status: 503 })],
  ])('has no axe violations with an %s', async (_label, impl) => {
    const fetchImpl = vi.fn(impl);
    const { container } = render(
      <SidebarDockBridge {...props} fetchImpl={fetchImpl} />
    );
    await waitFor(() => expect(fetchImpl).toHaveBeenCalledOnce());
    expect(screen.queryByRole('link')).toBeNull();
    await expectNoA11yViolations(container);
  });
});

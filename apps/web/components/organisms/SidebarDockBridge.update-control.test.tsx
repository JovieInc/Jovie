import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  downloadingUpdate,
  installDesktopUpdateBridge,
  uninstallDesktopUpdateBridge,
} from '@/lib/desktop/desktop-updates.test-utils';
import { SidebarDockBridge } from './SidebarDockBridge';

vi.mock('./release-sidebar/useTrackAudioPlayer', () => ({
  useTrackAudioPlayer: () => ({
    playbackState: { activeTrackId: null, trackTitle: null },
    stop: vi.fn(),
    toggleTrack: vi.fn(),
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

const READY = { state: 'ready', version: '26.11.12' } as const;
const props = {
  userId: 'one',
  collapsed: false,
  fetchImpl: vi.fn(async () => Response.json(null)),
  children: () => null,
};

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  uninstallDesktopUpdateBridge();
});
afterEach(uninstallDesktopUpdateBridge);

it('renders the update control in the dock and restarts in place', async () => {
  const { bridge } = installDesktopUpdateBridge(READY);
  const { container } = render(<SidebarDockBridge {...props} />);

  const control = await screen.findByTestId('desktop-update-control');
  expect(control).toHaveAttribute('data-state', 'ready');
  const card = container.querySelector('[data-dock-card="update"]');
  expect(card).toContainElement(control);
  // The control's button is the card's only one: no collapse, no dismiss.
  expect(card?.querySelectorAll('button')).toHaveLength(1);

  const restart = screen.getByRole('button', { name: 'Restart to update' });
  await act(async () => {
    fireEvent.click(restart);
  });
  expect(bridge.install).toHaveBeenCalledOnce();
  expect(control).toHaveAttribute('data-state', 'restarting');
  expect(screen.getByRole('button', { name: 'Restart to update' })).toBe(
    restart
  );
  expect(restart).toHaveAttribute('aria-busy', 'true');
});

it('follows pushed updater phases inside the same dock card', async () => {
  const { emit } = installDesktopUpdateBridge({ state: 'idle' });
  const { container } = render(<SidebarDockBridge {...props} />);
  await waitFor(() =>
    expect(container.querySelector('[data-sidebar-dock]')).not.toBeNull()
  );
  expect(container.querySelector('[data-dock-card="update"]')).toBeNull();

  act(() =>
    emit({
      state: 'available',
      version: '26.11.12',
      releaseDate: null,
      notesUrl: '/changelog',
    })
  );
  const control = await screen.findByTestId('desktop-update-control');
  const card = container.querySelector('[data-dock-card="update"]');
  expect(control).toHaveAttribute('data-state', 'available');

  act(() => emit(downloadingUpdate(42)));
  expect(control).toHaveAttribute('data-state', 'downloading');
  expect(
    screen.getByRole('progressbar', { name: 'Download Progress' })
  ).toHaveAttribute('aria-valuenow', '42');

  act(() => emit(READY));
  expect(control).toHaveAttribute('data-state', 'ready');
  expect(container.querySelector('[data-dock-card="update"]')).toBe(card);

  act(() => emit({ state: 'not-available' }));
  expect(control).toHaveAttribute('data-state', 'ready');
});

it('shows nothing in a browser tab', async () => {
  const { container } = render(<SidebarDockBridge {...props} />);
  await waitFor(() => expect(props.fetchImpl).toHaveBeenCalledOnce());
  expect(container.querySelector('[data-dock-card="update"]')).toBeNull();
});

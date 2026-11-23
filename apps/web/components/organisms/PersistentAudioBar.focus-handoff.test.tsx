import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
import { renderWithQueryClient as render } from '@/tests/utils/test-utils';
import {
  requestFullAudioPlayer,
  resetAudioChromeSnapshot,
} from './audio-chrome-state';
import { playTrack, resetPlayback } from './o-presence/o-presence.test-harness';

vi.mock('@/components/organisms/release-sidebar/useTrackAudioPlayer', () =>
  import('./o-presence/o-presence.test-harness').then(mod => mod.playerModule())
);
vi.mock('next/navigation', () => ({
  usePathname: () => '/app/library',
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

const { PersistentAudioBar } = await import('./PersistentAudioBar');
const { SidebarDockBridge } = await import('./SidebarDockBridge');

const noFeed = vi.fn(async () => Response.json(null));

beforeEach(() => {
  resetPlayback();
  resetAudioChromeSnapshot();
  localStorage.clear();
});

// On main the only element carrying data-shell-audio-surface="sidebar-compact"
// was the dead SidebarBottomNowPlayingBridge, so with the live sidebar mounted
// the full -> mini handoff found no target and keyboard focus fell to <body>.
it('lands keyboard focus on the sidebar mini when the full player hides', async () => {
  const user = userEvent.setup({ pointerEventsCheck: 0 });
  render(
    <>
      <SidebarDockBridge userId='one' collapsed={false} fetchImpl={noFeed} />
      <PersistentAudioBar />
    </>
  );
  playTrack();
  // Open the full player the way the sidebar's Show Player does.
  act(() => requestFullAudioPlayer());
  const hide = await screen.findByRole('button', { name: 'Hide Player' });
  hide.focus();
  expect(hide).toHaveFocus();

  await user.keyboard('{Enter}');

  await waitFor(() => {
    const focused = document.activeElement;
    expect(focused).not.toBe(document.body);
    expect(
      focused?.closest('[data-shell-audio-surface="sidebar-compact"]')
    ).not.toBeNull();
    expect(focused).toHaveAttribute('data-audio-expand-player', 'true');
  });
});

it('hands focus back to Hide Player when the sidebar mini expands', async () => {
  const user = userEvent.setup({ pointerEventsCheck: 0 });
  render(
    <>
      <SidebarDockBridge userId='one' collapsed={false} fetchImpl={noFeed} />
      <PersistentAudioBar />
    </>
  );
  playTrack();
  const show = await screen.findByRole('button', { name: /Show Player/ });
  show.focus();
  await user.keyboard('{Enter}');
  const hide = await screen.findByRole('button', { name: 'Hide Player' });
  await waitFor(() => expect(hide).toHaveFocus());
});

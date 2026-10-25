/**
 * @vitest-environment jsdom
 * JOV-6683: the update modal opens once per version when an update becomes
 * available, "Later" snoozes that version, and web builds render nothing.
 * JOV-9023: "Later" on the ready prompt also snoozes that version, so a
 * workspace switch (which remounts this provider) cannot re-present it.
 */

import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { banner } from '@/components/feedback/banner-store';
import {
  availableUpdate as available,
  downloadingUpdate,
  installDesktopUpdateBridge as installBridge,
  uninstallDesktopUpdateBridge,
} from '@/lib/desktop/desktop-updates.test-utils';
import {
  DesktopUpdateProvider,
  useDesktopUpdateContext,
} from './DesktopUpdateProvider';

function ContextProbe() {
  const ctx = useDesktopUpdateContext();
  return (
    <div>
      <span data-testid='update-state'>{ctx?.state.state ?? 'no-context'}</span>
      <button type='button' onClick={() => ctx?.openModal()}>
        Open modal
      </button>
    </div>
  );
}

beforeEach(() => {
  banner.dismiss();
  uninstallDesktopUpdateBridge();
  window.sessionStorage.clear();
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(
          JSON.stringify({ summary: 'Ship it', items: ['Faster sync'] }),
          { status: 200 }
        )
    )
  );
});

afterEach(() => {
  uninstallDesktopUpdateBridge();
  vi.unstubAllGlobals();
});

describe('DesktopUpdateProvider', () => {
  it('renders nothing update-related on web (no bridge)', async () => {
    render(
      <DesktopUpdateProvider>
        <ContextProbe />
      </DesktopUpdateProvider>
    );
    expect(screen.getByTestId('update-state')).toHaveTextContent('unsupported');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('auto-opens once per version and Later snoozes it', async () => {
    const { emit } = installBridge({ state: 'idle' });
    render(
      <DesktopUpdateProvider>
        <ContextProbe />
      </DesktopUpdateProvider>
    );

    act(() => emit(available('26.9.16')));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Jovie 26.9.16 Is Available')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Later' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    );

    // Same version stays snoozed.
    act(() => emit({ state: 'checking' }));
    act(() => emit(available('26.9.16')));
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    );

    // A new version reopens.
    act(() => emit({ state: 'checking' }));
    act(() => emit(available('26.9.17')));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();

    // The download phase carries no version; the modal keeps the accepted one.
    act(() => emit(downloadingUpdate(10)));
    expect(
      await screen.findByText('Downloading Jovie 26.9.17')
    ).toBeInTheDocument();
  });

  it('keeps a ready-prompt Later dismissed across a remount until a newer version', async () => {
    // JOV-9023: a workspace switch remounts the provider. "Later" pressed on
    // the ready prompt must record that version, so the re-check that follows
    // (which replays available for the same build) cannot interrupt again.
    const { emit } = installBridge({ state: 'idle' });
    const view = render(
      <DesktopUpdateProvider>
        <ContextProbe />
      </DesktopUpdateProvider>
    );

    act(() => emit(available('26.10.17')));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Download' }));
    act(() => emit(downloadingUpdate(50)));
    act(() => emit({ state: 'ready', version: '26.10.17' }));
    expect(
      await screen.findByText('Jovie 26.10.17 Is Ready')
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Later' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    );
    // The ready prompt records its version like the available prompt does.
    expect(
      window.sessionStorage.getItem('jovie:desktop-update:dismissed')
    ).toBe('26.10.17');

    // Workspace switch: the shell remounts this provider in the same session.
    view.unmount();
    render(
      <DesktopUpdateProvider>
        <ContextProbe />
      </DesktopUpdateProvider>
    );
    // A re-check replays available for the same version before ready
    // returns; each phase must flush so the replay is actually observed.
    act(() => emit({ state: 'checking' }));
    act(() => emit(available('26.10.17')));
    act(() => emit({ state: 'ready', version: '26.10.17' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    // A newer version still opens once.
    act(() => emit({ state: 'checking' }));
    act(() => emit(available('26.10.18')));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Jovie 26.10.18 Is Available')).toBeInTheDocument();
  });

  it('queues a passive update behind permission but permits explicit update recovery', async () => {
    const { emit } = installBridge({ state: 'idle' });
    render(
      <DesktopUpdateProvider>
        <ContextProbe />
      </DesktopUpdateProvider>
    );
    act(() => {
      banner.warning('Review notification permission', { id: 'permission' });
      emit(available('26.10.16'));
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(banner.getActiveBanner()?.id).toBe('permission');
    act(() => banner.dismiss('permission'));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Later' }));
    act(() => {
      emit({ state: 'error', message: 'offline', retryable: true });
      banner.error('Update failed', { id: 'sidebar-update-error' });
    });
    await userEvent.click(screen.getByRole('button', { name: 'Open modal' }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(banner.getActiveBanner()?.id).toBe('desktop-update-modal');
    expect(
      banner.getBanners().some(item => item.id === 'sidebar-update-error')
    ).toBe(true);
  });

  it('opens from the context trigger and retries after an error', async () => {
    const { bridge, emit } = installBridge({ state: 'idle' });
    render(
      <DesktopUpdateProvider>
        <ContextProbe />
      </DesktopUpdateProvider>
    );

    act(() => emit({ state: 'error', message: 'offline', retryable: true }));
    await userEvent.click(screen.getByRole('button', { name: 'Open modal' }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Try Again' }));
    expect(bridge.check).toHaveBeenCalledTimes(1);

    act(() => emit(downloadingUpdate(42)));
    expect(await screen.findByRole('progressbar')).toBeInTheDocument();
  });
});

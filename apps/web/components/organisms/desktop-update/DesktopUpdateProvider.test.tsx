/**
 * @vitest-environment jsdom
 * JOV-6683: the update modal opens once per version when an update becomes
 * available, "Later" snoozes that version, and web builds render nothing.
 */

import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

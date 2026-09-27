/**
 * @vitest-environment jsdom
 *
 * JOV-6683: the update modal opens once per version when an update becomes
 * available, "Later" snoozes that version, and web builds render nothing.
 */

import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  DesktopUpdatePhase,
  JovieDesktopUpdatesBridge,
} from '@/lib/desktop/desktop-updates';
import {
  DesktopUpdateProvider,
  useDesktopUpdateContext,
} from './DesktopUpdateProvider';

type StateListener = (phase: unknown) => void;
const NOTES_URL = 'https://jov.ie/changelog';

function installBridge(initial: DesktopUpdatePhase | null = null) {
  const listeners = new Set<StateListener>();
  const bridge: JovieDesktopUpdatesBridge = {
    getState: vi.fn(async () => initial),
    check: vi.fn(async () => ({ ok: true })),
    download: vi.fn(async () => ({ ok: true })),
    install: vi.fn(async () => ({ ok: true })),
    onState: vi.fn((cb: StateListener) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    }),
  };
  Object.defineProperty(window, 'jovieDesktop', {
    configurable: true,
    writable: true,
    value: { updates: bridge },
  });
  return {
    bridge,
    emit(phase: DesktopUpdatePhase) {
      for (const cb of listeners) cb(phase);
    },
  };
}

function available(version: string): DesktopUpdatePhase {
  return {
    state: 'available',
    version,
    releaseDate: '2026-09-27T00:00:00.000Z',
    notesUrl: NOTES_URL,
  };
}

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
  Reflect.deleteProperty(window, 'jovieDesktop');
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
  Reflect.deleteProperty(window, 'jovieDesktop');
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
    expect(screen.getByText('Jovie 26.9.16 is available')).toBeInTheDocument();

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

    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(bridge.check).toHaveBeenCalledTimes(1);

    act(() =>
      emit({
        state: 'downloading',
        percent: 42,
        transferredBytes: 1,
        totalBytes: 2,
        bytesPerSecond: 1,
      })
    );
    expect(await screen.findByRole('progressbar')).toBeInTheDocument();
  });
});

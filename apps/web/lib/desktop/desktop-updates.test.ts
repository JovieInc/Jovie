/**
 * @vitest-environment jsdom
 *
 * JOV-6683: the typed desktop updater bridge. Without `window.jovieDesktop`
 * (web builds, stale binaries) the hook reports 'unsupported' and callers
 * render nothing.
 */

import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  type DesktopUpdatePhase,
  type JovieDesktopUpdatesBridge,
  useDesktopUpdate,
} from './desktop-updates';

type StateListener = (phase: unknown) => void;

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

beforeEach(() => {
  Reflect.deleteProperty(window, 'jovieDesktop');
});

afterEach(() => {
  Reflect.deleteProperty(window, 'jovieDesktop');
});

describe('useDesktopUpdate', () => {
  it('returns unsupported when the bridge is missing', () => {
    const { result } = renderHook(() => useDesktopUpdate());
    expect(result.current.state).toEqual({ state: 'unsupported' });
  });

  it('returns unsupported when the bridge is partial', () => {
    Object.defineProperty(window, 'jovieDesktop', {
      configurable: true,
      writable: true,
      value: { updates: { check: () => Promise.resolve() } },
    });
    const { result } = renderHook(() => useDesktopUpdate());
    expect(result.current.state).toEqual({ state: 'unsupported' });
  });

  it('loads the current phase and subscribes to changes', async () => {
    const { emit } = installBridge({
      state: 'available',
      version: '26.9.16',
      releaseDate: null,
      notesUrl: 'https://jov.ie/changelog',
    });
    const { result } = renderHook(() => useDesktopUpdate());

    await waitFor(() => expect(result.current.state.state).toBe('available'));

    act(() =>
      emit({
        state: 'downloading',
        percent: 42,
        transferredBytes: 1,
        totalBytes: 2,
        bytesPerSecond: 1,
      })
    );
    expect(result.current.state).toMatchObject({
      state: 'downloading',
      percent: 42,
    });
  });

  it('drives error → retry → downloading', async () => {
    const { bridge, emit } = installBridge({ state: 'idle' });
    const { result } = renderHook(() => useDesktopUpdate());
    await waitFor(() => expect(result.current.state.state).toBe('idle'));

    act(() => emit({ state: 'error', message: 'offline', retryable: true }));
    expect(result.current.state.state).toBe('error');

    act(() => result.current.check());
    expect(bridge.check).toHaveBeenCalledTimes(1);

    act(() => emit({ state: 'checking' }));
    act(() =>
      emit({
        state: 'available',
        version: '26.9.16',
        releaseDate: null,
        notesUrl: 'https://jov.ie/changelog',
      })
    );
    act(() => result.current.download());
    expect(bridge.download).toHaveBeenCalledTimes(1);

    act(() =>
      emit({
        state: 'downloading',
        percent: 10,
        transferredBytes: 1,
        totalBytes: 10,
        bytesPerSecond: 1,
      })
    );
    expect(result.current.state).toMatchObject({ state: 'downloading' });
  });
});

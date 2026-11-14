/**
 * @vitest-environment jsdom
 */

import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DESKTOP_UPDATE_CHECK_TIMEOUT_MS,
  DESKTOP_UPDATE_RESTART_TIMEOUT_MS,
} from './desktop-update-control-state';
import {
  availableUpdate,
  downloadingUpdate,
  installDesktopUpdateBridge,
  uninstallDesktopUpdateBridge,
} from './desktop-updates.test-utils';
import { useDesktopUpdateState } from './useDesktopUpdateState';

const VERSION = '26.11.12';
const READY = { state: 'ready', version: VERSION } as const;
const ERROR = { state: 'error', message: 'boom', retryable: true } as const;

function setOnline(online: boolean) {
  Object.defineProperty(window.navigator, 'onLine', {
    configurable: true,
    get: () => online,
  });
}

beforeEach(() => {
  uninstallDesktopUpdateBridge();
  setOnline(true);
});
afterEach(() => {
  vi.useRealTimers();
  uninstallDesktopUpdateBridge();
  setOnline(true);
});

describe('useDesktopUpdateState', () => {
  it('stays hidden without the desktop bridge', () => {
    const { result } = renderHook(() => useDesktopUpdateState());
    expect(result.current.state).toEqual({ kind: 'hidden' });
    // No bridge: the actions are inert rather than throwing.
    act(() => {
      result.current.download();
      result.current.restart();
      result.current.retry();
    });
    expect(result.current.state).toEqual({ kind: 'hidden' });
  });

  it('reads the current phase, then follows every pushed phase', async () => {
    const { emit } = installDesktopUpdateBridge(availableUpdate(VERSION));
    const { result } = renderHook(() => useDesktopUpdateState());
    await waitFor(() =>
      expect(result.current.state).toEqual({
        kind: 'available',
        version: VERSION,
      })
    );

    act(() => emit(downloadingUpdate(42)));
    expect(result.current.state).toEqual({
      kind: 'downloading',
      version: VERSION,
      percent: 42,
    });

    act(() => emit(READY));
    expect(result.current.state).toEqual({ kind: 'ready', version: VERSION });

    act(() => emit({ state: 'checking' }));
    act(() => emit({ state: 'not-available' }));
    expect(result.current.state).toEqual({ kind: 'ready', version: VERSION });
  });

  it('prefers a pushed phase over a slower first snapshot', async () => {
    const { bridge, emit } = installDesktopUpdateBridge();
    let resolveSnapshot: (value: unknown) => void = () => undefined;
    vi.mocked(bridge.getState).mockReturnValue(
      new Promise(resolve => {
        resolveSnapshot = resolve;
      })
    );
    const { result } = renderHook(() => useDesktopUpdateState());
    act(() => emit(READY));
    await act(async () => resolveSnapshot(availableUpdate(VERSION)));
    expect(result.current.state).toEqual({ kind: 'ready', version: VERSION });
  });

  it('ignores malformed phases', async () => {
    const { bridge } = installDesktopUpdateBridge(READY);
    const { result } = renderHook(() => useDesktopUpdateState());
    await waitFor(() => expect(result.current.state.kind).toBe('ready'));
    const push = vi.mocked(bridge.onState).mock.calls[0]?.[0];
    act(() => push?.({ state: 'exploded' }));
    act(() => push?.(null));
    expect(result.current.state).toEqual({ kind: 'ready', version: VERSION });
  });

  it('asks the main process to download a waiting update', async () => {
    const { bridge } = installDesktopUpdateBridge(availableUpdate(VERSION));
    const { result } = renderHook(() => useDesktopUpdateState());
    await waitFor(() => expect(result.current.state.kind).toBe('available'));
    act(() => result.current.download());
    expect(bridge.download).toHaveBeenCalledTimes(1);
  });

  it('restarts through quitAndInstall and shows restarting until it quits', async () => {
    const { bridge, emit } = installDesktopUpdateBridge(READY);
    const { result } = renderHook(() => useDesktopUpdateState());
    await waitFor(() => expect(result.current.state.kind).toBe('ready'));

    await act(async () => result.current.restart());
    expect(bridge.install).toHaveBeenCalledTimes(1);
    expect(result.current.state).toEqual({
      kind: 'restarting',
      version: VERSION,
    });

    // A second press and a background check cannot disturb the restart.
    await act(async () => result.current.restart());
    act(() => emit({ state: 'checking' }));
    expect(bridge.install).toHaveBeenCalledTimes(1);
    expect(result.current.state.kind).toBe('restarting');
  });

  it('fails a rejected restart and retries the restart', async () => {
    const { bridge } = installDesktopUpdateBridge(READY);
    vi.mocked(bridge.install).mockResolvedValueOnce({
      ok: false,
      reason: 'invalid-request',
    });
    const { result } = renderHook(() => useDesktopUpdateState());
    await waitFor(() => expect(result.current.state.kind).toBe('ready'));

    await act(async () => result.current.restart());
    expect(result.current.state).toEqual({
      kind: 'failed',
      retry: 'restart',
      version: VERSION,
    });

    await act(async () => result.current.retry());
    expect(bridge.install).toHaveBeenCalledTimes(2);
    expect(bridge.check).not.toHaveBeenCalled();
    expect(result.current.state.kind).toBe('restarting');
  });

  it('re-checks when the staged build is gone', async () => {
    const { bridge } = installDesktopUpdateBridge(READY);
    vi.mocked(bridge.install).mockResolvedValueOnce({
      ok: false,
      reason: 'update-not-downloaded',
    });
    const { result } = renderHook(() => useDesktopUpdateState());
    await waitFor(() => expect(result.current.state.kind).toBe('ready'));

    await act(async () => result.current.restart());
    expect(result.current.state).toMatchObject({
      kind: 'failed',
      retry: 'check',
    });

    await act(async () => result.current.retry());
    expect(bridge.check).toHaveBeenCalledTimes(1);
    expect(result.current.state).toEqual({ kind: 'checking' });
  });

  it('fails a restart whose IPC throws', async () => {
    const { bridge } = installDesktopUpdateBridge(READY);
    vi.mocked(bridge.install).mockRejectedValueOnce(new Error('ipc closed'));
    const { result } = renderHook(() => useDesktopUpdateState());
    await waitFor(() => expect(result.current.state.kind).toBe('ready'));
    await act(async () => result.current.restart());
    expect(result.current.state).toMatchObject({
      kind: 'failed',
      retry: 'restart',
    });
  });

  it('fails a restart that never quits the app', async () => {
    installDesktopUpdateBridge(READY);
    const { result } = renderHook(() => useDesktopUpdateState());
    await waitFor(() => expect(result.current.state.kind).toBe('ready'));
    vi.useFakeTimers();
    await act(async () => result.current.restart());
    act(() => {
      vi.advanceTimersByTime(DESKTOP_UPDATE_RESTART_TIMEOUT_MS - 1);
    });
    expect(result.current.state.kind).toBe('restarting');
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current.state).toEqual({
      kind: 'failed',
      retry: 'restart',
      version: VERSION,
    });
  });

  it('drives a failed download through retry back to downloading', async () => {
    const { bridge, emit } = installDesktopUpdateBridge(
      availableUpdate(VERSION)
    );
    const { result } = renderHook(() => useDesktopUpdateState());
    await waitFor(() => expect(result.current.state.kind).toBe('available'));

    act(() => emit(downloadingUpdate(10)));
    act(() => emit(ERROR));
    expect(result.current.state).toEqual({
      kind: 'failed',
      retry: 'check',
      version: VERSION,
    });

    await act(async () => result.current.retry());
    expect(bridge.check).toHaveBeenCalledTimes(1);
    expect(result.current.state).toEqual({ kind: 'checking' });

    act(() => emit({ state: 'checking' }));
    act(() => emit(availableUpdate(VERSION)));
    act(() => emit(downloadingUpdate(3)));
    expect(result.current.state).toMatchObject({
      kind: 'downloading',
      percent: 3,
    });
  });

  it('fails a requested check the main process rejects or never answers', async () => {
    const { bridge, emit } = installDesktopUpdateBridge(
      availableUpdate(VERSION)
    );
    const { result } = renderHook(() => useDesktopUpdateState());
    await waitFor(() => expect(result.current.state.kind).toBe('available'));
    act(() => emit(ERROR));

    vi.mocked(bridge.check).mockResolvedValueOnce({
      ok: false,
      reason: 'invalid-request',
    });
    await act(async () => result.current.retry());
    expect(result.current.state).toMatchObject({
      kind: 'failed',
      retry: 'check',
    });

    vi.useFakeTimers();
    await act(async () => result.current.retry());
    expect(result.current.state).toEqual({ kind: 'checking' });
    act(() => {
      vi.advanceTimersByTime(DESKTOP_UPDATE_CHECK_TIMEOUT_MS);
    });
    expect(result.current.state).toMatchObject({
      kind: 'failed',
      retry: 'check',
    });
  });

  it('goes offline on a network failure and re-checks when back online', async () => {
    const { bridge, emit } = installDesktopUpdateBridge(
      availableUpdate(VERSION)
    );
    const { result } = renderHook(() => useDesktopUpdateState());
    await waitFor(() => expect(result.current.state.kind).toBe('available'));

    setOnline(false);
    act(() => emit(ERROR));
    expect(result.current.state).toEqual({ kind: 'offline' });
    expect(bridge.check).not.toHaveBeenCalled();

    setOnline(true);
    await act(async () => {
      window.dispatchEvent(new Event('online'));
    });
    expect(bridge.check).toHaveBeenCalledTimes(1);
    expect(result.current.state).toEqual({ kind: 'checking' });
  });

  it('does not check on reconnect when nothing was waiting', async () => {
    const { bridge } = installDesktopUpdateBridge(READY);
    const { result } = renderHook(() => useDesktopUpdateState());
    await waitFor(() => expect(result.current.state.kind).toBe('ready'));
    await act(async () => {
      window.dispatchEvent(new Event('offline'));
      window.dispatchEvent(new Event('online'));
    });
    expect(bridge.check).not.toHaveBeenCalled();
    expect(result.current.state.kind).toBe('ready');
  });
});

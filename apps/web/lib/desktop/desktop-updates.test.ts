/**
 * @vitest-environment jsdom
 * JOV-6683: the typed desktop updater bridge; no bridge → 'unsupported'.
 */

import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useDesktopUpdate } from './desktop-updates';
import {
  availableUpdate,
  downloadingUpdate,
  installDesktopUpdateBridge as installBridge,
  uninstallDesktopUpdateBridge,
} from './desktop-updates.test-utils';

beforeEach(uninstallDesktopUpdateBridge);
afterEach(uninstallDesktopUpdateBridge);

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
    const { emit } = installBridge(availableUpdate('26.9.16'));
    const { result } = renderHook(() => useDesktopUpdate());

    await waitFor(() => expect(result.current.state.state).toBe('available'));

    act(() => emit(downloadingUpdate(42)));
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
    act(() => emit(availableUpdate('26.9.16')));
    act(() => result.current.download());
    expect(bridge.download).toHaveBeenCalledTimes(1);

    act(() => emit(downloadingUpdate(10)));
    expect(result.current.state).toMatchObject({ state: 'downloading' });
  });
});

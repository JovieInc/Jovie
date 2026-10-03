import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { reportDesktopWorkState } from './electron-bridge';
import {
  beginDesktopWorkOperation,
  DESKTOP_WORK_HEARTBEAT_MS,
  getDesktopWorkState,
  subscribeDesktopWorkState,
  useDesktopWorkState,
} from './session-work-state';

vi.mock('./electron-bridge', () => ({
  reportDesktopWorkState: vi.fn(() => true),
}));

const idle = {
  hasDraft: false,
  isStreaming: false,
  isUploading: false,
  hasPendingAction: false,
  isAuthenticating: false,
};

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.mocked(reportDesktopWorkState).mockReset().mockReturnValue(true);
});

describe('desktop work owner', () => {
  it('publishes operations synchronously and releases concurrent work independently', () => {
    renderHook(() => useDesktopWorkState(idle));
    const first = beginDesktopWorkOperation('pending-action');
    const second = beginDesktopWorkOperation('pending-action');
    const auth = beginDesktopWorkOperation('authentication');
    try {
      expect(reportDesktopWorkState).toHaveBeenLastCalledWith({
        ...idle,
        hasPendingAction: true,
        isAuthenticating: true,
      });
      first();
      first();
      expect(getDesktopWorkState()?.hasPendingAction).toBe(true);
      second();
      expect(getDesktopWorkState()).toEqual({
        ...idle,
        isAuthenticating: true,
      });
      auth();
      expect(getDesktopWorkState()).toEqual(idle);
    } finally {
      first();
      second();
      auth();
    }
  });

  it('never creates idle ownership or a heartbeat for an operation alone', () => {
    vi.useFakeTimers();
    const finish = beginDesktopWorkOperation('pending-action');
    try {
      expect(getDesktopWorkState()).toBeNull();
      expect(vi.getTimerCount()).toBe(0);
      const owner = renderHook(() => useDesktopWorkState(idle));
      expect(getDesktopWorkState()?.hasPendingAction).toBe(true);
      owner.unmount();
      expect(getDesktopWorkState()).toBeNull();
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      finish();
    }
    expect(getDesktopWorkState()).toBeNull();
    renderHook(() => useDesktopWorkState(idle));
    expect(getDesktopWorkState()).toEqual(idle);
  });

  it('uses the mounted heartbeat for the current operation aggregate', () => {
    vi.useFakeTimers();
    const owner = renderHook(() => useDesktopWorkState(idle));
    const finish = beginDesktopWorkOperation('pending-action');
    try {
      expect(vi.getTimerCount()).toBe(1);
      act(() => vi.advanceTimersByTime(DESKTOP_WORK_HEARTBEAT_MS));
      expect(reportDesktopWorkState).toHaveBeenLastCalledWith({
        ...idle,
        hasPendingAction: true,
      });
      finish();
      act(() => vi.advanceTimersByTime(DESKTOP_WORK_HEARTBEAT_MS));
      expect(reportDesktopWorkState).toHaveBeenLastCalledWith(idle);
      owner.unmount();
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      finish();
    }
  });

  it('notifies navigation subscribers and never lets another idle owner erase active work', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeDesktopWorkState(listener);
    const active = renderHook(() =>
      useDesktopWorkState({ ...idle, isStreaming: true })
    );
    const second = renderHook(() => useDesktopWorkState(idle));
    expect(getDesktopWorkState()?.isStreaming).toBe(true);
    expect(reportDesktopWorkState).toHaveBeenLastCalledWith({
      ...idle,
      isStreaming: true,
    });
    second.unmount();
    expect(getDesktopWorkState()?.isStreaming).toBe(true);
    active.unmount();
    expect(getDesktopWorkState()).toBeNull();
    expect(listener).toHaveBeenCalledTimes(4);
    unsubscribe();
    renderHook(() => useDesktopWorkState(idle));
    expect(listener).toHaveBeenCalledTimes(4);
  });
  it('reports current work synchronously after commit and invalidates on navigation away', () => {
    const { rerender, unmount } = renderHook(useDesktopWorkState, {
      initialProps: idle,
    });
    expect(reportDesktopWorkState).toHaveBeenLastCalledWith(idle);
    rerender({ ...idle, isStreaming: true, hasPendingAction: true });
    expect(reportDesktopWorkState).toHaveBeenLastCalledWith({
      ...idle,
      isStreaming: true,
      hasPendingAction: true,
    });
    unmount();
    expect(reportDesktopWorkState).toHaveBeenLastCalledWith(null);
  });

  it('refreshes idle evidence only while the owner is mounted', () => {
    vi.useFakeTimers();
    const { unmount } = renderHook(() => useDesktopWorkState(idle));
    act(() => {
      vi.advanceTimersByTime(DESKTOP_WORK_HEARTBEAT_MS);
    });
    expect(reportDesktopWorkState).toHaveBeenCalledTimes(2);
    unmount();
    act(() => {
      vi.advanceTimersByTime(DESKTOP_WORK_HEARTBEAT_MS * 2);
    });
    expect(reportDesktopWorkState).toHaveBeenCalledTimes(3);
    expect(reportDesktopWorkState).toHaveBeenLastCalledWith(null);
  });

  it('does not schedule renderer work in a browser or stale desktop shell', () => {
    vi.useFakeTimers();
    vi.mocked(reportDesktopWorkState).mockReturnValue(false);
    renderHook(() => useDesktopWorkState(idle));
    act(() => {
      vi.advanceTimersByTime(DESKTOP_WORK_HEARTBEAT_MS * 2);
    });
    expect(reportDesktopWorkState).toHaveBeenCalledTimes(1);
  });
});

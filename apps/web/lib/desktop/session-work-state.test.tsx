import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { reportDesktopWorkState } from './electron-bridge';
import {
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

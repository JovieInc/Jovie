import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  SIDEBAR_PERSIST_DEBOUNCE_MS,
  useSidebarPreferencePersist,
} from './useSidebarPreferencePersist';

async function settle(ms = SIDEBAR_PERSIST_DEBOUNCE_MS) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

describe('useSidebarPreferencePersist', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns no handler without a persist function', () => {
    const { result } = renderHook(() => useSidebarPreferencePersist(undefined));

    expect(result.current).toBeUndefined();
  });

  it('coalesces a burst of toggles into one persist of the final state', async () => {
    const persist = vi.fn(async () => {});
    const { result } = renderHook(() => useSidebarPreferencePersist(persist));

    act(() => {
      // open=false means collapsed=true. Five rapid `[` presses.
      result.current?.(false);
      result.current?.(true);
      result.current?.(false);
      result.current?.(true);
      result.current?.(false);
    });

    expect(persist).not.toHaveBeenCalled();
    await settle(SIDEBAR_PERSIST_DEBOUNCE_MS - 1);
    expect(persist).not.toHaveBeenCalled();

    await settle(1);
    expect(persist).toHaveBeenCalledTimes(1);
    expect(persist).toHaveBeenCalledWith(true);
  });

  it('restarts the wait on each toggle', async () => {
    const persist = vi.fn(async () => {});
    const { result } = renderHook(() => useSidebarPreferencePersist(persist));

    act(() => result.current?.(false));
    await settle(SIDEBAR_PERSIST_DEBOUNCE_MS - 100);
    act(() => result.current?.(true));
    await settle(SIDEBAR_PERSIST_DEBOUNCE_MS - 100);
    expect(persist).not.toHaveBeenCalled();

    await settle(100);
    expect(persist).toHaveBeenCalledTimes(1);
    expect(persist).toHaveBeenCalledWith(false);
  });

  it('skips a burst that ends on the value already stored', async () => {
    const persist = vi.fn(async () => {});
    const { result } = renderHook(() => useSidebarPreferencePersist(persist));

    act(() => result.current?.(false));
    await settle();
    expect(persist).toHaveBeenCalledTimes(1);

    act(() => {
      result.current?.(true);
      result.current?.(false);
    });
    await settle();
    expect(persist).toHaveBeenCalledTimes(1);
  });

  it('retries the same value after a failed save', async () => {
    const persist = vi
      .fn<(collapsed: boolean) => Promise<void>>()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValue(undefined);
    const { result } = renderHook(() => useSidebarPreferencePersist(persist));

    act(() => result.current?.(false));
    await settle();
    act(() => result.current?.(false));
    await settle();

    expect(persist).toHaveBeenCalledTimes(2);
  });

  it('drops a pending persist when the shell unmounts', async () => {
    const persist = vi.fn(async () => {});
    const { result, unmount } = renderHook(() =>
      useSidebarPreferencePersist(persist)
    );

    act(() => result.current?.(false));
    unmount();
    await settle();

    expect(persist).not.toHaveBeenCalled();
  });

  it('keeps one handler identity across renders', () => {
    const persist = vi.fn(async () => {});
    const { result, rerender } = renderHook(() =>
      useSidebarPreferencePersist(persist)
    );
    const first = result.current;

    rerender();

    expect(result.current).toBe(first);
  });
});

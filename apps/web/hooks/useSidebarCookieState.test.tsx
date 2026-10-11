import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useSidebarCookieState } from './useSidebarCookieState';

afterEach(() => {
  document.cookie = 'sidebar:state=; path=/; max-age=0';
  document.documentElement.removeAttribute('data-desktop-runtime');
  vi.unstubAllGlobals();
});

describe('sidebar requested state', () => {
  it('shares the pinned geometry across native page documents without echoing messages', () => {
    const channels: {
      onmessage: ((event: { data: unknown }) => void) | null;
      postMessage: ReturnType<typeof vi.fn>;
      close: ReturnType<typeof vi.fn>;
    }[] = [];
    class Channel {
      onmessage: ((event: { data: unknown }) => void) | null = null;
      postMessage = vi.fn();
      close = vi.fn();
      constructor() {
        channels.push(this);
      }
    }
    vi.stubGlobal('BroadcastChannel', Channel);
    document.documentElement.dataset.desktopRuntime = 'electron';
    const onOpenChange = vi.fn();
    const { result, unmount } = renderHook(() =>
      useSidebarCookieState({ defaultOpen: true, onOpenChange })
    );
    act(() => result.current.setOpen(false));
    expect(channels[0].postMessage).toHaveBeenCalledExactlyOnceWith(false);
    act(() => channels[0].onmessage?.({ data: true }));
    expect(result.current.open).toBe(true);
    expect(channels[0].postMessage).toHaveBeenCalledTimes(1);
    act(() => channels[0].onmessage?.({ data: 'false' }));
    expect(result.current.open).toBe(true);
    unmount();
    expect(channels[0].close).toHaveBeenCalledOnce();
  });
  it('honors every toggle before React commits the batch', () => {
    const { result } = renderHook(() =>
      useSidebarCookieState({ defaultOpen: true })
    );
    act(() => {
      result.current.setOpen(value => !value);
      result.current.setOpen(value => !value);
    });
    expect(result.current.open).toBe(true);
    expect(document.cookie).toContain('sidebar:state=true');
    act(() => {
      for (let index = 0; index < 5; index++)
        result.current.setOpen(value => !value);
    });
    expect(result.current.open).toBe(false);
    expect(document.cookie).toContain('sidebar:state=false');
  });

  it('composes an explicit request and subsequent toggles in a controlled batch', () => {
    const onOpenChange = vi.fn();
    const { result, rerender } = renderHook(
      ({ open }) =>
        useSidebarCookieState({ defaultOpen: true, open, onOpenChange }),
      { initialProps: { open: true } }
    );
    act(() => {
      result.current.setOpen(false);
      result.current.setOpen(value => !value);
    });
    expect(onOpenChange.mock.calls).toEqual([[false], [true]]);
    rerender({ open: false });
    act(() => result.current.setOpen(value => !value));
    expect(onOpenChange).toHaveBeenLastCalledWith(true);
  });
});

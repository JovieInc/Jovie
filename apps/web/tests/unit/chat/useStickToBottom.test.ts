import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  SCROLL_THRESHOLD,
  useStickToBottom,
} from '@/components/jovie/hooks/useStickToBottom';

type IntersectionCallback = (
  entries: IntersectionObserverEntry[],
  observer: IntersectionObserver
) => void;

type ResizeCallback = (entries: ResizeObserverEntry[]) => void;

describe('useStickToBottom', () => {
  let intersectionCallback:
    | ((entries: IntersectionObserverEntry[]) => void)
    | null = null;
  let resizeCallback: ResizeCallback | null = null;
  let rafQueue: FrameRequestCallback[] = [];
  let queuedIntersectionEntries: IntersectionObserverEntry[] = [];

  beforeEach(() => {
    intersectionCallback = null;
    resizeCallback = null;
    rafQueue = [];
    queuedIntersectionEntries = [];

    vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation(cb => {
      rafQueue.push(cb);
      return rafQueue.length;
    });

    global.IntersectionObserver = vi.fn().mockImplementation(function (
      this: IntersectionObserver,
      callback: IntersectionCallback
    ) {
      intersectionCallback = entries => callback(entries, this);
      this.observe = vi.fn();
      this.unobserve = vi.fn();
      this.disconnect = vi.fn();
      this.takeRecords = vi.fn(() => {
        const entries = queuedIntersectionEntries;
        queuedIntersectionEntries = [];
        return entries;
      });
      this.root = null;
      this.rootMargin = '';
      this.thresholds = [];
    }) as unknown as typeof IntersectionObserver;

    global.ResizeObserver = vi.fn().mockImplementation(function (
      this: ResizeObserver,
      callback: ResizeCallback
    ) {
      resizeCallback = callback;
      this.observe = vi.fn();
      this.unobserve = vi.fn();
      this.disconnect = vi.fn();
    }) as unknown as typeof ResizeObserver;
  });

  afterEach(() => {
    Reflect.deleteProperty(globalThis, 'electronAPI');
    vi.restoreAllMocks();
  });

  function installVisibilityBridge() {
    let listener: ((active: boolean) => void) | undefined;
    const unsubscribe = vi.fn();
    Object.defineProperty(globalThis, 'electronAPI', {
      configurable: true,
      value: {
        getVisualActivity: () => Promise.resolve(true),
        onVisualActivity: (callback: (active: boolean) => void) => {
          listener = callback;
          return unsubscribe;
        },
      },
    });
    return {
      emit: (active: boolean) => act(() => listener?.(active)),
      unsubscribe,
    };
  }

  const flushRaf = () => {
    const callbacks = [...rafQueue];
    rafQueue = [];
    for (const cb of callbacks) {
      act(() => {
        cb(performance.now());
      });
    }
  };

  const attachSentinel = (
    result: ReturnType<
      typeof renderHook<ReturnType<typeof useStickToBottom>>
    >['result'],
    container: HTMLDivElement = document.createElement('div')
  ) => {
    result.current.scrollContainerRef.current = container;
    const sentinel = document.createElement('div');
    act(() => {
      result.current.bottomSentinelRef(sentinel);
    });
    return container;
  };

  it('observes the bottom sentinel with a near-bottom root margin', () => {
    const { result } = renderHook(() => useStickToBottom());

    const container = document.createElement('div');
    result.current.scrollContainerRef.current = container;

    const sentinel = document.createElement('div');
    act(() => {
      result.current.bottomSentinelRef(sentinel);
    });

    expect(global.IntersectionObserver).toHaveBeenCalledWith(
      expect.any(Function),
      {
        root: container,
        threshold: 0,
        rootMargin: `0px 0px ${SCROLL_THRESHOLD}px 0px`,
      }
    );
  });

  it('releases sticky state when the sentinel leaves the viewport', () => {
    const { result } = renderHook(() => useStickToBottom());
    attachSentinel(result);

    act(() => {
      intersectionCallback?.([
        { isIntersecting: false } as IntersectionObserverEntry,
      ]);
    });

    expect(result.current.isStuckToBottom).toBe(false);
  });

  it('re-attaches sticky state when the sentinel re-enters the viewport', () => {
    const { result } = renderHook(() => useStickToBottom());
    attachSentinel(result);

    act(() => {
      intersectionCallback?.([
        { isIntersecting: false } as IntersectionObserverEntry,
      ]);
      intersectionCallback?.([
        { isIntersecting: true } as IntersectionObserverEntry,
      ]);
    });

    expect(result.current.isStuckToBottom).toBe(true);
  });

  it('uses the latest sentinel sample when delayed delivery batches state changes', () => {
    const { result } = renderHook(() => useStickToBottom());
    attachSentinel(result);
    act(() =>
      intersectionCallback?.([
        { isIntersecting: true } as IntersectionObserverEntry,
        { isIntersecting: false } as IntersectionObserverEntry,
      ])
    );
    expect(result.current.isStuckToBottom).toBe(false);
    act(() =>
      intersectionCallback?.([
        { isIntersecting: false } as IntersectionObserverEntry,
        { isIntersecting: true } as IntersectionObserverEntry,
      ])
    );
    expect(result.current.isStuckToBottom).toBe(true);
  });

  it('batches resize-driven scroll writes to one rAF per frame', () => {
    const { result } = renderHook(() => useStickToBottom());

    const container = document.createElement('div');
    Object.defineProperty(container, 'scrollHeight', {
      configurable: true,
      value: 480,
    });
    let scrollTop = 0;
    Object.defineProperty(container, 'scrollTop', {
      configurable: true,
      get: () => scrollTop,
      set: value => {
        scrollTop = value;
      },
    });
    result.current.scrollContainerRef.current = container;

    const content = document.createElement('div');
    act(() => {
      result.current.totalSizeRef(content);
    });

    act(() => {
      resizeCallback?.([{ target: content } as ResizeObserverEntry]);
      resizeCallback?.([{ target: content } as ResizeObserverEntry]);
    });

    expect(scrollTop).toBe(0);
    expect(rafQueue).toHaveLength(1);

    flushRaf();
    expect(scrollTop).toBe(480);
  });

  it('does not scroll on resize when the user has scrolled away', () => {
    const { result } = renderHook(() => useStickToBottom());

    const container = document.createElement('div');
    Object.defineProperty(container, 'scrollHeight', {
      configurable: true,
      value: 480,
    });
    let scrollTop = 0;
    Object.defineProperty(container, 'scrollTop', {
      configurable: true,
      get: () => scrollTop,
      set: value => {
        scrollTop = value;
      },
    });
    attachSentinel(result, container);

    const content = document.createElement('div');
    act(() => {
      result.current.totalSizeRef(content);
      intersectionCallback?.([
        { isIntersecting: false } as IntersectionObserverEntry,
      ]);
    });

    act(() => {
      resizeCallback?.([{ target: content } as ResizeObserverEntry]);
    });

    flushRaf();
    expect(scrollTop).toBe(0);
  });

  it('does NOT force-pin to bottom when messages arrive while user is scrolled away (regression: gh-11948)', () => {
    const { result } = renderHook(() => useStickToBottom());

    const container = document.createElement('div');
    Object.defineProperty(container, 'scrollHeight', {
      configurable: true,
      value: 800,
    });
    let scrollTop = 0;
    Object.defineProperty(container, 'scrollTop', {
      configurable: true,
      get: () => scrollTop,
      set: value => {
        scrollTop = value;
      },
    });
    attachSentinel(result, container);

    const content = document.createElement('div');
    act(() => {
      result.current.totalSizeRef(content);
      // User scrolls away — sentinel leaves the viewport.
      intersectionCallback?.([
        { isIntersecting: false } as IntersectionObserverEntry,
      ]);
    });

    expect(result.current.isStuckToBottom).toBe(false);

    // New message appended: content grows (ResizeObserver fires).
    act(() => {
      resizeCallback?.([{ target: content } as ResizeObserverEntry]);
    });

    // Must NOT scroll back to bottom — user is scrolled away.
    flushRaf();
    expect(scrollTop).toBe(0);
    expect(result.current.isStuckToBottom).toBe(false);
  });

  it('keeps onScroll as a no-op (no layout reads)', () => {
    const { result } = renderHook(() => useStickToBottom());

    const container = document.createElement('div');
    const scrollHeightSpy = vi.spyOn(container, 'scrollHeight', 'get');
    result.current.scrollContainerRef.current = container;

    act(() => {
      result.current.onScroll();
    });

    expect(scrollHeightSpy).not.toHaveBeenCalled();
  });

  it('rests hidden scroll work and reconciles the latest content once on return', () => {
    const visibility = installVisibilityBridge();
    const { result, unmount } = renderHook(() => useStickToBottom());
    const container = attachSentinel(result);
    const write = vi.fn();
    let height = 400;
    Object.defineProperty(container, 'scrollHeight', { get: () => height });
    Object.defineProperty(container, 'scrollTop', { set: write });
    act(() => result.current.totalSizeRef(document.createElement('div')));
    visibility.emit(false);
    // Native hidden state wins even while Chromium reports visible.
    expect(document.visibilityState).toBe('visible');
    act(() => {
      resizeCallback?.([]);
      resizeCallback?.([]);
    });
    flushRaf();
    expect(write).not.toHaveBeenCalled();
    height = 950;
    visibility.emit(true);
    visibility.emit(true);
    // Hidden growth can deliver a stale offscreen observation before restore rAF.
    act(() =>
      intersectionCallback?.([
        { isIntersecting: false } as IntersectionObserverEntry,
      ])
    );
    flushRaf();
    expect(write).toHaveBeenCalledExactlyOnceWith(950);
    unmount();
    expect(visibility.unsubscribe).toHaveBeenCalledOnce();
  });

  it('cancels a queued scroll on hide and ignores hidden sentinel changes', () => {
    const visibility = installVisibilityBridge();
    const cancel = vi.spyOn(globalThis, 'cancelAnimationFrame');
    const { result } = renderHook(() => useStickToBottom());
    const container = attachSentinel(result);
    const write = vi.fn();
    Object.defineProperty(container, 'scrollTop', { set: write });
    act(() => {
      result.current.totalSizeRef(document.createElement('div'));
      resizeCallback?.([]);
    });
    visibility.emit(false);
    act(() =>
      intersectionCallback?.([
        { isIntersecting: false } as IntersectionObserverEntry,
      ])
    );
    expect(cancel).toHaveBeenCalledOnce();
    flushRaf();
    expect(write).not.toHaveBeenCalled();
    expect(result.current.isStuckToBottom).toBe(true);
  });

  it('discards hidden samples delivered after restoration but honors a later user scroll', () => {
    const visibility = installVisibilityBridge();
    const { result } = renderHook(() => useStickToBottom());
    const container = attachSentinel(result);
    Object.defineProperty(container, 'scrollHeight', { value: 950 });
    const write = vi.fn();
    Object.defineProperty(container, 'scrollTop', { set: write });
    act(() => result.current.totalSizeRef(document.createElement('div')));
    const deliverQueuedEntries = () => {
      const entries = queuedIntersectionEntries;
      queuedIntersectionEntries = [];
      if (entries.length) act(() => intersectionCallback?.(entries));
    };

    visibility.emit(false);
    // Chromium samples offscreen growth, then delays its callback past rAF.
    queuedIntersectionEntries.push({
      isIntersecting: false,
    } as IntersectionObserverEntry);
    visibility.emit(true);
    flushRaf();
    expect(write).toHaveBeenCalledExactlyOnceWith(950);
    deliverQueuedEntries();
    expect(result.current.isStuckToBottom).toBe(true);

    // A fresh post-restoration sample must still release the reader's pin.
    queuedIntersectionEntries.push({
      isIntersecting: false,
    } as IntersectionObserverEntry);
    deliverQueuedEntries();
    expect(result.current.isStuckToBottom).toBe(false);
    act(() => resizeCallback?.([]));
    flushRaf();
    expect(write).toHaveBeenCalledOnce();
  });

  it('preserves an unpinned reader across hide and restore', () => {
    const visibility = installVisibilityBridge();
    const { result } = renderHook(() => useStickToBottom());
    const container = attachSentinel(result);
    const write = vi.fn();
    Object.defineProperty(container, 'scrollTop', { set: write });
    act(() => result.current.setStuckToBottom(false));
    visibility.emit(false);
    visibility.emit(true);
    flushRaf();
    expect(write).not.toHaveBeenCalled();
    expect(result.current.isStuckToBottom).toBe(false);
  });

  it('honors an explicit unpin before the restoration frame', () => {
    const visibility = installVisibilityBridge();
    const { result } = renderHook(() => useStickToBottom());
    const container = attachSentinel(result);
    const write = vi.fn();
    Object.defineProperty(container, 'scrollTop', { set: write });
    visibility.emit(false);
    visibility.emit(true);
    act(() => result.current.setStuckToBottom(false));
    flushRaf();
    expect(write).not.toHaveBeenCalled();
  });

  it('re-pins only on the initial 0 → positive message count (JOV-5044)', () => {
    const { result, rerender } = renderHook(
      ({ count }: { count?: number }) => useStickToBottom(count),
      { initialProps: { count: 0 } }
    );
    attachSentinel(result);

    act(() => {
      intersectionCallback?.([
        { isIntersecting: false } as IntersectionObserverEntry,
      ]);
    });
    expect(result.current.isStuckToBottom).toBe(false);

    rerender({ count: 2 });
    expect(result.current.isStuckToBottom).toBe(true);

    act(() => {
      intersectionCallback?.([
        { isIntersecting: false } as IntersectionObserverEntry,
      ]);
    });
    expect(result.current.isStuckToBottom).toBe(false);

    rerender({ count: 3 });
    expect(result.current.isStuckToBottom).toBe(false);
  });
});

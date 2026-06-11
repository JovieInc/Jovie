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
  let intersectionCallback: IntersectionCallback | null = null;
  let resizeCallback: ResizeCallback | null = null;
  let rafQueue: FrameRequestCallback[] = [];

  beforeEach(() => {
    intersectionCallback = null;
    resizeCallback = null;
    rafQueue = [];

    vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation(cb => {
      rafQueue.push(cb);
      return rafQueue.length;
    });

    global.IntersectionObserver = vi.fn().mockImplementation(function (
      this: IntersectionObserver,
      callback: IntersectionCallback
    ) {
      intersectionCallback = callback;
      this.observe = vi.fn();
      this.unobserve = vi.fn();
      this.disconnect = vi.fn();
      this.takeRecords = vi.fn();
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
    vi.restoreAllMocks();
  });

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
    const { result } = renderHook(() => useStickToBottom({ messageCount: 1 }));

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
    const { result } = renderHook(() => useStickToBottom({ messageCount: 2 }));
    attachSentinel(result);

    act(() => {
      intersectionCallback?.([
        { isIntersecting: false } as IntersectionObserverEntry,
      ]);
    });

    expect(result.current.isStuckToBottom).toBe(false);
  });

  it('re-attaches sticky state when the sentinel re-enters the viewport', () => {
    const { result } = renderHook(() => useStickToBottom({ messageCount: 2 }));
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

  it('batches resize-driven scroll writes to one rAF per frame', () => {
    const { result } = renderHook(() => useStickToBottom({ messageCount: 1 }));

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
    const { result } = renderHook(() => useStickToBottom({ messageCount: 1 }));

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

  it('keeps onScroll as a no-op (no layout reads)', () => {
    const { result } = renderHook(() => useStickToBottom({ messageCount: 1 }));

    const container = document.createElement('div');
    const scrollHeightSpy = vi.spyOn(container, 'scrollHeight', 'get');
    result.current.scrollContainerRef.current = container;

    act(() => {
      result.current.onScroll();
    });

    expect(scrollHeightSpy).not.toHaveBeenCalled();
  });
});

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useStickToBottom } from '@/components/jovie/hooks/useStickToBottom';

type ResizeObserverCallbackType = ConstructorParameters<
  typeof ResizeObserver
>[0];

let resizeCallback: ResizeObserverCallbackType | null = null;
let originalResizeObserver: typeof ResizeObserver | undefined;

class ResizeObserverMock {
  constructor(callback: ResizeObserverCallbackType) {
    resizeCallback = callback;
  }

  observe() {}

  disconnect() {}
}

describe('useStickToBottom', () => {
  beforeEach(() => {
    originalResizeObserver = global.ResizeObserver;
    vi.stubGlobal('ResizeObserver', ResizeObserverMock);
    resizeCallback = null;
  });

  afterEach(() => {
    if (originalResizeObserver) {
      global.ResizeObserver = originalResizeObserver;
    } else {
      Reflect.deleteProperty(global, 'ResizeObserver');
    }
  });

  it('scrolls when content height grows but not when it shrinks', () => {
    const { result } = renderHook(() => useStickToBottom({ messageCount: 1 }));

    const container = {
      scrollHeight: 600,
      scrollTop: 100,
      clientHeight: 300,
    } as HTMLDivElement;
    result.current.scrollContainerRef.current = container;

    const node = {
      getBoundingClientRect: () => ({ height: 100 }),
    } as HTMLDivElement;

    act(() => {
      result.current.totalSizeRef(node);
    });

    expect(resizeCallback).not.toBeNull();

    act(() => {
      resizeCallback?.(
        [{ contentRect: { height: 120 } } as ResizeObserverEntry],
        {} as ResizeObserver
      );
    });

    expect(container.scrollTop).toBe(600);

    container.scrollTop = 123;

    act(() => {
      resizeCallback?.(
        [{ contentRect: { height: 110 } } as ResizeObserverEntry],
        {} as ResizeObserver
      );
    });

    expect(container.scrollTop).toBe(123);
  });
});

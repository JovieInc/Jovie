import { afterAll, beforeAll, vi } from 'vitest';

export function setupChatViewportMocks(
  resizeObserverCallbacks: ResizeObserverCallback[]
) {
  const originalScrollIntoView = Object.getOwnPropertyDescriptor(
    globalThis.HTMLElement.prototype,
    'scrollIntoView'
  );
  const originalResizeObserver = globalThis.ResizeObserver;

  beforeAll(() => {
    Object.defineProperty(globalThis.HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: vi.fn(),
    });
    globalThis.ResizeObserver = class MockResizeObserver
      implements ResizeObserver
    {
      observe = vi.fn<ResizeObserver['observe']>();
      unobserve = vi.fn<ResizeObserver['unobserve']>();
      disconnect = vi.fn<ResizeObserver['disconnect']>();

      constructor(callback: ResizeObserverCallback) {
        resizeObserverCallbacks.push(callback);
      }
    };
  });

  afterAll(() => {
    if (originalScrollIntoView) {
      Object.defineProperty(
        globalThis.HTMLElement.prototype,
        'scrollIntoView',
        originalScrollIntoView
      );
    } else {
      Reflect.deleteProperty(
        globalThis.HTMLElement.prototype,
        'scrollIntoView'
      );
    }
    if (originalResizeObserver) {
      globalThis.ResizeObserver = originalResizeObserver;
    } else {
      Reflect.deleteProperty(globalThis, 'ResizeObserver');
    }
  });
}

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useProfileMobileOverflow } from '@/components/features/profile/templates/useProfileMobileOverflow';

type Dimensions = {
  clientHeight: number;
  coverHeight: number;
  coverWidth: number;
  identityHeight: number;
  identityWidth: number;
  scrollHeight: number;
};

type SurfaceFixture = {
  dimensions: Dimensions;
  identity: HTMLDivElement;
  surface: HTMLDivElement;
};

type ResizeObserverRecord = {
  callback: ResizeObserverCallback;
  disconnect: ReturnType<typeof vi.fn>;
  observed: Element[];
};

const mediaListeners = new Set<() => void>();
const resizeObservers: ResizeObserverRecord[] = [];
const rafCallbacks = new Map<number, FrameRequestCallback>();
let mediaMatches = false;
let nextFrameId = 1;

const createRect = (width: number, height: number): DOMRect =>
  ({
    bottom: height,
    height,
    left: 0,
    right: width,
    top: 0,
    width,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  }) as DOMRect;

const createSurfaceFixture = (
  overrides: Partial<Dimensions> = {}
): SurfaceFixture => {
  const dimensions: Dimensions = {
    clientHeight: 568,
    coverHeight: 280,
    coverWidth: 320,
    identityHeight: 180,
    identityWidth: 320,
    scrollHeight: 700,
    ...overrides,
  };
  const surface = document.createElement('div');
  const identity = document.createElement('div');
  const cover = document.createElement('div');

  identity.dataset.testid = 'profile-hero-identity-block';
  cover.dataset.testid = 'profile-cover';
  identity.getBoundingClientRect = () =>
    createRect(dimensions.identityWidth, dimensions.identityHeight);
  cover.getBoundingClientRect = () =>
    createRect(dimensions.coverWidth, dimensions.coverHeight);
  Object.defineProperties(surface, {
    clientHeight: {
      configurable: true,
      get: () => dimensions.clientHeight,
    },
    scrollHeight: {
      configurable: true,
      get: () => dimensions.scrollHeight,
    },
  });
  surface.append(identity, cover);
  document.body.append(surface);

  return { dimensions, identity, surface };
};

const setMobileViewport = (matches: boolean) => {
  act(() => {
    mediaMatches = matches;
    for (const listener of mediaListeners) {
      listener();
    }
  });
};

const triggerResizeObserver = () => {
  act(() => {
    for (const observer of resizeObservers) {
      observer.callback([], observer as unknown as ResizeObserver);
    }
  });
};

const flushNextFrame = () => {
  const next = rafCallbacks.entries().next().value as
    | [number, FrameRequestCallback]
    | undefined;
  if (!next) {
    return;
  }
  const [frameId, callback] = next;
  rafCallbacks.delete(frameId);
  act(() => callback(0));
};

describe('useProfileMobileOverflow', () => {
  beforeEach(() => {
    mediaMatches = false;
    mediaListeners.clear();
    resizeObservers.length = 0;
    rafCallbacks.clear();
    nextFrameId = 1;

    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({
        addEventListener: vi.fn(
          (_type: string, listener: EventListenerOrEventListenerObject) => {
            if (typeof listener === 'function') {
              mediaListeners.add(listener as unknown as () => void);
            }
          }
        ),
        addListener: vi.fn(),
        dispatchEvent: vi.fn(() => true),
        get matches() {
          return mediaMatches;
        },
        media: '(max-width: 767px)',
        onchange: null,
        removeEventListener: vi.fn(
          (_type: string, listener: EventListenerOrEventListenerObject) => {
            if (typeof listener === 'function') {
              mediaListeners.delete(listener as unknown as () => void);
            }
          }
        ),
        removeListener: vi.fn(),
      }))
    );
    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn((callback: FrameRequestCallback) => {
        const frameId = nextFrameId++;
        rafCallbacks.set(frameId, callback);
        return frameId;
      })
    );
    vi.stubGlobal(
      'cancelAnimationFrame',
      vi.fn((frameId: number) => {
        rafCallbacks.delete(frameId);
      })
    );
    vi.stubGlobal(
      'ResizeObserver',
      class {
        readonly callback: ResizeObserverCallback;
        readonly disconnect = vi.fn();
        readonly observed: Element[] = [];

        constructor(callback: ResizeObserverCallback) {
          this.callback = callback;
          resizeObservers.push(this);
        }

        observe = vi.fn((element: Element) => {
          this.observed.push(element);
        });

        unobserve = vi.fn();
      } as unknown as typeof ResizeObserver
    );
  });

  afterEach(() => {
    document.body.replaceChildren();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('enters overflow only after the mobile media query becomes active', () => {
    const fixture = createSurfaceFixture();
    const { result } = renderHook(() =>
      useProfileMobileOverflow({
        isHomeMode: true,
        isPreviewEmbedded: false,
        surface: fixture.surface,
      })
    );

    expect(result.current).toBe(false);
    setMobileViewport(true);

    expect(result.current).toBe(true);
    expect(resizeObservers).toHaveLength(1);
    expect(resizeObservers[0]?.observed).toEqual(
      expect.arrayContaining([fixture.surface, fixture.identity])
    );
  });

  it('clears overflow and disconnects the observer when home mode exits', () => {
    const fixture = createSurfaceFixture();
    const { result, rerender } = renderHook(
      ({ isHomeMode }) =>
        useProfileMobileOverflow({
          isHomeMode,
          isPreviewEmbedded: false,
          surface: fixture.surface,
        }),
      { initialProps: { isHomeMode: true } }
    );

    setMobileViewport(true);
    expect(result.current).toBe(true);

    const observer = resizeObservers[0];
    rerender({ isHomeMode: false });

    expect(result.current).toBe(false);
    expect(observer?.disconnect).toHaveBeenCalledTimes(1);
  });

  it('remeasures fitting content through an observer-triggered animation frame', () => {
    const fixture = createSurfaceFixture();
    const { result } = renderHook(() =>
      useProfileMobileOverflow({
        isHomeMode: true,
        isPreviewEmbedded: false,
        surface: fixture.surface,
      })
    );

    setMobileViewport(true);
    expect(result.current).toBe(true);

    fixture.dimensions.identityHeight = 120;
    fixture.dimensions.scrollHeight = fixture.dimensions.clientHeight;
    triggerResizeObserver();

    expect(result.current).toBe(false);
    expect(rafCallbacks.size).toBe(1);
    flushNextFrame();
    expect(result.current).toBe(false);
  });

  it('measures newly overflowing content from a previously fitting surface', () => {
    const fixture = createSurfaceFixture({
      scrollHeight: 568,
    });
    const { result } = renderHook(() =>
      useProfileMobileOverflow({
        isHomeMode: true,
        isPreviewEmbedded: false,
        surface: fixture.surface,
      })
    );

    setMobileViewport(true);
    expect(result.current).toBe(false);

    fixture.dimensions.scrollHeight = 700;
    triggerResizeObserver();

    expect(result.current).toBe(true);
  });

  it('ignores observer notifications when active geometry is unchanged', () => {
    const fixture = createSurfaceFixture();
    const { result } = renderHook(() =>
      useProfileMobileOverflow({
        isHomeMode: true,
        isPreviewEmbedded: false,
        surface: fixture.surface,
      })
    );

    setMobileViewport(true);
    expect(result.current).toBe(true);

    triggerResizeObserver();

    expect(result.current).toBe(true);
    expect(rafCallbacks.size).toBe(0);
  });

  it('does not schedule a second probe while the first probe is pending', () => {
    const fixture = createSurfaceFixture();
    const { result } = renderHook(() =>
      useProfileMobileOverflow({
        isHomeMode: true,
        isPreviewEmbedded: false,
        surface: fixture.surface,
      })
    );

    setMobileViewport(true);
    fixture.dimensions.identityHeight = 120;
    fixture.dimensions.scrollHeight = fixture.dimensions.clientHeight;
    triggerResizeObserver();
    expect(rafCallbacks.size).toBe(1);

    triggerResizeObserver();
    expect(rafCallbacks.size).toBe(1);

    flushNextFrame();
    expect(result.current).toBe(false);
  });

  it('cancels a pending probe when the active surface leaves scope', () => {
    const fixture = createSurfaceFixture();
    const { result, rerender } = renderHook(
      ({ isHomeMode }) =>
        useProfileMobileOverflow({
          isHomeMode,
          isPreviewEmbedded: false,
          surface: fixture.surface,
        }),
      { initialProps: { isHomeMode: true } }
    );

    setMobileViewport(true);
    fixture.dimensions.identityHeight = 120;
    triggerResizeObserver();
    const pendingFrameId = [...rafCallbacks.keys()][0];
    expect(pendingFrameId).toBeDefined();

    rerender({ isHomeMode: false });

    expect(result.current).toBe(false);
    expect(cancelAnimationFrame).toHaveBeenCalledWith(pendingFrameId);
    expect(rafCallbacks.size).toBe(0);
  });

  it('uses the resize path to clear overflow after content fits again', () => {
    const fixture = createSurfaceFixture();
    const { result } = renderHook(() =>
      useProfileMobileOverflow({
        isHomeMode: true,
        isPreviewEmbedded: false,
        surface: fixture.surface,
      })
    );

    setMobileViewport(true);
    expect(result.current).toBe(true);

    fixture.dimensions.scrollHeight = fixture.dimensions.clientHeight;
    act(() => {
      window.dispatchEvent(new Event('resize'));
    });
    expect(result.current).toBe(false);
    flushNextFrame();
    expect(result.current).toBe(false);
  });

  it('cleans the resize fallback when ResizeObserver is unavailable', () => {
    vi.stubGlobal('ResizeObserver', undefined);
    const fixture = createSurfaceFixture();
    const { result, rerender } = renderHook(
      ({ isHomeMode }) =>
        useProfileMobileOverflow({
          isHomeMode,
          isPreviewEmbedded: false,
          surface: fixture.surface,
        }),
      { initialProps: { isHomeMode: true } }
    );

    setMobileViewport(true);
    expect(result.current).toBe(true);

    fixture.dimensions.scrollHeight = fixture.dimensions.clientHeight;
    act(() => {
      window.dispatchEvent(new Event('resize'));
    });
    expect(rafCallbacks.size).toBe(1);
    const pendingFrameId = [...rafCallbacks.keys()][0];

    rerender({ isHomeMode: false });

    expect(cancelAnimationFrame).toHaveBeenCalledWith(pendingFrameId);
    expect(rafCallbacks.size).toBe(0);
    expect(result.current).toBe(false);
  });

  it('resets stale overflow when an active surface swaps to a fitting surface', () => {
    vi.stubGlobal('ResizeObserver', undefined);
    const overflowingSurface = createSurfaceFixture();
    const fittingSurface = createSurfaceFixture({ scrollHeight: 568 });
    const { result, rerender } = renderHook(
      ({ surface }) =>
        useProfileMobileOverflow({
          isHomeMode: true,
          isPreviewEmbedded: false,
          surface,
        }),
      { initialProps: { surface: overflowingSurface.surface } }
    );

    setMobileViewport(true);
    expect(result.current).toBe(true);

    rerender({ surface: fittingSurface.surface });

    expect(result.current).toBe(false);
  });

  it('keeps embedded previews and missing surfaces outside the overflow contract', () => {
    const fixture = createSurfaceFixture();
    const { result, rerender } = renderHook<
      boolean,
      { isPreviewEmbedded: boolean; surface: HTMLDivElement | null }
    >(
      ({ isPreviewEmbedded, surface }) =>
        useProfileMobileOverflow({
          isHomeMode: true,
          isPreviewEmbedded,
          surface,
        }),
      { initialProps: { isPreviewEmbedded: true, surface: fixture.surface } }
    );

    setMobileViewport(true);
    expect(result.current).toBe(false);
    expect(resizeObservers).toHaveLength(0);

    rerender({ isPreviewEmbedded: false, surface: null });
    expect(result.current).toBe(false);
  });
});

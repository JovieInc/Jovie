import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ScrollRevealInit } from './ScrollRevealInit';

describe('ScrollRevealInit', () => {
  const observe = vi.fn();
  const disconnect = vi.fn();
  let observerCallback: IntersectionObserverCallback | undefined;
  let supportsViewTimeline = false;

  beforeEach(() => {
    observe.mockClear();
    disconnect.mockClear();
    observerCallback = undefined;
    vi.stubGlobal(
      'IntersectionObserver',
      vi.fn(function (this: unknown, callback: IntersectionObserverCallback) {
        observerCallback = callback;
        return { observe, disconnect, unobserve: vi.fn() };
      })
    );
    vi.stubGlobal('CSS', {
      supports: (query: string) =>
        query === 'animation-timeline: view()' && supportsViewTimeline,
    });
    document.body.innerHTML = '<div class="reveal-on-scroll"></div>';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    document.documentElement.classList.remove('reveal-js');
    document.body.innerHTML = '';
  });

  it('leaves the reveal to CSS when scroll-driven animations are supported', () => {
    supportsViewTimeline = true;
    render(<ScrollRevealInit />);

    expect(document.documentElement.classList.contains('reveal-js')).toBe(
      false
    );
    expect(observe).not.toHaveBeenCalled();
  });

  it('falls back to an observer that reveals elements once they intersect', () => {
    supportsViewTimeline = false;
    const target = document.querySelector('.reveal-on-scroll') as HTMLElement;
    const { unmount } = render(<ScrollRevealInit />);

    expect(document.documentElement.classList.contains('reveal-js')).toBe(true);
    expect(observe).toHaveBeenCalledWith(target);

    observerCallback?.(
      [
        {
          isIntersecting: true,
          target,
        } as unknown as IntersectionObserverEntry,
      ],
      {} as IntersectionObserver
    );
    expect(target.classList.contains('revealed')).toBe(true);

    unmount();
    expect(document.documentElement.classList.contains('reveal-js')).toBe(
      false
    );
    expect(disconnect).toHaveBeenCalled();
  });
});

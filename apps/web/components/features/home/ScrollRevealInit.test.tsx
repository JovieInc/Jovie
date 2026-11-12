import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
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

  it('leaves the reveal to CSS when scroll-driven animations are supported', async () => {
    supportsViewTimeline = true;
    const { container } = render(<ScrollRevealInit />);

    expect(document.documentElement.classList.contains('reveal-js')).toBe(
      false
    );
    expect(observe).not.toHaveBeenCalled();
    expect(container).toBeEmptyDOMElement();
    await expectNoA11yViolations(container);
  });

  it('registers no observer when the page has nothing to reveal', async () => {
    supportsViewTimeline = false;
    document.body.innerHTML = '';
    const { container, unmount } = render(<ScrollRevealInit />);

    expect(document.documentElement.classList.contains('reveal-js')).toBe(true);
    expect(IntersectionObserver).not.toHaveBeenCalled();
    expect(observe).not.toHaveBeenCalled();
    await expectNoA11yViolations(container);

    unmount();
    expect(document.documentElement.classList.contains('reveal-js')).toBe(
      false
    );
  });

  it('falls back to an observer that reveals elements once they intersect', async () => {
    supportsViewTimeline = false;
    const target = document.querySelector('.reveal-on-scroll') as HTMLElement;
    const { container, unmount } = render(<ScrollRevealInit />);

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
    await expectNoA11yViolations(container);

    unmount();
    expect(document.documentElement.classList.contains('reveal-js')).toBe(
      false
    );
    expect(disconnect).toHaveBeenCalled();
  });
});

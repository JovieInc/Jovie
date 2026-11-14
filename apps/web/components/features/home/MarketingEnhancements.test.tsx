import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { MarketingEnhancements } from './MarketingEnhancements';

const { scrollUnlockMounted, scrollRevealMounted } = vi.hoisted(() => ({
  scrollUnlockMounted: vi.fn(),
  scrollRevealMounted: vi.fn(),
}));

vi.mock('@/features/home/MarketingScrollUnlock', () => ({
  MarketingScrollUnlock: () => {
    scrollUnlockMounted();
    return <span data-testid='scroll-unlock' />;
  },
}));

vi.mock('@/features/home/ScrollRevealInit', () => ({
  ScrollRevealInit: () => {
    scrollRevealMounted();
    return <span data-testid='scroll-reveal' />;
  },
}));

type IdleCallback = (deadline: IdleDeadline) => void;

const originalRequestIdle = globalThis.requestIdleCallback;
const originalCancelIdle = globalThis.cancelIdleCallback;

function restoreIdleApi() {
  if (originalRequestIdle) {
    globalThis.requestIdleCallback = originalRequestIdle;
    globalThis.cancelIdleCallback = originalCancelIdle;
  } else {
    // jsdom has no idle API; drop the stubs so `in globalThis` is false again.
    Reflect.deleteProperty(globalThis, 'requestIdleCallback');
    Reflect.deleteProperty(globalThis, 'cancelIdleCallback');
  }
}

/** Let the two dynamic imports resolve and React commit the bundle. */
async function flushImports() {
  await act(async () => {
    await vi.dynamicImportSettled();
    await Promise.resolve();
  });
}

describe('MarketingEnhancements', () => {
  beforeEach(() => {
    scrollUnlockMounted.mockClear();
    scrollRevealMounted.mockClear();
  });

  afterEach(() => {
    // Unmount while the idle stubs still exist; the effect cleanup calls them.
    cleanup();
    restoreIdleApi();
    vi.useRealTimers();
  });

  describe('with requestIdleCallback', () => {
    let idleCallback: IdleCallback | undefined;
    const requestIdle = vi.fn((callback: IdleCallback) => {
      idleCallback = callback;
      return 42;
    });
    const cancelIdle = vi.fn();

    beforeEach(() => {
      idleCallback = undefined;
      requestIdle.mockClear();
      cancelIdle.mockClear();
      globalThis.requestIdleCallback =
        requestIdle as unknown as typeof globalThis.requestIdleCallback;
      globalThis.cancelIdleCallback = cancelIdle;
    });

    it('renders nothing until the browser is idle', async () => {
      const { container } = render(<MarketingEnhancements />);

      expect(requestIdle).toHaveBeenCalledWith(expect.any(Function), {
        timeout: 1500,
      });
      expect(container).toBeEmptyDOMElement();
      expect(scrollUnlockMounted).not.toHaveBeenCalled();
      expect(scrollRevealMounted).not.toHaveBeenCalled();
      await expectNoA11yViolations(container);
    });

    it('mounts both enhancements once the idle callback loads them', async () => {
      const { container, getByTestId } = render(<MarketingEnhancements />);

      idleCallback?.({} as IdleDeadline);
      await flushImports();

      expect(getByTestId('scroll-unlock')).toBeInTheDocument();
      expect(getByTestId('scroll-reveal')).toBeInTheDocument();
      expect(scrollUnlockMounted).toHaveBeenCalled();
      expect(scrollRevealMounted).toHaveBeenCalled();
      await expectNoA11yViolations(container);
    });

    it('cancels the idle callback when unmounted before it runs', () => {
      const { unmount } = render(<MarketingEnhancements />);

      unmount();

      expect(cancelIdle).toHaveBeenCalledWith(42);
    });

    it('ignores a load that finishes after unmount', async () => {
      const { unmount } = render(<MarketingEnhancements />);
      const pending = idleCallback;

      unmount();
      pending?.({} as IdleDeadline);
      await flushImports();

      expect(scrollUnlockMounted).not.toHaveBeenCalled();
      expect(scrollRevealMounted).not.toHaveBeenCalled();
    });
  });

  describe('without requestIdleCallback', () => {
    beforeEach(() => {
      Reflect.deleteProperty(globalThis, 'requestIdleCallback');
      Reflect.deleteProperty(globalThis, 'cancelIdleCallback');
      vi.useFakeTimers();
    });

    it('falls back to a short timeout before loading', async () => {
      const { container, queryByTestId } = render(<MarketingEnhancements />);

      await act(async () => {
        vi.advanceTimersByTime(199);
      });
      expect(container).toBeEmptyDOMElement();

      await act(async () => {
        vi.advanceTimersByTime(1);
      });
      vi.useRealTimers();
      await flushImports();

      expect(queryByTestId('scroll-unlock')).toBeInTheDocument();
      expect(queryByTestId('scroll-reveal')).toBeInTheDocument();
    });

    it('clears the pending timeout on unmount', async () => {
      const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');
      const { unmount } = render(<MarketingEnhancements />);

      unmount();
      await act(async () => {
        vi.advanceTimersByTime(500);
      });

      expect(clearTimeoutSpy).toHaveBeenCalled();
      expect(scrollUnlockMounted).not.toHaveBeenCalled();
      clearTimeoutSpy.mockRestore();
    });
  });
});

import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useReducedMotion } from './useReducedMotion';

// Mock MediaQueryList
class MockMediaQueryList {
  matches: boolean;
  media: string;
  private listeners: Array<(event: MediaQueryListEvent) => void> = [];

  constructor(matches: boolean) {
    this.matches = matches;
    this.media = '(prefers-reduced-motion: reduce)';
  }

  addEventListener(
    event: string,
    listener: (event: MediaQueryListEvent) => void
  ) {
    if (event === 'change') {
      this.listeners.push(listener);
    }
  }

  removeEventListener(
    event: string,
    listener: (event: MediaQueryListEvent) => void
  ) {
    if (event === 'change') {
      this.listeners = this.listeners.filter(l => l !== listener);
    }
  }

  // Simulate a change in media query
  change(matches: boolean) {
    this.matches = matches;
    const event = { matches, media: this.media } as MediaQueryListEvent;
    this.listeners.forEach(listener => listener(event));
  }
}

describe('useReducedMotion', () => {
  let mockMatchMedia: MockMediaQueryList;

  beforeEach(() => {
    // Reset matchMedia mock before each test
    mockMatchMedia = new MockMediaQueryList(false);
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => mockMatchMedia)
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('initial state', () => {
    it('should read initial value from media query', async () => {
      mockMatchMedia = new MockMediaQueryList(false);
      vi.stubGlobal(
        'matchMedia',
        vi.fn(() => mockMatchMedia)
      );

      const { result } = renderHook(() => useReducedMotion());

      // After effect runs, should have the media query value
      await waitFor(() => {
        expect(result.current).toBe(false);
      });
    });

    it('should return false when prefers-reduced-motion is not set', async () => {
      mockMatchMedia = new MockMediaQueryList(false);
      vi.stubGlobal(
        'matchMedia',
        vi.fn(() => mockMatchMedia)
      );

      const { result } = renderHook(() => useReducedMotion());

      await waitFor(() => {
        expect(result.current).toBe(false);
      });
    });

    it('should return true when prefers-reduced-motion is set', async () => {
      mockMatchMedia = new MockMediaQueryList(true);
      vi.stubGlobal(
        'matchMedia',
        vi.fn(() => mockMatchMedia)
      );

      const { result } = renderHook(() => useReducedMotion());

      await waitFor(() => {
        expect(result.current).toBe(true);
      });
    });
  });

  describe('media query changes', () => {
    it('should update when media query changes to true', async () => {
      mockMatchMedia = new MockMediaQueryList(false);
      vi.stubGlobal(
        'matchMedia',
        vi.fn(() => mockMatchMedia)
      );

      const { result } = renderHook(() => useReducedMotion());

      await waitFor(() => {
        expect(result.current).toBe(false);
      });

      // Simulate user enabling reduced motion
      mockMatchMedia.change(true);

      await waitFor(() => {
        expect(result.current).toBe(true);
      });
    });

    it('should update when media query changes to false', async () => {
      mockMatchMedia = new MockMediaQueryList(true);
      vi.stubGlobal(
        'matchMedia',
        vi.fn(() => mockMatchMedia)
      );

      const { result } = renderHook(() => useReducedMotion());

      await waitFor(() => {
        expect(result.current).toBe(true);
      });

      // Simulate user disabling reduced motion
      mockMatchMedia.change(false);

      await waitFor(() => {
        expect(result.current).toBe(false);
      });
    });

    it('should handle multiple changes', async () => {
      mockMatchMedia = new MockMediaQueryList(false);
      vi.stubGlobal(
        'matchMedia',
        vi.fn(() => mockMatchMedia)
      );

      const { result } = renderHook(() => useReducedMotion());

      await waitFor(() => {
        expect(result.current).toBe(false);
      });

      mockMatchMedia.change(true);
      await waitFor(() => {
        expect(result.current).toBe(true);
      });

      mockMatchMedia.change(false);
      await waitFor(() => {
        expect(result.current).toBe(false);
      });

      mockMatchMedia.change(true);
      await waitFor(() => {
        expect(result.current).toBe(true);
      });
    });
  });

  describe('cleanup', () => {
    it('should remove event listener on unmount', async () => {
      mockMatchMedia = new MockMediaQueryList(false);
      const removeEventListenerSpy = vi.spyOn(
        mockMatchMedia,
        'removeEventListener'
      );
      vi.stubGlobal(
        'matchMedia',
        vi.fn(() => mockMatchMedia)
      );

      const { unmount } = renderHook(() => useReducedMotion());

      await waitFor(() => {
        expect(removeEventListenerSpy).not.toHaveBeenCalled();
      });

      unmount();

      expect(removeEventListenerSpy).toHaveBeenCalledTimes(1);
      expect(removeEventListenerSpy).toHaveBeenCalledWith(
        'change',
        expect.any(Function)
      );
    });
  });

  describe('edge cases', () => {
    it('should handle missing matchMedia', async () => {
      vi.stubGlobal('matchMedia', undefined);

      const { result } = renderHook(() => useReducedMotion());

      await waitFor(() => {
        expect(result.current).toBe(false);
      });
    });

    it('should handle matchMedia that is not a function', async () => {
      vi.stubGlobal('matchMedia', 'not a function');

      const { result } = renderHook(() => useReducedMotion());

      await waitFor(() => {
        expect(result.current).toBe(false);
      });
    });
  });
});

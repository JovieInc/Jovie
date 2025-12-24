import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useReducedMotion } from '@/lib/hooks/useReducedMotion';

describe('useReducedMotion', () => {
  // Mock matchMedia
  const matchMediaMock = vi.fn();

  // Mock event listeners (modern API)
  const addEventListenerMock = vi.fn();
  const removeEventListenerMock = vi.fn();

  // Mock event listeners (legacy API for older browsers)
  const addListenerMock = vi.fn();
  const removeListenerMock = vi.fn();

  beforeEach(() => {
    // Setup mocks before each test
    Object.defineProperty(global.window, 'matchMedia', {
      writable: true,
      value: matchMediaMock,
    });
  });

  afterEach(() => {
    // Clear mocks after each test
    vi.clearAllMocks();
  });

  describe('initial state detection', () => {
    it('should return false when prefers-reduced-motion is not set', () => {
      // Mock matchMedia to return no preference for reduced motion
      matchMediaMock.mockReturnValue({
        matches: false,
        addEventListener: addEventListenerMock,
        removeEventListener: removeEventListenerMock,
      });

      const { result } = renderHook(() => useReducedMotion());

      expect(result.current).toBe(false);
      expect(matchMediaMock).toHaveBeenCalledWith(
        '(prefers-reduced-motion: reduce)'
      );
      expect(addEventListenerMock).toHaveBeenCalledWith(
        'change',
        expect.any(Function)
      );
    });

    it('should return true when prefers-reduced-motion is set to reduce', () => {
      // Mock matchMedia to return preference for reduced motion
      matchMediaMock.mockReturnValue({
        matches: true,
        addEventListener: addEventListenerMock,
        removeEventListener: removeEventListenerMock,
      });

      const { result } = renderHook(() => useReducedMotion());

      expect(result.current).toBe(true);
      expect(matchMediaMock).toHaveBeenCalledWith(
        '(prefers-reduced-motion: reduce)'
      );
      expect(addEventListenerMock).toHaveBeenCalledWith(
        'change',
        expect.any(Function)
      );
    });
  });

  describe('dynamic preference changes', () => {
    it('should update when user toggles reduced motion preference', () => {
      let changeHandler: ((event: { matches: boolean }) => void) | null = null;

      // Capture the change handler when addEventListener is called
      addEventListenerMock.mockImplementation(
        (event: string, handler: (event: { matches: boolean }) => void) => {
          if (event === 'change') {
            changeHandler = handler;
          }
        }
      );

      // Initial state: no reduced motion
      matchMediaMock.mockReturnValue({
        matches: false,
        addEventListener: addEventListenerMock,
        removeEventListener: removeEventListenerMock,
      });

      const { result } = renderHook(() => useReducedMotion());

      // Initially false
      expect(result.current).toBe(false);

      // Simulate user enabling reduced motion in system settings
      act(() => {
        if (changeHandler) {
          changeHandler({ matches: true });
        }
      });

      // Should now be true
      expect(result.current).toBe(true);

      // Simulate user disabling reduced motion
      act(() => {
        if (changeHandler) {
          changeHandler({ matches: false });
        }
      });

      // Should be false again
      expect(result.current).toBe(false);
    });
  });

  describe('cleanup', () => {
    it('should clean up event listener on unmount', () => {
      // Mock matchMedia to return no preference for reduced motion
      matchMediaMock.mockReturnValue({
        matches: false,
        addEventListener: addEventListenerMock,
        removeEventListener: removeEventListenerMock,
      });

      const { unmount } = renderHook(() => useReducedMotion());

      unmount();

      expect(removeEventListenerMock).toHaveBeenCalledWith(
        'change',
        expect.any(Function)
      );
    });

    it('should pass the same handler to remove that was added', () => {
      let capturedAddHandler: Function | null = null;
      let capturedRemoveHandler: Function | null = null;

      addEventListenerMock.mockImplementation(
        (_event: string, handler: Function) => {
          capturedAddHandler = handler;
        }
      );
      removeEventListenerMock.mockImplementation(
        (_event: string, handler: Function) => {
          capturedRemoveHandler = handler;
        }
      );

      matchMediaMock.mockReturnValue({
        matches: false,
        addEventListener: addEventListenerMock,
        removeEventListener: removeEventListenerMock,
      });

      const { unmount } = renderHook(() => useReducedMotion());
      unmount();

      // The same handler function should be passed to both add and remove
      expect(capturedAddHandler).toBe(capturedRemoveHandler);
    });
  });

  describe('legacy browser support', () => {
    it('should use addListener/removeListener for older browsers', () => {
      // Mock matchMedia without modern addEventListener (like Safari <14)
      matchMediaMock.mockReturnValue({
        matches: true,
        addEventListener: undefined,
        removeEventListener: undefined,
        addListener: addListenerMock,
        removeListener: removeListenerMock,
      });

      const { result, unmount } = renderHook(() => useReducedMotion());

      expect(result.current).toBe(true);
      expect(addListenerMock).toHaveBeenCalledWith(expect.any(Function));

      unmount();

      expect(removeListenerMock).toHaveBeenCalledWith(expect.any(Function));
    });

    it('should update via legacy listener when preference changes', () => {
      let changeHandler: ((event: { matches: boolean }) => void) | null = null;

      // Capture the change handler for legacy API
      addListenerMock.mockImplementation(
        (handler: (event: { matches: boolean }) => void) => {
          changeHandler = handler;
        }
      );

      // Mock matchMedia without modern addEventListener
      matchMediaMock.mockReturnValue({
        matches: false,
        addEventListener: undefined,
        removeEventListener: undefined,
        addListener: addListenerMock,
        removeListener: removeListenerMock,
      });

      const { result } = renderHook(() => useReducedMotion());

      expect(result.current).toBe(false);

      // Simulate preference change via legacy API
      act(() => {
        if (changeHandler) {
          changeHandler({ matches: true });
        }
      });

      expect(result.current).toBe(true);
    });
  });

  describe('graceful degradation', () => {
    it('should handle missing matchMedia gracefully', () => {
      // Mock window without matchMedia
      Object.defineProperty(global.window, 'matchMedia', {
        writable: true,
        value: undefined,
      });

      const { result } = renderHook(() => useReducedMotion());

      // Should default to false when matchMedia is not available on client
      expect(result.current).toBe(false);
    });

    it('should handle matchMedia that is not a function', () => {
      // Mock window with matchMedia as a non-function value
      Object.defineProperty(global.window, 'matchMedia', {
        writable: true,
        value: 'not a function',
      });

      const { result } = renderHook(() => useReducedMotion());

      // Should default to false when matchMedia is not callable
      expect(result.current).toBe(false);
    });
  });

  describe('query accuracy', () => {
    it('should query the correct media feature', () => {
      matchMediaMock.mockReturnValue({
        matches: false,
        addEventListener: addEventListenerMock,
        removeEventListener: removeEventListenerMock,
      });

      renderHook(() => useReducedMotion());

      // Verify the exact media query string
      expect(matchMediaMock).toHaveBeenCalledTimes(1);
      expect(matchMediaMock).toHaveBeenCalledWith(
        '(prefers-reduced-motion: reduce)'
      );
    });
  });
});

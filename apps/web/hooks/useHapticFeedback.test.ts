import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useHapticFeedback } from './useHapticFeedback';

afterEach(() => {
  Reflect.deleteProperty(window, 'webkit');
  vi.restoreAllMocks();
});

describe('useHapticFeedback', () => {
  it('vibrates with the pattern where the Vibration API exists', () => {
    const vibrate = vi.fn();
    Object.defineProperty(navigator, 'vibrate', {
      configurable: true,
      value: vibrate,
    });
    renderHook(() => useHapticFeedback()).result.current.selection();
    expect(vibrate).toHaveBeenCalledWith([5]);
  });
  it('prefers the native engine inside the iOS app and does not also vibrate', () => {
    const vibrate = vi.fn();
    const post = vi.fn();
    Object.defineProperty(navigator, 'vibrate', {
      configurable: true,
      value: vibrate,
    });
    Object.defineProperty(window, 'webkit', {
      configurable: true,
      value: { messageHandlers: { jovieHaptics: { postMessage: post } } },
    });
    const haptics = renderHook(() => useHapticFeedback()).result.current;
    haptics.selection();
    haptics.success();
    expect(post).toHaveBeenNthCalledWith(1, { style: 'selection' });
    expect(post).toHaveBeenNthCalledWith(2, { style: 'success' });
    expect(vibrate).not.toHaveBeenCalled();
  });
  it('falls back to vibrate if the native bridge throws', () => {
    const vibrate = vi.fn();
    Object.defineProperty(navigator, 'vibrate', {
      configurable: true,
      value: vibrate,
    });
    Object.defineProperty(window, 'webkit', {
      configurable: true,
      value: {
        messageHandlers: {
          jovieHaptics: {
            postMessage: () => {
              throw new Error('gone');
            },
          },
        },
      },
    });
    renderHook(() => useHapticFeedback()).result.current.light();
    expect(vibrate).toHaveBeenCalledWith([10]);
  });
  it('is a silent no-op with no haptic support at all', () => {
    Object.defineProperty(navigator, 'vibrate', {
      configurable: true,
      value: undefined,
    });
    expect(() =>
      renderHook(() => useHapticFeedback()).result.current.heavy()
    ).not.toThrow();
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  NATIVE_HAPTIC_HANDLER,
  postNativeHaptic,
} from './native-haptic-bridge';

function installHandler(postMessage: (message: unknown) => void) {
  Object.defineProperty(window, 'webkit', {
    configurable: true,
    value: { messageHandlers: { [NATIVE_HAPTIC_HANDLER]: { postMessage } } },
  });
}

afterEach(() => {
  Reflect.deleteProperty(window, 'webkit');
  vi.restoreAllMocks();
});

describe('postNativeHaptic', () => {
  it('is a no-op that reports false outside the app', () => {
    expect(postNativeHaptic('selection')).toBe(false);
  });
  it('posts the style to the native handler and reports true', () => {
    const post = vi.fn();
    installHandler(post);
    expect(postNativeHaptic('selection')).toBe(true);
    expect(post).toHaveBeenCalledWith({ style: 'selection' });
  });
  it('uses the agreed handler name', () => {
    expect(NATIVE_HAPTIC_HANDLER).toBe('jovieHaptics');
  });
  it('reports false when the handler throws so callers can fall back', () => {
    installHandler(() => {
      throw new Error('bridge gone');
    });
    expect(postNativeHaptic('success')).toBe(false);
  });
  it('ignores other message handlers and malformed bridges', () => {
    Object.defineProperty(window, 'webkit', {
      configurable: true,
      value: { messageHandlers: { other: { postMessage: vi.fn() } } },
    });
    expect(postNativeHaptic('light')).toBe(false);
    Object.defineProperty(window, 'webkit', {
      configurable: true,
      value: { messageHandlers: { [NATIVE_HAPTIC_HANDLER]: {} } },
    });
    expect(postNativeHaptic('light')).toBe(false);
  });
});

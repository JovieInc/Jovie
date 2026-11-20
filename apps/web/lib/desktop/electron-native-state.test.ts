/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  observeDesktopFullScreen,
  observeDesktopVisualActivity,
} from './electron-native-state';

function setElectronAPI(api: object): void {
  Object.defineProperty(window, 'electronAPI', {
    configurable: true,
    writable: true,
    value: api,
  });
}
beforeEach(() => Reflect.deleteProperty(window, 'electronAPI'));
afterEach(() => Reflect.deleteProperty(window, 'electronAPI'));
describe('native window state observers', () => {
  it('omits visual subscription on old and partial bridges', () => {
    const callback = vi.fn();
    const subscribe = vi.fn();
    for (const api of [
      {},
      { onVisualActivity: subscribe },
      { getVisualActivity: vi.fn() },
    ]) {
      setElectronAPI(api);
      observeDesktopVisualActivity(callback)();
    }
    expect(subscribe).not.toHaveBeenCalled();
    expect(callback).not.toHaveBeenCalled();
  });

  it('keeps a newer visibility event over a delayed initial snapshot', async () => {
    let resolveSnapshot: ((active: boolean) => void) | undefined;
    let listener: ((active: boolean) => void) | undefined;
    const unsubscribe = vi.fn();
    setElectronAPI({
      getVisualActivity: () =>
        new Promise<boolean>(resolve => {
          resolveSnapshot = resolve;
        }),
      onVisualActivity: (callback: (active: boolean) => void) => {
        listener = callback;
        return unsubscribe;
      },
    });
    const callback = vi.fn();
    const dispose = observeDesktopVisualActivity(callback);
    listener?.(false);
    resolveSnapshot?.(true);
    await Promise.resolve();
    expect(callback).toHaveBeenCalledExactlyOnceWith(false);
    dispose();
    listener?.(true);
    expect(callback).toHaveBeenCalledOnce();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it('reads the initial native state and tolerates rejected or malformed snapshots', async () => {
    const callback = vi.fn();
    for (const snapshot of [
      Promise.resolve(false),
      Promise.resolve(null),
      Promise.reject(new Error('old shell')),
    ]) {
      setElectronAPI({
        getVisualActivity: () => snapshot,
        onVisualActivity: () => () => undefined,
      });
      const dispose = observeDesktopVisualActivity(callback);
      await Promise.resolve();
      await Promise.resolve();
      dispose();
    }
    expect(callback).toHaveBeenCalledExactlyOnceWith(false);
  });

  it('omits the full-screen subscription on old and partial bridges', () => {
    const callback = vi.fn();
    const subscribe = vi.fn();
    for (const api of [
      {},
      { onFullScreenChanged: subscribe },
      { getFullScreenState: vi.fn() },
    ]) {
      setElectronAPI(api);
      observeDesktopFullScreen(callback)();
    }
    expect(subscribe).not.toHaveBeenCalled();
    expect(callback).not.toHaveBeenCalled();
  });

  it('keeps a newer full-screen event over a delayed initial snapshot', async () => {
    let resolveSnapshot: ((isFullScreen: boolean) => void) | undefined;
    let listener: ((isFullScreen: boolean) => void) | undefined;
    const unsubscribe = vi.fn();
    setElectronAPI({
      getFullScreenState: () =>
        new Promise<boolean>(resolve => {
          resolveSnapshot = resolve;
        }),
      onFullScreenChanged: (callback: (isFullScreen: boolean) => void) => {
        listener = callback;
        return unsubscribe;
      },
    });
    const callback = vi.fn();
    const dispose = observeDesktopFullScreen(callback);
    listener?.(false);
    resolveSnapshot?.(true);
    await Promise.resolve();
    expect(callback).toHaveBeenCalledExactlyOnceWith(false);
    dispose();
    listener?.(true);
    expect(callback).toHaveBeenCalledOnce();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it('reads the initial native full-screen state and tolerates rejected snapshots', async () => {
    const callback = vi.fn();
    for (const snapshot of [
      Promise.resolve(true),
      Promise.reject(new Error('old shell')),
    ]) {
      setElectronAPI({
        getFullScreenState: () => snapshot,
        onFullScreenChanged: () => () => undefined,
      });
      const dispose = observeDesktopFullScreen(callback);
      await Promise.resolve();
      await Promise.resolve();
      dispose();
    }
    expect(callback).toHaveBeenCalledExactlyOnceWith(true);
  });
});

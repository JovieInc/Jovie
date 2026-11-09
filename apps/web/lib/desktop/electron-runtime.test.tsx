import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import {
  getElectronAPI,
  getRawElectronAPI,
  isDesktopEnvironment,
  isElectronRuntime,
  useIsElectronRuntime,
} from './electron-runtime';

afterEach(() => {
  Reflect.deleteProperty(window, 'electronAPI');
  document.documentElement.removeAttribute('data-desktop-runtime');
});

describe('desktop runtime detection', () => {
  it('keeps ordinary browser tabs outside the desktop shell', () => {
    expect(getRawElectronAPI()).toBeUndefined();
    expect(getElectronAPI()).toBeUndefined();
    expect(isDesktopEnvironment()).toBe(false);
    expect(isElectronRuntime()).toBe(false);
    expect(renderHook(useIsElectronRuntime).result.current).toBe(false);
  });

  it('rejects malformed preload bridges', () => {
    for (const value of [null, 'electron', false]) {
      Object.defineProperty(window, 'electronAPI', {
        configurable: true,
        value,
      });
      expect(getRawElectronAPI()).toBeUndefined();
      expect(isDesktopEnvironment()).toBe(false);
    }
  });

  it('recognizes older desktop shells without treating a partial bridge as complete', () => {
    const partialBridge = { platform: 'darwin', versions: { app: 'old' } };
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: partialBridge,
    });
    expect(getRawElectronAPI()).toBe(partialBridge);
    expect(getElectronAPI()).toBeUndefined();
    expect(isDesktopEnvironment()).toBe(true);
    expect(renderHook(useIsElectronRuntime).result.current).toBe(true);
  });

  it('recognizes the early desktop marker before the bridge arrives', () => {
    document.documentElement.dataset.desktopRuntime = 'electron';
    expect(getRawElectronAPI()).toBeUndefined();
    expect(isElectronRuntime()).toBe(true);
    expect(renderHook(useIsElectronRuntime).result.current).toBe(true);
  });
});

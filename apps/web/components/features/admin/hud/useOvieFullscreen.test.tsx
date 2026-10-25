import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useOvieFullscreen } from './useOvieFullscreen';

let search = '';
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(search),
}));
vi.mock('@/lib/desktop/electron-bridge', () => ({
  isElectronRuntime: () => false,
}));

const key = (init: KeyboardEventInit) =>
  act(() => {
    globalThis.dispatchEvent(new KeyboardEvent('keydown', init));
  });
const flag = () => document.documentElement.dataset.ovieFullscreen;

describe('useOvieFullscreen', () => {
  beforeEach(() => {
    search = '';
    localStorage.clear();
  });
  afterEach(() => {
    delete document.documentElement.dataset.ovieFullscreen;
  });

  it('starts off, toggles, persists per device, and marks <html> so the main plane (composer included) fills the display', () => {
    const { result } = renderHook(() => useOvieFullscreen());
    expect(result.current.on).toBe(false);
    expect(flag()).toBeUndefined();
    act(() => result.current.toggle());
    expect(result.current.on).toBe(true);
    expect(flag()).toBe('1');
    expect(localStorage.getItem('ovie-home-fullscreen')).toBe('1');
    act(() => result.current.toggle());
    expect(flag()).toBeUndefined();
    expect(localStorage.getItem('ovie-home-fullscreen')).toBe('0');
  });

  it('restores the per-device preference and honours ?fullscreen=1', () => {
    localStorage.setItem('ovie-home-fullscreen', '1');
    expect(renderHook(() => useOvieFullscreen()).result.current.on).toBe(true);
    localStorage.clear();
    search = 'fullscreen=1';
    expect(renderHook(() => useOvieFullscreen()).result.current.on).toBe(true);
  });

  it('Cmd+Shift+F toggles, Esc leaves, and the palette event toggles', () => {
    const { result } = renderHook(() => useOvieFullscreen());
    key({ key: 'F', code: 'KeyF', metaKey: true, shiftKey: true });
    expect(result.current.on).toBe(true);
    key({ key: 'Escape' });
    expect(result.current.on).toBe(false);
    act(() => {
      globalThis.dispatchEvent(new Event('ovie:fullscreen-toggle'));
    });
    expect(result.current.on).toBe(true);
  });

  it('a conversation can claim Esc first: a capture listener that stops propagation keeps Full Screen on', () => {
    const { result } = renderHook(() => useOvieFullscreen());
    act(() => result.current.toggle());
    const claim = (event: Event) => event.stopImmediatePropagation();
    globalThis.addEventListener('keydown', claim, true);
    key({ key: 'Escape' });
    globalThis.removeEventListener('keydown', claim, true);
    expect(result.current.on).toBe(true);
  });

  it('clears the <html> mark on unmount', () => {
    const { result, unmount } = renderHook(() => useOvieFullscreen());
    act(() => result.current.toggle());
    unmount();
    expect(flag()).toBeUndefined();
  });
});

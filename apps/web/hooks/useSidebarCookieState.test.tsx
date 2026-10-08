import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useSidebarCookieState } from './useSidebarCookieState';

afterEach(() => {
  vi.restoreAllMocks();
  document.cookie = 'sidebar:state=; path=/; max-age=0';
});

describe('sidebar requested state', () => {
  it('keeps the safe default and session toggles when cookie access is denied', () => {
    const original = Object.getOwnPropertyDescriptor(document, 'cookie');
    Object.defineProperty(document, 'cookie', {
      configurable: true,
      get() {
        throw new DOMException('denied', 'SecurityError');
      },
      set() {
        throw new DOMException('denied', 'SecurityError');
      },
    });
    try {
      const onOpenChange = vi.fn();
      const { result } = renderHook(() =>
        useSidebarCookieState({ defaultOpen: true, onOpenChange })
      );
      expect(result.current.open).toBe(true);
      act(() => result.current.setOpen(false));
      expect(result.current.open).toBe(false);
      expect(onOpenChange).toHaveBeenCalledWith(false);
    } finally {
      if (original) Object.defineProperty(document, 'cookie', original);
      else Reflect.deleteProperty(document, 'cookie');
    }
  });
  it('honors every toggle before React commits the batch', () => {
    const { result } = renderHook(() =>
      useSidebarCookieState({ defaultOpen: true })
    );
    act(() => {
      result.current.setOpen(value => !value);
      result.current.setOpen(value => !value);
    });
    expect(result.current.open).toBe(true);
    expect(document.cookie).toContain('sidebar:state=true');
    act(() => {
      for (let index = 0; index < 5; index++)
        result.current.setOpen(value => !value);
    });
    expect(result.current.open).toBe(false);
    expect(document.cookie).toContain('sidebar:state=false');
  });

  it('composes an explicit request and subsequent toggles in a controlled batch', () => {
    const onOpenChange = vi.fn();
    const { result, rerender } = renderHook(
      ({ open }) =>
        useSidebarCookieState({ defaultOpen: true, open, onOpenChange }),
      { initialProps: { open: true } }
    );
    act(() => {
      result.current.setOpen(false);
      result.current.setOpen(value => !value);
    });
    expect(onOpenChange.mock.calls).toEqual([[false], [true]]);
    rerender({ open: false });
    act(() => result.current.setOpen(value => !value));
    expect(onOpenChange).toHaveBeenLastCalledWith(true);
  });
});

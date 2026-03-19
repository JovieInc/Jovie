import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  SIDEBAR_KEYBOARD_SHORTCUT,
  useSidebarKeyboardShortcut,
} from '@/hooks/useSidebarKeyboardShortcut';

describe('useSidebarKeyboardShortcut', () => {
  let onToggle: () => void;

  beforeEach(() => {
    onToggle = vi.fn();
  });

  function dispatchKeyDown(
    opts: Partial<KeyboardEventInit> & { key?: string | undefined }
  ) {
    const event = new KeyboardEvent('keydown', {
      bubbles: true,
      ...opts,
    });
    // For events with undefined key, override the property
    if (opts.key === undefined && 'key' in opts) {
      Object.defineProperty(event, 'key', { value: undefined });
    }
    globalThis.dispatchEvent(event);
    return event;
  }

  it('fires handler on Cmd+B', () => {
    renderHook(() => useSidebarKeyboardShortcut(onToggle));

    act(() => {
      dispatchKeyDown({ key: SIDEBAR_KEYBOARD_SHORTCUT, metaKey: true });
    });

    expect(onToggle).toHaveBeenCalledOnce();
  });

  it('fires handler on Ctrl+B', () => {
    renderHook(() => useSidebarKeyboardShortcut(onToggle));

    act(() => {
      dispatchKeyDown({ key: SIDEBAR_KEYBOARD_SHORTCUT, ctrlKey: true });
    });

    expect(onToggle).toHaveBeenCalledOnce();
  });

  it('does not fire handler without modifier key', () => {
    renderHook(() => useSidebarKeyboardShortcut(onToggle));

    act(() => {
      dispatchKeyDown({ key: SIDEBAR_KEYBOARD_SHORTCUT });
    });

    expect(onToggle).not.toHaveBeenCalled();
  });

  it('does not fire handler for wrong key', () => {
    renderHook(() => useSidebarKeyboardShortcut(onToggle));

    act(() => {
      dispatchKeyDown({ key: 'x', metaKey: true });
    });

    expect(onToggle).not.toHaveBeenCalled();
  });

  it('does not crash when event.key is undefined', () => {
    renderHook(() => useSidebarKeyboardShortcut(onToggle));

    expect(() => {
      act(() => {
        dispatchKeyDown({ key: undefined, metaKey: true });
      });
    }).not.toThrow();

    expect(onToggle).not.toHaveBeenCalled();
  });

  it('supports custom shortcut key', () => {
    renderHook(() => useSidebarKeyboardShortcut(onToggle, 'k'));

    act(() => {
      dispatchKeyDown({ key: 'k', metaKey: true });
    });

    expect(onToggle).toHaveBeenCalledOnce();
  });
});

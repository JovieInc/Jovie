import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  SIDEBAR_KEYBOARD_SHORTCUT,
  SIDEBAR_KEYBOARD_SHORTCUT_BARE,
  useSidebarKeyboardShortcut,
} from '@/hooks/useSidebarKeyboardShortcut';

describe('useSidebarKeyboardShortcut', () => {
  let onToggle: () => void;

  beforeEach(() => {
    onToggle = vi.fn();
  });

  afterEach(() => {
    document.body.replaceChildren();
  });

  function dispatchKeyDown(
    opts: Partial<KeyboardEventInit> & {
      key?: string | undefined;
      target?: EventTarget | null;
    }
  ) {
    const { target, ...init } = opts;
    const event = new KeyboardEvent('keydown', {
      bubbles: true,
      ...init,
    });
    // For events with undefined key, override the property
    if (opts.key === undefined && 'key' in opts) {
      Object.defineProperty(event, 'key', { value: undefined });
    }
    if (target) {
      Object.defineProperty(event, 'target', { value: target });
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

  it('fires handler on bare `[`', () => {
    renderHook(() => useSidebarKeyboardShortcut(onToggle));

    act(() => {
      dispatchKeyDown({ key: SIDEBAR_KEYBOARD_SHORTCUT_BARE });
    });

    expect(onToggle).toHaveBeenCalledOnce();
  });

  it('does not fire bare `[` while focus is in a form element', () => {
    const input = document.createElement('input');
    document.body.append(input);

    renderHook(() => useSidebarKeyboardShortcut(onToggle));

    act(() => {
      dispatchKeyDown({
        key: SIDEBAR_KEYBOARD_SHORTCUT_BARE,
        target: input,
      });
    });

    expect(onToggle).not.toHaveBeenCalled();
  });

  it('does not fire bare `[` when combined with a modifier', () => {
    renderHook(() => useSidebarKeyboardShortcut(onToggle));

    act(() => {
      dispatchKeyDown({
        key: SIDEBAR_KEYBOARD_SHORTCUT_BARE,
        metaKey: true,
      });
    });

    expect(onToggle).not.toHaveBeenCalled();
  });
});

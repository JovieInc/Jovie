import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  RIGHT_RAIL_KEYBOARD_SHORTCUT_BARE,
  useRightRailKeyboardShortcut,
} from '@/hooks/useRightRailKeyboardShortcut';

describe('useRightRailKeyboardShortcut', () => {
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
    if (opts.key === undefined && 'key' in opts) {
      Object.defineProperty(event, 'key', { value: undefined });
    }
    if (target) {
      Object.defineProperty(event, 'target', { value: target });
    }
    globalThis.dispatchEvent(event);
    return event;
  }

  it('fires handler on bare `]`', () => {
    renderHook(() => useRightRailKeyboardShortcut(onToggle));

    act(() => {
      dispatchKeyDown({ key: RIGHT_RAIL_KEYBOARD_SHORTCUT_BARE });
    });

    expect(onToggle).toHaveBeenCalledOnce();
  });

  it.each([{ repeat: true }, { isComposing: true }])(
    'ignores unstable key input %j',
    flags => {
      renderHook(() => useRightRailKeyboardShortcut(onToggle));
      act(() => dispatchKeyDown({ key: ']', ...flags }));
      expect(onToggle).not.toHaveBeenCalled();
    }
  );

  it('respects handled events and modal focus', () => {
    renderHook(() => useRightRailKeyboardShortcut(onToggle));
    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    const button = document.createElement('button');
    dialog.append(button);
    document.body.append(dialog);
    act(() => {
      dispatchKeyDown({ key: ']', target: button });
      const event = new KeyboardEvent('keydown', {
        key: ']',
        cancelable: true,
      });
      event.preventDefault();
      globalThis.dispatchEvent(event);
    });
    expect(onToggle).not.toHaveBeenCalled();
  });

  it('does not fire bare `]` while focus is in a form element', () => {
    const input = document.createElement('input');
    document.body.append(input);

    renderHook(() => useRightRailKeyboardShortcut(onToggle));

    act(() => {
      dispatchKeyDown({
        key: RIGHT_RAIL_KEYBOARD_SHORTCUT_BARE,
        target: input,
      });
    });

    expect(onToggle).not.toHaveBeenCalled();
  });

  it('does not fire bare `]` when combined with a modifier', () => {
    renderHook(() => useRightRailKeyboardShortcut(onToggle));

    act(() => {
      dispatchKeyDown({
        key: RIGHT_RAIL_KEYBOARD_SHORTCUT_BARE,
        metaKey: true,
      });
    });

    expect(onToggle).not.toHaveBeenCalled();
  });

  it('does not crash when event.key is undefined', () => {
    renderHook(() => useRightRailKeyboardShortcut(onToggle));

    expect(() => {
      act(() => {
        dispatchKeyDown({ key: undefined });
      });
    }).not.toThrow();

    expect(onToggle).not.toHaveBeenCalled();
  });
});

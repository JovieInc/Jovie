import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { commandsForSurface } from '@/lib/commands/registry';
import { KEYBOARD_SHORTCUTS, NAV_SHORTCUTS } from '@/lib/keyboard-shortcuts';
import { useSequentialShortcuts } from './useSequentialShortcuts';

const router = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));

function press(
  key: string,
  target: EventTarget = document.body,
  init: KeyboardEventInit = {}
) {
  const event = new KeyboardEvent('keydown', {
    key,
    bubbles: true,
    cancelable: true,
    composed: true,
    ...init,
  });
  act(() => {
    target.dispatchEvent(event);
  });
  return event;
}

describe('scoped shell navigation', () => {
  let fixture: HTMLDivElement;
  beforeEach(() => {
    router.push.mockClear();
    fixture = document.createElement('div');
    document.body.append(fixture);
  });
  afterEach(() => fixture.remove());

  it('executes the same Work target advertised by the menu and keyboard help', () => {
    renderHook(() => useSequentialShortcuts());
    const command = commandsForSurface('cmdk').find(
      entry => entry.id === 'go-work'
    );
    expect(command?.kind).toBe('nav');
    if (command?.kind !== 'nav') throw new Error('Work command missing');
    expect(NAV_SHORTCUTS.library).toMatchObject({
      commandId: command.id,
      href: command.href,
      keys: `${command.keyboardShortcut?.firstKey.toUpperCase()} then ${command.keyboardShortcut?.secondKey.toUpperCase()}`,
      label: `Go to ${command.label.toLowerCase()}`,
    });
    press('g');
    press('r');
    expect(router.push).toHaveBeenCalledExactlyOnceWith(command.href);
  });

  it.each(['input', 'textarea', 'select', 'audio', 'video'])(
    'yields to a focused %s and cancels an earlier sequence',
    tag => {
      renderHook(() => useSequentialShortcuts());
      const control = document.createElement(tag);
      fixture.append(control);
      press('g');
      expect(press('r', control).defaultPrevented).toBe(false);
      press('r');
      expect(router.push).not.toHaveBeenCalled();
    }
  );

  it.each([
    'dialog',
    'alertdialog',
    'menu',
    'listbox',
    'textbox',
    'searchbox',
    'combobox',
    'slider',
    'spinbutton',
    'tablist',
    'tree',
    'grid',
  ])('yields to the focused %s owner', role => {
    renderHook(() => useSequentialShortcuts());
    fixture.setAttribute('role', role);
    const control = document.createElement('button');
    fixture.append(control);
    expect(press('g', control).defaultPrevented).toBe(false);
    press('r', control);
    expect(router.push).not.toHaveBeenCalled();
  });

  it.each(['hidden', 'inert', 'aria-hidden'])(
    'suppresses keyboard effects under an %s ancestor',
    attribute => {
      renderHook(() => useSequentialShortcuts());
      fixture.setAttribute(
        attribute,
        attribute === 'aria-hidden' ? 'true' : ''
      );
      const control = document.createElement('button');
      fixture.append(control);
      expect(press('g', control).defaultPrevented).toBe(false);
      press('r', control);
      expect(router.push).not.toHaveBeenCalled();
    }
  );

  it('yields to an open native dialog without an ARIA role', () => {
    renderHook(() => useSequentialShortcuts());
    const dialog = document.createElement('dialog');
    dialog.open = true;
    const control = document.createElement('button');
    dialog.append(control);
    fixture.append(dialog);
    press('g', control);
    press('r', control);
    expect(router.push).not.toHaveBeenCalled();
  });

  it('keeps composer text, selection, and focus intact when a sequence reaches its editor', () => {
    renderHook(() => useSequentialShortcuts());
    const editor = document.createElement('textarea');
    editor.value = 'Unsent release notes';
    fixture.append(editor);
    press('g');
    editor.focus();
    editor.setSelectionRange(3, 7);
    expect(press('r', editor).defaultPrevented).toBe(false);
    expect(editor).toHaveFocus();
    editor.blur();
    press('r');
    expect(router.push).not.toHaveBeenCalled();
    expect(editor.value).toBe('Unsent release notes');
    expect([editor.selectionStart, editor.selectionEnd]).toEqual([3, 7]);
  });

  it('yields to nested contenteditable and shadow-root editors', () => {
    renderHook(() => useSequentialShortcuts());
    fixture.contentEditable = 'true';
    const text = document.createElement('span');
    fixture.append(text);
    press('g', text);
    press('r', text);
    fixture.contentEditable = 'false';
    const input = document.createElement('input');
    fixture.attachShadow({ mode: 'open' }).append(input);
    press('g', input);
    press('r', input);
    expect(router.push).not.toHaveBeenCalled();
  });

  it.each([
    { isComposing: true },
    { keyCode: 229 },
    { repeat: true },
    { altKey: true },
    { ctrlKey: true },
    { metaKey: true },
    { shiftKey: true },
  ])('cancels a pending sequence for protected input %j', init => {
    renderHook(() => useSequentialShortcuts());
    press('g');
    expect(press('r', document.body, init).defaultPrevented).toBe(false);
    press('r');
    expect(router.push).not.toHaveBeenCalled();
  });

  it.each(['blur', 'compositionstart', 'focusin', 'pointerdown'])(
    'cancels a sequence across %s without requiring another key',
    type => {
      renderHook(() => useSequentialShortcuts());
      press('g');
      act(() => {
        globalThis.dispatchEvent(new Event(type));
      });
      press('r');
      expect(router.push).not.toHaveBeenCalled();
    }
  );

  it('yields to an event consumed by the focused control', () => {
    renderHook(() => useSequentialShortcuts());
    fixture.addEventListener('keydown', event => event.preventDefault());
    press('g', fixture);
    press('r', fixture);
    expect(router.push).not.toHaveBeenCalled();
  });

  it('cannot complete a sequence on a different target', () => {
    renderHook(() => useSequentialShortcuts());
    press('g');
    press('r', fixture);
    expect(router.push).not.toHaveBeenCalled();
  });

  it('lets Escape belong to the nearest transient and cancels shell navigation', () => {
    renderHook(() => useSequentialShortcuts());
    press('g');
    expect(press('Escape').defaultPrevented).toBe(false);
    press('r');
    expect(router.push).not.toHaveBeenCalled();
  });

  it('fails closed for an unscoped collision instead of executing the first registered target', () => {
    renderHook(() => useSequentialShortcuts());
    KEYBOARD_SHORTCUTS.push({
      ...NAV_SHORTCUTS.library,
      id: 'conflicting-work',
      href: '/conflicting-target',
    });
    try {
      press('g');
      press('r');
      expect(router.push).not.toHaveBeenCalled();
    } finally {
      KEYBOARD_SHORTCUTS.pop();
    }
  });

  it('cancels a pending sequence when help opens and rejects extra help modifiers', () => {
    const onOpenShortcutsModal = vi.fn();
    renderHook(() => useSequentialShortcuts({ onOpenShortcutsModal }));
    press('g');
    press('?');
    press('r');
    press('?', document.body, { altKey: true });
    press('/', document.body, { metaKey: true, altKey: true });
    expect(onOpenShortcutsModal).toHaveBeenCalledOnce();
    expect(router.push).not.toHaveBeenCalled();
  });

  it('removes pending state and listeners when disabled or unmounted', () => {
    const { rerender, unmount } = renderHook(
      ({ enabled }) => useSequentialShortcuts({ enabled }),
      { initialProps: { enabled: true } }
    );
    press('g');
    rerender({ enabled: false });
    rerender({ enabled: true });
    press('r');
    unmount();
    press('g');
    press('r');
    expect(router.push).not.toHaveBeenCalled();
  });
});

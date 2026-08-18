import type React from 'react';

/**
 * Checks whether the given event target is a form element (input, textarea,
 * select, or contenteditable) where single-key shortcuts should be suppressed.
 */
export function isFormElement(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  // Walk up DOM tree to check for contentEditable (handles inheritance)
  let el: HTMLElement | null = target;
  while (el) {
    const ce = el.contentEditable;
    if (ce === 'true' || ce === 'plaintext-only') return true;
    if (ce === 'false') return false;
    el = el.parentElement;
  }
  return false;
}

/**
 * Handles keyboard activation for interactive elements.
 * Triggers the handler on Enter or Space key press, but ignores
 * activation when modifier keys (Ctrl, Shift, Alt, Meta) are pressed.
 */
export function handleActivationKeyDown(
  event: React.KeyboardEvent,
  handler: (event: React.KeyboardEvent) => void
) {
  const isActivationKey = event.key === 'Enter' || event.key === ' ';
  const hasModifier =
    event.ctrlKey || event.shiftKey || event.altKey || event.metaKey;

  if (isActivationKey && !hasModifier) {
    event.preventDefault();
    handler(event);
  }
}

/**
 * Returns the next index for a horizontal or vertical roving-focus control.
 *
 * Use this for a real composite control such as a toolbar or tablist. Native
 * buttons and links should otherwise keep their normal Tab behavior. The
 * helper deliberately does not call preventDefault so the owning component
 * can do that only when it handles a recognized navigation key.
 */
export function getRovingFocusIndex(
  key: string,
  currentIndex: number,
  itemCount: number
): number | null {
  if (itemCount <= 0 || currentIndex < 0 || currentIndex >= itemCount) {
    return null;
  }

  switch (key) {
    case 'ArrowRight':
    case 'ArrowDown':
      return (currentIndex + 1) % itemCount;
    case 'ArrowLeft':
    case 'ArrowUp':
      return (currentIndex - 1 + itemCount) % itemCount;
    case 'Home':
      return 0;
    case 'End':
      return itemCount - 1;
    default:
      return null;
  }
}

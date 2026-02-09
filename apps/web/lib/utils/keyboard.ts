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

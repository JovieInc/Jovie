import type React from 'react';

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

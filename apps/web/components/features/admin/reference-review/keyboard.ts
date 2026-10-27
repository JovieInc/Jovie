import type { ReferenceAction } from '@/lib/agent-os/design-reference-corpus/adaptive/types';

export function referenceKeyAction(
  event: KeyboardEvent,
  referenceId: string | null
): ReferenceAction | null {
  if (
    event.defaultPrevented ||
    event.repeat ||
    event.isComposing ||
    event.ctrlKey ||
    event.metaKey ||
    event.altKey ||
    event.shiftKey
  )
    return null;
  const target = event.target;
  if (
    target instanceof Element &&
    target.closest(
      'input, textarea, select, button, a, [contenteditable]:not([contenteditable="false"]), [role="textbox"], [role="dialog"], [role="menu"]'
    )
  )
    return null;
  if (event.key.toLowerCase() === 'z') return { type: 'undo' };
  if (!referenceId) return null;
  if (/^[1-5]$/u.test(event.key))
    return { type: 'rate', referenceId, rating: Number(event.key) };
  if (event.key.toLowerCase() === 's') return { type: 'skip', referenceId };
  return null;
}

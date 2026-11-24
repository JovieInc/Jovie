/** Legitimate shared-UI contracts (ASR-045). */
export const keyboardFocusRing = 'focus-visible:ring-2 focus-visible:ring-blue-500';
export const nestedRadius = {
  outerRadius: 16,
  padding: 8,
  innerRadius: 8, // outer - padding
};
export function onComposerFocus() {
  // Focus stays in the composer; Attach opens only on explicit activation.
}

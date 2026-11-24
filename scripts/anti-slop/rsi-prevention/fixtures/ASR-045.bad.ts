/** Deliberate-red shared-UI contract misses (ASR-045) — review-only signals. */
export const hoverFocusRing = 'hover:ring-2 hover:ring-blue-500';
export const clippedNested = {
  outerRadius: 16,
  padding: 8,
  // Wrong: nested radius copies outer instead of outer - padding
  innerRadius: 16,
};
export function onComposerFocusActivateAttach(openAttach: () => void) {
  // Focus on the textarea must not open Attach
  openAttach();
}

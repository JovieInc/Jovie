/**
 * Window event bus for the release-plan demo.
 *
 * Decouples the sidebar chat command from the calendar surface without
 * pulling in a shared store. The calendar listens for events; the chat
 * command dispatches them. SSR-safe (guarded on `window`).
 */

export const RELEASE_PLAN_MOVE_REMIX_NEAR_LA =
  'jovie:release-plan:move-remix-near-la';

export function dispatchMoveRemixNearLAShow(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(RELEASE_PLAN_MOVE_REMIX_NEAR_LA));
}

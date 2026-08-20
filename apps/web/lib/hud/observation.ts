/**
 * Scan-first Ops observation contract.
 *
 * Zero and Healthy are shown only after a successful observation.
 * Recoverable failures keep last-known-good evidence and expose Retry.
 */
export const HUD_OBSERVATION_STATES = [
  'loading',
  'fresh',
  'stale',
  'empty',
  'unavailable',
  'not_configured',
] as const;

export type HudObservationState = (typeof HUD_OBSERVATION_STATES)[number];

export const HUD_OBSERVATION_LABELS = {
  loading: 'Loading',
  fresh: 'Fresh',
  stale: 'Stale',
  empty: 'Empty',
  unavailable: 'Unavailable',
  not_configured: 'Not configured',
} as const satisfies Record<HudObservationState, string>;

export function isSuccessfulHudObservation(
  state: HudObservationState
): boolean {
  return state === 'fresh' || state === 'stale' || state === 'empty';
}

/**
 * Shared media lifecycle contract.
 *
 * Transport-specific queue states such as `queued` stay at the caller
 * boundary. Once media is being handled, every surface uses this finite set
 * of states so progress, failure, and cancellation cannot disappear into an
 * ad hoc string.
 */
export const MEDIA_LIFECYCLE_STATES = [
  'uploading',
  'processing',
  'ready',
  'failed',
  'cancelled',
] as const;

export type MediaLifecycleState = (typeof MEDIA_LIFECYCLE_STATES)[number];

export const MEDIA_LIFECYCLE_LABELS: Record<MediaLifecycleState, string> = {
  uploading: 'Uploading',
  processing: 'Processing',
  ready: 'Ready',
  failed: 'Failed',
  cancelled: 'Cancelled',
};

export const MEDIA_LIFECYCLE_TRANSITIONS = {
  uploading: ['processing', 'ready', 'failed', 'cancelled'],
  processing: ['ready', 'failed', 'cancelled'],
  ready: [],
  failed: [],
  cancelled: [],
} as const satisfies Record<
  MediaLifecycleState,
  readonly MediaLifecycleState[]
>;

export const MEDIA_LIFECYCLE_TERMINAL_STATES = [
  'ready',
  'failed',
  'cancelled',
] as const satisfies readonly MediaLifecycleState[];

export function isMediaLifecycleState(
  value: string
): value is MediaLifecycleState {
  return (MEDIA_LIFECYCLE_STATES as readonly string[]).includes(value);
}

export function isMediaLifecycleTerminal(state: MediaLifecycleState): boolean {
  return (MEDIA_LIFECYCLE_TERMINAL_STATES as readonly string[]).includes(state);
}

export function canTransitionMediaLifecycle(
  from: MediaLifecycleState,
  to: MediaLifecycleState
): boolean {
  return (
    from === to ||
    (
      MEDIA_LIFECYCLE_TRANSITIONS[from] as readonly MediaLifecycleState[]
    ).includes(to)
  );
}

export const AUDIO_PERFORMANCE_BUDGET_IDS = [
  'play-to-audible',
  'pause-visual-response',
  'timeline-scrub-settle',
  'cue-jump-settle',
  'buffer-recovery',
  'shell-transition-continuity',
  'progress-notification-cadence',
] as const;

export type AudioPerformanceBudgetId =
  (typeof AUDIO_PERFORMANCE_BUDGET_IDS)[number];

export type AudioPerformanceMeasurement =
  | 'cadence'
  | 'event-to-media-state'
  | 'event-to-paint';

export interface AudioPerformanceBudgetDefinition {
  readonly id: AudioPerformanceBudgetId;
  readonly label: string;
  readonly measurement: AudioPerformanceMeasurement;
  readonly maxP95Ms: number;
  readonly maxLongTasksPerRun: number;
  readonly requiresPlaybackContinuity: boolean;
}

/**
 * Cross-surface audio responsiveness contract.
 *
 * These are product budgets, not snapshots of one machine. Browser and app
 * harnesses may be faster, but every audio surface must stay within these
 * limits and must not create a task longer than the browser's 50ms threshold.
 */
export const AUDIO_PERFORMANCE_BUDGETS = {
  'play-to-audible': {
    id: 'play-to-audible',
    label: 'Playback intent to audible media',
    measurement: 'event-to-media-state',
    maxP95Ms: 250,
    maxLongTasksPerRun: 0,
    requiresPlaybackContinuity: false,
  },
  'pause-visual-response': {
    id: 'pause-visual-response',
    label: 'Pause intent to visible transport state',
    measurement: 'event-to-paint',
    maxP95Ms: 50,
    maxLongTasksPerRun: 0,
    requiresPlaybackContinuity: false,
  },
  'timeline-scrub-settle': {
    id: 'timeline-scrub-settle',
    label: 'Timeline scrub to settled playhead',
    measurement: 'event-to-media-state',
    maxP95Ms: 250,
    maxLongTasksPerRun: 0,
    requiresPlaybackContinuity: true,
  },
  'cue-jump-settle': {
    id: 'cue-jump-settle',
    label: 'Cue jump to settled playhead',
    measurement: 'event-to-media-state',
    maxP95Ms: 250,
    maxLongTasksPerRun: 0,
    requiresPlaybackContinuity: true,
  },
  'buffer-recovery': {
    id: 'buffer-recovery',
    label: 'Buffering event to resumed playback',
    measurement: 'event-to-media-state',
    maxP95Ms: 1_000,
    maxLongTasksPerRun: 0,
    requiresPlaybackContinuity: true,
  },
  'shell-transition-continuity': {
    id: 'shell-transition-continuity',
    label: 'App-shell transition to next paint without playback loss',
    measurement: 'event-to-paint',
    maxP95Ms: 100,
    maxLongTasksPerRun: 0,
    requiresPlaybackContinuity: true,
  },
  'progress-notification-cadence': {
    id: 'progress-notification-cadence',
    label: 'Playing progress notification cadence',
    measurement: 'cadence',
    maxP95Ms: 250,
    maxLongTasksPerRun: 0,
    requiresPlaybackContinuity: true,
  },
} as const satisfies Readonly<
  Record<AudioPerformanceBudgetId, AudioPerformanceBudgetDefinition>
>;

export function getAudioPerformanceBudget(
  id: AudioPerformanceBudgetId
): AudioPerformanceBudgetDefinition {
  return AUDIO_PERFORMANCE_BUDGETS[id];
}

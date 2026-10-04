/**
 * Closed-loop playbooks: every run records what it reached, and the next run
 * of the same playbook reads that history to aim at a bigger audience and
 * lean into the channels that grew it. Pure and deterministic.
 */

import type { TaskPriority } from '@/lib/tasks/types';
import type { PlaybookChannel, PlaybookTemplate } from './types';

export interface PlaybookChannelOutcome {
  /** People who saw it. */
  readonly reach: number;
  /** Clicks, replies, saves, listens: whatever counts as acting on it. */
  readonly engagement: number;
}

/** Stored under `tasks.metadata.playbook.outcome` on the run's project task. */
export interface PlaybookRunOutcome {
  readonly reach: number;
  readonly engagement: number;
  readonly newFollowers: number;
  readonly byChannel: Readonly<
    Partial<Record<PlaybookChannel, PlaybookChannelOutcome>>
  >;
  /** Free-text notes, e.g. "the acoustic cut beat the single". */
  readonly whatWorked: readonly string[];
  readonly recordedAt: string;
}

export interface PlaybookRunPlan {
  readonly runNumber: number;
  /** Reach the next run should beat. null on the first run. */
  readonly audienceTarget: number | null;
  readonly stepPriority: Readonly<Record<string, TaskPriority>>;
  readonly rationale: readonly string[];
}

/** Each run aims this much past the best reach so far. */
export const AUDIENCE_GROWTH_TARGET = 1.25;

const PRIORITY_ORDER: readonly TaskPriority[] = [
  'none',
  'low',
  'medium',
  'high',
  'urgent',
];

function shiftPriority(priority: TaskPriority, by: number): TaskPriority {
  // Urgent and none are deliberate choices; adaptation moves low..high only.
  if (priority === 'urgent' || priority === 'none') return priority;
  const index = PRIORITY_ORDER.indexOf(priority);
  return PRIORITY_ORDER[Math.min(3, Math.max(1, index + by))];
}

function engagementRate(outcome: PlaybookChannelOutcome): number {
  return outcome.reach > 0 ? outcome.engagement / outcome.reach : 0;
}

/**
 * Plans the next run from previous outcomes (oldest first). Channels whose
 * engagement rate beat the run average move up a priority level; channels
 * that reached people but drew no engagement in the last two runs move down.
 */
export function planNextRun(
  template: PlaybookTemplate,
  history: readonly PlaybookRunOutcome[]
): PlaybookRunPlan {
  const basePriority = Object.fromEntries(
    template.steps.map(step => [step.id, step.priority])
  ) as Record<string, TaskPriority>;
  const runNumber = history.length + 1;

  if (!template.iterative || history.length === 0) {
    return {
      runNumber,
      audienceTarget: null,
      stepPriority: basePriority,
      rationale: [],
    };
  }

  const bestReach = Math.max(...history.map(run => run.reach));
  const audienceTarget = Math.ceil(bestReach * AUDIENCE_GROWTH_TARGET);
  const last = history[history.length - 1];
  const previous = history.length > 1 ? history[history.length - 2] : null;
  const rationale = [
    `Run ${runNumber}: aim for ${audienceTarget} people, past the best run so far (${bestReach}).`,
  ];

  const channels = Object.entries(last.byChannel) as [
    PlaybookChannel,
    PlaybookChannelOutcome,
  ][];
  const average = last.reach > 0 ? last.engagement / last.reach : 0;
  const shift = new Map<PlaybookChannel, number>();

  for (const [channel, outcome] of channels) {
    const prior = previous?.byChannel[channel];
    const deadTwice =
      outcome.reach > 0 &&
      outcome.engagement === 0 &&
      prior !== undefined &&
      prior.reach > 0 &&
      prior.engagement === 0;
    if (deadTwice) {
      shift.set(channel, -1);
      rationale.push(`Less ${channel}: no engagement two runs in a row.`);
    } else if (outcome.reach > 0 && engagementRate(outcome) > average) {
      shift.set(channel, 1);
      rationale.push(`More ${channel}: it beat the average last run.`);
    }
  }

  const stepPriority = { ...basePriority };
  for (const step of template.steps) {
    const by = step.channel ? shift.get(step.channel) : undefined;
    if (by) {
      stepPriority[step.id] = shiftPriority(step.priority, by);
    }
  }

  return { runNumber, audienceTarget, stepPriority, rationale };
}

export function isPlaybookRunOutcome(
  value: unknown
): value is PlaybookRunOutcome {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.reach === 'number' &&
    typeof record.engagement === 'number' &&
    typeof record.newFollowers === 'number' &&
    typeof record.byChannel === 'object' &&
    record.byChannel !== null &&
    Array.isArray(record.whatWorked) &&
    typeof record.recordedAt === 'string'
  );
}

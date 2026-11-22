import type { TaskPriority, TaskStatus } from '@/lib/tasks/types';

export type AccentPaletteName =
  | 'gray'
  | 'blue'
  | 'purple'
  | 'pink'
  | 'red'
  | 'orange'
  | 'green'
  | 'teal';

export const ACCENT_ROTATION: readonly AccentPaletteName[] = [
  'gray',
  'blue',
  'purple',
  'pink',
  'red',
  'orange',
  'green',
  'teal',
] as const;

export const TASK_STATUS_ACCENT: Record<TaskStatus, AccentPaletteName> = {
  backlog: 'gray',
  todo: 'blue',
  in_progress: 'purple',
  done: 'green',
  cancelled: 'red',
};

export const TASK_PRIORITY_ACCENT: Record<TaskPriority, AccentPaletteName> = {
  urgent: 'red',
  high: 'orange',
  medium: 'purple',
  low: 'teal',
  none: 'gray',
};

export const HUD_TONE_ACCENT = {
  good: 'green',
  warning: 'orange',
  bad: 'red',
  neutral: 'gray',
} as const;

export function getAccentCssVars(accent: AccentPaletteName) {
  return {
    solid: `var(--color-accent-${accent})`,
    subtle: `var(--color-accent-${accent}-subtle)`,
  } as const;
}

/**
 * Accent pack rotation (Tim, Nov 22 2026). Peer items rotate ion, ultra,
 * pulse, orange, mint, red. Green and red keep their success and failure
 * meaning, so they only join a set of GREEN_RED_MIN_SET or more peers. Sets of
 * 5 or fewer wrap ion, ultra, pulse, orange. The enforced copy of the
 * threshold lives in scripts/invariants/art-direction/accent-pack-config.mjs.
 */
export const GREEN_RED_MIN_SET = 6;

export type RotationAccent =
  | 'ion'
  | 'ultra'
  | 'pulse'
  | 'orange'
  | 'mint'
  | 'red';

const ROTATION_FULL: readonly RotationAccent[] = [
  'ion',
  'ultra',
  'pulse',
  'orange',
  'mint',
  'red',
];

/** The accent for item `index` in a peer set of `setSize` items. */
export function getRotationAccent(
  index: number,
  setSize: number
): RotationAccent {
  const pool =
    setSize >= GREEN_RED_MIN_SET ? ROTATION_FULL : ROTATION_FULL.slice(0, 4);
  return pool[
    ((index % pool.length) + pool.length) % pool.length
  ] as RotationAccent;
}

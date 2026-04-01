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

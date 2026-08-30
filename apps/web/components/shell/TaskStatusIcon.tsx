'use client';

import {
  Check,
  CircleDashed,
  Circle as CircleIcon,
  CircleSlash,
} from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Closed enum of task statuses surfaced by TaskStatusIcon — matches the
 * Linear-style task list states used across the shell. Lives here so the
 * icon module is the single source of truth.
 */
export type TaskStatus =
  | 'backlog'
  | 'todo'
  | 'in_progress'
  | 'done'
  | 'cancelled';

/**
 * TaskStatusIcon — 14×14 status glyph for Linear-style task rows.
 *
 * - `backlog` — dashed circle, quaternary tone (the row is parked).
 * - `todo` — solid circle outline, tertiary tone (queued).
 * - `in_progress` — half-filled cyan circle. When `agentRunning` is true,
 *   the glyph adds a calm-breath pulse so the row reads as live.
 * - `done` — emerald-filled circle with a check (clearly resolved).
 * - `cancelled` — slashed-circle, faded (intentionally retired).
 *
 * Pure leaf — caller controls `status` and the optional `agentRunning`
 * pulse modifier. Uses the shared `anim-calm-breath` keyframe defined in
 * `globals.css`.
 *
 * @example
 * ```tsx
 * <TaskStatusIcon status='in_progress' agentRunning />
 * ```
 */
export function TaskStatusIcon({
  status,
  agentRunning = false,
  className,
}: {
  readonly status: TaskStatus;
  readonly agentRunning?: boolean;
  readonly className?: string;
}) {
  switch (status) {
    case 'backlog':
      return (
        <CircleDashed
          className={cn('h-3.5 w-3.5 text-quaternary-token', className)}
          strokeWidth={2.25}
          aria-label='Backlog'
        />
      );
    case 'todo':
      return (
        <CircleIcon
          className={cn('h-3.5 w-3.5 text-tertiary-token', className)}
          strokeWidth={2.25}
          aria-label='Todo'
        />
      );
    case 'in_progress':
      return (
        <svg
          viewBox='0 0 14 14'
          className={cn(
            'h-3.5 w-3.5 text-cyan-400',
            agentRunning && 'anim-calm-breath',
            className
          )}
          aria-label={
            agentRunning ? 'In progress, agent running' : 'In progress'
          }
          role='img'
        >
          <title>In progress</title>
          <path d='M7 1 A6 6 0 0 0 7 13 Z' fill='currentColor' />
          <path
            d='M7 1 A6 6 0 0 1 7 13'
            fill='none'
            stroke='currentColor'
            strokeWidth={1.5}
            strokeDasharray='1.5 1.7'
            strokeLinecap='round'
          />
        </svg>
      );
    case 'done':
      return (
        <span
          role='img'
          aria-label='Done'
          className={cn(
            'inline-flex items-center justify-center h-3.5 w-3.5 rounded-full bg-emerald-500/85 text-(--linear-bg-page)',
            className
          )}
        >
          <Check aria-hidden='true' className='h-2.5 w-2.5' strokeWidth={3} />
        </span>
      );
    case 'cancelled':
      return (
        <CircleSlash
          className={cn('h-3.5 w-3.5 text-quaternary-token/70', className)}
          strokeWidth={2.25}
          aria-label='Cancelled'
        />
      );
  }
}

'use client';

import { Check } from 'lucide-react';

import { cn } from '../lib/utils';

export interface ProgressStep {
  readonly id: string;
  readonly label: string;
}

export type ProgressStepItemState =
  | 'completed'
  | 'current'
  | 'failed'
  | 'upcoming';

export interface ProgressStepsProps {
  /** Ordered steps. Steps before `current` render completed. */
  readonly steps: readonly ProgressStep[];
  /**
   * Controlled 0-based index of the active step. Finite out-of-range values
   * clamp into the list; a non-finite or omitted value degrades to
   * indeterminate mode (ProgressBar atom precedent).
   */
  readonly current?: number;
  /** Marks the active step as failed (determinate mode only). */
  readonly failed?: boolean;
  /** Progress position unknown: no step is marked and the region reports as an indeterminate progressbar. */
  readonly indeterminate?: boolean;
  /** Accessible name for the steps region. */
  readonly 'aria-label'?: string;
  readonly className?: string;
}

const MARKER_BASE =
  'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-xs font-medium tabular-nums transition-colors duration-subtle ease-subtle motion-reduce:transition-none';

const MARKER_STATE_CLASSES: Record<
  ProgressStepItemState,
  { marker: string; connector: string }
> = {
  completed: {
    marker: 'border-transparent bg-accent text-white',
    connector: 'bg-accent',
  },
  current: {
    marker: 'border-accent text-primary-token',
    connector: 'bg-surface-2',
  },
  failed: {
    marker: 'border-error text-error',
    connector: 'bg-surface-2',
  },
  upcoming: {
    marker: 'border-subtle text-tertiary-token',
    connector: 'bg-surface-2',
  },
};

function resolveStepState(
  index: number,
  activeIndex: number,
  failed: boolean
): ProgressStepItemState {
  if (index === activeIndex) {
    return failed ? 'failed' : 'current';
  }
  return index < activeIndex ? 'completed' : 'upcoming';
}

/**
 * Step indicator for multi-step flows (setup, import, review).
 *
 * Determinate mode: list semantics — each step is a list item, the active
 * step carries `aria-current="step"`, completed/failed steps append a
 * screen-reader state word, and a polite status region announces progress
 * as the controlled `current` index moves. Indeterminate mode: the region
 * reports as an indeterminate `progressbar` (no `aria-valuenow`, no
 * current step) because the position is unknown.
 *
 * Markers keep a fixed 20px box across every state, so completing steps
 * never shifts layout. Styling is token-only.
 */
export function ProgressSteps({
  steps,
  current,
  failed = false,
  indeterminate = false,
  'aria-label': ariaLabel,
  className,
}: ProgressStepsProps) {
  const total = steps.length;
  if (total === 0) {
    return null;
  }

  const hasDeterminateCurrent =
    !indeterminate && typeof current === 'number' && Number.isFinite(current);
  // Clamp like ProgressBar: below-range becomes the first step, above-range
  // (the flow finished) becomes `total`, where every step reads completed.
  const activeIndex = hasDeterminateCurrent
    ? Math.min(total, Math.max(0, Math.trunc(current)))
    : null;
  const isDeterminate = activeIndex !== null;
  const isComplete = isDeterminate && activeIndex === total;
  const activeStep =
    isDeterminate && !isComplete ? steps[activeIndex] : undefined;

  const list = (
    <ol
      data-part='list'
      aria-label={ariaLabel}
      className='flex w-full min-w-0 items-center gap-1.5'
    >
      {steps.map((step, index) => {
        const state = isDeterminate
          ? isComplete
            ? 'completed'
            : resolveStepState(index, activeIndex as number, failed)
          : 'upcoming';
        const styles = MARKER_STATE_CLASSES[state];
        const connectorCompleted = state === 'completed';
        return (
          <li
            key={step.id}
            data-part='step'
            data-state={state}
            aria-current={state === 'current' ? 'step' : undefined}
            className='flex min-w-0 items-center gap-1.5'
          >
            <span
              aria-hidden='true'
              data-part='marker'
              className={cn(MARKER_BASE, styles.marker)}
            >
              {state === 'completed' ? (
                <Check className='h-3 w-3' />
              ) : (
                index + 1
              )}
            </span>
            <span
              data-part='label'
              className={cn(
                'min-w-0 truncate text-sm transition-colors duration-subtle ease-subtle motion-reduce:transition-none',
                state === 'failed' || state === 'current'
                  ? 'text-primary-token'
                  : state === 'completed'
                    ? 'text-secondary-token'
                    : 'text-tertiary-token'
              )}
            >
              {step.label}
            </span>
            {state === 'completed' || state === 'failed' ? (
              <span className='sr-only'>
                {state === 'completed' ? 'Completed' : 'Failed'}
              </span>
            ) : null}
            {index < total - 1 ? (
              <span
                aria-hidden='true'
                data-part='connector'
                className={cn(
                  'h-px min-w-2 flex-1 transition-colors duration-subtle ease-subtle motion-reduce:transition-none',
                  connectorCompleted ? styles.connector : 'bg-surface-2'
                )}
              />
            ) : null}
          </li>
        );
      })}
    </ol>
  );

  if (!isDeterminate) {
    return (
      <div
        role='progressbar'
        aria-label={ariaLabel ?? 'Progress'}
        aria-valuemin={0}
        aria-valuemax={total}
        data-part='steps'
        data-state='indeterminate'
        className={cn('w-full', className)}
      >
        {list}
      </div>
    );
  }

  const announcement = isComplete
    ? `All ${total} steps complete`
    : failed
      ? `Step failed: ${activeStep?.label}`
      : `Step ${(activeIndex as number) + 1} of ${total}: ${activeStep?.label}`;

  return (
    <div
      data-part='steps'
      data-state={failed ? 'failed' : 'determinate'}
      className={cn('w-full', className)}
    >
      {list}
      <span role='status' aria-live='polite' className='sr-only'>
        {announcement}
      </span>
    </div>
  );
}

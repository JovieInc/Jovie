import { StatusGlyph, type StatusGlyphState } from '@jovie/ui';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** Evidence state of one pipeline stage. */
export type StatusPipelineStageState =
  | 'done'
  | 'current'
  | 'blocked'
  | 'failed'
  | 'pending'
  | 'unknown';

export interface StatusPipelineStage {
  readonly id: string;
  readonly label: string;
  readonly state: StatusPipelineStageState;
  /** The stage's real reading: a count, a SHA, a share. Never decorative. */
  readonly value: ReactNode;
  /** One line naming the evidence behind `value` (tooltip and SR text). */
  readonly evidence: string;
}

const GLYPH: Record<StatusPipelineStageState, StatusGlyphState> = {
  done: 'done',
  current: 'in_progress',
  blocked: 'blocked',
  failed: 'failed',
  pending: 'pending',
  unknown: 'unknown',
};

const STATE_LABEL: Record<StatusPipelineStageState, string> = {
  done: 'Done',
  current: 'In progress',
  blocked: 'Blocked',
  failed: 'Failed',
  pending: 'Not reached',
  unknown: 'Unknown',
};

/**
 * Ordered stages with each stage's evidenced state and reading, e.g.
 * Desired → Built → Certified → Deployed → Exposed → Observed → Healthy.
 *
 * The one owner for a lifecycle or funnel strip. Every stage carries a value
 * and the evidence behind it; a stage without evidence is `unknown`, never a
 * bare label. Stages share one row on desktop and wrap to a fixed grid on
 * narrow widths, so geometry does not change as values arrive.
 */
export function StatusPipeline({
  stages,
  ariaLabel,
  className,
  testId = 'status-pipeline',
}: Readonly<{
  readonly stages: readonly StatusPipelineStage[];
  readonly ariaLabel: string;
  readonly className?: string;
  readonly testId?: string;
}>) {
  return (
    <ol
      aria-label={ariaLabel}
      className={cn(
        'grid grid-cols-2 gap-px overflow-hidden rounded-lg bg-subtle sm:grid-cols-4 lg:grid-flow-col lg:auto-cols-fr lg:grid-cols-none',
        className
      )}
      data-testid={testId}
    >
      {stages.map(stage => (
        <li
          key={stage.id}
          aria-current={stage.state === 'current' ? 'step' : undefined}
          className='flex min-w-0 flex-col gap-1 bg-surface-1 px-3 py-2'
          data-state={stage.state}
          data-testid={`${testId}-stage-${stage.id}`}
          title={stage.evidence}
        >
          <span className='flex min-w-0 items-center gap-1.5'>
            <StatusGlyph
              state={GLYPH[stage.state]}
              size='sm'
              tooltipLabel={`${stage.label}: ${STATE_LABEL[stage.state]}`}
            />
            <span className='truncate text-2xs text-secondary-token'>
              {stage.label}
            </span>
          </span>
          <span
            className={cn(
              'truncate text-app font-semibold tabular-nums',
              stage.state === 'unknown' || stage.state === 'pending'
                ? 'font-normal text-tertiary-token'
                : 'text-primary-token'
            )}
          >
            {stage.value}
          </span>
          <span className='sr-only'>
            {STATE_LABEL[stage.state]}. {stage.evidence}
          </span>
        </li>
      ))}
    </ol>
  );
}

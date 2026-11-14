'use client';

import { PlainButton } from '@jovie/ui';
import { createContext, useContext } from 'react';
import { DotBadge } from '@/components/atoms/DotBadge';

interface ReleaseDueBadgeProps {
  readonly dueDate: Date | null;
  readonly dueDaysOffset: number | null;
  readonly isCompleted?: boolean;
  readonly onSetDate?: () => void;
}

/** Fixed-date previews can share one clock without changing live task rows. */
export const ReleaseDueClockContext = createContext<Date | undefined>(
  undefined
);

function formatRelativeDue(
  dueDate: Date,
  now: Date
): {
  label: string;
  variant: 'future' | 'soon' | 'overdue' | 'stale' | 'today';
} {
  const diffMs = dueDate.getTime() - now.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    const absDays = Math.abs(diffDays);
    return {
      label: 'Overdue',
      variant: absDays > 90 ? 'stale' : 'overdue',
    };
  }
  if (diffDays === 0) {
    return { label: 'Today', variant: 'today' };
  }
  if (diffDays <= 3) {
    return { label: `${diffDays}d`, variant: 'soon' };
  }
  return { label: `${diffDays}d`, variant: 'future' };
}

const VARIANT_STYLES = {
  future: {
    className: 'border-transparent bg-transparent',
    dotClassName: 'bg-transparent',
  },
  soon: {
    className: 'border-warning/20 bg-warning/5',
    dotClassName: 'bg-warning',
  },
  overdue: {
    className: 'border-error/20 bg-error/5',
    dotClassName: 'bg-error',
  },
  stale: {
    className: 'border-accent-gray/20 bg-accent-gray/5',
    dotClassName: 'bg-accent-gray',
  },
  today: {
    className: 'border-warning/20 bg-warning/5',
    dotClassName: 'bg-warning',
  },
} as const;

export function ReleaseDueBadge({
  dueDate,
  dueDaysOffset,
  isCompleted,
  onSetDate,
}: Readonly<ReleaseDueBadgeProps>) {
  const now = useContext(ReleaseDueClockContext) ?? new Date();
  if (isCompleted) return null;

  if (!dueDate) {
    if (dueDaysOffset !== null) {
      return (
        <PlainButton
          type='button'
          onClick={onSetDate}
          className='text-3xs text-warning hover:underline'
        >
          Set date
        </PlainButton>
      );
    }
    return null;
  }

  const { label, variant } = formatRelativeDue(dueDate, now);

  return (
    <DotBadge
      label={label}
      size='sm'
      variant={VARIANT_STYLES[variant]}
      title={dueDate.toLocaleDateString()}
    />
  );
}

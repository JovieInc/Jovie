'use client';

import { DotBadge } from '@/components/atoms/DotBadge';

interface ReleaseDueBadgeProps {
  readonly dueDate: Date | null;
  readonly dueDaysOffset: number | null;
  readonly isCompleted?: boolean;
  readonly onSetDate?: () => void;
}

function formatRelativeDue(dueDate: Date): {
  label: string;
  variant: 'future' | 'soon' | 'overdue' | 'stale' | 'today';
} {
  const now = new Date();
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
    className: 'border-subtle',
    dotClassName: 'bg-tertiary-token',
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
  if (isCompleted) return null;

  if (!dueDate) {
    if (dueDaysOffset !== null) {
      return (
        <button
          type='button'
          onClick={onSetDate}
          className='text-3xs text-warning hover:underline'
        >
          Set date
        </button>
      );
    }
    return null;
  }

  const { label, variant } = formatRelativeDue(dueDate);

  return (
    <DotBadge
      label={label}
      size='sm'
      variant={VARIANT_STYLES[variant]}
      title={dueDate.toLocaleDateString()}
    />
  );
}

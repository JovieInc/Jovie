'use client';

import { DotBadge } from '@/components/atoms/DotBadge';

interface ReleaseTaskDueBadgeProps {
  readonly dueDate: Date | null;
  readonly dueDaysOffset: number | null;
  readonly onSetDate?: () => void;
}

function formatRelativeDue(dueDate: Date): {
  label: string;
  variant: 'future' | 'soon' | 'overdue' | 'today';
} {
  const now = new Date();
  const diffMs = dueDate.getTime() - now.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    return {
      label: `${Math.abs(diffDays)}d overdue`,
      variant: 'overdue',
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
    className: 'border-amber-500/20 bg-amber-500/5',
    dotClassName: 'bg-amber-500',
  },
  overdue: {
    className: 'border-red-500/20 bg-red-500/5',
    dotClassName: 'bg-red-500',
  },
  today: {
    className: 'border-amber-500/20 bg-amber-500/5',
    dotClassName: 'bg-amber-500',
  },
} as const;

export function ReleaseTaskDueBadge({
  dueDate,
  dueDaysOffset,
  onSetDate,
}: ReleaseTaskDueBadgeProps) {
  if (!dueDate) {
    if (dueDaysOffset !== null) {
      // Show offset hint when no release date set
      return (
        <button
          type='button'
          onClick={onSetDate}
          className='text-[10px] text-amber-500 hover:underline'
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

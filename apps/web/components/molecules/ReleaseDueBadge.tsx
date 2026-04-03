'use client';

import { DotBadge } from '@/components/atoms/DotBadge';

interface ReleaseDueBadgeProps {
  readonly dueDate: Date | null;
  readonly dueDaysOffset: number | null;
  readonly isCompleted?: boolean;
  readonly onSetDate?: () => void;
}

function formatOverdue(absDays: number): string {
  if (absDays <= 6) return `${absDays}d overdue`;
  if (absDays < 30) return `${Math.round(absDays / 7)}w overdue`;
  if (absDays <= 364) return `${Math.round(absDays / 30)}mo overdue`;
  return `${Math.round(absDays / 365)}y overdue`;
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
      label: formatOverdue(absDays),
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
    className: 'border-amber-500/20 bg-amber-500/5',
    dotClassName: 'bg-amber-500',
  },
  overdue: {
    className: 'border-red-500/20 bg-red-500/5',
    dotClassName: 'bg-red-500',
  },
  stale: {
    className: 'border-zinc-400/20 bg-zinc-400/5',
    dotClassName: 'bg-zinc-400',
  },
  today: {
    className: 'border-amber-500/20 bg-amber-500/5',
    dotClassName: 'bg-amber-500',
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

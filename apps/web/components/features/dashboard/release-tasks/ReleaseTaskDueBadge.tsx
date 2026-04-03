'use client';

import { ReleaseDueBadge } from '@/components/molecules/ReleaseDueBadge';

interface ReleaseTaskDueBadgeProps {
  readonly dueDate: Date | null;
  readonly dueDaysOffset: number | null;
  readonly isCompleted?: boolean;
  readonly onSetDate?: () => void;
}

export function ReleaseTaskDueBadge({
  dueDate,
  dueDaysOffset,
  isCompleted,
  onSetDate,
}: ReleaseTaskDueBadgeProps) {
  return (
    <ReleaseDueBadge
      dueDate={dueDate}
      dueDaysOffset={dueDaysOffset}
      isCompleted={isCompleted}
      onSetDate={onSetDate}
    />
  );
}

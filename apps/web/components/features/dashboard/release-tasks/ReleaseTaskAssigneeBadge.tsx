'use client';

import { DotBadge } from '@/components/atoms/DotBadge';

interface ReleaseTaskAssigneeBadgeProps {
  readonly assigneeType: 'human' | 'ai_workflow';
}

const ASSIGNEE_VARIANTS = {
  human: {
    className: 'border-transparent bg-transparent',
    dotClassName: 'bg-accent',
  },
  ai_workflow: {
    className: 'border-purple-500/20 bg-purple-500/5',
    dotClassName: 'bg-purple-500',
  },
} as const;

export function ReleaseTaskAssigneeBadge({
  assigneeType,
}: ReleaseTaskAssigneeBadgeProps) {
  return (
    <DotBadge
      label={assigneeType === 'human' ? 'You' : 'AI'}
      size='sm'
      variant={ASSIGNEE_VARIANTS[assigneeType]}
    />
  );
}

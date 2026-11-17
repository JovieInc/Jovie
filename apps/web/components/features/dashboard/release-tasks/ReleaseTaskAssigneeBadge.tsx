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
    className: 'border-accent-purple-text/20 bg-accent-purple-text/5',
    dotClassName: 'bg-accent-purple-text',
  },
} as const;

export function ReleaseTaskAssigneeBadge({
  assigneeType,
}: ReleaseTaskAssigneeBadgeProps) {
  return (
    <DotBadge
      label={assigneeType === 'human' ? 'Me' : 'Jovie'}
      size='sm'
      variant={ASSIGNEE_VARIANTS[assigneeType]}
    />
  );
}
